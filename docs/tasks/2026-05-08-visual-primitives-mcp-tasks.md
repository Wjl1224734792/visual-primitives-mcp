# Visual Primitives MCP -- 任务分解文档

> 基于 DeepSeek《Thinking with Visual Primitives》论文的多模态空间锚定 MCP 服务器
> 日期：2026-05-08 | 状态：任务分解完成

---

## 1. 需求文档路径

| 文档                                | 路径                                                    |
| ----------------------------------- | ------------------------------------------------------- |
| 主需求文档（27 条 REQ）             | `docs/requirements/2026-05-08-visual-primitives-mcp.md` |
| 详细 PRD（架构/模块/目录/工具定义） | `docs/prds/需求文档.md`                                 |

**实际 REQ 数量说明**：主需求文档将需求分为功能需求 REQ-001~019（19 条）、非功能需求 REQ-N01~N08（8 条）、工程配置需求 REQ-C01~C07（7 条），合计 34 条。所有 34 条 REQ 均已映射。

**架构澄清**：PRD 第 13 节提及 FastMCP，但用户明确要求使用 `@modelcontextprotocol/sdk` + Hono（非 FastMCP）。本任务文档以用户最新指令为准：MCP 协议用 `@modelcontextprotocol/sdk` 原生 API，Hono 仅用于 SSE/HTTP Stream 传输层的 HTTP 服务器基础设施。

---

## 2. 任务概览

| 轮次 | 任务     | 名称                                        | 类型     | 优先级 | 预估行数 | 依赖             |
| ---- | -------- | ------------------------------------------- | -------- | ------ | -------- | ---------------- |
| 1    | TASK-001 | 工程配置初始化                              | 直接开发 | P0     | ~145     | 无               |
| 1    | TASK-002 | 配置体系、类型定义与工具库                  | TDD+直接 | P0     | ~260     | TASK-001         |
| 1    | TASK-003 | 图片核心管道（解析/校验/归一化/提示词构建） | TDD      | P0     | ~490     | TASK-002         |
| 2    | TASK-004 | 图片适配器与视觉客户端                      | 直接开发 | P0     | ~140     | TASK-002         |
| 2    | TASK-005 | 会话管理器（Session Manager）               | DDD+TDD  | P0     | ~400     | TASK-002         |
| 2    | TASK-006 | 管道编排器与模态路由器                      | DDD+TDD  | P0     | ~330     | TASK-003/004/005 |
| 3    | TASK-007 | 视频适配器与文档适配器                      | 直接开发 | P0     | ~340     | TASK-004         |
| 3    | TASK-008 | MCP 服务入口、传输层与工具处理器            | 直接开发 | P0     | ~150     | TASK-006         |
| 3    | TASK-009 | README 文档与环境变量模板                   | 直接开发 | P0     | ~100     | TASK-008         |

**预估总变更行数**：~2,355 行（含源码 ~1,320 行 + 测试 ~935 行 + 配置/文档 ~100 行）\
**轮次汇总**：Round 1 ~895 行 | Round 2 ~870 行 | Round 3 ~590 行

---

## 3. 任务分解列表

### 第 1 轮：工程基础与图片核心管道（~895 行）

---

### TASK-001：工程配置初始化

| 属性         | 值                                                                     |
| ------------ | ---------------------------------------------------------------------- |
| **映射 REQ** | REQ-C01, REQ-C02, REQ-C03, REQ-C04, REQ-C05, REQ-C06, REQ-N07, REQ-N08 |
| **类型**     | 直接开发                                                               |
| **优先级**   | P0                                                                     |
| **预估行数** | ~145（XS/S）                                                           |
| **依赖**     | 无                                                                     |
| **被依赖**   | 全部其他 TASK                                                          |
| **并行组**   | 无（必须最先完成）                                                     |
| **风险**     | 低                                                                     |

**涉及文件**：

| 文件                       | 所有权            | 说明                                                    |
| -------------------------- | ----------------- | ------------------------------------------------------- |
| `package.json`             | TASK-001 **独占** | 含全部依赖声明（运行时 + 开发），后续任务不再修改此文件 |
| `tsconfig.json`            | TASK-001 **独占** | strict 模式，ESM 模块，路径别名                         |
| `.eslintrc.json`           | TASK-001 **独占** | TypeScript + import 规则                                |
| `.prettierrc`              | TASK-001 **独占** | 项目统一格式化配置                                      |
| `.gitignore`               | TASK-001 **独占** | node_modules / dist / data / .env                       |
| `.husky/pre-commit`        | TASK-001 **独占** | lint-staged 触发                                        |
| `commitlint.config.js`     | TASK-001 **独占** | Conventional Commits 校验                               |
| `.github/workflows/ci.yml` | TASK-001 **独占** | CI 流水线：lint → type-check → unit → build             |
| `tests/` 目录              | TASK-001 创建     | 空目录结构                                              |

**完成标准**：

1. `npm install` 成功安装全部依赖
2. `npm run lint` 通过（空项目无错误）
3. `npm run typecheck` 通过（空项目无错误）
4. `npm run build` 成功生成空 dist
5. `git commit` 触发 pre-commit hook（lint-staged 运行）
6. `echo "feat: test" | npx commitlint` 通过

**关键决策**：

- **测试框架**：选用 `vitest`（ESM 原生支持、TypeScript 开箱即用、与 Node.js 22.5+ 兼容）
- **package.json** 需包含全部运行时依赖和开发依赖，后续 TASK 不再新增依赖。依赖清单：
  - 运行时：`@modelcontextprotocol/sdk`, `zod`, `pino`, `hono`, `ffmpeg-static`, `sharp`, `pdf-poppler`
  - 开发：`typescript`, `@types/node`, `vitest`, `eslint`, `@typescript-eslint/*`, `prettier`, `eslint-config-prettier`, `husky`, `lint-staged`, `@commitlint/*`
- **CI 平台**：默认使用 GitHub Actions（`.github/workflows/ci.yml`）

---

### TASK-002：配置体系、类型定义与工具库

