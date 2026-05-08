# tests/ — 测试套件

基于 vitest，TDD 核心模块，mock 外部依赖。

## 测试文件

| 文件                                | 测试对象               | 用例数 | 策略         |
| ----------------------------------- | ---------------------- | ------ | ------------ |
| `config.test.ts`                    | `loadConfig()`         | 26     | TDD          |
| `retry.test.ts`                     | `withRetry()`          | 8      | TDD          |
| `parser.test.ts`                    | `parseResponse()`      | 12     | TDD          |
| `validator.test.ts`                 | `validateObjects()`    | 31     | TDD          |
| `normalizer.test.ts`                | `normalizeObjects()`   | 14     | TDD          |
| `session-manager.test.ts`           | `SessionManager`       | 16     | DDD+TDD      |
| `pipeline.test.ts`                  | `PipelineOrchestrator` | 14     | 集成（mock） |
| `adapters/image-adapter.test.ts`    | `ImageAdapter`         | 8      | 直接         |
| `adapters/video-adapter.test.ts`    | `VideoAdapter`         | 7      | 直接         |
| `adapters/document-adapter.test.ts` | `DocumentAdapter`      | 11     | 直接         |

## 规则

- 测试数据库使用 `:memory:` 模式，不污染开发数据
- 外部依赖 mock：FFmpeg / sharp / VisionClient / fetch
- `npm test` 运行全部 147 个用例

## 参考

- [AGENTS.md](../AGENTS.md) — 完整架构文档
