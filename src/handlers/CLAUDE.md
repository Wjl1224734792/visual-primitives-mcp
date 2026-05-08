# src/handlers/ — 处理器层

MCP 工具注册和请求路由。

## 文件

| 文件               | 职责                                     |
| ------------------ | ---------------------------------------- |
| `tool-handlers.ts` | 注册 `multimodal_grounding_augment` 工具 |

## 处理流程

```
MCP CallToolRequest
  → Zod 校验 6 个输入参数
  → 未传 session_id → 自动生成 UUID
  → 调用 PipelineOrchestrator.execute()
  → 返回 { content: [{ type: 'text', text: JSON.stringify(result) }] }
```

## 参数交叉校验

- `media_base64` 存在且 `media_type` 缺失 → Zod 拒绝
- `merge_strategy` 默认 `augment`
- `coordinate_precision` 默认 `0-1000`

## 参考

- [AGENTS.md](../AGENTS.md) — 完整架构文档，见 3.3 节处理器层详解
