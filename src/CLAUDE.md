# src/ — 入口层

项目入口和全局配置，所有模块的依赖起点。

## 文件

| 文件        | 职责           | 关键导出                                    |
| ----------- | -------------- | ------------------------------------------- |
| `server.ts` | MCP 服务主入口 | `main()` — 初始化链 + 优雅关闭              |
| `config.ts` | 环境变量校验   | `config: AppConfig` (单例), `loadConfig()`  |
| `types.ts`  | 共享类型定义   | `AppConfig`, `ModelConfig`, 各任务输入/输出 |

## 模型配置

分级配置体系：`VISION_API_BASE_URL` / `VISION_API_KEY` / `VISION_MODEL_NAME` 作为默认值，每个工具可覆盖（`VISION_MODEL_DESCRIBE` / `VISION_MODEL_LOCATE` / `VISION_MODEL_OCR` / `VISION_MODEL_VIDEO`）。全部 OpenAI 兼容接口。

## 规则

- `types.ts` 和 `config.ts` 是**共享区域**，其他模块只读不写
- `server.ts` 根据 `config.mcpTransport` 选择传输模式

## 参考

- [AGENTS.md](../AGENTS.md) — 完整架构文档，见 3.1 节入口层详解
