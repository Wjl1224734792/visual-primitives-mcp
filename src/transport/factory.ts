/**
 * 传输层工厂：根据 MCP_TRANSPORT 配置创建对应的传输实例
 *
 * 支持的传输模式（与 AppConfig.mcpTransport 一致）：
 *   - stdio：StdioServerTransport（标准输入/输出，默认）
 *   - sse / http-stream：WebStandardStreamableHTTPServerTransport（Streamable HTTP）
 *
 * 注意：Streamable HTTP 传输规范兼容 SSE 和 HTTP Stream 两种模式。
 * MCP SDK v1.29 已将 SSEServerTransport 标记为已弃用，推荐使用
 * WebStandardStreamableHTTPServerTransport。
 *
 * 映射需求：REQ-019（Hono HTTP 传输）
 * 任务 ID：TASK-008
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { TransportMode } from '../types.js';
import { logger } from '../utils/logger.js';

/** Stdio 传输创建结果 */
export interface StdioTransportResult {
  type: 'stdio';
  transport: StdioServerTransport;
}

/** Streamable HTTP 传输创建结果 */
export interface StreamableHttpTransportResult {
  type: 'sse' | 'http-stream';
  transport: WebStandardStreamableHTTPServerTransport;
}

/** 所有支持的传输创建结果的联合类型 */
export type TransportResult =
  | StdioTransportResult
  | StreamableHttpTransportResult;

/**
 * 根据传输模式创建对应的 MCP 传输实例
 *
 * @param mode - 传输模式（stdio / sse / http-stream）
 * @returns 包含传输类型和实例的结果对象
 */
export function createTransport(mode: TransportMode): TransportResult {
  switch (mode) {
    case 'stdio': {
      logger.info('TransportFactory: 创建 StdioServerTransport');
      return {
        type: 'stdio',
        transport: new StdioServerTransport(),
      };
    }

    case 'sse':
    case 'http-stream': {
      logger.info(
        { mode },
        'TransportFactory: 创建 WebStandardStreamableHTTPServerTransport'
      );
      // 使用 stateless 模式（sessionIdGenerator: undefined），
      // MCP 协议层的会话由我们的 SessionManager 独立管理。
      return {
        type: mode,
        transport: new WebStandardStreamableHTTPServerTransport(),
      };
    }

    default: {
      // 未知模式，回退到 stdio
      logger.warn({ mode }, 'TransportFactory: 未知传输模式，回退到 stdio');
      return {
        type: 'stdio',
        transport: new StdioServerTransport(),
      };
    }
  }
}
