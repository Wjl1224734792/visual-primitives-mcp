---
name: browser-testing
description: '浏览器自动化测试方法论——测试用例编写规范、agent-browser 操作流程、报告模板、修复闭环。用于 /browser-test 和 /bug-fix 命令的执行。依赖 agent-browser CLI 工具。'
---

# 浏览器自动化测试

## 概述

基于 `agent-browser` CLI 的交互测试方法。先编写结构化测试用例，再逐条通过 Bash 执行 agent-browser 命令操作浏览器，截图记录结果，失败驱动修复闭环。

**前置条件：** `agent-browser` 已安装（`npm i -g agent-browser && agent-browser install`）。

**版本更新时：** 首先运行 `agent-browser skills get core` 获取最新工作流内容，它会覆盖本文内容。

## 测试用例格式

每条用例输出到 `docs/testing/YYYY-MM-DD-<topic>-browser-test-cases.md`：

```markdown
### TC-001: <用例名称>

- **前置条件**：<URL、登录状态、数据准备>
- **操作步骤**：
  1. 导航到 <页面>
  2. 点击/输入 <元素>
  3. 验证 <结果>
- **预期结果**：<具体可验证的结果>
- **验证方式**：截图 / 状态检查 / 元素文本匹配
- **优先级**：P0（阻塞）/ P1（重要）/ P2（次要）
```

## 执行流程

按优先级从高到低逐条执行。

### 初始化：打开浏览器

```bash
agent-browser open <url>          # 默认无头，加 --headed 可见
agent-browser profile list        # 若需复用 Chrome 登录态，先查 profile
agent-browser --profile "Default" open <url>  # 使用现有 Chrome 登录态
```

### 每条用例的标准操作序列

```bash
# 1. 导航
agent-browser open "<URL>"

# 2. 获取页面快照（获取元素 @ref）
agent-browser snapshot -i

# 3. 交互操作
agent-browser click @e1                          # 点击元素
agent-browser fill @e2 "text"                    # 填写输入框
agent-browser type @e3 "text"                    # 追加输入
agent-browser press "Enter"                      # 按键
agent-browser select @e4 "option"                # 下拉选择
agent-browser hover @e5                          # 悬停
agent-browser scroll down 300                    # 滚动

# 4. 截图留证（关键交互后必须）
agent-browser screenshot [path.png]
agent-browser screenshot --full                  # 全页截图
agent-browser screenshot --annotate              # 带标注截图

# 5. 验证
agent-browser snapshot -i                        # 确认预期元素出现/消失
agent-browser get text @e1                       # 确认文本内容
agent-browser console                            # 检查控制台日志
agent-browser errors                             # 检查 JS 异常
agent-browser network requests --filter api      # 检查 API 请求
agent-browser get url                            # 确认当前 URL
```

**执行规则：**

- 先加载: `agent-browser skills get core` 获取最新命令文档
- 每次关键交互后截图（点击按钮、提交表单、页面跳转后）
- 截图使用 `agent-browser screenshot [path]`；异常区域检查 `agent-browser get text` 和 `agent-browser get html`
- 失败立即记录，截图保存失败状态
- 前置条件不满足则标记"跳过"，写明原因
- 页面异常时 `agent-browser close` 清理后重试
- 不用硬等待；用 `agent-browser wait "<selector>"` 或 `agent-browser --text "text"` 轮询确认元素就绪

## Bug 复现模式

接到 Bug 报告后：

1. 读取复现步骤
2. `agent-browser open <url>` → `agent-browser snapshot -i` → 逐步执行操作
3. 异常发生时立即截图：`agent-browser screenshot bug-xxx.png` + `agent-browser screenshot --annotate`
4. 收集证据：
   - `agent-browser console` — JS 错误
   - `agent-browser errors` — 未捕获异常
   - `agent-browser network requests` — 失败的网络请求
   - `agent-browser get text @eN` — 页面异常文本
5. 尝试至少 1 个变体确认触发边界
6. 输出复现证据：截图路径、操作步骤、实际 vs 预期

