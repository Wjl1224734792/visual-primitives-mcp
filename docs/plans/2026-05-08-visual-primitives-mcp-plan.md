# Visual Primitives MCP -- 执行计划

> 基于 DeepSeek《Thinking with Visual Primitives》论文的多模态空间锚定 MCP 服务器
> 日期：2026-05-08 | 状态：待执行

---

## 1. 需求文档路径

| 文档                           | 路径                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------- |
| 主需求文档（34 条 REQ）        | `E:\CodeStore\vision-mcp\docs\requirements\2026-05-08-visual-primitives-mcp.md` |
| 任务分解文档（9 TASK）         | `E:\CodeStore\vision-mcp\docs\tasks\2026-05-08-visual-primitives-mcp-tasks.md`  |
| 详细 PRD（架构/模块/工具定义） | `E:\CodeStore\vision-mcp\docs\prds\需求文档.md`                                 |

---

## 2. Gate B 前置检查

| 检查项                          | 结果                                             |
| ------------------------------- | ------------------------------------------------ |
| 任务 ID 完整（TASK-XXX 格式）   | 通过 -- TASK-001 ~ TASK-009 全部完整             |
| 每个任务映射到至少一个 REQ-XXX  | 通过 -- 34/34 REQ 全覆盖（100%）                 |
| 类型完整（前端/后端/共享/测试） | 通过 -- 全部后端+共享+测试任务                   |
| 优先级/完成标准完整             | 通过 -- 每个 TASK 含完整完成标准                 |
| DDD 分类完整                    | 通过 -- TASK-005/006 标注 DDD 建模要点           |
| TDD/直接开发分类完整            | 通过 -- 6 个 TDD 模块 + 7 个直接开发模块         |
| 风险任务已标注                  | 通过 -- TASK-002/003/005/006/007 含风险描述      |
| 文件所有权已写明                | 通过 -- 9 个共享区域已指定唯一责任方             |
| 垂直切片检查                    | 通过 -- 每个 TASK 交付可独立验证的端到端功能路径 |
| 无水平切片                      | 通过 -- 无"设计所有表"/"实现所有 API"类任务      |
| 单轮次行数控制                  | 通过 -- R1:~895, R2:~870, R3:~590，均<1000       |

---

## 3. 当前轮次目标

一次性全实现 visual-primitives-mcp 多模态 MCP 服务器，覆盖全部 34 条 REQ、9 个 TASK。按 3 轮（Round）分步交付，每轮验证通过后方可进入下一轮。

| 轮次    | 目标                                            | 预估行数 | 关键交付物                                                      |
| ------- | ----------------------------------------------- | -------- | --------------------------------------------------------------- |
| Round 1 | 工程基础 + 图片核心管道 + 适配器基础 + 会话管理 | ~895     | 可独立验证的 parser/validator/normalizer 管道，通过全量单元测试 |
| Round 2 | 多模态适配器 + 管道编排集成                     | ~870     | 完整的 PipelineOrchestrator，mock 环境下全量集成测试通过        |
| Round 3 | MCP 服务入口 + 传输层 + 文档                    | ~590     | 可启动的 MCP 服务器，README 完整                                |

---

## 4. 当前轮次范围

覆盖全部 9 个 TASK（TASK-001 ~ TASK-009），34 条 REQ。执行跨度 7 个 Batch。

---

## 5. 整体完成标准

1. `npm run lint` 全量通过，无 error
2. `npm run typecheck` 全量通过，TypeScript strict 模式零错误
3. `npm run build` 成功生成 dist
4. `npm test` 全量通过（~935 行测试覆盖全部核心模块）
5. Stdio 模式：`node dist/server.js` 启动，MCP Inspector 可发现 `multimodal_grounding_augment` 工具
6. SSE 模式：`MCP_TRANSPORT=sse npm start` → Hono 在端口监听
7. 必填环境变量缺失时服务拒绝启动并输出清晰错误
8. 多轮缓存命中：同 session_id 第二轮 `from_cache=true`，0 视觉 API 成本
9. 任何单点异常不导致进程崩溃（降级提示词返回）
10. `README.md` 含全部 8 个必需章节

---

## 6. 是否需要先查阅 code-explore-expert / docs-research-expert

**不需要。** 项目为 greenfield 初始代码（当前只有 `.claude/`、`.jarvis/`、`docs/` 目录），无现有代码可探索。

---

## 7. 共享区域改动归属

| 共享文件                            | 唯一责任方        | 冻结节点           | 其他任务访问策略                                          |
| ----------------------------------- | ----------------- | ------------------ | --------------------------------------------------------- |
| `package.json`                      | TASK-001 **独占** | Batch 1 完成后冻结 | 后续任务不得新增依赖                                      |
| `tsconfig.json`                     | TASK-001 **独占** | Batch 1 完成后冻结 | 只读                                                      |
| `.eslintrc.json` / `.prettierrc`    | TASK-001 **独占** | Batch 1 完成后冻结 | 只读                                                      |
| `src/config.ts`                     | TASK-002 **独占** | Batch 2 完成后冻结 | 其余任务只读 import，禁止修改                             |
| `src/types.ts`                      | TASK-002 **独占** | Batch 2 完成后冻结 | 其余任务只读 import，可 `implements` 接口但不可修改签名   |
| `src/core/adapters/base-adapter.ts` | TASK-004 **独占** | Batch 3 完成后冻结 | TASK-007 的适配器 `implements MediaAdapter`，不可修改接口 |
| `src/core/modality-router.ts`       | TASK-006 **独占** | Batch 5 完成后冻结 | TASK-007 不得修改此文件                                   |
| `src/core/pipeline.ts`              | TASK-006 **独占** | Batch 5 完成后冻结 | 导入全部核心模块                                          |
| `src/handlers/tool-handlers.ts`     | TASK-008 **独占** | Batch 6 完成后冻结 | Pipeline 的唯一消费者                                     |

---

## 8. 接口冻结节点

| 冻结节点 | 批次         | 冻结内容                                                           | 影响范围       |
| -------- | ------------ | ------------------------------------------------------------------ | -------------- |
| 冻结点 1 | Batch 2 完成 | `src/config.ts`（全部配置项）、`src/types.ts`（全部共享类型/接口） | 所有后续 Batch |
| 冻结点 2 | Batch 3 完成 | `src/core/adapters/base-adapter.ts`（`MediaAdapter` 接口）         | TASK-007       |
| 冻结点 3 | Batch 5 完成 | `src/core/modality-router.ts`（路由注册表）                        | TASK-008       |

**冻结规则**：冻结点后的批次，对冻结文件只能 `import` / `implements`，不得修改文件内容。任何需要修改冻结文件的场景均触发 plan patch 回编排者。

---

## 9. 跨 Batch 契约约定

### 契约 1：ModalityRouter 与适配器的注册约定

**问题**：TASK-006（Batch 5）的 `modality-router.ts` 需要导入 TASK-007（Batch 4）的 VideoAdapter 和 DocumentAdapter。若 TASK-006 先于 TASK-007 执行，TypeScript 类型检查将因缺少导入模块而失败。

**解决方案**：TASK-007 排在 Batch 4，TASK-006 排在 Batch 5。TASK-007 先创建完整的 VideoAdapter 和 DocumentAdapter 类，TASK-006 的 `modality-router.ts` 直接从已有文件导入。

**约定内容**：

- TASK-007 创建的 VideoAdapter/DocumentAdapter 必须使用**命名导出**（`export class VideoAdapter`），类名严格匹配
- TASK-006 的 `modality-router.ts` 静态导入路径：
  ```typescript
  import { ImageAdapter } from './adapters/image-adapter.js';
  import { VideoAdapter } from './adapters/video-adapter.js';
  import { DocumentAdapter } from './adapters/document-adapter.js';
  ```
- 若 TASK-007 的导出名/路径与约定不符，由 TASK-006 提交 plan patch 回编排者协调

### 契约 2：Pipeline 核心模块导出约定

TASK-006（pipeline.ts）导入 TASK-003/004/005 的全部核心模块。各模块导出必须满足以下约定：

| 模块                          | 来源 TASK | 导出实体                                                     | 导出方式 |
| ----------------------------- | --------- | ------------------------------------------------------------ | -------- |
| `src/core/parser.ts`          | TASK-003  | `parseVisionResponse(raw: string): ParsedResult`             | 命名导出 |
| `src/core/validator.ts`       | TASK-003  | `validateObjects(objects: VisualObject[]): ValidationResult` | 命名导出 |
| `src/core/normalizer.ts`      | TASK-003  | `normalizeCoordinates(objects, precision)`                   | 命名导出 |
| `src/core/prompt-builder.ts`  | TASK-003  | `buildAugmentedPrompt(params): string`                       | 命名导出 |
| `src/core/vision-client.ts`   | TASK-004  | `class VisionClient`                                         | 命名导出 |
| `src/core/session-manager.ts` | TASK-005  | `class SessionManager`                                       | 命名导出 |
| `src/core/modality-router.ts` | TASK-006  | `class ModalityRouter`                                       | 命名导出 |

若上述导出名与约定不符，TASK-006 的 `pipeline.ts` 导入将失败，需回编排者协调。

