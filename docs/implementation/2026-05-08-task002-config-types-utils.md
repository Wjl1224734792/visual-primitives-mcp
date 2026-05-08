# TASK-002：配置体系、类型定义与工具库 -- 后端实现文档

## 1. 当前实现目标

完成项目共享区域：类型定义（`types.ts`）、配置体系（`config.ts`）、日志器（`logger.ts`）、重试工具（`retry.ts`），为后续所有 TASK-003~008 提供类型契约与基础设施。

## 2. 对应需求 ID / 任务 ID

- **任务 ID**：TASK-002
- **映射 REQ**：REQ-010（配置校验）、REQ-018（结构化日志）、REQ-N03（安全-敏感数据不落日志）、REQ-N04（可扩展-MediaAdapter 接口）

## 3. 输入依据

- `docs/prds/需求文档.md` -- 第四节（MCP 工具定义）、第五节（配置与环境变量）
- `docs/tasks/2026-05-08-visual-primitives-mcp-tasks.md` -- TASK-002 详细完成标准
- `package.json`（TASK-001 已完成，所有依赖已声明）

## 4. 变更文件 / 变更范围

| 文件                   | 操作             | 说明                                                                             |
| ---------------------- | ---------------- | -------------------------------------------------------------------------------- |
| `src/types.ts`         | **新建**         | 全部共享 TypeScript 类型/接口。`MediaAdapter` 接口在此声明。后续 TASK 只读不写。 |
| `src/config.ts`        | **新建**         | Zod schema 校验 + 环境变量读取 + 目录创建 + 单例导出。后续 TASK 只读不写。       |
| `src/utils/logger.ts`  | **新建**         | pino 结构化日志，附带敏感字段脱敏过滤器                                          |
| `src/utils/retry.ts`   | **新建**         | 指数退避重试工具函数 `withRetry`                                                 |
| `src/server.ts`        | **新建（占位）** | 最小入口占位（`export {}`），确保 typecheck 通过。TASK-008 正式实现。            |
| `tests/config.test.ts` | **新建**         | 配置校验测试（26 个用例）                                                        |
| `tests/retry.test.ts`  | **新建**         | 重试逻辑测试（8 个用例）                                                         |

## 5. 实现说明

### 5.1 类型定义（`src/types.ts`）

- 使用 `type` 定义联合/字面量类型：`CoordinatePrecision`、`MergeStrategy`、`MediaType`、`TransportMode`、`LogLevel`
- 使用 `interface` 定义对象形状：`BBox`、`Centroid`、`VisualObject`、`VisualAnalysisResult`、`Base64Image`、`MediaAdapter`、`AdapterEntry`、`SessionObject`、`Session`、`ConversationTurn`、`SessionContext`、`MultimodalGroundingInput`、`MultimodalGroundingOutput`、`PipelineInput`、`PipelineOutput`、`AppConfig`
- `MediaAdapter` 接口定义了 `mediaType` 属性和 `adapt(input): Promise<Base64Image[]>` 方法，供 TASK-004/TASK-007 实现
- `AppConfig` 是所有配置项的最终驼峰命名结构

### 5.2 配置体系（`src/config.ts`）

- **Zod schema**：`envSchema` 使用 `z.object()` 定义全部 12 个变量
  - 3 个必填：`VISION_API_BASE_URL`、`VISION_API_KEY`、`VISION_MODEL_NAME`（`.string().min(1)`）
  - 9 个可选：均提供 `default()` 值
- **数字类型处理**：使用 `.string().default('...').transform(Number).pipe(z.number().int().min/max())` 管道，确保环境变量的字符串值被正确转换为带范围校验的数字
- **目录创建**：`loadConfig()` 中使用 `mkdirSync(dbDir, { recursive: true })` 自动创建 DB_PATH 所在目录
- **单例模式**：`export const config: AppConfig = loadConfig()` -- 模块级惰性求值，首次 import 时执行，后续 import 复用缓存值
- **错误信息**：Zod 原生错误消息已包含缺失字段名，如 `VISION_API_BASE_URL 是必填项`

### 5.3 日志器（`src/utils/logger.ts`）

- 基于 pino v9.14.0
- 使用 `hooks.logMethod` 拦截每次日志调用
- 敏感字段匹配规则：key 转小写后包含 `base64`、`api_key`、`apikey`、`token`、`secret`、`password`、`authorization` 等关键词
- 匹配的字段值替换为 `[REDACTED]`
- 不修改原对象（创建新对象返回）

### 5.4 重试工具（`src/utils/retry.ts`）