| 属性         | 值                                                   |
| ------------ | ---------------------------------------------------- |
| **映射 REQ** | REQ-010, REQ-018, REQ-N03, REQ-N04                   |
| **类型**     | TDD（config 校验）+ 直接开发（logger, retry, types） |
| **优先级**   | P0                                                   |
| **预估行数** | ~260（XS/S）                                         |
| **依赖**     | TASK-001                                             |
| **被依赖**   | TASK-003, TASK-004, TASK-005, TASK-006               |
| **并行组**   | 无（所有后续 TASK 依赖此任务）                       |
| **风险**     | 中（共享区域——所有模块依赖 config.ts 和 types.ts）   |

**涉及文件**：

| 文件                   | 所有权            | 说明                                                                                                                 |
| ---------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| `src/config.ts`        | TASK-002 **独占** | 环境变量读取 + Zod 校验 + 启动拒绝逻辑。定义**全部**配置项（含后续会话/视频/文档所需变量）。后续 TASK **只读不写**。 |
| `src/types.ts`         | TASK-002 **独占** | 全部共享 TypeScript 类型/接口定义。`MediaAdapter` 接口在此定义。后续 TASK **只读不写**（仅实现接口）。               |
| `src/utils/logger.ts`  | TASK-002 **独占** | pino 结构化日志，含敏感数据过滤（Base64/API Key 不记录）                                                             |
| `src/utils/retry.ts`   | TASK-002 **独占** | 指数退避重试工具函数                                                                                                 |
| `tests/config.test.ts` | TASK-002          | 配置校验测试                                                                                                         |
| `tests/retry.test.ts`  | TASK-002          | 重试逻辑测试                                                                                                         |

**完成标准**：

1. 配置校验：缺少必填环境变量时 `ConfigLoader.load()` 抛出明确错误并拒绝启动
2. 配置校验：所有可选变量有合法默认值
3. 配置校验：`COORDINATE_PRECISION` 仅接受 `"0-100"` 或 `"0-1000"`
4. 配置校验：`DB_PATH` 目录不存在时自动创建
5. 日志器：`logger.info({ base64: "xxx" })` 输出中不包含 base64 字段
6. 日志器：`logger.info({ apiKey: "sk-xxx" })` 输出中不包含 apiKey 字段
7. 重试工具：模拟 3 次失败 + 第 4 次成功，确认指数退避时间间隔递增
8. 重试工具：全部重试耗尽后抛出最后一次错误
9. TypeScript 类型检查通过：`MediaAdapter` 接口可被其他模块 `implements`
10. `npm test` 全部通过

**config.ts 需定义的完整变量清单**：

| 变量                   | 类型                                     | 默认值                  | 必填 |
| ---------------------- | ---------------------------------------- | ----------------------- | ---- |
| `VISION_API_BASE_URL`  | `string`                                 | --                      | 是   |
| `VISION_API_KEY`       | `string`                                 | --                      | 是   |
| `VISION_MODEL_NAME`    | `string`                                 | --                      | 是   |
| `COORDINATE_PRECISION` | `"0-100" \| "0-1000"`                    | `"0-1000"`              | 否   |
| `MCP_TRANSPORT`        | `"stdio" \| "sse" \| "http-stream"`      | `"stdio"`               | 否   |
| `LOG_LEVEL`            | `"debug" \| "info" \| "warn" \| "error"` | `"info"`                | 否   |
| `TIMEOUT_MS`           | `number`                                 | `45000`                 | 否   |
| `SESSION_TTL_SECONDS`  | `number`                                 | `3600`                  | 否   |
| `DB_PATH`              | `string`                                 | `"./data/grounding.db"` | 否   |
| `MAX_VIDEO_FRAMES`     | `number`                                 | `10`                    | 否   |
| `MAX_DOC_PAGES`        | `number`                                 | `20`                    | 否   |
| `PORT`                 | `number`                                 | `3000`                  | 否   |

---

### TASK-003：图片核心管道（解析 / 校验 / 归一化 / 提示词构建）

| 属性         | 值                                                                          |
| ------------ | --------------------------------------------------------------------------- |
| **映射 REQ** | REQ-006, REQ-007, REQ-008, REQ-009                                          |
| **类型**     | TDD（parser, validator, normalizer）+ 直接开发（prompt-builder, templates） |
| **优先级**   | P0                                                                          |
| **预估行数** | ~490（L，风险任务）                                                         |
| **依赖**     | TASK-002                                                                    |
| **被依赖**   | TASK-006                                                                    |
| **并行组**   | 可与 TASK-004、TASK-005 并行（仅依赖 TASK-002 的 types.ts）                 |
| **风险**     | 中（L 任务，核心管道逻辑，需 TDD 保障正确性）                               |

**涉及文件**：

| 文件                                 | 所有权            | 说明                                               |
| ------------------------------------ | ----------------- | -------------------------------------------------- |
| `src/core/parser.ts`                 | TASK-003 **独占** | JSON 主解析 + 正则备用解析                         |
| `src/core/validator.ts`              | TASK-003 **独占** | 坐标范围/合法性/唯一性校验                         |
| `src/core/normalizer.ts`             | TASK-003 **独占** | 0-1000 到 0-100 精度归一化                         |
| `src/core/prompt-builder.ts`         | TASK-003 **独占** | 增强提示词构建器（含会话历史注入逻辑——空历史跳过） |
| `src/templates/vision-system.txt`    | TASK-003 **独占** | 视觉模型系统提示词模板                             |
| `src/templates/augmented-prompt.txt` | TASK-003 **独占** | 增强提示词多模态统一模板                           |
| `tests/parser.test.ts`               | TASK-003          |                                                    |
| `tests/validator.test.ts`            | TASK-003          |                                                    |
| `tests/normalizer.test.ts`           | TASK-003          |                                                    |

**TDD 流程要求（parser / validator / normalizer）**：

1. **红**：先编写失败测试（无效输入 → 预期错误）
2. **绿**：最小实现让测试通过
3. **重构**：清理代码，确保所有已有测试仍通过

**完成标准**：

1. **Parser**：
   - 标准 JSON 解析成功返回对象
   - 非标 JSON（前后有 Markdown 包裹 `\`\`\`json...\`\`\``）→ 正则提取成功
   - 完全无法解析 → 抛出 `AnalysisParseError`
   - JSON 中 `objects` 数组为空 → 抛出 `AnalysisParseError`
