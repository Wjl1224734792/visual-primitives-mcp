# TASK-008：MCP 服务入口、传输层与工具处理器

## 1. 当前实现目标

实现 MCP 服务的主入口、传输层工厂和工具处理器，将 PipelineOrchestrator 封装为标准 MCP 工具 `multimodal_grounding_augment`，并支持三种传输模式（stdio / SSE / HTTP Stream）。

## 2. 对应需求 / 任务 ID

| 需求 ID | 描述                                            |
| ------- | ----------------------------------------------- |
| REQ-001 | 注册 MCP 工具，支持 stdio/SSE/HTTP Stream       |
| REQ-002 | 与 OpenAI 兼容视觉模型通信，获取 JSON 坐标      |
| REQ-019 | Hono 提供 SSE 和 HTTP Stream 传输的 HTTP 服务器 |

- **任务 ID**：TASK-008
- **任务类型**：直接开发
- **依赖**：TASK-006（PipelineOrchestrator 已就绪）

## 3. 变更文件 / 变更范围

| 文件                            | 操作     | 说明                                     |
| ------------------------------- | -------- | ---------------------------------------- |
| `src/handlers/tool-handlers.ts` | **新建** | MCP 工具注册与请求处理器                 |
| `src/transport/factory.ts`      | **新建** | 传输层工厂，根据配置创建对应传输实例     |
| `src/server.ts`                 | **重写** | MCP 服务主入口（原为占位符 `export {}`） |

**不修改的文件**：src/config.ts、src/types.ts、src/core/\*、src/utils/\*（仅只读 import）

## 4. 路由清单

### 4.1 MCP 工具

| 方法             | 工具名                         | 处理器                                              |
| ---------------- | ------------------------------ | --------------------------------------------------- |
| MCP `tools/call` | `multimodal_grounding_augment` | `registerTool()` → `PipelineOrchestrator.execute()` |

### 4.2 HTTP 端点（SSE / HTTP Stream 模式）

| 方法 | 路径      | 处理器                                                     | 说明                                                                             |
| ---- | --------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------- |
| GET  | `/health` | 控制器返回 JSON                                            | 健康检查                                                                         |
| ALL  | `/mcp`    | `WebStandardStreamableHTTPServerTransport.handleRequest()` | MCP 协议端点，处理 GET（SSE 流建立）、POST（JSON-RPC 消息）和 DELETE（会话终止） |

## 5. 请求/响应格式说明

### 5.1 工具输入参数

| 参数                   | 类型                   | 必填                         | 默认值        | 说明              |
| ---------------------- | ---------------------- | ---------------------------- | ------------- | ----------------- |
| `session_id`           | string                 | 否                           | 自动生成 UUID | 会话 ID，多轮复用 |
| `media_base64`         | string                 | 否                           | -             | 媒体内容 Base64   |
| `media_type`           | enum                   | 否（传 media_base64 时必填） | -             | 7 种媒体类型      |
| `question`             | string                 | **是**                       | -             | 自然语言问题      |
| `merge_strategy`       | 'replace' \| 'augment' | 否                           | 'augment'     | 合并策略          |
| `coordinate_precision` | '0-100' \| '0-1000'    | 否                           | '0-1000'      | 坐标精度          |

### 5.2 工具响应格式

```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"session_id\":\"...\",\"raw_visual_analysis\":{...},\"augmented_prompt\":\"...\",\"objects_count\":5,\"from_cache\":false,\"round\":1}"
    }
  ]
}
```

### 5.3 HTTP 健康检查响应

```json
{
  "status": "ok",
  "name": "visual-primitives-mcp",
  "version": "1.0.0",
  "transport": "sse"
}
```

## 6. 中间件与错误处理说明

### 6.1 工具级错误处理