### 契约 3：测试数据库隔离约定

TASK-005（SessionManager）的测试必须使用 `:memory:` 数据库或临时文件路径，**不得使用** `config.ts` 中的 `DB_PATH`，避免污染开发/生产数据库文件。

---

## 10. 风险提醒

| 风险编号 | 关联任务     | 风险描述                                                                     | 等级 | 缓解策略                                                                     |
| -------- | ------------ | ---------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------- |
| R-01     | TASK-002     | config.ts 和 types.ts 定义错误影响全局                                       | 高   | TASK-002 完成后立即冻结；config.test.ts 覆盖全部变量校验                     |
| R-02     | TASK-003     | 核心管道 parser/validator/normalizer 逻辑错误导致后续全链路异常              | 中   | TDD 保障：Red→Green→Refactor，~220 行测试覆盖边界条件                        |
| R-03     | TASK-005     | node:sqlite 是 Node.js 22.5+ 新 API，生态资料少；DDD 聚合边界 + WAL 并发写入 | 高   | TDD + WAL 模式 + 并发写入测试 + 使用 `:memory:` 隔离测试                     |
| R-04     | TASK-006     | 集成复杂度最高——pipeline 协调全部模块，任何单点异常不能导致崩溃              | 高   | 全部模块 mock + 每个分支独立测试 + 降级处理覆盖                              |
| R-05     | TASK-007     | FFmpeg 系统依赖兼容性（Windows/Linux/macOS）；文档渲染库跨平台差异           | 中   | `ffmpeg-static` 自动下载二进制；Office 文档 MVP 返回降级提示                 |
| R-06     | TASK-006/007 | 契约不匹配——ModalityRouter 导入的适配器类名/路径与 TASK-007 实际导出不一致   | 中   | 跨 Batch 契约明确约定导出名和路径（见第 9 节）                               |
| R-07     | TASK-001     | CI 平台选型（GitHub Actions 默认）与项目实际托管平台可能不一致               | 低   | 计划中标注为可配置项；若非 GitHub 平台，调整 `.github/workflows/ci.yml` 路径 |
| R-08     | 全部         | 单次执行 2,355 行变更，review 和回滚难度大                                   | 中   | 分 3 Round 执行，每轮独立验证后再进入下一轮                                  |

---

## 11. 实现者交接信息

### 下游实现代理（子 Agent）注意事项

1. **所有子 Agent 启动时必须加载 `behavioral-guidelines` 技能**（已在每个 Execution Packet 的 `required_skills` 中列出）。
2. **共享区域文件**（`src/config.ts`、`src/types.ts`、`src/core/adapters/base-adapter.ts`、`src/core/modality-router.ts`）冻结后只能 `import` / `implements`，不得修改。
3. **TDD 任务**（TASK-002 config-validator、TASK-003 parser/validator/normalizer、TASK-005、TASK-006）严格按照 Red→Green→Refactor 循环执行。
4. **DDD 任务**（TASK-005、TASK-006）遵循项目编码规范中的 DDD 章节：聚合根定义边界、值对象不可变、领域服务跨聚合协调。
5. **任何需要修改冻结文件或共享契约的场景**，必须先提交 plan patch 回编排者，不得自行修改。
6. **测试文件**使用独立路径（`:memory:` 或 `os.tmpdir()`），不污染开发数据库。
7. **日志安全**：不得记录 Base64 字符串和 API Key。

### 编排者（Jarvis）交接信息

1. 每个 Batch 完成后，运行该 Batch 相关测试确认通过后再启动下一 Batch。
2. Batch 3（核心并行层）的 3 个 Agent 可同时 spawn，无共享文件冲突。
3. 接口冻结点之后，编排者应禁止任何子 Agent 修改冻结文件——若子 Agent 的 plan patch 涉及冻结文件，需特别审批。
4. Round 1/Batch 2 完成后，确认 `src/config.ts` 和 `src/types.ts` 的接口签名为最终版本再继续。

---

## 12. parallel_batches

### Batch 1（Round 1 -- 无依赖，可立即启动）

- **TASK-001** → subagent_type: `remediation-expert`

### Batch 2（Round 1 -- 依赖 Batch 1 全部完成）

- **TASK-002** → subagent_type: `backend-dev-expert`

### Batch 3（Round 1 -- 依赖 Batch 2 全部完成，三者并行）

- **TASK-003** → subagent_type: `backend-dev-expert`
- **TASK-004** → subagent_type: `backend-dev-expert`
- **TASK-005** → subagent_type: `backend-dev-expert`

> 并行安全说明：TASK-003/004/005 三者仅读取（不修改）TASK-002 的 `src/config.ts` 和 `src/types.ts`。各自修改的文件完全独立（parser/validator/normalizer/prompt-builder vs base-adapter/image-adapter/vision-client vs session-manager），无共享文件冲突。

### Batch 4（Round 2 -- 依赖 Batch 3 中 TASK-004 完成）

- **TASK-007** → subagent_type: `backend-dev-expert`

> 说明：TASK-007 仅依赖 TASK-004 的 `base-adapter.ts` 和 `vision-client.ts`。可于 TASK-004 完成后立即启动，不等待 TASK-003/005 完成。

### Batch 5（Round 2 -- 依赖 Batch 3 全部 + Batch 4 全部完成）

- **TASK-006** → subagent_type: `backend-logic-expert`

> 说明：TASK-006 依赖 TASK-003/004/005 的核心模块导出 + TASK-007 的适配器导出。延迟到 Batch 5 可确保 `modality-router.ts` 静态导入全部适配器时所有依赖文件已存在。

### Batch 6（Round 3 -- 依赖 Batch 5 全部完成）

- **TASK-008** → subagent_type: `backend-api-expert`

### Batch 7（Round 3 -- 依赖 Batch 6 全部完成）

- **TASK-009** → subagent_type: `remediation-expert`

---

## 13. Execution Packets

---

### task_id: TASK-001

### task_name: 工程配置初始化

### requirement_ids: REQ-C01, REQ-C02, REQ-C03, REQ-C04, REQ-C05, REQ-C06, REQ-N07, REQ-N08

### owner: remediation-expert

### objective: 创建完整的项目工程骨架——package.json（含全部运行时+开发依赖）、TypeScript 严格模式配置、ESLint+Prettier、Git hooks、CI 流水线

### in_scope:

- 初始化 `package.json`（含项目元数据 + 全部依赖声明）
- 创建 `tsconfig.json`（strict=true, ESM, 路径别名 `@/` → `./src/`）
- 创建 `.eslintrc.json`（TypeScript + import 规则，使用 `eslint-config-prettier`）
- 创建 `.prettierrc`（`semi=true, singleQuote=true, printWidth=80, tabWidth=2, trailingComma=es5, endOfLine=lf, arrowParens=avoid`）
- 创建 `.gitignore`（排除 `node_modules/`、`dist/`、`data/`、`.env`）
- 创建 `.husky/pre-commit`（`npx lint-staged`）
- 创建 `commitlint.config.js`（Conventional Commits 校验）
- 创建 `.github/workflows/ci.yml`（`lint → type-check → unit → build`）
- 创建 `tests/` 空目录及子目录结构
- 执行 `npm install` 安装全部依赖

### out_of_scope:

- 不创建任何业务逻辑文件（`src/` 下的 .ts 文件由后续 TASK 负责）

### input_documents:

- `E:\CodeStore\vision-mcp\docs\requirements\2026-05-08-visual-primitives-mcp.md`
- `E:\CodeStore\vision-mcp\docs\tasks\2026-05-08-visual-primitives-mcp-tasks.md`
- `E:\CodeStore\vision-mcp\docs\prds\需求文档.md`（第 5 节配置、第 6 节依赖与目录）
- `E:\CodeStore\vision-mcp\.claude\rules\团队协作规范.md`（Prettier/ESLint/CI 配置参考）

### allowed_paths:

