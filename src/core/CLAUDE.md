# src/core/ — 核心管道层

数据处理核心：从视觉模型原始输出到增强提示词的完整管道。

## 模块流水线

```
VisionClient.analyze() → raw JSON string
  → parser.ts       JSON 解析（主路径 + 正则备用）
  → validator.ts    6 条坐标校验规则
  → normalizer.ts   精度归一化（0-1000 → 0-100）
  → prompt-builder.ts  增强提示词拼接 + 会话历史注入
```

## 文件

| 文件                 | 职责                                       |
| -------------------- | ------------------------------------------ |
| `pipeline.ts`        | **管道编排器** — 多轮流程协调，是集成核心  |
| `modality-router.ts` | **模态路由器** — media_type → Adapter 分发 |
| `parser.ts`          | JSON 解析 + 容错                           |
| `validator.ts`       | 坐标校验（范围/合法性/唯一性）             |
| `normalizer.ts`      | 精度归一化                                 |
| `prompt-builder.ts`  | 增强提示词构建                             |
| `vision-client.ts`   | OpenAI 兼容视觉模型客户端                  |
| `session-manager.ts` | SQLite 会话持久化（7 个方法）              |
| `sqlite-wrapper.ts`  | node:sqlite Vite 兼容适配层                |

## 集成规则

- `pipeline.ts` 是唯一协调者，导入所有核心模块
- `modality-router.ts` 静态导入所有适配器类（来自 `adapters/`）
- 每个模块独立 try/catch，任何异常不崩溃

## 参考

- [AGENTS.md](../AGENTS.md) — 完整架构文档，见 3.4 节核心管道层详解