2. **Validator**：
   - `objects` 至少包含 1 个物体 → 通过
   - `object_id` 无重复 → 通过；有重复 → 抛出 `ValidationError`
   - 四个 bbox 值均在 0-1000（或 0-100）内 → 通过；越界 → 抛出
   - `x1 < x2` 且 `y1 < y2` → 通过；不满足 → 抛出
   - `centroid [cx, cy]` 落在对应 bbox 范围内 → 通过；不满足 → 抛出
   - 视频/文档扩展字段（`page`, `timestamp_range`, `media_type`）可选，存在时校验格式
3. **Normalizer**：
   - 从 0-1000 归一化到 0-100：`bbox` 和 `centroid` 均按比例缩放
   - 精度配置为 0-1000 时保持原值不变
   - 归一化后仍满足 `x1 < x2`, `y1 < y2`
4. **Prompt Builder**：
   - 输入 objects + question → 输出含 `[多模态空间信息]` + `[用户问题]` 的完整提示词
   - 物体信息包含：label, bbox, centroid, state, relevance
   - 坐标系说明正确（原点左上角，x 右 y 下）
   - 无会话历史时 `[会话历史]` 段不出现（或显示"首轮对话"）
   - 输出文本不包含任何 JSON 格式错误
5. **Templates**：
   - `vision-system.txt` 内容与 PRD 第九章一致
   - `augmented-prompt.txt` 包含多模态统一模板变量占位符
6. `npm test` 全部通过（parser/validator/normalizer 共 ~220 行测试）

**风险说明**：此任务为 L 任务（~490 行），包含 4 个子模块。不拆分理由：parser → validator → normalizer 构成紧密数据流管道，prompt-builder 依赖前三者输出，拆分会破坏端到端可验证性。

---

### 第 2 轮：适配器与会话/编排（~870 行）

---

### TASK-004：图片适配器与视觉客户端

| 属性         | 值                           |
| ------------ | ---------------------------- |
| **映射 REQ** | REQ-003, REQ-N04             |
| **类型**     | 直接开发                     |
| **优先级**   | P0                           |
| **预估行数** | ~140（M）                    |
| **依赖**     | TASK-002                     |
| **被依赖**   | TASK-006, TASK-007           |
| **并行组**   | 可与 TASK-003、TASK-005 并行 |
| **风险**     | 低                           |

**涉及文件**：

| 文件                                 | 所有权            | 说明                                                                          |
| ------------------------------------ | ----------------- | ----------------------------------------------------------------------------- |
| `src/core/adapters/base-adapter.ts`  | TASK-004 **独占** | `MediaAdapter` 接口定义（在 `src/types.ts` 已声明，此处为接口实现契约和基类） |
| `src/core/adapters/image-adapter.ts` | TASK-004 **独占** | 图片透传适配器：Base64 校验 + 20MB 大小检验                                   |
| `src/core/vision-client.ts`          | TASK-004 **独占** | OpenAI 兼容视觉模型客户端：多图请求、指数退避重试、45s 超时                   |

**完成标准**：

1. **BaseAdapter**：
   - `MediaAdapter` 接口定义 `adapt(input): Promise<Base64Image[]>` 方法签名
   - 接口同时声明 `mediaType: string` 属性（用于 ModalityRouter 注册）
2. **ImageAdapter**：
   - `implements MediaAdapter`
   - 输入 JPEG/PNG/GIF/WebP Base64 → 透传返回单元素 `Base64Image[]`
   - 输入超过 20MB → 返回错误提示（不抛异常）
   - 空/无效 Base64 → 返回错误提示
3. **VisionClient**：
   - 构建 OpenAI Chat Completions 请求：`messages` 含多张 `image_url` content block
   - 强制 `response_format: { type: "json_object" }`（或 `json_schema`）
   - 指数退避重试，最多 3 次
   - 超时 45s
   - 网络错误或超时 → 返回降级结果（不抛异常，符合 REQ-017）
   - 支持通过环境变量配置 `VISION_API_BASE_URL` / `VISION_API_KEY` / `VISION_MODEL_NAME`
4. `npm run typecheck` 通过（ImageAdapter 满足 MediaAdapter 接口）

---

### TASK-005：会话管理器（Session Manager）

| 属性         | 值                                                   |
| ------------ | ---------------------------------------------------- |
| **映射 REQ** | REQ-011, REQ-012, REQ-013, REQ-014, REQ-015, REQ-N06 |
| **类型**     | DDD + TDD                                            |
| **优先级**   | P0                                                   |
| **预估行数** | ~400（L，风险任务）                                  |
| **依赖**     | TASK-002                                             |
| **被依赖**   | TASK-006                                             |
| **并行组**   | 可与 TASK-003、TASK-004 并行                         |
| **风险**     | 高（DDD 聚合边界 + SQLite 持久化 + 涉及数据一致性）  |

**涉及文件**：

| 文件                            | 所有权            | 说明                                  |
| ------------------------------- | ----------------- | ------------------------------------- |
| `src/core/session-manager.ts`   | TASK-005 **独占** | 基于 `node:sqlite` 的会话持久化管理器 |
| `tests/session-manager.test.ts` | TASK-005          | 完整 CRUD + TTL + merge 策略测试      |

**DDD 建模要求**：

- **聚合根**：`Session`（session_id, media_type, created_at, last_accessed_at）
- **实体**：`SessionObject`（object_id, label, bbox, centroid, state, relevance, page?, timestamp_range?, media_type, created_round）
- **值对象**：`BBox`, `Centroid`, `MergeStrategy`
- **仓储**：SessionManager 自身充当 Repository（`node:sqlite` 直接操作，无需抽象额外层）
- **领域服务**：`ObjectMergeService`（处理 augment/replace 两种合并策略）
- **领域事件**（轻量，函数调用即可）：`SessionCreated`, `ObjectsMerged`, `SessionExpired`

**核心方法实现（PRD 3.4 节定义）**：

| 方法                                                   | 说明                                                  |
| ------------------------------------------------------ | ----------------------------------------------------- |
| `createSession(sessionId, mediaType, imageBase64?)`    | 创建新会话                                            |
| `getSession(sessionId)`                                | 获取会话上下文（元数据 + 全部物体 + 最近 N 轮对话）   |
| `upsertObjects(sessionId, objects[], mergeStrategy)`   | augment：新物体分配新 ID，不冲突；replace：清空后重建 |
| `addConversationTurn(sessionId, round, role, content)` | 追加对话记录                                          |
| `getRecentHistory(sessionId, maxRounds)`               | 取最近 N 轮对话摘要                                   |
| `cleanupExpired(ttlSeconds)`                           | 删除过期会话及关联数据（CASCADE）                     |
| `deleteSession(sessionId)`                             | 完全删除会话                                          |

