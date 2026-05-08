/**
 * MCP 服务主入口
 *
 * 根据 MCP_TRANSPORT 环境变量选择传输模式启动服务：
 *   - stdio：标准输入/输出模式（默认，适合 Claude Desktop 集成）
 *   - sse / http-stream：Hono HTTP 服务器 + Streamable HTTP 传输
 *
 * 初始化顺序：
 *   1. 加载配置（config.ts 已自动校验环境变量）
 *   2. 创建核心组件（SessionManager、VisionClient、PipelineOrchestrator）
 *   3. 创建 McpServer 并注册工具
 *   4. 根据传输模式连接并启动服务
 *   5. 启动会话 TTL 定期清理
 *   6. 注册优雅关闭信号处理
 *
 * 映射需求：REQ-001（工具注册 + 传输）, REQ-002（端到端通信）, REQ-019（Hono）
 * 任务 ID：TASK-008
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { SessionManager } from './core/session-manager.js';
import { VisionClient } from './core/vision-client.js';
import { PipelineOrchestrator } from './core/pipeline.js';
import { registerTool } from './handlers/tool-handlers.js';
import { createTransport } from './transport/factory.js';

async function main(): Promise<void> {
  logger.info(
    {
      transport: config.mcpTransport,
      defaultModel: config.vision.model,
      baseUrl: config.vision.baseUrl,
    },
    'Visual Primitives MCP 服务启动中...'
  );

  // ---- 步骤 1：初始化核心组件 ----

  // SessionManager：基于 node:sqlite 的会话持久化管理器
  const sessionManager = new SessionManager(config.dbPath);

  // VisionClient：OpenAI 兼容视觉模型客户端
  const visionClient = new VisionClient();

  // PipelineOrchestrator：多模态增强提示词管道编排器
  const pipeline = new PipelineOrchestrator(sessionManager, visionClient);

  // ---- 步骤 2：创建 McpServer 并注册工具 ----

  const server = new McpServer(
    {
      name: 'visual-primitives-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // 注册 4 个视觉任务工具
  registerTool(server, pipeline);

  // ---- 步骤 3：根据传输模式创建传输实例并连接 ----

  const transportResult = createTransport(config.mcpTransport);

  // 连接 McpServer 到传输层（此操作会设置 onmessage 回调并启动传输）
  await server.connect(transportResult.transport);

  if (transportResult.type === 'stdio') {
    // Stdio 模式：McpServer 已自动连接并监听 stdin/stdout
    logger.info('MCP 服务已启动（stdio 模式）');
  } else {
    // SSE / HTTP Stream 模式：启动 Hono HTTP 服务器
    const transport = transportResult.transport;

    const { Hono } = await import('hono');
    const { serve } = await import('@hono/node-server');

    const app = new Hono();

    // 健康检查端点
    app.get('/health', c =>
      c.json({
        status: 'ok',
        name: 'visual-primitives-mcp',
        version: '1.0.0',
        transport: config.mcpTransport,
      })
    );

    // MCP 协议端点：使用 WebStandardStreamableHTTPServerTransport
    // 处理所有 GET（SSE 流建立）、POST（JSON-RPC 消息）和 DELETE（会话终止）请求
    app.all('/mcp', async c => {
      const response = await transport.handleRequest(c.req.raw);
      return response;
    });

    // 启动 HTTP 服务器
    serve({ fetch: app.fetch, port: config.port }, info => {
      logger.info(
        {
          mode: config.mcpTransport,
          port: info.port,
          address: info.address,
        },
        `MCP 服务已启动（${config.mcpTransport} 模式，端口 ${String(info.port)}）`
      );
    });
  }

  // ---- 步骤 4：启动会话 TTL 定期清理 ----

  // 每 60 秒检查一次过期会话
  const cleanupInterval = setInterval(() => {
    try {
      const expired = sessionManager.cleanupExpired(config.sessionTtlSeconds);
      if (expired > 0) {
        logger.info({ expired }, '已清理过期会话');
      }
    } catch (err: unknown) {
      logger.warn({ err }, '会话清理失败');
    }
  }, 60_000);

  // ---- 步骤 5：优雅关闭 ----

  const shutdown = () => {
    logger.info('收到关闭信号，正在优雅退出...');

    clearInterval(cleanupInterval);

    // 使用 Promise chain 处理异步关闭，避免 lint 标记 Promise 未消费
    void server
      .close()
      .catch((err: unknown) => {
        logger.warn({ err }, '关闭 MCP 服务器连接时出错');
      })
      .then(() => {
        try {
          sessionManager.close();
          logger.info('SessionManager 数据库连接已关闭');
        } catch (err: unknown) {
          logger.warn({ err }, '关闭数据库连接时出错');
        }
      })
      .then(() => {
        // 给异步清理操作留出时间
        return new Promise(resolve => setTimeout(resolve, 500));
      })
      .then(() => {
        logger.info('服务已正常退出');
        process.exit(0);
      });
  };

  // Windows 上的 SIGINT 处理也有效（Node.js 默认行为）
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err: unknown) => {
  logger.error({ err }, '服务启动失败');
  process.exit(1);
});