- `E:\CodeStore\vision-mcp\package.json`
- `E:\CodeStore\vision-mcp\tsconfig.json`
- `E:\CodeStore\vision-mcp\.eslintrc.json`
- `E:\CodeStore\vision-mcp\.prettierrc`
- `E:\CodeStore\vision-mcp\.gitignore`
- `E:\CodeStore\vision-mcp\.husky\pre-commit`
- `E:\CodeStore\vision-mcp\commitlint.config.js`
- `E:\CodeStore\vision-mcp\.github\workflows\ci.yml`
- `E:\CodeStore\vision-mcp\tests\`（仅创建目录）
- `E:\CodeStore\vision-mcp\src\`（仅创建空目录占位——`src/`、`src/core/`、`src/core/adapters/`、`src/utils/`、`src/templates/`、`src/transport/`、`src/handlers/`）

### forbidden_paths:

- `E:\CodeStore\vision-mcp\src\**\*.ts`（不创建任何 .ts 文件）
- `E:\CodeStore\vision-mcp\docs\**`（不修改需求/任务文档）
- `E:\CodeStore\vision-mcp\.claude\**`

### dependencies: 无（Bootstrap 任务，无前置依赖）

### required_skills: behavioral-guidelines, code-standards

### parallel_group: 无（必须最先完成）

### wait_for: 无

### acceptance_criteria:

1. `npm install` 成功安装全部依赖（运行时：`@modelcontextprotocol/sdk`, `zod`, `pino`, `hono`, `ffmpeg-static`, `sharp`, `pdf-poppler`；开发：`typescript`, `@types/node`, `vitest`, `eslint`, `@typescript-eslint/*`, `prettier`, `eslint-config-prettier`, `husky`, `lint-staged`, `@commitlint/*`）
2. `npm run lint` 通过（空项目无错误）
3. `npm run typecheck` 通过（空项目无错误）
4. `npm run build` 成功生成空 dist
5. `npm test` 通过（无测试但 vitest 配置正确：`npx vitest run` 不报配置错误）
6. `git commit` 触发 pre-commit hook（lint-staged 运行）
7. `echo "feat: test" | npx commitlint` 通过
8. CI 配置文件语法正确（`.github/workflows/ci.yml` 包含 lint/type-check/unit/build 四个 job）

### test_strategy: manual_only

### handoff_notes:

- `package.json` 的 `scripts` 需定义：`lint`（eslint）、`typecheck`（tsc --noEmit）、`build`（tsc）、`test`（vitest run）、`test:watch`（vitest）、`dev`（tsx watch src/server.ts）
- `package.json` 的 `lint-staged` 配置需包含 `*.ts` 文件的 eslint --fix + prettier --write
- `vitest.config.ts` 需配置：`test` 目录匹配、alias 路径映射、环境为 node
- CI 的 `build` job 仅在 `main`/`develop` 分支运行，其余分支只跑 lint+typecheck+unit
- 预期变更行数：~145（配置文件，无业务代码）

### escalation_rule: 如需新增依赖包（超出 TASK-001 列出的清单），必须先回编排者确认，不得自行添加

---

### task_id: TASK-002

### task_name: 配置体系、类型定义与工具库

### requirement_ids: REQ-010, REQ-018, REQ-N03, REQ-N04

### owner: backend-dev-expert

### objective: 建立整个项目的配置读取/校验体系、全部共享 TypeScript 类型定义、结构化日志器、指数退避重试工具

### in_scope:

- `src/config.ts`：环境变量读取 + Zod schema 校验 + 必填项缺失时拒绝启动 + `DB_PATH` 目录自动创建
- `src/types.ts`：全部共享类型/接口定义（`VisualObject`, `BBox`, `Centroid`, `SessionContext`, `MediaAdapter`, `ParsedResult`, `ValidationResult`, `PipelineParams`, `PipelineResult`, `AnalysisParseError`, `ValidationError` 等）
- `src/utils/logger.ts`：pino 结构化日志，含 Base64/API Key 敏感数据过滤
- `src/utils/retry.ts`：指数退避重试工具函数（`withRetry<T>(fn, options): Promise<T>`）
- `tests/config.test.ts`：配置校验测试（TDD -- 先写 Red 测试再绿实现）
- `tests/retry.test.ts`：重试逻辑测试

### out_of_scope:

- 不实现任何核心业务管道逻辑（parser/validator/normalizer/prompt-builder 由 TASK-003 负责）
- 不实现 SessionManager（由 TASK-005 负责）
- 不实现 Pipeline Orchestrator（由 TASK-006 负责）

### input_documents:

- `E:\CodeStore\vision-mcp\docs\requirements\2026-05-08-visual-primitives-mcp.md`（REQ-010, REQ-018, REQ-N03, REQ-N04）
- `E:\CodeStore\vision-mcp\docs\tasks\2026-05-08-visual-primitives-mcp-tasks.md`（TASK-002 详情 + config.ts 完整变量清单）
- `E:\CodeStore\vision-mcp\docs\prds\需求文档.md`（第 5 节配置与环境变量、第 10 节日志与观测）

### allowed_paths:

- `E:\CodeStore\vision-mcp\src\config.ts`
- `E:\CodeStore\vision-mcp\src\types.ts`
- `E:\CodeStore\vision-mcp\src\utils\logger.ts`
- `E:\CodeStore\vision-mcp\src\utils\retry.ts`
- `E:\CodeStore\vision-mcp\tests\config.test.ts`
- `E:\CodeStore\vision-mcp\tests\retry.test.ts`

### forbidden_paths:

- `E:\CodeStore\vision-mcp\package.json`（依赖已在 TASK-001 锁定，不得修改）
- `E:\CodeStore\vision-mcp\src\core\**`（核心管道由后续 TASK 负责）
- `E:\CodeStore\vision-mcp\docs\**`

### dependencies:

- TASK-001 完成的 `package.json`（全部依赖已安装）
- TASK-001 完成的 `tsconfig.json`（严格模式 + 路径别名）

### required_skills: behavioral-guidelines, code-standards, source-driven-development, incremental-implementation, verification-before-completion, test-driven-development

### parallel_group: 无（所有后续 TASK 依赖此任务，不得与任何其他 TASK 并行）

### wait_for: TASK-001

### acceptance_criteria:

1. 配置校验：缺少必填环境变量（`VISION_API_BASE_URL` / `VISION_API_KEY` / `VISION_MODEL_NAME`）时 `ConfigLoader.load()` 抛出明确错误（含哪个变量缺失），拒绝启动
2. 配置校验：所有可选变量有合法默认值（与 task doc 中 config.ts 完整变量清单一致）
3. 配置校验：`COORDINATE_PRECISION` 仅接受 `"0-100"` 或 `"0-1000"`，其他值拒绝
4. 配置校验：`SESSION_TTL_SECONDS` 和 `TIMEOUT_MS` 必须是正整数
5. 配置校验：`DB_PATH` 设置后自动创建父目录（不存在时）
6. 日志器：`logger.info({ base64: "dGVzdA==" })` 输出 JSON 中不包含 `base64` 字段
7. 日志器：`logger.info({ apiKey: "sk-xxx" })` 输出 JSON 中不包含 `apiKey` 字段
8. 日志器：`logger.info({ nested: { base64: "abc" } })` 深层嵌套的敏感字段也被过滤
9. 重试工具：模拟 3 次失败 + 第 4 次成功，确认指数退避时间间隔（初始延迟 ~1s）递增
10. 重试工具：全部重试耗尽后抛出最后一次错误（错误消息保留）
11. TypeScript 类型检查：`MediaAdapter` 接口签名完整，可被其他模块 `implements`
12. `npm test` 全部通过（含 config.test.ts + retry.test.ts）

### test_strategy: tdd

### handoff_notes:

- `src/config.ts` 和 `src/types.ts` 是全局共享区域，本任务完成后立即冻结——Batch 2 完成后任何修改须经编排者审批
- `MediaAdapter` 接口定义必须包含 `adapt(input: string): Promise<Base64Image[]>` 方法和 `mediaType: string` 属性
- `ConfigLoader` 必须是单例模式或导出单例 `config` 对象，确保全局配置一致
- pino 日志配置使用 `redact` 选项过滤敏感字段，而非手动拼接 JSON
- 预期变更行数：~260（含 ~100 行测试）

### escalation_rule: 如需变更 `src/config.ts` 的环境变量清单（新增/删除/修改默认值）或 `src/types.ts` 接口签名，必须先回编排者——这属于共享契约变更

---

### task_id: TASK-003

### task_name: 图片核心管道（解析/校验/归一化/提示词构建）

### requirement_ids: REQ-006, REQ-007, REQ-008, REQ-009

### owner: backend-dev-expert

### objective: 实现视觉模型响应的完整后处理管道——JSON 解析+正则备用、坐标校验、精度归一化、增强提示词构建，全部以 TDD 方式驱动

### in_scope:

- `src/core/parser.ts`：JSON 主解析 + 正则备用（处理 ` ```json...``` ` 包裹）
- `src/core/validator.ts`：坐标范围/合法性/唯一性/质心在 bbox 内校验 + 视频/文档扩展字段可选校验
- `src/core/normalizer.ts`：0-1000 ↔ 0-100 坐标归一化
- `src/core/prompt-builder.ts`：增强提示词构建（注入空间信息 + 会话历史 + 用户问题）
- `src/templates/vision-system.txt`：视觉模型系统提示词（与 PRD 第九章一致）
- `src/templates/augmented-prompt.txt`：多模态统一模板（含变量占位符）
- `tests/parser.test.ts`：~70 行测试
- `tests/validator.test.ts`：~90 行测试
- `tests/normalizer.test.ts`：~60 行测试

### out_of_scope:

- 不实现 VisionClient（由 TASK-004 负责）
- 不实现 SessionManager（由 TASK-005 负责）
- 不实现 PipelineOrchestrator（由 TASK-006 负责）

### input_documents:

- `E:\CodeStore\vision-mcp\docs\requirements\2026-05-08-visual-primitives-mcp.md`（REQ-006, REQ-007, REQ-008, REQ-009）
- `E:\CodeStore\vision-mcp\docs\tasks\2026-05-08-visual-primitives-mcp-tasks.md`（TASK-003 详情）
- `E:\CodeStore\vision-mcp\docs\prds\需求文档.md`（3.2 Parser & Validator, 3.3 Prompt Builder, 第九章系统提示词）

### allowed_paths:

- `E:\CodeStore\vision-mcp\src\core\parser.ts`
- `E:\CodeStore\vision-mcp\src\core\validator.ts`
- `E:\CodeStore\vision-mcp\src\core\normalizer.ts`
- `E:\CodeStore\vision-mcp\src\core\prompt-builder.ts`
- `E:\CodeStore\vision-mcp\src\templates\vision-system.txt`
- `E:\CodeStore\vision-mcp\src\templates\augmented-prompt.txt`
- `E:\CodeStore\vision-mcp\tests\parser.test.ts`
- `E:\CodeStore\vision-mcp\tests\validator.test.ts`
- `E:\CodeStore\vision-mcp\tests\normalizer.test.ts`

### forbidden_paths:

- `E:\CodeStore\vision-mcp\src\config.ts`（TASK-002 独占，只读 import）
- `E:\CodeStore\vision-mcp\src\types.ts`（TASK-002 独占，只读 import，可 `implements` 不可修改）
- `E:\CodeStore\vision-mcp\src\core\session-manager.ts`（TASK-005 独占）
- `E:\CodeStore\vision-mcp\src\core\pipeline.ts`（TASK-006 独占）
- `E:\CodeStore\vision-mcp\src\core\modality-router.ts`（TASK-006 独占）

### dependencies:

- TASK-002 完成的 `src/types.ts`（VisualObject, BBox, Centroid, AnalysisParseError, ValidationError 等类型定义）
- TASK-002 完成的 `src/config.ts`（COORDINATE_PRECISION 配置读取）

### required_skills: behavioral-guidelines, code-standards, test-driven-development, source-driven-development, incremental-implementation, verification-before-completion

### parallel_group: TASK-004, TASK-005

### wait_for: TASK-002

### acceptance_criteria:

1. **Parser -- 标准 JSON**：输入 `'{"objects": [...]}'` → 返回解析后的对象
2. **Parser -- Markdown 包裹**：输入 `'```json\n{"objects": [...]}\n```'` → 正则提取成功
3. **Parser -- 完全无法解析**：输入 `'not json at all'` → 抛出 `AnalysisParseError`
4. **Parser -- objects 数组为空**：输入 `'{"objects": []}'` → 抛出 `AnalysisParseError`
5. **Validator -- objects 至少 1 个物体**：空数组 → 抛出 `ValidationError`
6. **Validator -- object_id 无重复** → 通过；有重复 → 抛出 `ValidationError`
7. **Validator -- bbox 四个值均在 0-1000** → 通过；任一越界 → 抛出
8. **Validator -- x1 < x2 且 y1 < y2** → 通过；不满足 → 抛出
9. **Validator -- centroid 落在 bbox 内** → 通过；不满足 → 抛出
10. **Validator -- page/timestamp_range/media_type 可选**，存在时校验格式
11. **Normalizer -- 0-1000 → 0-100**：bbox 和 centroid 均按比例缩放（如 `[0,0,1000,1000]` → `[0,0,100,100]`）
12. **Normalizer -- 精度配置为 0-1000** 时保持原值不变
13. **Normalizer -- 归一化后** x1<x2, y1<y2 仍满足
14. **Normalizer -- centroid 归一化后仍在 bbox 内**
15. **Prompt Builder -- 输入 objects + question** → 输出含 `[多模态空间信息]` + `[用户问题]` 的完整文本
16. **Prompt Builder -- 输出含** label, bbox, centroid, state, relevance
17. **Prompt Builder -- 坐标系说明** "原点左上角，x 右 y 下" 正确
18. **Prompt Builder -- 无会话历史时** `[会话历史]` 段不出现
19. **Templates -- vision-system.txt** 与 PRD 第九章内容一致
20. **Templates -- augmented-prompt.txt** 包含 `{{objects_list}}` / `{{spatial_relationships}}` / `{{session_history}}` / `{{user_question}}` / `{{precision}}` 等变量占位符
21. `npm test -- tests/parser.test.ts tests/validator.test.ts tests/normalizer.test.ts` 全部通过（~220 行测试）
22. `npm run typecheck` 通过

### test_strategy: tdd

### handoff_notes:

- parser/validator/normalizer 按 Red→Green→Refactor 严格 TDD 流程
- prompt-builder 和 templates 为直接开发（模板拼接，无分支逻辑），但建议写 2-3 个基础验证测试
- 模板文件（.txt）需通过 `fs.readFileSync` 加载——TASK-006 的 pipeline 会在运行时读取
- `prompt-builder.ts` 的函数签名须接受 `sessionHistory?: string` 可选参数，空值时跳过 `[会话历史]` 段
- 预期变更行数：~490（~270 源码 + ~220 测试）

### escalation_rule: 如需新增解析规则、校验规则或归一化精度档位（非 0-100/0-1000），必须先回编排者——这属于需求变更

---

### task_id: TASK-004

### task_name: 图片适配器与视觉客户端

### requirement_ids: REQ-003, REQ-N04

### owner: backend-dev-expert

### objective: 实现 MediaAdapter 接口的基础适配器（ImageAdapter）和 OpenAI 兼容视觉模型客户端（VisionClient），建立适配器接口契约

### in_scope:

- `src/core/adapters/base-adapter.ts`：`MediaAdapter` 接口实体文件（`src/types.ts` 声明签名，此处为接口实现契约 + 可选的 BaseAdapter 抽象基类）
- `src/core/adapters/image-adapter.ts`：图片透传适配器——Base64 校验、20MB 大小检验、格式校验
- `src/core/vision-client.ts`：OpenAI 兼容视觉模型客户端——多图请求构建、`response_format` 强制 JSON、指数退避重试（最多 3 次）、45s 超时、降级兜底

### out_of_scope:

- 不实现 VideoAdapter 和 DocumentAdapter（由 TASK-007 负责）
- 不实现 ModalityRouter（由 TASK-006 负责）
- 不实现 PipelineOrchestrator（由 TASK-006 负责）

### input_documents:

- `E:\CodeStore\vision-mcp\docs\requirements\2026-05-08-visual-primitives-mcp.md`（REQ-003, REQ-N04）
- `E:\CodeStore\vision-mcp\docs\tasks\2026-05-08-visual-primitives-mcp-tasks.md`（TASK-004 详情）
- `E:\CodeStore\vision-mcp\docs\prds\需求文档.md`（3.0.1 ImageAdapter, 3.1 VisionClient）

### allowed_paths:

- `E:\CodeStore\vision-mcp\src\core\adapters\base-adapter.ts`
- `E:\CodeStore\vision-mcp\src\core\adapters\image-adapter.ts`
- `E:\CodeStore\vision-mcp\src\core\vision-client.ts`

### forbidden_paths:

- `E:\CodeStore\vision-mcp\src\config.ts`（TASK-002 独占，只读 import）
- `E:\CodeStore\vision-mcp\src\types.ts`（TASK-002 独占，只读 import / implements）
- `E:\CodeStore\vision-mcp\src\core\adapters\video-adapter.ts`（TASK-007 独占）
- `E:\CodeStore\vision-mcp\src\core\adapters\document-adapter.ts`（TASK-007 独占）
- `E:\CodeStore\vision-mcp\src\core\modality-router.ts`（TASK-006 独占）
- `E:\CodeStore\vision-mcp\src\core\pipeline.ts`（TASK-006 独占）

### dependencies:

- TASK-002 完成的 `src/types.ts`（MediaAdapter 接口签名、Base64Image 类型）
- TASK-002 完成的 `src/config.ts`（VISION_API_BASE_URL, VISION_API_KEY, VISION_MODEL_NAME, TIMEOUT_MS）
- TASK-002 完成的 `src/utils/retry.ts`（指数退避重试）

### required_skills: behavioral-guidelines, code-standards, source-driven-development, incremental-implementation, verification-before-completion

### parallel_group: TASK-003, TASK-005

### wait_for: TASK-002

### acceptance_criteria:

1. **BaseAdapter**：`MediaAdapter` 接口已从 `src/types.ts` 导入并在 `base-adapter.ts` 中提供实现契约文档（JSDoc）
2. **ImageAdapter**：`implements MediaAdapter`，`mediaType = "image"`
3. **ImageAdapter**：输入有效 JPEG/PNG/GIF/WebP Base64 → 透传返回单元素 `Base64Image[]`
4. **ImageAdapter**：输入空/无效 Base64 → 返回错误提示（`{ error: "Invalid base64 input" }`，不抛异常）
5. **ImageAdapter**：输入 30MB Base64 → 返回 `{ error: "Image exceeds 20MB limit" }`，不抛异常
6. **VisionClient**：构建的 API 请求包含 `messages[].content[]` 中多个 `image_url` block
7. **VisionClient**：请求体包含 `response_format: { type: "json_object" }`
8. **VisionClient**：指数退避重试最多 3 次（429/503/5xx 触发）
9. **VisionClient**：超时 45s（通过 `TIMEOUT_MS` 配置）
10. **VisionClient**：网络错误或超时 → 返回降级结果 `{ objects: [], error: "..." }`（不抛异常不崩溃）
11. `npm run typecheck` 通过（ImageAdapter 满足 MediaAdapter 接口契约）

### test_strategy: test_after

### handoff_notes:

- `base-adapter.ts` 接口冻结后（Batch 3 完成），TASK-007 的适配器必须 `implements MediaAdapter`，不得修改接口签名
- `vision-client.ts` 是外部 API 调用封装，单元测试用 mock fetch，不需要真实 API 调用
- ImageAdapter 的 Base64 校验逻辑：检查是否是有效的 Base64 字符串（正则 + 解码长度估算），空字符串和非法字符均判定为无效
- 预期变更行数：~140（全部源码，无独立测试文件——验证依赖 typecheck + TASK-006 集成测试）

### escalation_rule: 如需修改 `MediaAdapter` 接口签名（在 `src/types.ts` 中），必须先回编排者——属于共享契约变更

---

### task_id: TASK-005

### task_name: 会话管理器（Session Manager）

### requirement_ids: REQ-011, REQ-012, REQ-013, REQ-014, REQ-015, REQ-N06

### owner: backend-dev-expert

### objective: 基于 node:sqlite 实现完整的会话持久化管理器，支持创建/查询/更新/删除会话、物体增补/替换合并、跨轮 ID 一致性、TTL 过期自动清理

### in_scope:

- `src/core/session-manager.ts`：SessionManager 类，基于 `node:sqlite` 的完整实现
  - DDD 聚合根：`Session`
  - 实体：`SessionObject`
  - 值对象：`BBox`, `Centroid`, `MergeStrategy`
  - 仓储：SessionManager 自身（直接操作 SQLite）
  - 领域服务：`ObjectMergeService`（augment/replace 策略）
  - 领域事件（轻量函数调用）：`SessionCreated`, `ObjectsMerged`, `SessionExpired`
  - 7 个核心方法：`createSession`, `getSession`, `upsertObjects`, `addConversationTurn`, `getRecentHistory`, `cleanupExpired`, `deleteSession`
- `tests/session-manager.test.ts`：完整 CRUD + TTL + merge 策略测试（~200 行）

### out_of_scope:

- 不实现 PipelineOrchestrator（由 TASK-006 负责）
- 不实现 TTL 定时器调度（由 TASK-008 的 `server.ts` 负责 `setInterval` 调用 `cleanupExpired`）

### input_documents:

- `E:\CodeStore\vision-mcp\docs\requirements\2026-05-08-visual-primitives-mcp.md`（REQ-011~015, REQ-N06）
- `E:\CodeStore\vision-mcp\docs\tasks\2026-05-08-visual-primitives-mcp-tasks.md`（TASK-005 详情 + DDD 建模要求）
- `E:\CodeStore\vision-mcp\docs\prds\需求文档.md`（3.4 SessionManager + SQLite DDL）

### allowed_paths:

- `E:\CodeStore\vision-mcp\src\core\session-manager.ts`
- `E:\CodeStore\vision-mcp\tests\session-manager.test.ts`

### forbidden_paths:

- `E:\CodeStore\vision-mcp\src\config.ts`（TASK-002 独占，只读 import DB_PATH / SESSION_TTL_SECONDS）
- `E:\CodeStore\vision-mcp\src\types.ts`（TASK-002 独占，只读 import / implements）
- `E:\CodeStore\vision-mcp\src\core\pipeline.ts`（TASK-006 独占）
- `E:\CodeStore\vision-mcp\src\core\modality-router.ts`（TASK-006 独占）
- `E:\CodeStore\vision-mcp\data\**`（测试使用 `:memory:` 或临时文件，不操作 `data/` 目录）

### dependencies:

- TASK-002 完成的 `src/types.ts`（VisualObject, SessionContext, BBox, Centroid, SessionObject 等类型）
- TASK-002 完成的 `src/config.ts`（DB_PATH, SESSION_TTL_SECONDS）

### required_skills: behavioral-guidelines, code-standards, test-driven-development, source-driven-development, incremental-implementation, verification-before-completion

### parallel_group: TASK-003, TASK-004

### wait_for: TASK-002

### acceptance_criteria:

1. 创建会话 → 查询可获取完整元数据（`createSession` + `getSession`）
2. 重复创建同 `session_id` → 返回已有会话（幂等，不抛异常不覆盖）
3. `upsertObjects` + `augment` 策略 → 新物体分配新 ID，不与已有 ID 冲突，新旧数据共存
4. `upsertObjects` + `replace` 策略 → 清空旧物体，仅保留新物体（先 DELETE 再 INSERT）
5. 同物体跨轮 ID 一致：同一 `session_id` + 同一 `object_id` 的物体在多次 `getSession` 查询中 `object_id` 不变（SQLite 持久化保证）
6. 重启验证：写入物体 + 新建 SessionManager 实例（模拟进程重启）→ `getSession` 仍能获取完整数据
7. `addConversationTurn` → `getRecentHistory(sessionId, N)` 返回最近 N 轮对话，轮次和内容正确
8. `cleanupExpired(ttlSeconds)` → `last_accessed_at` 超时的会话被删除（`sessions` + `session_objects` + `conversation_history` 级联删除），未过期会话不受影响
9. `deleteSession` → 完全删除会话及全部关联数据（三表级联）
10. 并发写入测试：模拟多轮快速调用（`Promise.all` 并发写入），WAL 模式下不丢数据、不损坏
11. SQLite WAL 模式已启用（`PRAGMA journal_mode=WAL;`）
12. 表结构与 PRD 3.4 节 DDL 完全一致
13. `npm test -- tests/session-manager.test.ts` 全部通过（~200 行测试）

### test_strategy: tdd

### handoff_notes:

- DDD 建模：`Session` 聚合根包含 `session_id`、`media_type`、`created_at`、`last_accessed_at`、`objects[]`
- `ObjectMergeService` 是领域服务，负责 augment/replace 策略的物件 ID 分配逻辑
- `BBox` 和 `Centroid` 是值对象（不可变），建议使用 TypeScript `readonly` 类型
- 测试使用 `:memory:` 数据库（传入空字符串 `""` 给 `node:sqlite` 构造器），隔离开发数据库
- SQLite 表名：`sessions`、`session_objects`、`conversation_history`（严格与 PRD DDL 一致）
- `getRecentHistory` 返回格式建议为简洁字符串数组：`["User: xxx", "Assistant: yyy"]`
- 预期变更行数：~400（~200 源码 + ~200 测试）

### escalation_rule: 如需修改 DDL 表结构（新增列/改列名/新增表），或修改 merge 策略语义（如新增 overwrite 策略），必须先回编排者——属于数据契约变更

---

### task_id: TASK-007

### task_name: 视频适配器与文档适配器

### requirement_ids: REQ-004, REQ-005

### owner: backend-dev-expert

### objective: 实现 VideoAdapter（FFmpeg 抽帧）和 DocumentAdapter（文档渲染为图像），扩展多模态输入支持

### in_scope:

- `src/core/adapters/video-adapter.ts`：FFmpeg 抽帧适配器
  - Base64 解码 → 临时文件（`os.tmpdir()`）
  - `ffprobe` 获取视频时长/帧率
  - 分段抽帧策略（≤30s 每 3s、30s-120s 每 5s、>120s 每 10s）
  - `ffmpeg` 抽帧为 JPEG（质量 85%）
  - 每帧转 Base64 + 时间戳元数据
  - 抽帧数受 `MAX_VIDEO_FRAMES` 限制
  - FFmpeg 不可用时返回错误提示
- `src/core/adapters/document-adapter.ts`：文档渲染适配器
  - PDF 用 `sharp` + `pdf-poppler` 渲染每页为 PNG
  - TXT/MD 用 sharp 创建文本渲染图像
  - Office 文档（DOCX/PPTX/XLSX）MVP 返回降级提示
  - 渲染页数受 `MAX_DOC_PAGES` 限制
  - 渲染失败时返回降级提示
- `tests/adapters/video-adapter.test.ts`：视频适配器测试（需 `tests/fixtures/sample.mp4`）
- `tests/adapters/document-adapter.test.ts`：文档适配器测试（需 `tests/fixtures/sample.pdf`）
- `tests/fixtures/` 目录：测试用样本文件

### out_of_scope:

- 不实现 Office 文档的结构化提取（DOCX/PPTX/XLSX 文字提取由 v1.1 迭代）
- 不实现 FFmpeg 场景检测智能抽帧（MVP 用固定间隔）
- 不实现 ModalityRouter（由 TASK-006 负责）

### input_documents:

- `E:\CodeStore\vision-mcp\docs\requirements\2026-05-08-visual-primitives-mcp.md`（REQ-004, REQ-005）
- `E:\CodeStore\vision-mcp\docs\tasks\2026-05-08-visual-primitives-mcp-tasks.md`（TASK-007 详情）
- `E:\CodeStore\vision-mcp\docs\prds\需求文档.md`（3.0.2 VideoAdapter, 3.0.3 DocumentAdapter）

### allowed_paths:

- `E:\CodeStore\vision-mcp\src\core\adapters\video-adapter.ts`
- `E:\CodeStore\vision-mcp\src\core\adapters\document-adapter.ts`
- `E:\CodeStore\vision-mcp\tests\adapters\video-adapter.test.ts`
- `E:\CodeStore\vision-mcp\tests\adapters\document-adapter.test.ts`
- `E:\CodeStore\vision-mcp\tests\fixtures\`（创建测试样本文件）

### forbidden_paths:

- `E:\CodeStore\vision-mcp\src\core\adapters\base-adapter.ts`（TASK-004 独占，只读 implements）
- `E:\CodeStore\vision-mcp\src\core\modality-router.ts`（TASK-006 独占，只读——TASK-006 从本任务的适配器文件导入）
- `E:\CodeStore\vision-mcp\src\core\pipeline.ts`（TASK-006 独占）
- `E:\CodeStore\vision-mcp\src\config.ts`（TASK-002 独占，只读 import）
- `E:\CodeStore\vision-mcp\src\types.ts`（TASK-002 独占，只读 import）

### dependencies:

- TASK-002 完成的 `src/types.ts`（MediaAdapter 接口、Base64Image 类型）
- TASK-002 完成的 `src/config.ts`（MAX_VIDEO_FRAMES, MAX_DOC_PAGES）
- TASK-004 完成的 `src/core/adapters/base-adapter.ts`（MediaAdapter 接口）
- TASK-004 完成的 `src/core/vision-client.ts`（document-adapter 可能复用）

### required_skills: behavioral-guidelines, code-standards, source-driven-development, incremental-implementation, verification-before-completion

### parallel_group: 无（TASK-007 之后由 TASK-006 导入，TASK-008 之后由 TASK-006 依赖；TASK-007 与 TASK-008 无直接依赖但 TASK-006 需要 TASK-007 的适配器文件先存在——见 Batch 编排）

### wait_for: TASK-004（base-adapter.ts + vision-client.ts）

### acceptance_criteria:

1. **VideoAdapter**：`implements MediaAdapter`，`mediaType = "video"`
2. **VideoAdapter**：输入小样本 MP4（~10s）→ 返回 ≥2 帧 Base64 JPEG + 时间戳（`timestamp_start`/`timestamp_end`）
3. **VideoAdapter**：输入超长视频（~180s）→ 帧数不超过 `MAX_VIDEO_FRAMES`（默认 10）
4. **VideoAdapter**：FFmpeg/ffprobe 不可用 → 返回 `{ error: "FFmpeg is not available..." }`，不崩溃
5. **VideoAdapter**：无效 Base64 视频数据 → 返回错误提示
6. **DocumentAdapter**：`implements MediaAdapter`，`mediaType` 根据输入格式动态返回
7. **DocumentAdapter**：输入小样本 PDF（~3 页）→ 返回每页 Base64 PNG + 页码
8. **DocumentAdapter**：页数超过 `MAX_DOC_PAGES`（默认 20）→ 只渲染前 N 页
9. **DocumentAdapter**：输入 TXT/MD → 渲染为图像（sharp 文本渲染）
10. **DocumentAdapter**：输入 DOCX/PPTX/XLSX → 返回 `{ error: "Office 文档暂不支持，请转换为 PDF 后重试" }`
11. **DocumentAdapter**：无效 Base64 文档数据 → 返回错误提示
12. 两个适配器均采用命名导出（`export class VideoAdapter`, `export class DocumentAdapter`）——与契约 1（第 9 节）一致
13. `npm run typecheck` 通过（两个适配器满足 MediaAdapter 接口）
14. `npm test -- tests/adapters/` 全部通过（~160 行测试）

### test_strategy: test_after

### handoff_notes:

- 测试用样本文件放入 `tests/fixtures/`：`sample.mp4`（<1MB，~5s）和 `sample.pdf`（~2 页，<1MB）
- 视频抽帧策略严格按 PRD 分段：≤30s 每 3s、30-120s 每 5s、>120s 每 10s。帧序号从 1 开始
- 每个适配器的 `adapt()` 方法签名：`async adapt(input: string): Promise<Base64Image[]>`
- `Base64Image` 类型需含 `data`（Base64 字符串）、`mimeType`、`metadata`（含 `timestamp` 或 `page` 或 `media_type`）
- 适配器命名导出必须为 `VideoAdapter` 和 `DocumentAdapter`（大写类名）——TASK-006 的 `modality-router.ts` 按此名静态导入
- Office 文档降级提示文案：`"Office 文档（DOCX/PPTX/XLSX）暂不支持，请转换为 PDF 后重试"`
- 预期变更行数：~340（~180 源码 + ~160 测试）

### escalation_rule:

- 如需修改 `Base64Image` 类型定义（在 `src/types.ts` 中），必须先回编排者——属于共享契约变更
- 如需新增文档格式支持（如 EPUB），先回编排者确认——属于需求范围变更
- FFmpeg 不可用时的错误提示文案需与 TASK-006 的降级处理逻辑协调

---

### task_id: TASK-006

### task_name: 管道编排器与模态路由器

### requirement_ids: REQ-001, REQ-016, REQ-017, REQ-N01, REQ-N02, REQ-N05

### owner: backend-logic-expert

### objective: 实现 PipelineOrchestrator（多轮处理全流程编排）和 ModalityRouter（模态→适配器路由注册），协调全部核心模块完成从输入到 augmented_prompt 的完整链路

### in_scope:

- `src/core/pipeline.ts`：PipelineOrchestrator 领域服务
  - 9 步处理流程：接收参数 → getSession → 判断来源（cache/vision）→ ModalityRouter 路由 → VisionClient 分析 → Parser 解析 → Validator 校验 → Normalizer 归一化 → SessionManager.upsertObjects → PromptBuilder 构建 → 返回 augmented_prompt
  - 缓存命中逻辑（`fromCache=true`，跳过视觉 API）
  - 降级处理逻辑（任何子模块异常 → 日志记录 → 返回降级提示词 → 进程不崩溃）
  - augment/replace 合并策略分发
- `src/core/modality-router.ts`：ModalityRouter
  - 注册表模式：`Map<string, MediaAdapter>`
  - 静态导入并注册 ImageAdapter、VideoAdapter、DocumentAdapter
  - `route(mediaType: string): MediaAdapter` 路由方法
  - 未知 media_type → 抛出明确错误（含支持的媒体类型列表）
- `tests/pipeline.test.ts`：管道集成测试（~150 行，全部 mock）

### out_of_scope:

- 不实现 MCP 工具注册和传输层（由 TASK-008 负责）
- 不实现 TTL 定时清理调度（由 TASK-008 负责）
- 不修改任何子模块（parser/validator/normalizer/session-manager/adapters）的内部实现

### input_documents:

- `E:\CodeStore\vision-mcp\docs\requirements\2026-05-08-visual-primitives-mcp.md`（REQ-001/016/017, REQ-N01/02/05）
- `E:\CodeStore\vision-mcp\docs\tasks\2026-05-08-visual-primitives-mcp-tasks.md`（TASK-006 详情 + DDD 建模 + 核心流程 9 步）
- `E:\CodeStore\vision-mcp\docs\prds\需求文档.md`（3.5 Pipeline Orchestrator + 2.1 架构图）

### allowed_paths:

- `E:\CodeStore\vision-mcp\src\core\pipeline.ts`
- `E:\CodeStore\vision-mcp\src\core\modality-router.ts`
- `E:\CodeStore\vision-mcp\tests\pipeline.test.ts`

### forbidden_paths:

- `E:\CodeStore\vision-mcp\src\core\parser.ts`（TASK-003 独占，只读 import）
- `E:\CodeStore\vision-mcp\src\core\validator.ts`（TASK-003 独占，只读 import）
- `E:\CodeStore\vision-mcp\src\core\normalizer.ts`（TASK-003 独占，只读 import）
- `E:\CodeStore\vision-mcp\src\core\prompt-builder.ts`（TASK-003 独占，只读 import）
- `E:\CodeStore\vision-mcp\src\core\session-manager.ts`（TASK-005 独占，只读 import）
- `E:\CodeStore\vision-mcp\src\core\adapters\base-adapter.ts`（TASK-004 独占，只读 import）
- `E:\CodeStore\vision-mcp\src\core\adapters\image-adapter.ts`（TASK-004 独占，只读 import）
- `E:\CodeStore\vision-mcp\src\core\adapters\video-adapter.ts`（TASK-007 独占，只读 import）
- `E:\CodeStore\vision-mcp\src\core\adapters\document-adapter.ts`（TASK-007 独占，只读 import）
- `E:\CodeStore\vision-mcp\src\config.ts`（TASK-002 独占，只读 import）
- `E:\CodeStore\vision-mcp\src\types.ts`（TASK-002 独占，只读 import）

### dependencies:

- TASK-002 完成的 `src/types.ts`、`src/config.ts`、`src/utils/logger.ts`
- TASK-003 完成的 `src/core/parser.ts`、`src/core/validator.ts`、`src/core/normalizer.ts`、`src/core/prompt-builder.ts`
- TASK-004 完成的 `src/core/adapters/base-adapter.ts`、`src/core/adapters/image-adapter.ts`、`src/core/vision-client.ts`
- TASK-005 完成的 `src/core/session-manager.ts`
- TASK-007 完成的 `src/core/adapters/video-adapter.ts`、`src/core/adapters/document-adapter.ts`

### required_skills: behavioral-guidelines, code-standards, test-driven-development, source-driven-development, incremental-implementation, verification-before-completion

### parallel_group: 无（pipeline 作为唯一集成点，依赖全部子模块完成）

### wait_for: TASK-003, TASK-004, TASK-005, TASK-007

### acceptance_criteria:

1. **Cache Hit**：同 `session_id` 第二轮无新 `media_base64` → `from_cache=true`，未调用 VisionClient.analyze()（通过 mock 验证 spy）
2. **Cache Miss + Image**：新 session + image → ImageAdapter 调用 → VisionClient 调用 → Parser → Validator → Normalizer → SessionManager.upsertObjects → PromptBuilder → 返回完整 `augmented_prompt`
3. **Cache Miss + Video**：新 session + video → VideoAdapter 调用 → VisionClient → 解析 → 入库（mock 验证 flow）
4. **Cache Miss + Document**：新 session + pdf → DocumentAdapter 调用 → VisionClient → 解析 → 入库
5. **Augment 策略**：已有 session + 新 media_base64 + augment → 新物体追加（通过 mock SessionManager 验证 `upsertObjects` 收到 `augment` 策略）
6. **Replace 策略**：已有 session + 新 media_base64 + replace → 旧物体清空（mock 验证 `replace` 策略）
7. **降级处理**：VisionClient 返回不可解析内容 → 不抛异常，`augmented_prompt` 含降级说明 + 用户问题
8. **降级处理**：任一子模块抛异常 → 记录 error 日志 → 返回降级提示词 → Pipeline.execute() 正常返回（不 throw）
9. **降级处理**：SessionManager 初始化失败（SQLite 不可用）→ 记录 error → 返回降级提示词
10. **跨轮 ID 一致**：同 session 同物理物体 → SQLite 读取的 `object_id` 不变（mock SessionManager 模拟）
11. **多模态混合**：同一 session 内先图片后 PDF（augment 模式）→ 物体含 `media_type` 区分（mock 验证）
12. **ModalityRouter.unknown media_type**：输入 `"audio/mp3"` → `route()` 抛出明确错误（含支持列表）
13. `npm test -- tests/pipeline.test.ts` 全部通过（~150 行测试）
14. `npm run typecheck` 通过

### test_strategy: tdd

### handoff_notes:

- DDD 领域服务 `PipelineOrchestrator`：不持有状态，纯函数式的编排方法 `execute(params: PipelineParams): Promise<PipelineResult>`
- 测试全部使用 mock（mock adapters + mock vision client + mock session manager），不依赖外部服务
- `PipelineOrchestrator` 构造时注入所有依赖（或使用工厂函数），便于 mock 替换
- `PipelineResult` 类型需含 `session_id`、`augmented_prompt`、`objects_count`、`from_cache`、`round` 字段
- `PipelineParams` 类型需含 `session_id?`、`media_base64?`、`media_type?`、`question`、`merge_strategy?`、`coordinate_precision?`
- 预期变更行数：~330（~180 源码 + ~150 测试）

### escalation_rule: 如需修改子模块的导出函数签名（parser/validator/normalizer/session-manager 等），必须先回编排者——需要通过契约 2（第 9 节）协调跨 TASK 接口变更

---

### task_id: TASK-008

### task_name: MCP 服务入口、传输层与工具处理器

### requirement_ids: REQ-001, REQ-002, REQ-019

### owner: backend-api-expert

### objective: 实现 MCP 服务完整入口——工具注册、三种传输模式（stdio/SSE/HTTP Stream）、请求参数校验、Pipeline 调用与 MCP 标准响应

### in_scope:

- `src/server.ts`：MCP 服务入口
  - 初始化 Config → Logger 启动信息
  - 初始化 SessionManager（创建数据目录 + 创建 SQLite 表）
  - 注册工具处理器
  - 根据 `MCP_TRANSPORT` 创建传输并连接
  - 启动 SessionManager TTL 定期清理（`setInterval(cleanupExpired, ...)`）
  - 优雅关闭（SIGINT/SIGTERM → 关闭 SQLite → 停止定时器 → 退出）
- `src/transport/factory.ts`：传输工厂
  - `stdio`：`StdioServerTransport`（原生 SDK）
  - `sse`：Hono 服务器 + SSE 端点
  - `http-stream`：Hono 服务器 + HTTP Stream 端点
  - PORT 从 config.ts 读取
- `src/handlers/tool-handlers.ts`：工具处理器
  - 注册 `multimodal_grounding_augment` 工具（元数据严格遵循 PRD 4.1 节）
  - Zod Schema 校验输入参数（6 个参数 + required: ["question"]）
  - 调用 `PipelineOrchestrator.execute(params)`
  - 返回 MCP 标准响应（PRD 4.2 节格式）
  - 未传 `session_id` 时自动生成 UUID

### out_of_scope:

- 不实现 PipelineOrchestrator 逻辑（由 TASK-006 负责）
- 不修改任何子模块

### input_documents:

- `E:\CodeStore\vision-mcp\docs\requirements\2026-05-08-visual-primitives-mcp.md`（REQ-001/002/019）
- `E:\CodeStore\vision-mcp\docs\tasks\2026-05-08-visual-primitives-mcp-tasks.md`（TASK-008 详情）
- `E:\CodeStore\vision-mcp\docs\prds\需求文档.md`（第 4 节 MCP 工具定义）

### allowed_paths:

- `E:\CodeStore\vision-mcp\src\server.ts`
- `E:\CodeStore\vision-mcp\src\transport\factory.ts`
- `E:\CodeStore\vision-mcp\src\handlers\tool-handlers.ts`

### forbidden_paths:

- `E:\CodeStore\vision-mcp\src\core\**`（全部核心模块只读 import，不修改）
- `E:\CodeStore\vision-mcp\src\config.ts`（TASK-002 独占，只读 import）
- `E:\CodeStore\vision-mcp\src\types.ts`（TASK-002 独占，只读 import）

### dependencies:

- TASK-006 完成的 `src/core/pipeline.ts`（`PipelineOrchestrator.execute()`）
- TASK-005 完成的 `src/core/session-manager.ts`（`SessionManager` 实例化）
- TASK-002 完成的 `src/config.ts`（MCP_TRANSPORT, PORT, DB_PATH, SESSION_TTL_SECONDS）
- TASK-002 完成的 `src/utils/logger.ts`

### required_skills: behavioral-guidelines, code-standards, source-driven-development, incremental-implementation, verification-before-completion, mcp-builder

### parallel_group: 无（依赖 TASK-006 的 Pipeline）

### wait_for: TASK-006

### acceptance_criteria:

1. `npm run build` 成功生成 dist
2. **Stdio 模式**：`node dist/server.js` 启动正常（日志输出"Server started in stdio mode"）
3. **SSE 模式**：`MCP_TRANSPORT=sse PORT=3000 node dist/server.js` → Hono 在 3000 端口监听，`GET /sse` 端点可连接
4. **HTTP Stream 模式**：`MCP_TRANSPORT=http-stream PORT=3000 node dist/server.js` → HTTP Stream 端点可访问
5. 未传 `session_id` → 自动生成 UUID（v4 格式 `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`）并返回
6. 传了 `media_base64` 但无 `media_type` → Zod 校验拒绝并返回明确错误（"media_type is required when media_base64 is provided"）
7. 缺失必填 `question` → Zod 校验拒绝
8. 服务启动时缺少必填环境变量 → 拒绝启动并输出清晰错误（"Missing required environment variables: VISION_API_BASE_URL, VISION_API_KEY"）
9. 优雅关闭：Ctrl+C → 日志记录"Shutting down..." → `SessionManager.close()` 调用 → 定时器清除 → 进程退出
10. 工具元数据与 PRD 4.1 节严格一致（6 个 parameters，`required: ["question"]`）
11. 返回值包含 `content[0].text` JSON 字符串（含 `session_id`, `augmented_prompt`, `from_cache`, `round`, `objects_count`）
12. `npm run typecheck` 通过

### test_strategy: manual_only

### handoff_notes:

- `@modelcontextprotocol/sdk` 的 `McpServer` 实例化时传入 `name: "visual-primitives-mcp"` 和 `version: "1.0.0"`
- `StdioServerTransport` 直接使用 SDK 的 `StdioServerTransport` 类
- Hono SSE 端点：`app.get('/sse', ...)` 和 `app.post('/messages', ...)`（标准 MCP SSE 路径）
- Hono HTTP Stream 端点：`app.post('/mcp', ...)`
- 优雅关闭使用 `process.on('SIGINT', ...)` 和 `process.on('SIGTERM', ...)`
- TTL 清理间隔建议为 `SESSION_TTL_SECONDS / 4`（如 TTL 3600s → 每 900s 清理一次）
- 预期变更行数：~150（全部源码）

### escalation_rule: 如需修改 MCP 工具参数 schema（新增/删除 parameter 或修改 required 字段），必须先回编排者——属于接口契约变更，影响所有 MCP 客户端

---

### task_id: TASK-009

### task_name: README 文档与环境变量模板

### requirement_ids: REQ-C07

### owner: remediation-expert

### objective: 编写完整的项目 README 文档（含安装/配置/使用/多轮示例/开发指南）和环境变量模板 `.env.example`

### in_scope:

- `README.md`：8 个必需章节
  1. 项目简介
  2. 前置要求
  3. 安装步骤
  4. 环境变量配置（完整变量表格）
  5. 启动方式（Stdio + SSE + 配置示例）
  6. MCP 工具说明（`multimodal_grounding_augment` 参数表格 + 返回值）
  7. 多轮调用示例（3 轮 JSON 示例，与 PRD 4.3 一致）
  8. 支持的输入格式（图片/视频/文档格式和大小限制表格）
  9. 开发指南（dev/test/lint/build 命令）
- `.env.example`：全部 12 个环境变量（3 必填 + 9 可选，中文注释）

### out_of_scope:

- 不修改任何源代码
- 不修改 CI 配置

### input_documents:

- `E:\CodeStore\vision-mcp\docs\requirements\2026-05-08-visual-primitives-mcp.md`（REQ-C07）
- `E:\CodeStore\vision-mcp\docs\tasks\2026-05-08-visual-primitives-mcp-tasks.md`（TASK-009 详情）
- `E:\CodeStore\vision-mcp\docs\prds\需求文档.md`（4.1 工具定义, 4.2 返回值, 4.3 多轮示例, 5.1/5.2 环境变量, 6.3 目录结构）

### allowed_paths:

- `E:\CodeStore\vision-mcp\README.md`
- `E:\CodeStore\vision-mcp\.env.example`

### forbidden_paths:

- `E:\CodeStore\vision-mcp\src\**`（不修改任何源代码）
- `E:\CodeStore\vision-mcp\docs\**`（不修改需求/任务文档）

### dependencies:

- TASK-008 完成的完整功能（确保文档描述与实际行为一致）
- TASK-002 完成的 `src/config.ts`（环境变量清单来源）
- TASK-008 完成的 `src/handlers/tool-handlers.ts`（工具参数 schema 来源）

### required_skills: behavioral-guidelines, code-standards, chinese-documentation

### parallel_group: 无（需等待 TASK-008 完成以验证文档准确性）

### wait_for: TASK-008

### acceptance_criteria:

1. `README.md` 包含全部 9 个必需章节（含章节标题）
2. `.env.example` 包含全部 12 个变量：3 必填（标注 `# 必填`）+ 9 可选（标注 `# 可选` + 默认值注释）
3. 每个变量一行中文注释说明用途
4. 多轮示例 JSON 语法正确（3 轮示例：首轮上传 → 二轮追问 → 三轮增补）
5. Claude Desktop 配置示例（`mcpServers` JSON）语法正确
6. 支持格式表格包含：格式名称、MIME 类型、最大大小限制
7. 文档无拼写错误，术语与代码库一致（变量名、函数名与源码匹配）
8. 文档中 `npm run` 命令可在实际项目中执行（`dev`、`test`、`lint`、`typecheck`、`build`）

### test_strategy: manual_only

### handoff_notes:

- 如果 TASK-008 的工具参数 schema 在开发中有调整，需同步更新 README 中的参数表格
- `.env.example` 中变量顺序建议：先必填、后可选，每组内按字母序排列
- 预期变更行数：~100（约 80 行 README + 20 行 .env.example）

### escalation_rule: 如需在 README 中新增功能说明（非当前已实现的功能），先回编排者确认——文档只能描述已实现的功能

---

## 14. 串行 / 并行策略总览

```
Batch 1 ──► Batch 2 ──► Batch 3 ──────────► Batch 4 ──► Batch 5 ──► Batch 6 ──► Batch 7
(TASK-001)  (TASK-002)  (TASK-003 ║          (TASK-007)  (TASK-006)  (TASK-008)  (TASK-009)
                          TASK-004 ║
                          TASK-005)

串行链（关键路径）：TASK-001 → TASK-002 → TASK-003 → TASK-007 → TASK-006 → TASK-008 → TASK-009（6 跳）
并行链（Batch 3）：TASK-003、TASK-004、TASK-005 三个 Agent 同时启动
```

**并行组标注**：

- Batch 3 内并行：[TASK-003, TASK-004, TASK-005] -- 无共享文件冲突
- 其余 Batch 均为串行（单一任务或存在文件依赖）

**串行原因说明**：

- Batch 1→2：TASK-002 需 TASK-001 的 package.json/tsconfig.json
- Batch 2→3：Batch 3 全组需 TASK-002 的 config.ts/types.ts
- Batch 3→4：TASK-007 需 TASK-004 的 base-adapter.ts
- Batch 4→5：TASK-006 需 TASK-003/4/5/7 全部出口模块
- Batch 5→6：TASK-008 需 TASK-006 的 Pipeline
- Batch 6→7：TASK-009 需 TASK-008 的完整功能

---

## 15. plan patch / contract change request 触发条件

以下场景发生时，实现代理必须**立即停止当前工作**，提交 plan patch 回编排者（jarvis），不得自行决策：

| 触发条件                                                            | 触发 Agent | 回传原因                     |
| ------------------------------------------------------------------- | ---------- | ---------------------------- |
| 需要修改 `src/types.ts` 中已有接口签名                              | 任何 Agent | 共享类型契约变更，影响全体   |
| 需要修改 `src/config.ts` 环境变量清单                               | 任何 Agent | 配置契约变更，影响全局校验   |
| 需要修改 `src/core/adapters/base-adapter.ts` 中 `MediaAdapter` 接口 | TASK-007   | 适配器契约变更               |
| 需要新增 npm 依赖包（超出 TASK-001 清单）                           | 任何 Agent | 依赖变更，需评估安全与兼容性 |
| `modality-router.ts` 中 `import` 的适配器类名与实际导出不匹配       | TASK-006   | 跨 Batch 契约冲突            |
| Pipeline 导入的子模块导出签名与预期不一致                           | TASK-006   | 跨 TASK 接口契约冲突         |
| TASK-008 发现需要新增 MCP 工具参数或修改 required 字段              | TASK-008   | 外部接口契约变更             |
| 需要新增 DDL 表或修改已有表结构                                     | TASK-005   | 数据库 schema 契约变更       |
| `node:sqlite` API 在当前 Node.js 版本行为与预期不符                 | TASK-005   | 技术风险评估                 |
| FFmpeg 静态二进制在当前平台不可用且无替代方案                       | TASK-007   | 架构决策需重新评估           |
| 任何子模块实现发现需求规格不明确或矛盾                              | 任何 Agent | 需求澄清                     |

---

## 16. 推荐的下一步

1. **编排者（Jarvis）确认**：审阅本执行计划，确认 Batch 编排、代理分工、契约约定无异议
2. **开始执行 Batch 1**：spawn `remediation-expert` 执行 TASK-001（工程配置初始化）
3. **Round 1 完成后**：运行 `npm run lint && npm run typecheck && npm test` 全量验证后再进入 Round 2
4. **Round 2 完成后**：再次全量验证 + 确认所有 TDD 测试通过（parser/validator/normalizer/session-manager/pipeline）
5. **Round 3 完成后**：执行端到端手动验证（MCP Inspector 工具发现 + 模拟调用）
6. **全部完成后**：触发 `qa-review-expert` 执行代码审查（五轴审查框架，检查所有 Gate C1 条件）

---

## 附录 A：REQ 覆盖确认

| 覆盖项                   | 数值  |
| ------------------------ | ----- |
| 总 REQ 数                | 34    |
| 已映射 REQ 数            | 34    |
| 覆盖率                   | 100%  |
| 功能需求 REQ-001~019     | 19/19 |
| 非功能需求 REQ-N01~N08   | 8/8   |
| 工程配置需求 REQ-C01~C07 | 7/7   |

## 附录 B：测试覆盖策略

| 任务     | 模块                             | test_strategy | 测试行数 | 说明                             |
| -------- | -------------------------------- | ------------- | -------- | -------------------------------- |
| TASK-002 | config-validator                 | tdd           | ~60      | Red→Green→Refactor，env 校验边界 |
| TASK-002 | retry                            | test_after    | ~40      | 指数退避时间验证                 |
| TASK-003 | parser                           | tdd           | ~70      | JSON 主路径 + 正则备用路径       |
| TASK-003 | validator                        | tdd           | ~90      | 7 条校验规则全覆盖               |
| TASK-003 | normalizer                       | tdd           | ~60      | 两种精度 + 边界缩放验证          |
| TASK-004 | image-adapter + vision-client    | test_after    | --       | 集成测试由 TASK-006 覆盖         |
| TASK-005 | session-manager                  | tdd           | ~200     | 10 条 AC 全覆盖 + 并发测试       |
| TASK-006 | pipeline + modality-router       | tdd           | ~150     | 11 条 AC 全覆盖（全部 mock）     |
| TASK-007 | video-adapter + document-adapter | test_after    | ~160     | 含测试 fixtures                  |
| TASK-008 | server + transport + handler     | manual_only   | --       | MCP Inspector 手工验证           |
| TASK-009 | README + .env.example            | manual_only   | --       | 文档检查                         |
| **合计** |                                  |               | **~935** |                                  |

> 注：test_strategy=manual_only 的任务在实现完成后由编排者或 qa-review-expert 手工验收。test_strategy=test_after 的任务测试在实现后编写，与实现同属一个 TASK 内执行。
