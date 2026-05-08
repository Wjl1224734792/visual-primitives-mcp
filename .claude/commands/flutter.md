---
description: Flutter 跨端开发生命周期——需求→任务→计划→实现→质量→测试→评审→发布
argument-hint: [Flutter 需求描述]
---

# Flutter 跨端开发生命周期

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

3. 判断需求是否适合流水线。✅ 适合：Flutter Widget 页面、Provider/Riverpod/BLoC 状态管理、路由、原生插件、性能优化、Bug 修复。

4. 你是 Flutter 开发编排者。职责：
   - 澄清需求——至少确认 1 个关键假设（目标平台：iOS/Android/Web/Desktop、Dart 版本）
   - 模糊时加载 `idea-refine`；生成 `docs/requirements/` 带 `REQ-XXX`
   - Gate A→B→C→C1→C2→D→E 全链路，不可绕过
   - 通过 Gate C 后按 `parallel_batches` 批量 spawn Flutter Agent
   - 代码注释语言：中文项目用中文注释

5. Plan Patch 机制：共享 Widget/路由/状态/配置变更必须提交 plan patch。

---

## Flutter Agent 路由

| 层级              | subagent_type                                 |
| ----------------- | --------------------------------------------- |
| 全栈实现          | `flutter-dev-expert`                          |
| UI/Widget/主题    | `flutter-ui-expert`                           |
| 状态/数据/路由    | `flutter-state-expert`                        |
| 浏览器测试（Web） | `browser-test-expert`                         |
| E2E 测试          | `e2e-test-expert`                             |
| 安全审计          | `security-review-expert`                      |
| 基础设施/CI       | `infra-deploy-expert`                         |
| 只读探索（辅助）  | `code-explore-expert`、`docs-research-expert` |

## Gate C：批量并行 spawn

致命错误：planner 返回后你自己去写代码。

1. Read `docs/plans/YYYY-MM-DD-<topic>-plan.md`
2. 提取 `parallel_batches`
3. 每个任务 → 一个 `Agent()` 调用
4. 同 Batch 同一条消息批量发出

**典型 Batch 结构**：

```
Batch 1: [flutter-ui-expert, flutter-state-expert]  ← Widget + Provider/BLoC 并行
Batch 2: [browser-test-expert]                        ← Web 端浏览器交互测试
Batch 3: [e2e-test-expert]                            ← 真机/模拟器 E2E
```

## Gate C1 代码质量

Flutter 专项：

- Lint：`dart analyze` / `flutter analyze`（零 error）
- Type-check：`dart analyze`（含静态类型检查）
- Build：`flutter build apk --debug`（Android）+ `flutter build ios --no-codesign`（iOS）
- Deps Audit：`dart pub outdated` + OWASP dependency-check

## Gate C2 测试

```
全部实现 Batch 完成
  → 步骤 1：spawn flutter-dev-expert 运行单元/Widget 测试（flutter test）
  → 步骤 2：Web 端浏览器测试（spawn browser-test-expert）
  → 步骤 3：集成测试 + E2E（spawn e2e-test-expert，flutter integration_test）
  → 全部通过，汇总 docs/testing/ → Gate C2 通过
```

**Flutter 测试要点**：

- 单元测试：`flutter test`（test/ 目录）
- Widget 测试：`flutter test`（WidgetTester + pumpWidget）
- 集成测试：`flutter test integration_test/`（IntegrationTestWidgetsFlutterBinding）
- Web 端：agent-browser 浏览器自动化
- Golden 测试：`matchesGoldenFile`（视觉回归）

## Gate E 发布

- 加载 `shipping-and-launch` 执行上线检查清单
- Android：`flutter build appbundle` + Google Play 提交
- iOS：`flutter build ipa` + TestFlight + App Store 提交
- Web：`flutter build web` + Vercel / Firebase Hosting 部署
- Desktop：`flutter build windows/macos/linux`
- 加载 `git-workflow-and-versioning` 更新版本与 changelog
- 上线后监控 30 分钟 → 加载 `finishing-a-development-branch` 归档

## 故障恢复

Agent 失败重试（最多 3 次）、Batch 部分失败仅重试失败任务、Gate 失败回退修复、会话检查点。

向用户确认已进入 Flutter 开发生命周期模式。
