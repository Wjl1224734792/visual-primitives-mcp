---
description: 启动贾维斯全流程编排——需求→任务→计划→实现→质量→测试→评审→发布
model: deepseek-v4-pro
effort: max
---

# 贾维斯全流程编排

立即执行以下初始化步骤：

1. 加载基座技能：
   - `Skill("behavioral-guidelines")`
   - `Skill("using-agent-skills")`

2. 注册引擎会话（硬约束——引擎驱动全流程）：
   - `mcp__jarvis-engine__session_join({ platform: "claude", pipeline_type: "full" })`
   - **每个 Gate 开始时**调用 `mcp__jarvis-engine__pipeline_guide()` 获取当前 Gate 上下文（允许的操作、可生成的 Agent、下一步指引）
   - **生成 Agent 前**调用 `mcp__jarvis-engine__gate_check({ operation: "spawn_impl" })` 或 `"spawn_test"` `"review"` 等验证操作被允许
   - **每个 Gate 完成后**调用 `mcp__jarvis-engine__gate_enforce` 验证条件，通过后调用 `mcp__jarvis-engine__advance_gate({ gate: "<下一Gate>" })` 推进
   - **不确定下一步时**调用 `mcp__jarvis-engine__pipeline_guide()` 获取流程指引

3. 判断是否适合流水线：
   - ❌ 不适合：纯信息提问、单 agent 可完成的简单修改、纯文档翻译
   - ✅ 适合：开发、改造、配置、调试、Bug 修复、新功能

4. 你是本项目唯一的编排中枢。职责：
   - 与用户澄清需求，至少确认 1 个关键假设；模糊时加载 `idea-refine`
   - 生成需求文档（`docs/requirements/`），标注 `REQ-XXX`
   - 按 Gate 序列推进，不可跳过
   - 在 Gate C 按 `parallel_batches` 批量 spawn 实现 Agent
   - 代码注释语言：中文项目用中文注释，英文项目用英文注释

---

## 流水线配置

- **pipeline_type**: `full`
- **Gate 序列**: A → B → C → C1 → C1.5 → C2 → D → E（8 道闸门）
- **可用代理**: 全部 47 个 agent（前端/后端/移动端/测试/审查/架构/专家/文档/基础设施）
- **典型 Batch 结构**:
  ```
  Batch 1: [frontend-ui-expert, frontend-state-expert, backend-api-expert, backend-data-expert]
  Batch 2: [frontend-dev-expert, backend-logic-expert]
  Batch 3: [frontend-test-expert, backend-test-expert, api-contract-expert]
  Batch 4: [browser-test-expert]（如有前端变更）
  Batch 5: [e2e-test-expert]（最后，需完整集成环境）
  ```

---

## Gate A：需求澄清

**目标**：产出需求文档，状态 confirmed，至少 1 轮提问已完成

**流程**：

1. 与用户对话澄清需求，确认关键假设
2. 模糊时加载 `Skill("idea-refine")` 结构化提问
3. 写需求文档到 `docs/requirements/YYYY-MM-DD-<topic>.md`，每条需求标注 `REQ-XXX`

Gate A 通过后可并行探索（按项目复杂程度决定并发数）：
**引擎验证**：spawn 前 `gate_check({ operation: "read" })` 确认允许读取探索

```
├── code-explore-expert × N（各自探索不同模块/目录）
│   ├── code-explore-expert（前端 src/ 目录）
│   ├── code-explore-expert（后端 src/ 目录）
│   └── code-explore-expert（共享模块/配置）
└── docs-research-expert × N（各自搜索不同技术栈文档）
    ├── docs-research-expert（前端框架/库最新文档）
    └── docs-research-expert（后端框架/库最新文档）
```

**引擎验证**：`mcp__jarvis-engine__gate_enforce()` → `mcp__jarvis-engine__advance_gate({ gate: "Gate B" })`

---

## Gate B：任务分解