**SQLite 数据库要求**：

- 使用 `node:sqlite`（Node.js 22.5+ 内置）
- WAL 模式启用（`PRAGMA journal_mode=WAL;`）
- 表结构严格遵循 PRD 3.4 节 DDL
- 数据库文件路径从 `config.ts` 读取 `DB_PATH`

**TDD 完成标准**：

1. 创建会话 → 查询可获取完整元数据
2. 重复创建同 session_id → 返回已有会话（幂等）
3. upsertObjects + augment 策略 → 新 ID 不与已有 ID 冲突，新旧数据共存
4. upsertObjects + replace 策略 → 清空旧物体，仅保留新物体
5. 同物体跨轮 ID 不变（SQLite 持久化保证，重启后验证）
6. addConversationTurn → getRecentHistory 返回正确轮次和内容
7. cleanupExpired → 过期会话被删除，未过期会话不受影响
8. deleteSession → 级联删除 sessions + session_objects + conversation_history
9. 并发写入测试（模拟多轮快速调用）：WAL 模式下不丢数据
10. `npm test -- tests/session-manager.test.ts` 全部通过（~200 行测试）

**不拆分理由**：对话管理器 7 个方法围绕同一 SQLite 数据库和同一聚合根 `Session` 操作，拆分将导致数据库连接共享冲突和事务边界割裂。

---

### TASK-006：管道编排器与模态路由器

| 属性         | 值                                                                         |
| ------------ | -------------------------------------------------------------------------- |
| **映射 REQ** | REQ-001（管道核心逻辑）, REQ-016, REQ-017, REQ-N01, REQ-N02, REQ-N05       |
| **类型**     | DDD + TDD                                                                  |
| **优先级**   | P0                                                                         |
| **预估行数** | ~330（L，风险任务）                                                        |
| **依赖**     | TASK-003, TASK-004, TASK-005                                               |
| **被依赖**   | TASK-008                                                                   |
| **并行组**   | 无（依赖前三者全部完成）                                                   |
| **风险**     | 高（共享区域——协调所有模块，集成复杂度最高；任何单点异常不能导致进程崩溃） |

**涉及文件**：

| 文件                          | 所有权            | 说明                                                                      |
| ----------------------------- | ----------------- | ------------------------------------------------------------------------- |
| `src/core/pipeline.ts`        | TASK-006 **独占** | Pipeline Orchestrator：多轮处理流程完整编排                               |
| `src/core/modality-router.ts` | TASK-006 **独占** | ModalityRouter：media_type → Adapter 路由注册与分发                       |
| `tests/pipeline.test.ts`      | TASK-006          | 管道集成测试（mock adapters + mock vision client + mock session manager） |

**DDD 建模要求**：

- **领域服务**：`PipelineOrchestrator`（协调 SessionManager + ModalityRouter + VisionClient + Parser + Validator + Normalizer + PromptBuilder）
- **核心流程**（PRD 3.5 节定义）：
  ```
  1. 接收参数 → 2. getSession → 3. 判断来源
     ├─ fromCache → 跳过 4-7
     └─ fromVision → 4. ModalityRouter 路由
                     5. VisionClient.analyze()
                     6. Parser + Validator
                     7. SessionManager.upsertObjects()
  8. PromptBuilder.build()
  9. 返回 augmented_prompt
  ```

**ModalityRouter 设计**：

- 使用注册表模式：`Map<string, MediaAdapter>`
- 直接导入全部适配器并注册（TASK-004 的 ImageAdapter、TASK-007 的 VideoAdapter/DocumentAdapter）
- `route(mediaType): MediaAdapter` 返回对应适配器
- 未知 media_type → 抛出明确错误（含支持的媒体类型列表）

**TDD 完成标准**：

1. **Cache Hit**：同 session_id 第二轮无新 media_base64 → `from_cache=true`，未调用视觉 API
2. **Cache Miss + Image**：新 session + image → 调用 ImageAdapter + VisionClient → 解析 → 入库 → 返回完整 augmented_prompt
3. **Cache Miss + Video**：新 session + video → 调用 VideoAdapter → VisionClient → 解析 → 入库
4. **Cache Miss + Document**：新 session + pdf → 调用 DocumentAdapter → VisionClient → 解析 → 入库
5. **Augment 策略**：已有 session + 新 media_base64 + augment → 新物体追加，ID 不冲突
6. **Replace 策略**：已有 session + 新 media_base64 + replace → 旧物体清空，新物体重建
7. **降级处理**：VisionClient 返回不可解析内容 → 不抛异常，返回降级提示词（仅含用户问题 + 系统说明）
8. **跨轮 ID 一致**：同 session 的同物理物体 → 通过 SQLite 跨轮保持相同 object_id
9. **多模态混合**：同一 session 内先图片后 PDF（augment 模式）→ 物体含 `media_type` 区分
10. **失败不崩溃**：任何子模块异常 → 记录错误日志 → 返回降级提示词 → 进程不退出
11. `npm test -- tests/pipeline.test.ts` 全部通过（~150 行测试）

**不拆分理由**：Pipeline 和 ModalityRouter 紧密耦合——Pipeline 的步骤 4 直接调用 ModalityRouter，拆分会增加不必要的接口抽象层。

**文件冲突预案**：ModalityRouter（`modality-router.ts`）静态导入 TASK-004 和 TASK-007 的适配器。这是 `modality-router.ts` 的独占权利——其他 TASK 不得修改此文件。

---

### 第 3 轮：多模态扩展与 MCP 集成（~590 行）

---

### TASK-007：视频适配器与文档适配器

| 属性         | 值                                                           |
| ------------ | ------------------------------------------------------------ |
| **映射 REQ** | REQ-004, REQ-005                                             |
| **类型**     | 直接开发                                                     |
| **优先级**   | P0                                                           |
| **预估行数** | ~340（L，风险任务）                                          |
| **依赖**     | TASK-004（base-adapter 接口 + vision-client）                |
| **被依赖**   | 无（适配器通过 ModalityRouter 注册，无其他 TASK 依赖此任务） |
| **并行组**   | 可与 TASK-008 并行（TASK-007 不依赖 TASK-006）               |
| **风险**     | 中（FFmpeg 系统依赖、文档渲染库兼容性）                      |

