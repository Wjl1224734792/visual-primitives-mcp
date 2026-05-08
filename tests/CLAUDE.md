# tests/ — 测试套件

基于 vitest，TDD 核心模块，mock 外部依赖。

## 测试文件

| 文件                      | 测试对象               | 策略         |
| ------------------------- | ---------------------- | ------------ |
| `config.test.ts`          | `loadConfig()`         | TDD          |
| `retry.test.ts`           | `withRetry()`          | TDD          |
| `parser.test.ts`          | `parseResponse()`      | TDD          |
| `validator.test.ts`       | `validateObjects()`    | TDD          |
| `normalizer.test.ts`      | `normalizeObjects()`   | TDD          |
| `session-manager.test.ts` | `SessionManager`       | DDD+TDD      |
| `pipeline.test.ts`        | `PipelineOrchestrator` | 集成（mock） |

## 规则

- 测试数据库使用 `:memory:` 模式，不污染开发数据
- 外部依赖 mock：VisionClient / fetch
- `npm test` 运行全部测试用例

## 参考

- [AGENTS.md](../AGENTS.md) — 完整架构文档