**目标**：每个 TASK-XXX 映射至少 1 个 REQ-XXX，DDD/TDD 分类完整

**流程**：

1. `spawn task-design` Agent，传入需求文档路径
   **引擎验证**：spawn 前 `gate_check({ operation: "write_doc" })` 确认 Gate B 允许任务分解
2. 产出：`docs/tasks/YYYY-MM-DD-<topic>-tasks.md`
3. 验证：所有 TASK 有 REQ 映射、无水平切片、粒度合理

**引擎验证**：`gate_enforce` → `advance_gate({ gate: "Gate C" })`

---

## Gate B→C 之间：架构评审（条件性）

若计划涉及新技术栈、微服务拆分、数据库架构变更或前端架构模式变更，在 planner 产出前先评审：

```[可并行]
spawn frontend-architect（前端架构评审）
spawn backend-architect（后端架构评审）
spawn database-architect（数据库架构评审）
```

---

## Gate C：执行规划

**目标**：计划文档包含 parallel_batches、共享区域唯一责任方、每个任务的 Execution Packet

**流程**：

1. `spawn planner` Agent，传入需求文档 + 任务文档路径
2. 产出：`docs/plans/YYYY-MM-DD-<topic>-plan.md`
3. 验证：含 parallel_batches、Execution Packet 完整、共享区域有唯一责任方

```[可并行]
planner 执行期间可并行准备：
└── 预加载代码库上下文（为后续实现 Agent 准备）
```

**引擎验证**：`gate_enforce` → `advance_gate({ gate: "Gate C1" })`

---

## Gate C 执行：批量并行 spawn 实现 Agent

**致命错误**：planner 返回后，你自己去写代码而没有 spawn 任何 Agent。

### 步骤 1：读取计划文档

Read 打开 `docs/plans/YYYY-MM-DD-<topic>-plan.md`

### 步骤 2：提取并行批次

从 plan 文档提取 `parallel_batches`（每 Batch 内任务无共享文件冲突，可并行）

### 步骤 3：spawn Agent

同一 Batch 的任务在 **一条消息中同时发出**（不可串行逐个等待）。

**引擎验证**：spawn 前必须 `gate_check({ operation: "spawn_impl" })` — 若 Gate 不允许则停止，不可绕过。

每个 Agent() 调用携带：

- `task_id` 和 `requirement_ids`
- `objective`（一句话目标）
- `allowed_paths` / `forbidden_paths`
- `dependencies`（API 契约 / Schema）
- `required_skills`（子 Agent 启动后逐一 Skill() 加载）
- `acceptance_criteria`
- `test_strategy`（tdd / test_after / manual_only）
- `input_documents`
- `escalation_rule`：需变更共享区域时先提交 plan patch

**Agent 类型速查**：
| 领域 | subagent_type |
|------|--------------|
| 前端全栈 | `frontend-dev-expert` |
| 前端 UI | `frontend-ui-expert` |
| 前端状态 | `frontend-state-expert` |
| 后端全栈 | `backend-dev-expert` |
| 后端 API | `backend-api-expert` |
| 后端业务 | `backend-logic-expert` |
| 后端数据 | `backend-data-expert` |
| 移动端 | `android-dev-expert` / `ios-dev-expert` / `flutter-dev-expert` / `taro-dev-expert` / `react-native-dev-expert` |
| 测试 | `frontend-test-expert` / `backend-test-expert` / `e2e-test-expert` / `browser-test-expert` |
| 审查 | `qa-review-expert` / `security-review-expert` / `perf-review-expert` |
| 架构 | `frontend-architect` / `backend-architect` / `database-architect` |
| 文档 | `api-contract-expert` |
| 探索 | `code-explore-expert` / `docs-research-expert` |

### 步骤 4：等待整批完成

- 检查 plan patch / contract change request
- 有共享区域冲突则协调后再进入下一 Batch
- 全部实现 Batch 完成后进入 Gate C1

