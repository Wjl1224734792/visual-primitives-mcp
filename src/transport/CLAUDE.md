# src/transport/ — 传输层

根据 `MCP_TRANSPORT` 环境变量创建对应的 MCP 传输实例。

## 文件

| 文件         | 职责                              |
| ------------ | --------------------------------- |
| `factory.ts` | 传输工厂：`createTransport(mode)` |

## 三种模式

| 模式          | 类                              | Hono 参与    |
| ------------- | ------------------------------- | ------------ |
| `stdio`       | `StdioServerTransport`          | 不参与       |
| `sse`         | `StreamableHTTPServerTransport` | 健康检查端点 |
| `http-stream` | `StreamableHTTPServerTransport` | 健康检查端点 |

## 参考

- [AGENTS.md](../AGENTS.md) — 完整架构文档，见 3.2 节传输层详解