**涉及文件**：

| 文件                                      | 所有权            | 说明                                        |
| ----------------------------------------- | ----------------- | ------------------------------------------- |
| `src/core/adapters/video-adapter.ts`      | TASK-007 **独占** | FFmpeg 抽帧，生成 Base64 JPEG 数组 + 时间戳 |
| `src/core/adapters/document-adapter.ts`   | TASK-007 **独占** | PDF/Office 渲染为图像（视觉路径）           |
| `tests/adapters/video-adapter.test.ts`    | TASK-007          | 视频适配器测试（需小样本视频文件）          |
| `tests/adapters/document-adapter.test.ts` | TASK-007          | 文档适配器测试（需小样本 PDF）              |

**VideoAdapter 实现要求**：

1. `implements MediaAdapter`（来自 `src/core/adapters/base-adapter.ts`）
2. Base64 解码写入临时文件（`os.tmpdir()`）
3. 使用 `ffprobe` 获取视频时长/帧率
4. 抽帧策略（PRD 3.0.2 节）：
   - ≤30s：每 3s 一帧，最多 10 帧
   - 30s-120s：每 5s 一帧，最多 24 帧
   - > 120s：每 10s 一帧，最多 30 帧
5. `ffmpeg` 抽帧，输出为 JPEG（质量 85%）
6. 每帧转为 Base64，附带时间戳元数据
7. FFmpeg 不可用时返回明确错误提示（不抛异常不崩溃）
8. 使用 `ffmpeg-static` npm 包（零系统依赖）
9. 抽帧数受 `MAX_VIDEO_FRAMES` 环境变量限制

**DocumentAdapter 实现要求**：

1. `implements MediaAdapter`（来自 `src/core/adapters/base-adapter.ts`）
2. 支持：PDF / DOCX / PPTX / XLSX / TXT / MD
3. MVP 阶段仅实现 **P0 视觉渲染路径**（PRD 3.0.3 节）：
   - PDF：用 `sharp` + `pdf-poppler`（或 `pdf-to-png`）渲染每页为 PNG
   - Office 文档（DOCX/PPTX/XLSX）：需先转 PDF（MVP 可暂跳过 Office，返回提示"Office 文档暂不支持，请转换为 PDF 后重试"）
   - TXT/MD：用 sharp 创建文本渲染图像
4. 每页输出 Base64 PNG + 页码
5. 渲染页数受 `MAX_DOC_PAGES` 环境变量限制
6. 渲染失败时返回降级提示（不抛异常不崩溃）

**完成标准**：

1. **VideoAdapter**：输入小样本 MP4（~10s）→ 返回 ≥2 帧 Base64 JPEG + 时间戳
2. **VideoAdapter**：输入超长视频 → 帧数不超过 `MAX_VIDEO_FRAMES`
3. **VideoAdapter**：FFmpeg 不可用 → 返回错误提示，不崩溃
4. **DocumentAdapter**：输入小样本 PDF（~3 页）→ 返回每页 Base64 PNG + 页码
5. **DocumentAdapter**：页数超过 `MAX_DOC_PAGES` → 只渲染前 N 页
6. **DocumentAdapter**：输入 TXT/MD → 渲染为图像
7. 两个适配器均 `implements MediaAdapter`，`npm run typecheck` 通过
8. `npm test -- tests/adapters/` 全部通过（~160 行测试）

**风险说明**：

- FFmpeg 依赖：使用 `ffmpeg-static` 自动下载二进制，需验证 Windows/Linux/macOS 兼容性
- Office 文档转换：MVP 阶段跳过，返回明确提示。PPTX 转 PDF 需 LibreOffice 或第三方 API，非 MVP 范围
- 测试需准备小样本文件（<1MB 视频、2 页 PDF），放在 `tests/fixtures/` 目录

---

### TASK-008：MCP 服务入口、传输层与工具处理器

| 属性         | 值                                                                           |
| ------------ | ---------------------------------------------------------------------------- |
| **映射 REQ** | REQ-001（工具注册 + 传输）, REQ-002（端到端通信）, REQ-019（Hono HTTP 传输） |
| **类型**     | 直接开发                                                                     |
| **优先级**   | P0                                                                           |
| **预估行数** | ~150（M）                                                                    |
| **依赖**     | TASK-006                                                                     |
| **被依赖**   | TASK-009                                                                     |
| **并行组**   | 可与 TASK-007 并行                                                           |
| **风险**     | 中（集成多个模块，MCP 协议正确性要求高；传输模式切换逻辑）                   |

**涉及文件**：

| 文件                            | 所有权            | 说明                                                          |
| ------------------------------- | ----------------- | ------------------------------------------------------------- |
| `src/server.ts`                 | TASK-008 **独占** | MCP 服务入口：根据 `MCP_TRANSPORT` 选择传输模式启动           |
| `src/transport/factory.ts`      | TASK-008 **独占** | 传输工厂：创建 StdioServerTransport 或 Hono SSE/HTTP Stream   |
| `src/handlers/tool-handlers.ts` | TASK-008 **独占** | `multimodal_grounding_augment` 工具注册 + 请求路由到 Pipeline |

**实现要求**：

**1. `tool-handlers.ts`**：

- 注册工具 `multimodal_grounding_augment`（元数据严格遵循 PRD 4.1 节）
- Zod Schema 校验输入参数：
  - `session_id`：可选 string
  - `media_base64`：可选 string（传了 media_base64 则 media_type 必填）
  - `media_type`：enum（PRD 4.1 定义的 7 种类型）
  - `question`：必填 string
  - `merge_strategy`：enum `replace|augment`，默认 `augment`
  - `coordinate_precision`：enum `0-100|0-1000`，默认 `0-1000`
- 调用 `PipelineOrchestrator.execute(params)` 获取结果
- 返回 MCP 标准响应格式（PRD 4.2 节）
- 未传 `session_id` 时自动生成 UUID

**2. `transport/factory.ts`**：

- 根据 `MCP_TRANSPORT` 环境变量选择：
  - `stdio`：创建 `StdioServerTransport`（原生 SDK）
  - `sse`：创建 Hono 服务器 + SSE 端点
  - `http-stream`：创建 Hono 服务器 + HTTP Stream 端点