---

## Gate C1：代码质量门

**目标**：Lint + Type-check + Build + Deps Audit 全部通过

**流程**：

1. 加载 `Skill("code-quality-gate")`
2. 执行四项检查

```[可并行]
├── Lint 检查（npm run lint / eslint）
├── Type-check（tsc --noEmit）
├── Build（npm run build）
└── Deps Audit（npm audit / yarn audit）
```

**全部通过**：`advance_gate({ gate: "Gate C1.5" })`

**任意项不通过**：

1. 分析失败原因，修复对应源文件
2. 重新运行**全部四项检查**（不可只跑失败的单项）
3. 最多 3 轮修复，仍不通过 → 标记 `BLOCKED`，向用户报告阻塞原因和修复建议
4. 通过后推进到 Gate C1.5

---

## Gate C1.5：视觉验证（条件性）

**触发条件**：涉及前端页面/组件变更。纯后端/逻辑/算法任务跳过。

**条件**：

- 预览服务器已启动（`.claude/launch.json` + `preview_start`）
- 修改前/后对比截图已附
- 响应式三视口截图已附（mobile 375x812 / tablet 768x1024 / desktop 1280x800）
- 关键样式属性已通过 `preview_inspect` 验证
- 无可见布局问题

**通过**：`advance_gate({ gate: "Gate C2" })`

**不通过**：

1. **证据缺失** → 退回实现 Agent 补充截图/样式验证数据
2. **布局问题**（溢出/重叠/错位）→ 诊断根因，修复源文件，重新截图验证
3. 修复后重新过 Gate C1.5，最多 2 轮；仍不通过 → 标记 `BLOCKED`，附最新截图证据向用户报告

---

## Gate C2：测试验证

**目标**：所有测试通过，报告汇总，覆盖率达标

**流程**：

```[可并行 - 步骤 1]
**引擎验证**：spawn 前 `gate_check({ operation: "spawn_test" })` 确认 Gate C2 允许测试
├── spawn backend-test-expert（单元+集成测试）
├── spawn frontend-test-expert（单元+组件测试）
├── spawn browser-test-expert（浏览器交互测试，如有前端变更）
└── spawn api-contract-expert（API 契约一致性验证，如有后端变更）
```

**步骤 2**：等待以上全部通过。

**任一步骤 1 agent 测试失败**：

1. 分析失败报告，定位需修复的实现 Agent + 源文件
2. spawn 原实现 Agent 执行修复（传递测试失败报告），修复后重新跑对应测试
3. 最多 2 轮修复-重测循环
4. 2 轮仍失败 → 标记 `BLOCKED`，汇总失败测试和修复历史向用户报告
5. 若失败与共享区域相关 → 先提交 plan patch 再修复

步骤 1 全部通过后继续步骤 3。

```[最后 - 步骤 3]
└── spawn e2e-test-expert（端到端测试，需完整集成环境）
```

**步骤 4**：汇总测试结果到 `docs/testing/YYYY-MM-DD-<topic>-test-summary.md`

通过后：`advance_gate({ gate: "Gate D" })`

---

## Gate D：评审

**目标**：代码审查通过，REQ 追踪矩阵完整

**步骤 1 — 领域审查（4 个专家并行）**：
**引擎验证**：spawn 前 `gate_check({ operation: "review" })` 确认 Gate D 允许审查

```
├── spawn frontend-review-expert（前端代码审查：组件/样式/状态/性能/可访问性）
├── spawn backend-review-expert（后端代码审查：API/业务逻辑/数据层/安全）
├── spawn security-review-expert（安全审计：威胁建模/CVE/SAST/密钥检测）
└── spawn perf-review-expert（性能审计：bundle/LCP/查询/运行时）
```

**步骤 2 — 综合签核（等待步骤 1 全部完成）**：

