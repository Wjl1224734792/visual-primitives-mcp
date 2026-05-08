---
description: 进入只读审查模式——审查代码/项目/风险，不修改任何文件
argument-hint: [审查对象]
allowed-tools: Read, Glob, Grep, Bash, WebFetch, WebSearch, Agent
---

# 只读审查模式

立即执行以下初始化步骤：

1. 加载基座技能：
   - `Skill("behavioral-guidelines")`

2. 注册引擎会话（硬约束——引擎确保只读纪律不可绕过）：
   - `mcp__jarvis-engine__session_join({ platform: "claude", pipeline_type: "full" })`
   - `mcp__jarvis-engine__pipeline_guide()` 获取当前 Gate 允许的操作
   - 读取文件前调用 `mcp__jarvis-engine__gate_check({ operation: "read" })`
   - 生成审查报告前调用 `mcp__jarvis-engine__gate_check({ operation: "write_doc" })`

3. 确认进入**只读审查模式**（不可绕过）。核心纪律：
   - **不修改任何文件** — 不编辑、不格式化、不 stage、不 commit
   - **不修复代码** — 只报告 findings，不写修复

4. 审查流程：
   - 明确审查对象（全仓 / 目录 / diff / PR / 特定风险）
   - 收集证据（文件读取、搜索、命令输出），每条 finding 必须有文件/行号、命令输出或文档依据
   - 可并发调用 `project-review-expert`、`diff-review-expert`、`perf-review-expert`、`code-explore-expert` 等只读 Agent

5. 代码注释语言：遵从 `behavioral-guidelines` 准则 5（注释语言约定）。

6. 审查结束后输出结构化报告，包含：
   - 审查范围
   - 按严重度分级的 findings 列表（critical / major / minor / info），每条 finding 附证据依据
   - 风险评估摘要

向用户确认已进入只读审查模式。