- Hono 用于 SSE 和 HTTP Stream 的 HTTP 层，MCP 消息处理仍走 SDK
- PORT 从 `config.ts` 读取

**3. `server.ts`**：

- 初始化 Config → Logger 启动信息
- 初始化 SessionManager（创建数据目录 + 初始化 SQLite 表）
- 注册工具处理器
- 创建传输并连接
- 启动 SessionManager 的 TTL 定期清理（`setInterval` 调用 `cleanupExpired`）
- 优雅关闭：SIGINT/SIGTERM → 关闭 SQLite 连接 → 停止定时器 → 退出

**完成标准**：

1. `npm run build` 成功生成 dist
2. **Stdio 模式**：`node dist/server.js` 启动，MCP Inspector 可发现 `multimodal_grounding_augment` 工具
3. **SSE 模式**：`MCP_TRANSPORT=sse npm start` → Hono 在 3000 端口监听，SSE 端点可访问
4. **HTTP Stream 模式**：`MCP_TRANSPORT=http-stream npm start` → HTTP Stream 端点可访问
5. 工具调用：传入 `question` → 返回含 `session_id`, `augmented_prompt`, `from_cache`, `round` 的 JSON
6. 未传 `session_id` → 自动生成 UUID 会话 ID 并返回
7. 传了 `media_base64` 但无 `media_type` → Zod 校验拒绝并返回明确错误
8. 服务启动时缺少必填环境变量 → 拒绝启动并输出清晰错误信息
9. 优雅关闭：Ctrl+C → 日志记录关闭事件 → SQLite 连接正常关闭
10. `npm run typecheck` 通过

---

### TASK-009：README 文档与环境变量模板

| 属性         | 值                                     |
| ------------ | -------------------------------------- |
| **映射 REQ** | REQ-C07                                |
| **类型**     | 直接开发                               |
| **优先级**   | P0                                     |
| **预估行数** | ~100（S）                              |
| **依赖**     | TASK-008（确保文档描述与实际行为一致） |
| **被依赖**   | 无                                     |
| **并行组**   | 无                                     |
| **风险**     | 低                                     |

**涉及文件**：

| 文件           | 所有权            | 说明                                      |
| -------------- | ----------------- | ----------------------------------------- |
| `README.md`    | TASK-009 **独占** | 项目完整文档                              |
| `.env.example` | TASK-009 **独占** | 环境变量模板（含全部必填+可选变量及注释） |

**README.md 必须包含的内容**：

1. 项目简介：基于 Visual Primitives 论文的多模态空间锚定 MCP 服务器，1-2 段
2. 前置要求：Node.js ≥ 22.5.0
3. 安装步骤：`git clone` → `npm install` → 配置 `.env`
4. 环境变量配置：完整变量表格（含说明、默认值、是否必填）
5. 启动方式：
   - Stdio 模式：Claude Desktop 配置示例（`mcpServers` JSON）
   - SSE 模式：`npm run dev:sse` + 端点说明
6. MCP 工具说明：`multimodal_grounding_augment` 参数表格 + 返回值说明
7. 多轮调用示例：与 PRD 4.3 节一致的 3 轮 JSON 示例
8. 支持的输入格式：图片/视频/文档的格式和大小限制表格
9. 开发指南：`npm run dev` / `npm test` / `npm run lint` / `npm run build`

**`.env.example` 内容**：

- 所有必填变量（标注 `# 必填`）
- 所有可选变量（标注 `# 可选` + 默认值）
- 每个变量一行中文注释

**完成标准**：

1. README.md 包含全部 8 个必需章节
2. `.env.example` 包含全部 12 个变量（3 必填 + 9 可选）
3. 多轮示例 JSON 语法正确且与实际返回一致
4. 文档无拼写错误，术语与代码一致

---

## 4. DDD 分类

| 任务     | 领域建模要点                                                                                                | DDD 适用理由                                                                                                   |
| -------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| TASK-005 | 聚合根 `Session`、实体 `SessionObject`、值对象 `BBox/Centroid/MergeStrategy`、领域服务 `ObjectMergeService` | 状态转换复杂（augment/replace 合并 + TTL 过期 + 跨轮一致性）、聚合边界清晰、多个业务对象在同一事务中一致性要求 |
| TASK-006 | 领域服务 `PipelineOrchestrator`（协调多个聚合和领域服务）                                                   | 复杂业务流程编排（cache 判断 → 路由 → 分析 → 解析 → 合并 → 构建提示词）、多个领域对象协调、降级处理横切关注点  |

**DDD 实施原则**（遵守 behavioral-guidelines 准则 2：简单优先）：

- 使用轻量 DDD：定义聚合边界和领域服务，但不过度引入事件总线、CQRS 等重型模式
- SessionManager 自身充当 Repository（`node:sqlite` 直接操作），不引入额外 Repository 抽象层
- 领域事件使用简单函数调用，不引入事件分发基础设施

---

## 5. TDD 与直接开发分类

### TDD 任务（核心业务规则，先写测试再写代码）

| 任务     | 模块             | TDD 原因                                       |
| -------- | ---------------- | ---------------------------------------------- |
| TASK-002 | config-validator | 配置校验是启动门禁，错误配置必须早发现         |
| TASK-003 | parser           | JSON 解析 + 正则备用——容错逻辑需边界测试       |
| TASK-003 | validator        | 坐标范围/合法性/唯一性——数学边界条件多         |
| TASK-003 | normalizer       | 坐标归一化运算——精度转换需验证                 |
| TASK-005 | session-manager  | SQLite CRUD + merge 策略 + TTL——数据一致性核心 |
| TASK-006 | pipeline         | 编排逻辑 + 缓存命中/未命中分支——集成复杂度高   |

### 直接开发任务（配置/模板/适配器/文档）

| 任务     | 模块                            | 理由                                                  |
| -------- | ------------------------------- | ----------------------------------------------------- |
| TASK-001 | 工程配置                        | 纯配置文件，无业务逻辑                                |
| TASK-002 | logger, retry                   | 工具函数，行为直观可手工验证                          |
| TASK-004 | image-adapter, vision-client    | 透传逻辑/API 调用封装，依赖外部服务，手工验证更高效   |
| TASK-003 | prompt-builder, templates       | 模板字符串拼接，无分支逻辑                            |
| TASK-007 | video-adapter, document-adapter | FFmpeg/渲染库集成，依赖外部二进制，手工集成测试更合适 |
| TASK-008 | server, transport, handler      | 框架集成代码，MCP Inspector 手工验证                  |
| TASK-009 | README, .env.example            | 纯文档                                                |

