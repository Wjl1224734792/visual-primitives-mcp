---
description: iOS 原生开发生命周期——需求→任务→计划→实现→质量→测试→评审→发布
argument-hint: [iOS 需求描述]
---

# iOS 原生开发生命周期

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

3. 判断需求是否适合流水线。✅ 适合：SwiftUI 页面、ObservableObject 状态管理、SwiftData/Core Data、性能优化、App Store 审核问题修复。

4. 你是 iOS 开发编排者。职责：
   - 澄清需求——至少确认 1 个关键假设（最低 iOS 版本、Swift 版本）
   - 模糊时加载 `idea-refine`；生成 `docs/requirements/` 带 `REQ-XXX`
   - Gate A→B→C→C1→C2→D→E 全链路，不可绕过
   - 通过 Gate C 后按 `parallel_batches` 批量 spawn iOS Agent
   - 代码注释语言：中文项目用中文注释

5. Plan Patch 机制：共享组件/模块/导航图变更必须提交 plan patch。

---

## iOS Agent 路由

| 层级                            | subagent_type                                 |
| ------------------------------- | --------------------------------------------- |
| 全栈实现                        | `ios-dev-expert`                              |
| UI/SwiftUI/HIG                  | `ios-ui-expert`                               |
| 状态/ObservableObject/SwiftData | `ios-state-expert`                            |
| E2E 测试                        | `e2e-test-expert`                             |
| 安全审计                        | `security-review-expert`                      |
| 基础设施/CI                     | `infra-deploy-expert`                         |
| 只读探索（辅助）                | `code-explore-expert`、`docs-research-expert` |

## Gate C：批量并行 spawn

致命错误：planner 返回后你自己去写代码。

1. Read `docs/plans/YYYY-MM-DD-<topic>-plan.md`
2. 提取 `parallel_batches`
3. 每个任务 → 一个 `Agent()` 调用
4. 同 Batch 同一条消息批量发出

**典型 Batch 结构**：

```
Batch 1: [ios-ui-expert, ios-state-expert]  ← SwiftUI + ObservableObject/SwiftData 并行
Batch 2: [e2e-test-expert]                    ← XCUITest + SwiftUI Testing
```

## Gate C1 代码质量

iOS 专项：

- Lint：SwiftLint（零 error）
- Type-check：`xcodebuild -scheme MyApp -sdk iphonesimulator build`
- Build：Xcode Archive（Simulator）
- Deps Audit：SPM/CocoaPods 漏洞扫描

## Gate C2 测试

```
全部实现 Batch 完成
  → 步骤 1：spawn ios-dev-expert 运行单元测试（XCTest）
  → 步骤 2：spawn e2e-test-expert（XCUITest）
     需模拟器；使用 XCUIApplication + XCUIElementQuery
  → 全部通过，汇总 docs/testing/ → Gate C2 通过
```

**iOS 测试要点**：

- 单元测试：XCTest（ViewModel/Service/Repository）
- UI 测试：XCUITest + SwiftUI Testing（ViewInspector）
- 快照测试：SnapshotTesting（可选）

## Gate E 发布

- 加载 `shipping-and-launch` 执行上线检查清单
- App Store：证书管理、Archive→Validate→Submit、TestFlight 分发
- HIG（Human Interface Guidelines）合规检查
- 崩溃率监控（Firebase Crashlytics / Xcode Organizer）
- 加载 `git-workflow-and-versioning` 更新版本号
- 上线后监控 30 分钟 → 加载 `finishing-a-development-branch` 归档

## 故障恢复

Agent 失败重试（最多 3 次）、Batch 部分失败仅重试失败任务、Gate 失败回退修复、会话检查点。

向用户确认已进入 iOS 开发生命周期模式。
