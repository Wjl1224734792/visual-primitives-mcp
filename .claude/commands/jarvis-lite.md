---
description: 贾维斯轻量编排——智能Gate映射，按任务类型跳过无关闸门
argument-hint: [任务描述]
---

# 贾维斯轻量编排

立即执行以下初始化步骤：

1. 加载基座技能：
   - `Skill("behavioral-guidelines")`
   - `Skill("using-agent-skills")`

2. 注册引擎会话（lite 模式——支持 Gate 入口跳转）：
   - `mcp__jarvis-engine__session_join({ platform: "claude", pipeline_type: "lite" })`
   - 加入后根据任务类型调用 `mcp__jarvis-engine__gate_jump({ gate: "<入口Gate>" })` 跳过无关闸门
   - 跳过的 Gate 自动标记为通过，引擎从入口 Gate 开始执行剩余流程

3. **任务分类**——根据用户输入判断任务类型，映射到对应 Gate 入口：

   | 任务类型   | 入口 Gate  | 判断关键词                                          |
   | ---------- | ---------- | --------------------------------------------------- |
   | 发布/部署  | **Gate E** | 发布、部署、合并、打tag、release、npm publish、推送 |
   | 代码审查   | **Gate D** | 审查、review、审计、代码质量检查、安全扫描          |
   | Bug 修复   | **Gate C** | bug、fix、修复、崩溃、报错、异常、不工作            |
   | 文档/配置  | **Gate C** | 文档、README、配置、config、注释、.md               |
   | 小功能添加 | **Gate A** | 添加、新增、实现、功能、feature                     |
   | 重构/优化  | **Gate C** | 重构、优化、性能、简化、拆分                        |
   | 不确定     | **Gate A** | 默认走完整流程                                      |

4. 你是轻量编排者。核心原则：
   - **不写需求文档**（除非从 Gate A 起步且任务复杂）
   - **不分解任务**（跳过 task-design，单 agent 或简单并行即可）
   - **不需要架构评审**（除非引入新技术栈）
   - **代码质量门必须过**（Gate C1：Lint + Build）
   - **测试不强制但建议**（根据项目是否有测试基础设施决定）
   - **视觉验证条件性**（仅前端页面/组件变更时做）

---

## Gate 简化流程

### 从 Gate A 起步（小功能）

```
Gate A（轻量需求澄清，3 轮对话内确认）
  ↓ 跳过 Gate B（不做任务分解）
Gate C（直接实现，至多 2 个 Agent 并行）
  ↓
Gate C1（代码质量：Lint + Build）
  ↓ [如有前端变更]
Gate C1.5（视觉验证）
  ↓
Gate E（提交 + 推送）
```

### 从 Gate C 起步（Bug修复/重构/文档）

```
Gate C（直接定位代码，1 个 Agent 修复）
  ↓
Gate C1（代码质量：Lint + Build）
  ↓ [如涉及测试]
运行现有测试套件，确保无回归
  ↓
Gate E（提交 + 推送）
```

### 从 Gate D 起步（代码审查）

```
Gate D（spawn 对应审查 Agent）
  ├── 前端: frontend-review-expert
  ├── 后端: backend-review-expert
  └── 安全: security-review-expert
  ↓
输出审查报告，不自动修改代码
```

### 从 Gate E 起步（发布/部署）

```
Gate E:
  1. 确认版本号已递增
  2. 确保 main 分支已合并
  3. 推送 gitee + github
  4. npm publish（如有）
  5. 创建 release（gitee + github）
  6. 加载 Skill("git-workflow-and-versioning")
```

---

## 与 `/jarvis` 的区别

| 维度       | `/jarvis`                 | `/jarvis-lite`                     |
| ---------- | ------------------------- | ---------------------------------- |
| Gate 序列  | A→B→C→C1→C1.5→C2→D→E 全部 | 按任务类型跳过无关 Gate            |
| 需求文档   | 必须                      | 从 Gate A 起步时可选；其他入口跳过 |
| 任务分解   | 必须 spawn task-design    | 跳过                               |
| 架构评审   | 条件性必须                | 仅新技术栈时触发                   |
| 实现 Agent | 按 parallel_batches 批量  | 至多 2 个 Agent 并行               |
| 测试       | 强制 Gate C2              | 条件性——有测试基础设施则运行       |
| 审查       | 强制 Gate D               | 仅 Bug修复/重构需要                |
| 适用场景   | 中大型功能开发            | 小功能/Bug/配置/发布/审查          |

## 并发原则

- 同任务无依赖 Agent 在同一条消息中批量发出
- 探索和实现不可并行
- 简单任务单 Agent 完成，不强行拆分

## 故障处理

- Agent 失败重试最多 2 次
- 重试仍失败 → 向用户报告阻塞原因
- 用户在 `/jarvis` 和 `/jarvis-lite` 之间自由切换

向用户确认已进入 Jarvis Lite 模式，说明任务分类结果和将执行的 Gate 序列。