---

## 6. 风险任务

| 任务     | 风险等级 | 预估行数 | 风险描述                                                                               | 缓解策略                                                                    |
| -------- | -------- | -------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| TASK-002 | 中       | 260      | 共享区域——config.ts 和 types.ts 被所有模块依赖，定义错误影响全局                       | config.ts 一次性定义全部变量，后续只读；types.ts 接口先行，实现后不可改签名 |
| TASK-003 | 中       | 490（L） | 核心管道逻辑，4 个子模块；parser 错误会导致后续所有模块异常                            | TDD 保障：parser/validator/normalizer 均先写测试                            |
| TASK-005 | 高       | 400（L） | DDD 聚合 + SQLite 持久化 + 数据一致性；node:sqlite 是 Node.js 22.5+ 新 API，生态资料少 | TDD + WAL 模式 + 并发写入测试                                               |
| TASK-006 | 高       | 330（L） | 共享区域——协调全部模块，集成复杂度最高；任何单点异常不能导致进程崩溃                   | 全部模块 mock，隔离测试管道逻辑；每个分支路径独立测试                       |
| TASK-007 | 中       | 340（L） | FFmpeg 系统依赖兼容性（Windows/Linux/macOS）；Office 文档转换能力有限                  | `ffmpeg-static` 自动下载二进制；Office 文档 MVP 返回降级提示                |

---

## 7. 文件所有权和共享路径提醒

### 共享区域（需串行处理）

| 文件                                | 唯一责任方   | 访问策略                                                      | 冲突风险                                                          |
| ----------------------------------- | ------------ | ------------------------------------------------------------- | ----------------------------------------------------------------- |
| `src/config.ts`                     | **TASK-002** | 其余 TASK 只读 import，禁止修改                               | 高——若后续 TASK 擅自添加配置项，可能导致启动校验不一致            |
| `src/types.ts`                      | **TASK-002** | 其余 TASK 只读 import，可 `implements` 接口但不可修改接口签名 | 高——接口签名变更将破坏所有实现者                                  |
| `src/core/modality-router.ts`       | **TASK-006** | TASK-006 静态导入全部适配器类                                 | 中——TASK-007 新增适配器后，需确保导出名与 TASK-006 的 import 一致 |
| `package.json`                      | **TASK-001** | 后续 TASK 不得新增依赖（全部依赖已在 TASK-001 声明）          | 低——TASK-001 一次性声明所有依赖                                   |
| `src/core/adapters/base-adapter.ts` | **TASK-004** | TASK-007 的适配器 `implements MediaAdapter`                   | 低——接口定义后不可变                                              |

### 独立区域（可并行）

| 文件组                                                                                                                  | 并行条件                                              |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| TASK-003（parser/validator/normalizer/prompt-builder）⇄ TASK-004（adapters/vision-client）⇄ TASK-005（session-manager） | 三者仅依赖 TASK-002 的 config/types，互不修改对方文件 |
| TASK-007（video/document adapters）⇄ TASK-008（server/transport/handler）                                               | 独立文件集，无共享依赖                                |

### 关键共享路径提醒

1. **`src/core/pipeline.ts`（TASK-006）导入全部核心模块**：parser, validator, normalizer, prompt-builder, session-manager, modality-router, vision-client。TASK-003/004/005 导出必须与 TASK-006 预期一致。建议 TASK-003/004/005 完成后由 TASK-006 统一核对导入。

2. **`src/handlers/tool-handlers.ts`（TASK-008）导入 Pipeline**：TASK-008 仅导入 Pipeline.execute()，是唯一的使用者，耦合面最小。

3. **`src/core/modality-router.ts`（TASK-006）的 adapter 注册**：

   ```typescript
   // TASK-006 在 modality-router.ts 中导入：
   import { ImageAdapter } from './adapters/image-adapter.js';
   import { VideoAdapter } from './adapters/video-adapter.js';
   import { DocumentAdapter } from './adapters/document-adapter.js';
   ```

   确保 TASK-004 和 TASK-007 的适配器类名和路径与此匹配。

4. **测试文件使用内存 SQLite**：TASK-005 测试应使用 `:memory:` 数据库（而非 `DB_PATH`），避免污染开发数据库。

---

## 8. 推荐交付顺序

```
Round 1 (Foundation)
  TASK-001 ──────────────────────────►
    └─► TASK-002 ────────────────────►
          ├─► TASK-003 ──────────────►  (并行)
          ├─► TASK-004 ──────────────►  (并行)
          └─► TASK-005 ──────────────►  (并行)

Round 2 (Integration)
  TASK-003 + TASK-004 + TASK-005 就绪
    └─► TASK-006 ────────────────────►

Round 3 (Multi-modal + Delivery)
  TASK-006 就绪
    ├─► TASK-007 ────────────────────►  (并行)
    └─► TASK-008 ────────────────────►  (并行)
          └─► TASK-009 ──────────────►

Ring 0 (先行)  : TASK-001
Ring 1 (基础)  : TASK-002 ──► TASK-003 ║ TASK-004 ║ TASK-005 (并行)
Ring 2 (集成)  : TASK-006
Ring 3 (交付)  : TASK-007 ║ TASK-008 ──► TASK-009
```

**关键路径**：TASK-001 → TASK-002 → TASK-003 → TASK-006 → TASK-008 → TASK-009\
**最长路径耗时**：6 个任务的串行链 + 并行组中最长的 TASK（TASK-005 约与 TASK-003 相当）

---

## 9. REQ 追溯矩阵（完整映射）

### 功能需求（REQ-001 ~ REQ-019）