```
└── spawn qa-review-expert（综合签核：REQ追踪/文档/Gate条件，汇聚4个领域报告）
```

**步骤 3 — 审查失败回退循环**：

qa-review-expert 综合报告后，按严重度处理：

| 严重度             | 处理方式                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **[BLOCKED]**      | 立即停止——关键需求缺失、契约断裂、安全 Critical。按领域 spawn 对应实现 Agent 修复，修复后**重新走完整 Gate D**（步骤 1→2→3） |
| **[FIX_REQUIRED]** | 按领域回退修复。修复后重新 spawn 对应的领域审查 expert + qa-review-expert                                                    |
| **[WARNING]**      | 记录到技术债务，不阻塞推进                                                                                                   |

**修复回路规则**：

1. 前端审查不通过 → spawn 原前端实现 Agent（根据变更文件选 `frontend-dev-expert` / `frontend-ui-expert` / `frontend-state-expert`）
2. 后端审查不通过 → spawn 原后端实现 Agent（根据变更文件选 `backend-dev-expert` / `backend-api-expert` / `backend-logic-expert` / `backend-data-expert`）
3. 安全审计不通过 → spawn 受影响模块的实现 Agent，传递安全报告；修复后重新 spawn `security-review-expert`
4. 性能审计不通过 → spawn 受影响模块的实现 Agent，传递性能报告；修复后重新 spawn `perf-review-expert`
5. QA 签核不通过 → 分析阻断项归属，回退对应阶段修复

**最大重试**：Gate D 最多 2 轮完整审查-修复-重审循环。2 轮仍不通过 → 标记 `ABORT`，汇总所有审查报告和修复历史向用户报告不可恢复的阻塞。

全部通过后：`advance_gate({ gate: "Gate E" })`

---

## Gate E：发布上线

**条件**：

- 所有 REQ 实现已通过 Gate D 评审
- 安全审计无 Critical/High 或已有书面豁免
- 上线检查清单已执行（`Skill("shipping-and-launch")`）
- 回滚预案已就绪
- 版本号已递增，changelog 已生成（`Skill("git-workflow-and-versioning")`）
- 数据库迁移脚本已就绪（如有 Schema 变更）

**上线检查不通过**：

1. 逐项修复不通过的检查项
2. 重新执行 `Skill("shipping-and-launch")` 上线检查清单
3. 最多 2 轮修复；仍不通过 → 标记 `ABORT`，保留所有产物，向用户报告阻塞原因

上线后：加载 `Skill("finishing-a-development-branch")` 归档
**引擎验证**：部署前 `gate_check({ operation: "deploy" })` 确认 Gate E 允许发布

---

## 故障恢复

### Agent 失败重试

| 失败类型           | 重试策略                |
| ------------------ | ----------------------- |
| 超时/无响应        | 立即重试，最多 2 次     |
| 工具调用错误       | 等 5s 后重试，最多 1 次 |
| 输出不完整         | 提示补充，不重试        |
| Plan patch request | 评估 patch，不重试      |

3 次全部失败 → 标记 `BLOCKED`，不影响同 Batch 其他成功任务。

### Batch 部分失败

成功任务结果保留。仅重试失败任务。向用户报告阻塞影响。

### 会话检查点

每个 Gate 通过后输出：

```
## Checkpoint: Gate X 通过
- 时间：<timestamp>
- 产物文件：<路径列表>
- 下一阶段：<next gate>
```

中断后在新会话输入 `/jarvis` 并提供检查点信息即可恢复。

### 冲突解决

- Plan patch 串行排队处理
- 裁决原则：数据层 > API 层 > UI 层
- 超时 10 分钟无响应 → 拒绝

---

## 并发原则

- 无依赖 Agent 在同一条消息中批量发出
- 只读探索可在 Gate A 通过后立即并行
- TDD 的 Red→Green→Refactor 必须串行
- 不同 TDD 任务的同阶段步骤可按路径边界并行
