# src/handlers/ — 处理器层

MCP 工具注册和请求路由。通过任务调度机制将视觉能力拆分为 4 个专注工具。

## 文件

| 文件               | 职责                                         |
| ------------------ | -------------------------------------------- |
| `tool-handlers.ts` | 注册 4 个 MCP 工具 + `encodeFileBase64` 辅助 |

## 注册的工具

| 工具名                 | 任务               | 系统提示词            |
| ---------------------- | ------------------ | --------------------- |
| `visual_describe`      | 场景描述，自然语言 | `describe-system.txt` |
| `visual_locate`        | 坐标定位，JSON     | `locate-system.txt`   |
| `visual_ocr`           | 文字/表格提取      | `ocr-system.txt`      |
| `visual_video_analyze` | 视频内容分析       | `describe-system.txt` |

## 处理流程

```
MCP CallToolRequest
  → Zod 校验参数（各工具独立 schema）
  → 未传 session_id → 自动生成 UUID
  → encodeFileBase64() 读取本地文件并编码
  → 调用 PipelineOrchestrator 对应方法（describe/locate/ocr/videoAnalyze）
  → 返回 { content: [{ type: 'text', text: ... }] }
```

## 文件路径支持

所有工具接受 `image_path` / `video_path` 本地文件路径，`encodeFileBase64()` 内部自动 Base64 编码。

## 参考

- [AGENTS.md](../../AGENTS.md) — 完整架构文档，见 3.3 节处理器层详解