| REQ     | 需求                                                       | 主 TASK  | 辅 TASK  |
| ------- | ---------------------------------------------------------- | -------- | -------- |
| REQ-001 | 注册 MCP 工具，支持 stdio/SSE/HTTP Stream                  | TASK-008 | TASK-006 |
| REQ-002 | 与 OpenAI 兼容视觉模型通信，获取 JSON 坐标                 | TASK-008 | TASK-004 |
| REQ-003 | 支持图片输入（JPEG/PNG/GIF/WebP），Base64 直传，>20MB 拒绝 | TASK-004 | --       |
| REQ-004 | 支持视频输入（MP4/MOV/AVI/MKV/WebM），FFmpeg 抽帧          | TASK-007 | --       |
| REQ-005 | 支持文档输入（PDF/DOCX/PPTX/XLSX/TXT/MD），渲染为图像      | TASK-007 | --       |
| REQ-006 | 非标 JSON 备用正则解析恢复                                 | TASK-003 | --       |
| REQ-007 | 坐标验证：范围/合法性/唯一性/质心在 bbox 内                | TASK-003 | --       |
| REQ-008 | 坐标归一化到可配置精度                                     | TASK-003 | TASK-002 |
| REQ-009 | 增强提示词含物体标签/bbox/中心点/状态/空间关系             | TASK-003 | --       |
| REQ-010 | 配置通过环境变量注入，启动时校验必填项                     | TASK-002 | TASK-008 |
| REQ-011 | 基于 node:sqlite 的会话管理 CRUD                           | TASK-005 | --       |
| REQ-012 | 同一会话后续轮次复用缓存物体，0 视觉 API 成本              | TASK-005 | TASK-006 |
| REQ-013 | 跨轮物体 ID 一致性（SQLite 持久化保证）                    | TASK-005 | TASK-006 |
| REQ-014 | 会话物体列表增量更新（augment 策略）                       | TASK-005 | TASK-006 |
| REQ-015 | 会话 TTL 自动过期清理                                      | TASK-005 | TASK-008 |
| REQ-016 | 多轮增强提示词包含会话历史摘要                             | TASK-006 | TASK-003 |
| REQ-017 | 视觉分析失败时降级提示词，不中断服务                       | TASK-006 | TASK-004 |
| REQ-018 | 结构化日志（pino），不记录 Base64/API Key                  | TASK-002 | --       |
| REQ-019 | Hono 提供 SSE 和 HTTP Stream 传输的 HTTP 服务器            | TASK-008 | --       |

### 非功能需求（REQ-N01 ~ REQ-N08）

| REQ     | 需求                                               | 主 TASK  | 辅 TASK            |
| ------- | -------------------------------------------------- | -------- | ------------------ |
| REQ-N01 | 低延迟：单模态 P95 < 5s，多模态 P95 < 10s          | TASK-006 | TASK-004, TASK-007 |
| REQ-N02 | 高可用：含重试成功率 > 99.5%                       | TASK-006 | TASK-002           |
| REQ-N03 | 安全：API Key 仅环境变量，日志不记录敏感数据       | TASK-002 | --                 |
| REQ-N04 | 可扩展：实现 MediaAdapter 接口即可接入新模态       | TASK-002 | TASK-004           |
| REQ-N05 | 稳定性：任何单点异常不导致进程崩溃                 | TASK-006 | --                 |
| REQ-N06 | 持久化可靠性：SQLite WAL 模式，重启不丢失          | TASK-005 | --                 |
| REQ-N07 | 代码质量：ESLint + Prettier + TS strict，Git hooks | TASK-001 | --                 |
| REQ-N08 | CI/CD：lint → type-check → unit → build 流水线     | TASK-001 | --                 |

### 工程配置需求（REQ-C01 ~ REQ-C07）

| REQ     | 需求                                        | 主 TASK  |
| ------- | ------------------------------------------- | -------- |
| REQ-C01 | npm 项目初始化，package.json 含完整元数据   | TASK-001 |
| REQ-C02 | TypeScript 严格模式配置（tsconfig.json）    | TASK-001 |
| REQ-C03 | ESLint + Prettier 统一格式化配置            | TASK-001 |
| REQ-C04 | .gitignore 排除 node_modules/dist/data/.env | TASK-001 |
| REQ-C05 | Git hooks（husky + lint-staged）            | TASK-001 |
| REQ-C06 | commitlint 校验 Conventional Commits        | TASK-001 |
| REQ-C07 | README.md 含安装/配置/使用/多轮示例         | TASK-009 |

**映射覆盖率**：34/34 REQ（100%）

---

## 10. 验证清单

- [x] 所有 REQ-XXX 都至少映射到 1 个 TASK（34/34，100% 覆盖）
- [x] 任务使用垂直切片策略（每个 TASK 交付可独立验证的功能路径）
- [x] 无水平切片（无"设计全部表"/"实现全部 API"类任务）
- [x] 每个任务有明确的优先级和 test_strategy
- [x] 依赖关系已明确，无循环依赖
- [x] 并行机会已识别（TASK-003║TASK-004║TASK-005、TASK-007║TASK-008）
- [x] 风险任务已标注（TASK-002/003/005/006/007）
- [x] 单轮次总变更均不超过 1000 行（R1:~895, R2:~870, R3:~590）
- [x] 共享区域已指定唯一责任方（config.ts→TASK-002, types.ts→TASK-002, pipeline.ts→TASK-006, modality-router.ts→TASK-006, base-adapter.ts→TASK-004）
- [x] 每个任务有可独立验证的完成标准
- [x] 工程配置作为独立 TASK（TASK-001）
- [x] README 作为独立 TASK（TASK-009）
- [x] TDD/Direct 分类明确

---

## 11. 推荐的下一步

1. **交付给 planner**：任务分解文档已就绪，可交由 planner 制定详细执行计划（task → 文件级映射 + 实现顺序微调）
2. **开发启动前确认**：
   - 确认 CI 平台（GitHub Actions / Gitee / GitLab CI）——当前默认 GitHub Actions
   - 确认测试框架选择（当前默认 vitest）
   - 确认 Office 文档（DOCX/PPTX/XLSX）MVP 暂跳过的方案是否可接受
3. **实现顺序**：建议按 Round 1 → Round 2 → Round 3 顺序交付，每个 Round 完成后运行全量测试确保无回归
4. **接口冻结点**：
   - `src/types.ts`（TASK-002 完成后冻结）
   - `src/config.ts`（TASK-002 完成后冻结）
   - `src/core/adapters/base-adapter.ts`（TASK-004 完成后冻结）
   - `src/core/modality-router.ts`（TASK-006 完成后冻结）
