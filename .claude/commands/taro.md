---
description: Taro 小程序/H5 开发生命周期——需求→任务→计划→实现→质量→测试→评审→发布
argument-hint: [Taro 需求描述]
---

# Taro 小程序/H5 开发生命周期

立即执行以下初始化步骤：

1. 加载基座技能：
   - `Skill("behavioral-guidelines")`
   - `Skill("using-agent-skills")`

2. 注册引擎会话（硬约束——引擎驱动全流程，不可绕过）：
   - `mcp__jarvis-engine__session_join({ platform: "claude", pipeline_type: "full" })`
   - **每个 Gate 开始时**调用 `mcp__jarvis-engine__pipeline_guide()` 获取当前 Gate 上下文
   - **生成 Agent 前**调用 `mcp__jarvis-engine__gate_check({ operation: "spawn_impl" })` 验证操作被允许
   - **Gate C1 时**加载 `Skill("code-quality-gate")`，Lint/Type-check/Build 前调用 `gate_check`
   - **每个 Gate 完成后**调用 `mcp__jarvis-engine__gate_enforce` 验证条件，通过后 `mcp__jarvis-engine__advance_gate` 推进
   - **Gate E 时**加载 `Skill("shipping-and-launch")`、`Skill("git-workflow-and-versioning")`、`Skill("finishing-a-development-branch")`

3. 判断需求是否适合流水线。✅ 适合：Taro 页面/组件、多端适配、状态管理、性能优化、小程序审核问题修复。

4. 你是 Taro 开发编排者。职责：
   - 澄清需求——至少确认 1 个关键假设（目标端：微信/支付宝/百度/字节小程序 + H5）
   - 模糊时加载 `idea-refine`；生成 `docs/requirements/` 带 `REQ-XXX`
   - Gate A→B→C→C1→C2→D→E 全链路，不可绕过
   - 通过 Gate C 后按 `parallel_batches` 批量 spawn Taro Agent
   - 代码注释语言：中文项目用中文注释

5. Plan Patch 机制：共享组件/配置/路由变更必须提交 plan patch。

---

## Taro Agent 路由

| 层级             | subagent_type                                 |
| ---------------- | --------------------------------------------- |
| 全栈实现         | `taro-dev-expert`                             |
| UI/布局/多端样式 | `taro-ui-expert`                              |
| 状态/数据/路由   | `taro-state-expert`                           |
| 浏览器测试（H5） | `browser-test-expert`                         |
| E2E 测试         | `e2e-test-expert`                             |
| 安全审计         | `security-review-expert`                      |
| 基础设施/CI      | `infra-deploy-expert`                         |
| 只读探索（辅助） | `code-explore-expert`、`docs-research-expert` |

## Gate C：批量并行 spawn

致命错误：planner 返回后你自己去写代码。

1. Read `docs/plans/YYYY-MM-DD-<topic>-plan.md`
2. 提取 `parallel_batches`
3. 每个任务 → 一个 `Agent()` 调用
4. 同 Batch 同一条消息批量发出

**典型 Batch 结构**：

```
Batch 1: [taro-ui-expert, taro-state-expert]   ← UI + 状态并行
Batch 2: [browser-test-expert]                   ← H5 端浏览器测试
Batch 3: [e2e-test-expert]                       ← 真机/模拟器 E2E
```

## Gate C2 测试

```
全部实现 Batch 完成
  → 步骤 1：spawn taro-dev-expert 运行单元/组件测试
  → 步骤 2：H5 端浏览器测试（spawn browser-test-expert，加载 agent-browser）
  → 步骤 3：小程序端 E2E（spawn e2e-test-expert，微信开发者工具 CLI）
  → 全部通过，汇总 docs/testing/ → Gate C2 通过
```

**小程序测试要点**：

- 微信开发者工具 CLI：`cli open --project` + 自动化操作
- H5 端：agent-browser 浏览器自动化
- 多端适配验证：至少覆盖微信 + H5 两端

## Gate E 发布

- 加载 `shipping-and-launch` 执行上线检查清单
- 小程序：微信审核规范检查、体验版验证、提交审核
- H5：静态资源 CDN 部署、缓存策略
- 加载 `git-workflow-and-versioning` 更新版本与 changelog
- 上线后监控 30 分钟 → 加载 `finishing-a-development-branch` 归档

## 故障恢复

Agent 失败重试（最多 3 次）、Batch 部分失败仅重试失败任务、Gate 失败回退修复、会话检查点。

向用户确认已进入 Taro 开发生命周期模式。