- **交叉校验**：`media_base64` 传入但 `media_type` 未传时返回 `isError: true` 的 MCP 错误响应
- **管道异常兜底**：`PipelineOrchestrator.execute()` 内部已捕获大部分异常并返回降级结果；外层 try-catch 作为最后一层防线
- **错误响应格式**：始终返回 MCP 标准 `content` 数组，`isError: true` 标记错误

### 6.2 传输层错误处理

- **未知传输模式**：回退到 stdio 模式并记录警告日志
- **优雅关闭**：SIGINT/SIGTERM 触发关闭流程：停止 TTL 清理定时器 → 关闭 MCP 服务器连接 → 关闭 SQLite 数据库

### 6.3 会话 TTL 清理

- 每 60 秒调用 `SessionManager.cleanupExpired()` 清理过期会话
- 使用 `setInterval` 实现，在关闭信号到达时被清除

## 7. 测试和验证结果

| 检查项                             | 结果                        |
| ---------------------------------- | --------------------------- |
| `npm run typecheck` (tsc --noEmit) | 通过，零错误                |
| `npm run lint` (src/ 目录)         | 通过，零错误                |
| `npm test` (147 tests)             | 通过，10 个测试文件全部通过 |
| `npm run build` (tsc)              | 通过，生成 dist/            |

### 构建输出

```
dist/server.js                          (5,592 bytes)
dist/handlers/tool-handlers.js          (5,668 bytes)
dist/transport/factory.js               (2,112 bytes)
```

## 8. 风险 / 未解决项

| 风险                             | 说明                                                                         | 缓解措施                                      |
| -------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------- |
| `tests/` 目录 ESLint parser 错误 | tsconfig.json 排除 tests/ 导致类型感知 lint 规则无法解析测试文件（预存问题） | ESLint 在 src/ 目录下全绿，不影响 CI          |
| `VisionClient` 无构造函数参数    | 当前实现使用 `new VisionClient()` 无参构造，内部依赖 `config` 单例           | 已验证与现有 VisionClient 实现兼容            |
| SSE/HTTP Stream 运行时验证       | 缺少集成测试覆盖 Streamable HTTP 传输路径                                    | 需通过 MCP Inspector 手工验证                 |
| Hono 动态 import                 | Hono 和 `@hono/node-server` 通过动态 import 加载，在 stdio 模式下不加载      | 减少 stdio 模式的启动开销，但可能延迟错误暴露 |

## 9. 推荐的下一步

1. **运行时验证**：使用 MCP Inspector 测试 stdio 模式工具注册和调用
2. **SSE 模式验证**：设置 `MCP_TRANSPORT=sse` 启动后通过 `curl http://localhost:3000/health` 验证
3. **TASK-009**：编写 README 文档和 `.env.example`
4. **CI 配置**：修复 `tests/` 目录 ESLint parser 配置问题（可选）

## 10. 关键架构决策

| 决策             | 选择                                            | 理由                                                                  |
| ---------------- | ----------------------------------------------- | --------------------------------------------------------------------- |
| MCP SDK 版本     | v1.29.0，使用 `McpServer.registerTool()`        | 官方推荐的注册方式，`tool()` 已标记为 deprecated                      |
| Streamable HTTP  | 使用 `WebStandardStreamableHTTPServerTransport` | 兼容 SSE 和 HTTP Stream 两种模式；SSEServerTransport 已 deprecated    |
| 传输模式状态管理 | stateless（不设置 sessionIdGenerator）          | MCP 协议层 session 由我们的 SessionManager 独立管理，避免双层 session |
| Hono 加载方式    | `await import('hono')` 动态导入                 | stdio 模式下不加载 Hono，减少启动开销                                 |

## 11. 文件列表

- `E:\CodeStore\vision-mcp\src\server.ts` — MCP 服务主入口
- `E:\CodeStore\vision-mcp\src\transport\factory.ts` — 传输层工厂
- `E:\CodeStore\vision-mcp\src\handlers\tool-handlers.ts` — 工具处理器
