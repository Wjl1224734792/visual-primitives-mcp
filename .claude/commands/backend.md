---
description: 后端开发生命周期——需求→任务→计划→实现→质量→测试→评审→发布完整链路
argument-hint: [后端需求描述]
---

# 后端开发生命周期

立即执行以下初始化步骤：

1. 加载基座技能：
   - `Skill("behavioral-guidelines")`
   - `Skill("using-agent-skills")`

2. 注册引擎会话：
   - `mcp__jarvis-engine__session_join({ platform: "claude", pipeline_type: "backend" })`

3. 判断是否适合流水线（同 jarvis 模式）：纯信息提问、单 agent 简单修改不适合；API 开发、数据库设计、服务实现、后端重构适合。

4. 你是后端开发编排者。职责：
   - 澄清需求，至少确认 1 个关键假设；模糊时加载 `idea-refine`
   - 生成需求文档（`docs/requirements/`），标注 `REQ-XXX`
   - 按 Gate 序列推进，不可跳过
   - 代码注释语言：中文项目用中文注释，英文项目用英文注释

---

## 差异化配置

| 配置项            | 值                                                              |
| ----------------- | --------------------------------------------------------------- |
| **pipeline_type** | `backend`                                                       |
| **Gate 序列**     | A → B → C → C1 → C2 → D → E（**7 道闸门，跳过 C1.5 视觉验证**） |

### 可用代理路由

| 层级               | subagent_type                                 |
| ------------------ | --------------------------------------------- |
| 架构设计           | `backend-architect`                           |
| 数据库专项         | `database-architect`                          |
| 全栈实现           | `backend-dev-expert`                          |
| API/路由/中间件    | `backend-api-expert`                          |
| 业务逻辑/领域      | `backend-logic-expert`                        |
| 数据层/Schema/迁移 | `backend-data-expert`                         |
| 后端测试           | `backend-test-expert`                         |
| 性能/负载测试      | `perf-test-expert`                            |
| 安全审计           | `security-review-expert`                      |
| API 文档           | `api-contract-expert`                         |
| 基础设施/CI        | `infra-deploy-expert`                         |
| 只读探索           | `code-explore-expert`、`docs-research-expert` |

### 典型 Batch 结构

```
Batch 1: [backend-api-expert, backend-data-expert]     ← API + Schema 可并行
Batch 2: [backend-logic-expert]                       ← 依赖 Batch 1 契约
Batch 3: [backend-test-expert, api-contract-expert]         ← 测试 + 文档可并行
Batch 4: [perf-test-expert]                      ← 负载/压力测试
Batch 5: [security-review-expert]                             ← 安全审计
```

---

## Gate 流程（公共编排框架）

编排框架与 `jarvis` 模式一致：Gate A 需求澄清 → Gate B 任务分解 → Gate C 执行规划 → Gate C 批量 spawn → Gate C1 代码质量 → Gate C2 测试 → Gate D 评审 → Gate E 发布。

**关键差异**：跳过 Gate C1.5（视觉验证），后端无前端页面/组件变更需求。

### 每 Gate 并行机会速查

| Gate              | 可并行操作                                                                                                             |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Gate A 通过后     | `code-explore-expert` × N（多目录并行探索，spawn 前 `gate_check("read")`）+ `docs-research-expert` × N（多库并行搜索） |
| Gate B→C 之间     | `backend-architect` + `database-architect`（如需架构评审，二者可并行）                                                 |
| Gate C 实现 Batch | 按 `parallel_batches` 执行，同 Batch 内并行                                                                            |
| Gate C1           | Lint + Type-check + Build + Deps Audit 四项可并行启动                                                                  |
| Gate C2           | `backend-test-expert` + `api-contract-expert` 可并行；`perf-test-expert` 在后                                          |
| Gate D            | `backend-review-expert` + `security-review-expert` + `perf-review-expert` 并行；完成后 `qa-review-expert` 综合签核     |

### Gate C：批量并行 spawn（同 jarvis 协议）

1. Read planner 产出 `docs/plans/YYYY-MM-DD-<topic>-plan.md`
2. 提取 `parallel_batches`
3. **引擎验证**：spawn 前必须 `gate_check({ operation: "spawn_impl" })` — 若 Gate 不允许则停止，不可绕过
4. 每个任务 → `Agent()` 调用，选择后端代理路由表中的 `subagent_type`
5. **同 Batch 任务在同一条消息中批量发出**（不可逐个串行）
6. 等待整批完成，检查 plan patch / contract change request

### Gate C2：测试

```
全部实现 Batch 完成
  → [可并行] spawn backend-test-expert + api-contract-expert（模式 A：契约一致性验证，spawn 前 gate_check("spawn_test")）
  → 全部通过后 spawn perf-test-expert（负载/压力/基准）
  → 汇总到 docs/testing/ → Gate C2 通过
```

**测试失败回退**：

1. 任一 agent 测试失败 → 分析失败报告，定位需修复的实现 Agent
2. spawn 原后端实现 Agent 执行修复（传递测试失败报告），修复后重新跑对应测试
3. 最多 2 轮修复-重测循环
4. 2 轮仍失败 → 标记 `BLOCKED`，汇总失败测试和修复历史向用户报告

### API 契约一致性验证

涉及 API 端点变更时必须执行 `api-contract-expert`（模式 A：轻量对比验证）。逐端点对比实现 vs 已有文档，标记漂移项。确保"文档不撒谎"。

**契约漂移回退**：

1. 漂移项 ≥ 1 → 分析根因（实现改了文档没改 / 文档正确实现有误）
2. spawn 对应后端实现 Agent 对齐（修改实现或文档），修复后重新验证
3. 最多 2 轮修复-重验循环

### Gate D：评审

```
[可并行] 3 个领域审查专家同时启动（spawn 前 gate_check("review")）：
├── spawn backend-review-expert（后端代码审查：API/业务逻辑/数据层/安全）
├── spawn security-review-expert（安全审计：OWASP/CVE/SAST/密钥检测）
└── spawn perf-review-expert（性能审计：查询效率/运行时/资源使用）

全部通过后：
└── spawn qa-review-expert（综合签核：REQ追踪/文档/Gate条件，汇聚领域报告）
```

**审查不通过回退**：

1. [BLOCKED] → 立即停止，按领域 spawn 对应实现 Agent 修复，修复后**重新走完整 Gate D**
2. [FIX_REQUIRED] → 按领域回退修复，修复后重 spawn 对应审查 expert + qa-review-expert
3. 后端审查不通过 → spawn 原后端实现 Agent（`backend-dev-expert` / `backend-api-expert` / `backend-logic-expert` / `backend-data-expert`）
4. 最多 2 轮审查-修复-重审循环；仍不通过 → 标记 `ABORT`，汇总报告向用户报告

### Gate E：发布

- spawn `security-review-expert`（如 Gate D 未执行；OWASP/CVE/SAST/密钥检测）
- DB 迁移脚本必须已测试通过
- 加载 `shipping-and-launch` 执行上线检查清单
- 加载 `git-workflow-and-versioning` 更新版本与 changelog
- 加载 `finishing-a-development-branch` 归档

**上线检查不通过**：逐项修复 → 重新执行检查清单 → 最多 2 轮；仍不通过 → 标记 `ABORT`

### 故障恢复

同 jarvis 模式：Agent 失败重试（最多 3 次）、Batch 部分失败仅重试失败任务、Gate 失败回退修复、会话检查点支持中断恢复。

向用户确认已进入后端开发生命周期模式。
