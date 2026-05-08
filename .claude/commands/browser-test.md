---
description: 浏览器自动化测试闭环——先写用例，再操作浏览器执行，记录结果，失败则驱动修复重测
argument-hint: [测试范围—URL、功能描述或页面路径]
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Skill, Agent
---

# 浏览器自动化测试闭环

> 主动测试模式（编写用例 → 执行 → 修复）。若需修复已知 Bug 并用浏览器复现，请使用 `/bug-fix`。
> **Claude Desktop 优先用 preview\_\* MCP，终端用 agent-browser CLI。禁止使用 Claude in Chrome 扩展。**

立即执行以下步骤：

## 步骤 0：加载技能 + 注册引擎

加载 `behavioral-guidelines` `agent-browser` `browser-testing` 三个技能。

**引擎会话注册**（硬约束——引擎确保测试操作不越权）：

- `mcp__jarvis-engine__session_join({ platform: "claude", pipeline_type: "full" })`
- 生成测试 Agent 前调用 `mcp__jarvis-engine__gate_check({ operation: "spawn_test" })`
- 测试完成后 `mcp__jarvis-engine__gate_enforce` 验证结果，`mcp__jarvis-engine__advance_gate` 推进状态机

## 步骤 0.5：判断测试工具

### Claude Desktop（有 preview\_\* MCP 原生工具）

preview*\* 是 Claude Desktop 内置 MCP，**无需浏览器扩展**。全部操作走 preview*\*：

- `preview_start` → 启动开发服务器
- `preview_snapshot` → 获取页面元素引用（含 UID）
- `preview_click` / `preview_fill` → 交互操作
- `preview_screenshot` → 截图留证
- `preview_console_logs` → 检查 JS 错误
- `preview_network` → 检查 API 请求状态
- `preview_resize` → 响应式视口切换
- `preview_inspect` → 验证 CSS 样式属性
- `preview_eval` → JS 调试/页面状态查询
- `preview_logs` → 服务器日志
- `preview_stop` → 清理停止

**agent-browser CLI 仅用于需要 Chrome 登录态（`--profile "Default"`）的场景。**

### 终端（无 preview\_\* MCP）

纯 agent-browser CLI 操作浏览器。先加载文档：

```bash
agent-browser skills get core
```

## 步骤 1：确认测试范围

若用户未提供，先询问并确认：

- **目标 URL**：测试页面地址
- **功能范围**：要验证的具体功能
- **关键用户路径**：核心操作流程
- **已知风险点**：最近修改或历史上出 Bug 的区域

## 步骤 2：编写测试用例清单

输出到 `docs/testing/YYYY-MM-DD-<topic>-browser-test-cases.md`。
每条用例包含：编号（TC-001 起）、前置条件、操作步骤、预期结果、验证方式、优先级（P0 阻塞 / P1 重要 / P2 次要）

## 步骤 3：逐条执行测试（不可绕过）

### Claude Desktop 执行序列（preview\_\*）

```
1. preview_start({ name: "<server>" })                       # 启动开发服务器
2. preview_resize({ preset: "mobile|tablet|desktop" })       # 设置视口
3. preview_snapshot                                          # 获取元素 UID
4. preview_click({ selector: "button.submit" })              # 点击
   或 preview_fill({ selector: "#input", value: "text" })    # 填写
5. preview_screenshot                                        # 截图留证
6. preview_console_logs({ level: "error" })                  # 检查 JS 异常
7. preview_network({ filter: "failed" })                     # 检查 API 失败
8. preview_inspect({ selector: ".btn", styles:["color"] })   # 验证样式
```

### 终端执行序列（agent-browser CLI）

```bash
1. agent-browser open "<URL>"                                # 导航
2. agent-browser snapshot -i                                 # 获取 @e1, @e2 元素引用
3. agent-browser click @eN                                   # 点击
   或 agent-browser fill @eN "text"                           # 填写
   或 agent-browser press "Enter"                             # 按键
4. agent-browser screenshot tc-NNN-step.png                   # 截图留证
5. agent-browser console / agent-browser errors               # 检查异常
6. agent-browser network requests --filter api                # 检查 API
```

### 执行规则

- 每条用例关键交互后截图
- 失败立即记录：截图 + 控制台日志 + 网络错误
- 前置条件不满足则标记"跳过"，写明原因
- 不用硬等待；预览模式用 `preview_eval` 轮询，终端用 `agent-browser wait`
- Claude Desktop 测试结束执行 `preview_stop` 清理

### 响应式验证（必须覆盖三种视口）

**Claude Desktop：**

```
preview_resize({ preset: "mobile" })   → preview_screenshot
preview_resize({ preset: "tablet" })   → preview_screenshot
preview_resize({ preset: "desktop" })  → preview_screenshot
```

**终端：**

```bash
agent-browser set viewport 375 812   && agent-browser screenshot mobile.png
agent-browser set viewport 768 1024  && agent-browser screenshot tablet.png
agent-browser set viewport 1280 800  && agent-browser screenshot desktop.png
```

## 步骤 4：汇总测试报告

输出到 `docs/testing/YYYY-MM-DD-<topic>-browser-test-report.md`，包含：测试概览（通过/失败/跳过/通过率）、每条用例详细结果（含截图路径）、失败用例根因分析、控制台/网络错误日志

## 步骤 5：闭环——失败驱动修复（不可绕过）

### 全部通过 → 闭环完成，输出最终报告。

### 存在失败 → 启动修复闭环：

1. 输出 **Browser Test Findings**（失败用例 + 截图证据 + 控制台/网络错误 + 修复建议）
2. 触发修复：提交给 `/review-fix` 闭环或调用对应实现 agent
3. 代码质量验证：修复后必须先通过 Lint + Type-check + Build（三项全部通过才能继续）
4. 重测验证：仅重跑失败用例，更新报告
5. 全部通过后 → 闭环完成

```
测试 ──全部通过──→ ✅ 闭环完成
  │
  └──存在失败──→ Browser Test Findings → /review-fix → 重测失败用例
                                                         │
                                                    通过→ ✅ 闭环完成
                                                    仍失败→ 再次修复（最多 2 轮）
```

**最多 2 轮修复-重测循环**，第 3 轮仍失败则标记为 BLOCKED 并上报。

## 红线

- **禁止使用 Claude in Chrome 扩展**（`mcp__Claude_in_Chrome__*`），Claude Desktop 原生 `preview_*` 即用 preview\_\*
- 不写用例直接操作浏览器（缺少可追溯的测试计划）
- 测试失败不截图（缺少证据）
- 跳过修复闭环（失败用例不驱动修复，测试失去意义）
- 在浏览器中执行破坏性操作（删除数据、发起支付等）
- 用硬等待（sleep/wait）替代轮询确认页面状态
