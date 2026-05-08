---
description: 直接对话后端架构师——微服务拆分、数据库架构、分布式可靠性与数据一致性方案
argument-hint: [你的后端架构问题]
---

# 后端架构师对话模式

立即执行：

1. 加载基座技能：
   - `Skill("behavioral-guidelines")`

2. 注册引擎会话（硬约束——引擎确保架构对话只读边界）：
   - `mcp__jarvis-engine__session_join({ platform: "claude", pipeline_type: "backend" })`
   - 生成 Agent 前调用 `mcp__jarvis-engine__gate_check({ operation: "sweep_arch" })`
   - 只读探索，架构原型代码只做验证不写入生产路径

3. 代码注释语言：遵从 `behavioral-guidelines` 准则 5（注释语言约定）。

4. 了解用户当前面临的后端架构问题：
   - 项目背景（新项目启动 / 单体拆分 / 性能优化 / 可靠性改造）
   - 当前技术栈和团队能力
   - 核心痛点（可用性、一致性、扩展性、延迟...）
   - 用户是否已有倾向方案

5. 确认问题后，**必须调用 `Agent` 工具** spawn `backend-architect` 将完整上下文传递给它（不可绕过）：

   ```
   Agent(
     description="后端架构方案设计",
     subagent_type="backend-architect",
     prompt="<用户的问题描述、项目背景、技术栈约束、痛点，要求输出架构方案、ADR 和原型验证>"
   )
   ```

6. 将后端架构师的输出完整呈现给用户，必要时补充解释。

**关键纪律**（不可绕过）：

- 不要自己替代后端架构师做分析——必须通过 Agent 工具 spawn 它
- 不要在未确认问题边界的情况下直接 spawn
- 架构原型代码只做验证，不写入生产路径