## 响应式/多视口测试

对于需要验证响应式的页面：

```bash
agent-browser set viewport 375 812   # 移动端
agent-browser screenshot mobile.png
agent-browser set viewport 768 1024  # 平板
agent-browser screenshot tablet.png
agent-browser set viewport 1280 800  # 桌面
agent-browser screenshot desktop.png
```

## 本地开发环境测试

### 工具可用性矩阵

| 平台/环境               | Preview MCP | agent-browser CLI | Playwright MCP |
| ----------------------- | ----------- | ----------------- | -------------- |
| Claude Code（桌面版）   | ✅ 可用     | ✅ 可用           | ✅ 可用        |
| Claude Code（终端/CLI） | ❌ 不可用   | ✅ 可用           | ✅ 可用        |
| OpenCode                | ❌ 不可用   | ✅ 可用           | ✅ 可用        |
| Codex                   | ❌ 不可用   | ✅ 可用           | ✅ 可用        |

> **重要**：`mcp__Claude_Preview__*` 工具仅在 Claude Code 桌面应用中可用。在 Claude Code 终端/CLI 环境中，必须使用 agent-browser CLI 工具进行浏览器操作和截图验证。

### 方案 A：有 Preview MCP 时（Claude Code 桌面版）

1. `mcp__Claude_Preview__preview_list` — 检查是否已有运行中的预览服务器
2. 若未运行且 `.claude/launch.json` 已配置：
   ```
   mcp__Claude_Preview__preview_start({name: "<config-name>"})
   ```
3. 获取本地 URL 后使用 `agent-browser open <url>` 或 `preview_screenshot` 进行测试
4. 测试完成后可保留服务器供后续使用

### 方案 B：无 Preview MCP 时（Claude Code 终端 / OpenCode / Codex）

1. 通过 Bash 启动 dev server（后台运行）：
   ```bash
   npm run dev &
   ```
2. 用 agent-browser 打开页面：
   ```bash
   agent-browser open http://localhost:<port>
   ```
3. 页面快照 + 截图验证：
   ```bash
   agent-browser snapshot -i
   agent-browser screenshot
   ```
4. 响应式多视口测试：
   ```bash
   agent-browser set viewport 375 812   # 移动端
   agent-browser screenshot mobile.png
   agent-browser set viewport 768 1024  # 平板
   agent-browser screenshot tablet.png
   agent-browser set viewport 1280 800  # 桌面
   agent-browser screenshot desktop.png
   ```

## 报告模板

`docs/testing/YYYY-MM-DD-<topic>-browser-test-report.md`：

```markdown
# 浏览器自动化测试报告

## 测试概览

| 总用例 | 通过 | 失败 | 跳过 | 通过率 |
| ------ | ---- | ---- | ---- | ------ |
| N      | N    | N    | N    | XX%    |

## 环境信息

- 测试 URL：<URL>
- 测试时间：<timestamp>
- 浏览器视口：<尺寸>

## 详情

### TC-001: <名称> — ✅ 通过

- 截图：<路径>

### TC-002: <名称> — ❌ 失败

- 预期：<结果> / 实际：<结果>
- 截图：<路径>
- 控制台错误：<错误信息>
- 网络异常：<失败请求>
- 疑似原因：<分析>

## 失败汇总

| 用例 | 严重度 | 故障类型 | 疑似根因 |
| ---- | ------ | -------- | -------- |
```

## 修复闭环

1. 全部通过 → ✅ 闭环完成
2. 存在失败 → Browser Test Findings → `/review-fix` 修复 → 仅重跑失败用例 → 更新报告
3. 最多 2 轮，第 3 轮仍失败标记 BLOCKED

## 红线

- 不写用例直接操作浏览器（缺少可追溯的测试计划）
- 失败不截图、不记录控制台/网络错误（缺少证据）
- 跳过用例不标注原因
- 伪造测试结果
- 执行破坏性操作（删除数据、发起支付等）
- 用硬等待（sleep/wait）替代 `agent-browser wait` 轮询确认页面状态
