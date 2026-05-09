# src/core/ — 核心管道层

数据处理核心：任务调度分发的视觉处理管道。

## 任务调度架构

`pipeline.ts` 提供 4 个独立任务方法：

```
visual_describe:
  VisionClient.analyze(describe-structured) → JSON {description, objects}
  → parser.ts → validator.ts → normalizer.ts → 入库会话物体
  → 返回自然语言描述 + 物体列表 + 中心原点位置提示

visual_locate:
  VisionClient.analyze(locate-system) → JSON 坐标
  → parser.ts → validator.ts → normalizer.ts → 入库会话物体

visual_ocr:
  VisionClient.chat(ocr-system) → 文字内容 → 直接返回

visual_video_analyze:
  VisionClient.chat(describe-system) → 返回描述
```

## 文件

| 文件                 | 职责                                        |
| -------------------- | ------------------------------------------- |
| `pipeline.ts`        | **管道编排器** — 任务调度核心，4 个方法     |
| `parser.ts`          | JSON 解析 + 容错（仅 locate）               |
| `validator.ts`       | 坐标校验（仅 locate）                       |
| `normalizer.ts`      | 精度归一化（仅 locate）                     |
| `prompt-builder.ts`  | 增强提示词构建 + 历史描述上下文注入         |
| `vision-client.ts`   | OpenAI 兼容视觉客户端（`analyze` + `chat`） |
| `session-manager.ts` | SQLite 会话持久化                           |
| `sqlite-wrapper.ts`  | node:sqlite Vite 兼容适配层                 |

## 模型配置

每个工具方法使用独立的 `ModelConfig`（`config.describe` / `config.locate` / `config.ocr` / `config.video`），每工具可独立覆盖 baseUrl/apiKey/model 任意字段，不配则逐字段回退到 `VISION_API_BASE_URL` / `VISION_API_KEY` / `VISION_MODEL_NAME` 默认值。全部 OpenAI 兼容接口。

## 集成规则

- `pipeline.ts` 是唯一协调者，每个任务方法独立 try/catch
- pipeline 直接传 data URL 到 VisionClient，无中间适配层
- `chat()` 返回自由文本（describe/ocr/video_analyze），`analyze()` 返回 JSON（locate）
- 每个模块独立 try/catch，任何异常不崩溃

## 参考

- [AGENTS.md](../../AGENTS.md) — 完整架构文档，见 3.4 节核心管道层详解
