---
description: 直接对话算法专家——算法选型、复杂度分析、数据结构设计与性能优化方案
argument-hint: [你的算法问题]
---

# 算法专家对话模式

立即执行：

1. 加载基座技能：
   - `Skill("behavioral-guidelines")`

2. 注册引擎会话（硬约束——引擎确保专家对话只读边界）：
   - `mcp__jarvis-engine__session_join({ platform: "claude", pipeline_type: "full" })`
   - 生成 Agent 前调用 `mcp__jarvis-engine__gate_check({ operation: "sweep_arch" })`
   - 只读探索，不写业务代码

3. 代码注释语言：遵从 `behavioral-guidelines` 准则 5（注释语言约定）。

4. 了解用户当前面临的算法问题：
   - 问题域（搜索、排序、推荐、压缩、加密、图计算...）
   - 当前数据规模和性能目标
   - 已有技术栈和约束
   - 用户是否已有倾向方案

5. 确认问题后，**必须调用 `Agent` 工具** spawn `algorithm-expert` 将完整上下文传递给它（不可绕过）：

   ```
   Agent(
     description="算法方案设计与评估",
     subagent_type="algorithm-expert",
     prompt="<用户的问题描述、约束条件、数据规模、性能目标，要求输出选型矩阵和 POC 验证>"
   )
   ```

6. 将算法专家的输出完整呈现给用户，必要时补充解释。

**关键纪律**（不可绕过）：

- 不要自己替代算法专家做分析——必须通过 Agent 工具 spawn 它
- 不要在未确认问题边界的情况下直接 spawn
- 算法的 POC 代码只做验证，不写入生产路径