- `withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>`
- 指数退避公式：`delay = min(baseDelayMs * backoffFactor^attempt, maxDelayMs)`
- 默认参数：`maxAttempts=3`、`baseDelayMs=1000`、`maxDelayMs=30000`、`backoffFactor=2`
- `shouldRetry` 回调可自定义重试条件（默认全部重试）
- 重试日志仅记录错误消息，不记录完整 base64

## 6. 测试和验证结果

### 测试执行结果

```
Test Files  2 passed (2)
Tests       34 passed (34)
```

**config.test.ts**（26 tests）：

| 测试组         | 用例数 | 验证要点                                               |
| -------------- | ------ | ------------------------------------------------------ |
| 必填项校验     | 3      | 缺少 VISION_API_BASE_URL/KEY/MODEL_NAME 均抛出明确错误 |
| 可选变量默认值 | 9      | 所有可选变量有合法默认值                               |
| 可选变量校验   | 9      | 无效枚举值/越界数值均抛出错误                          |
| 自定义值生效   | 5      | 自定义值被正确解析和应用                               |

**retry.test.ts**（8 tests）：

| 测试组       | 用例数 | 验证要点                                                   |
| ------------ | ------ | ---------------------------------------------------------- |
| 基本行为     | 5      | 成功不重试、失败重试、全部失败抛最后错误、shouldRetry 控制 |
| 延迟时间递增 | 2      | 指数退避公式正确、maxDelayMs 上限生效                      |
| 默认参数     | 1      | 不传 options 使用默认值                                    |

### 自动化验证通过

- **ESLint**：`src/` 下零错误（test 文件因 tsconfig exclude 限制，lint 不可用，但 vitest 可正常编译运行）
- **TypeScript type-check**：`tsc --noEmit` 零错误
- **Build**：`tsc` 构建成功，dist/ 生成
- **日志脱敏验证**：`logger.info({ base64: "...", apiKey: "sk-xxx" })` 输出中两字段均显示 `[REDACTED]`
- **DB_PATH 目录创建**：设置 `DB_PATH=./data/test-subdir/test.db`，配置加载后目录自动创建

## 7. 数据与接口边界

### 共享区域契约

| 模块              | 导出                                                                                                                                                 | 使用者                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `types.ts`        | `AppConfig`, `MediaAdapter`, `VisualObject`, `SessionObject`, `Session`, `VisualAnalysisResult`, `Base64Image`, `PipelineInput`, `PipelineOutput` 等 | 全部后续 TASK                  |
| `config.ts`       | `config: AppConfig`（单例）                                                                                                                          | 全部后续 TASK                  |
| `utils/logger.ts` | `logger: Logger`（单例）                                                                                                                             | 全部后续 TASK                  |
| `utils/retry.ts`  | `withRetry<T>(fn, options)`                                                                                                                          | `vision-client.ts`（TASK-004） |

### 接口契约

- `MediaAdapter` interface：`{ mediaType: string; adapt(input: string): Promise<Base64Image[]> }` -- TASK-004 和 TASK-007 的适配器必须实现此接口
- `AppConfig` 包含所有配置字段，后续模块通过 `config.xxx` 访问
- `VisualAnalysisResult.objects` 必须至少包含 1 个元素（TASK-003 validator 校验）

## 8. 风险 / 未解决项

| 风险                   | 等级 | 说明                                                                 | 缓解                                                                                   |
| ---------------------- | ---- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 测试文件 lint 不可用   | 低   | tsconfig.json exclude tests/，导致 ESLint project-aware 规则无法解析 | 不影响功能；vitest 可正常编译运行；必要时可创建 tests/tsconfig.json（TASK-001 范围外） |
| Zod error message 语言 | 低   | Zod 默认错误消息为英文                                               | 通过 `.min(1, '中文提示')` 提供中文说明；后续如需国际化可配置 Zod 全局 errorMap        |

## 9. 需要前端配合的点

无。本任务为纯后端基础设施，不涉及前端。

## 10. 推荐的下一步

1. **TASK-003**（图片核心管道）：可立即开始，依赖 `types.ts` 中的 `VisualAnalysisResult`、`VisualObject` 等类型和 `config.ts` 中的配置
2. **TASK-004**（图片适配器与视觉客户端）：可立即开始，需 `implements MediaAdapter` 和调用 `withRetry`
3. **TASK-005**（会话管理器）：可立即开始，依赖 `types.ts` 中的 `Session`、`SessionObject` 等类型和 `config.ts` 中的 `dbPath`/`sessionTtlSeconds`
   - 注意：SessionManager 的测试需使用 `:memory:` 数据库，不应依赖 `DB_PATH`
4. **接口冻结**：`src/types.ts` 和 `src/config.ts` 已冻结，后续 TASK 不得修改其导出签名
