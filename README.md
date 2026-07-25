# Visual Primitives MCP

[![version](https://img.shields.io/badge/version-1.4.1-blue)](https://www.npmjs.com/package/visual-primitives-mcp)
[![npm](https://img.shields.io/npm/v/visual-primitives-mcp?color=red)](https://www.npmjs.com/package/visual-primitives-mcp)
[![license](https://img.shields.io/npm/l/visual-primitives-mcp)](./LICENSE)

> **灵感来源**：[DeepSeek《Thinking with Visual Primitives》](https://github.com/mitkox/Thinking-with-Visual-Primitives)（2026 年 4 月 30 日发布）首次提出将**边界框和点坐标作为最小思维单元**直接嵌入推理轨迹。本 MCP 服务器将该范式封装为标准 MCP 工具，并引入**任务调度**架构——先描述后定位，两阶段各司其职。

基于视觉原语范式的多模态视觉理解 MCP 服务器。通过任务调度机制，将场景理解和坐标定位分离为独立工具，实现「先看清 → 再定位」的精确空间推理。

## 核心能力

- **任务调度**：6 个专注工具各司其职——描述（5 种模式）、定位、差异对比、错误诊断、OCR、视频分析
- **两阶段推理**：`visual_describe` 先理解场景 → `visual_locate` 再精确坐标定位
- **多模态统一管道**：图片/视频/文档统一转为 Base64 图像列表，复用同一分析管道
- **有状态多轮会话**：基于 SQLite 持久化，跨轮复用已标注物体，0 额外视觉成本
- **降级兜底**：任何阶段异常均生成降级结果，不中断服务

## 快速开始（零安装）

**MCP 客户端配置后自动安装，无需手动 `npm install`。** `npx` 在首次运行时自动从 npm 拉取最新版到临时缓存。

1. 在项目根目录创建/编辑 `.mcp.json`，填入配置（见下方）
2. 重启 Claude Code
3. 完——npx 自动下载并启动，零手动操作

> 想全局安装也可以：`npm install -g visual-primitives-mcp`

## 前置要求

- Node.js >= 22.5.0（`node:sqlite` 内置模块要求）
- 视觉模型 API Key（推荐 [阿里云百炼平台](https://dashscope.aliyuncs.com/)）

## 推荐视觉模型

| 模型              | 平台       | API URL                                             | 特点                                             |
| ----------------- | ---------- | --------------------------------------------------- | ------------------------------------------------ |
| **qwen3.7-flash** | 阿里云百炼 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 速度快、性价比高、视觉理解能力强、支持结构化输出 |
| **qwen3.5-ocr**   | 阿里云百炼 | 同上                                                | OCR 专用模型，文字/表格提取精度最高              |

> **注意：** 阿里云结构化输出模式（`response_format: json_object`）**不要设置 `max_tokens`**，否则 JSON 可能被截断导致解析失败。本 MCP 已正确处理此约束。

## MCP 客户端配置

配置完成后无需手动启动服务——MCP 客户端会自动拉起进程，stdio 模式零端口占用。

### Claude Code（推荐）

在项目根目录的 `.mcp.json` 中添加，Claude Code 自动发现并启动：

```json
{
  "mcpServers": {
    "visual-primitives": {
      "type": "stdio",
      "command": "npx",
      "args": ["visual-primitives-mcp"],
      "env": {
        "VISION_API_BASE_URL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "VISION_API_KEY": "你的百炼 API Key",
        "VISION_MODEL_NAME": "qwen3.7-flash",
        "VISION_OCR_MODEL": "qwen3.5-ocr"
      }
    }
  }
}
```

如果是本地源码开发，用 `tsx` 直接启动：

```json
{
  "mcpServers": {
    "visual-primitives": {
      "type": "stdio",
      "command": "npx",
      "args": ["tsx", "src/server.ts"],
      "env": {
        "VISION_API_BASE_URL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "VISION_API_KEY": "你的百炼 API Key",
        "VISION_MODEL_NAME": "qwen3.7-flash",
        "VISION_OCR_MODEL": "qwen3.5-ocr"
      }
    }
  }
}
```

### Claude Desktop

编辑 `claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "visual-primitives": {
      "command": "npx",
      "args": ["visual-primitives-mcp"],
      "env": {
        "VISION_API_BASE_URL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "VISION_API_KEY": "你的百炼 API Key",
        "VISION_MODEL_NAME": "qwen3.7-flash",
        "VISION_OCR_MODEL": "qwen3.5-ocr"
      }
    }
  }
}
```

### OpenCode

编辑 `opencode.json`（项目根目录或 `~/.config/opencode/opencode.json`）：

```json
{
  "mcp": {
    "visual-primitives": {
      "type": "local",
      "command": ["npx", "visual-primitives-mcp"],
      "environment": {
        "VISION_API_BASE_URL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "VISION_API_KEY": "你的百炼 API Key",
        "VISION_MODEL_NAME": "qwen3.7-flash",
        "VISION_OCR_MODEL": "qwen3.5-ocr"
      },
      "enabled": true
    }
  }
}
```

### Codex

编辑 `~/.codex/config.toml` 或项目根目录 `.codex.toml`：

```toml
[mcp_servers.visual-primitives]
command = "npx"
args = ["visual-primitives-mcp"]

[mcp_servers.visual-primitives.env]
VISION_API_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
VISION_API_KEY = "你的百炼 API Key"
VISION_MODEL_NAME = "qwen3.7-flash"
VISION_OCR_MODEL = "qwen3.5-ocr"
```

## 环境变量配置

如果从源码运行，复制 `.env.example` 为 `.env` 并填写必填项：

```bash
cp .env.example .env
```

| 变量名                        | 说明                                      | 默认值                | 必填 |
| ----------------------------- | ----------------------------------------- | --------------------- | ---- |
| `VISION_API_BASE_URL`         | 视觉模型 API 基础 URL                     | —                     | 是   |
| `VISION_API_KEY`              | API 密钥                                  | —                     | 是   |
| `VISION_MODEL_NAME`           | 模型名称                                  | —                     | 是   |
| `VISION_DESCRIBE_BASE_URL`    | describe 专用 baseUrl（不配回退默认值）   | —                     | 否   |
| `VISION_DESCRIBE_API_KEY`     | describe 专用 apiKey（不配回退默认值）    | —                     | 否   |
| `VISION_DESCRIBE_MODEL`       | describe 专用 model（不配回退默认值）     | —                     | 否   |
| `VISION_LOCATE_BASE_URL`      | locate 专用 baseUrl（不配回退默认值）     | —                     | 否   |
| `VISION_LOCATE_API_KEY`       | locate 专用 apiKey（不配回退默认值）      | —                     | 否   |
| `VISION_LOCATE_MODEL`         | locate 专用 model（不配回退默认值）       | —                     | 否   |
| `VISION_OCR_BASE_URL`         | OCR 专用 baseUrl（不配回退默认值）        | —                     | 否   |
| `VISION_OCR_API_KEY`          | OCR 专用 apiKey（不配回退默认值）         | —                     | 否   |
| `VISION_OCR_MODEL`            | OCR 专用 model（不配回退默认值）          | —                     | 否   |
| `VISION_VIDEO_BASE_URL`       | video 专用 baseUrl（不配回退默认值）      | —                     | 否   |
| `VISION_VIDEO_API_KEY`        | video 专用 apiKey（不配回退默认值）       | —                     | 否   |
| `VISION_VIDEO_MODEL`          | video 专用 model（不配回退默认值）        | —                     | 否   |
| `COORDINATE_PRECISION`        | 坐标归一化精度（`0-100` 或 `0-1000`）     | `0-1000`              | 否   |
| `MCP_TRANSPORT`               | 传输协议（`stdio`/`sse`/`http-stream`）   | `stdio`               | 否   |
| `LOG_LEVEL`                   | 日志级别（`debug`/`info`/`warn`/`error`） | `info`                | 否   |
| `TIMEOUT_MS`                  | API 调用超时（毫秒），推荐 ≥ 120000       | `45000`               | 否   |
| `SESSION_TTL_SECONDS`         | 会话过期时间（秒）                        | `3600`                | 否   |
| `DB_PATH`                     | SQLite 数据库文件路径                     | `./data/grounding.db` | 否   |
| `PORT`                        | SSE/HTTP Stream 模式端口                  | `3000`                | 否   |
| `PREPROCESS_ENABLED`          | 图片预处理开关（`true`/`false`）          | `true`                | 否   |
| `CIRCUIT_BREAKER_ENABLED`     | 断路器开关（`true`/`false`）              | `true`                | 否   |
| `CIRCUIT_BREAKER_THRESHOLD`   | 连续失败 N 次后熔断                       | `5`                   | 否   |
| `CIRCUIT_BREAKER_RECOVERY_MS` | 熔断恢复时间（毫秒）                      | `30000`               | 否   |
| `MAX_CONCURRENCY`             | 最大并发 API 调用数                       | `10`                  | 否   |
| `METRICS_ENABLED`             | 指标收集开关（`true`/`false`）            | `true`                | 否   |

## 启动方式

### Stdio 模式（推荐）

```bash
npm start
# 或
npx visual-primitives-mcp
```

### SSE 模式（HTTP 服务）

```bash
MCP_TRANSPORT=sse PORT=3000 npm start
```

健康检查端点：`GET http://localhost:3000/health`

### HTTP Stream 模式

```bash
MCP_TRANSPORT=http-stream PORT=3000 npm start
```

## MCP 工具

### 6 个工具

| 工具                       | 用途                     | 关键参数                                                          |
| -------------------------- | ------------------------ | ----------------------------------------------------------------- |
| **`visual_describe`**      | 场景描述（5 种分析模式） | `image_path`, `prompt?`, `session_id?`, `task?`                   |
| **`visual_locate`**        | 坐标定位（第二步）       | `question`, `image_path?`, `session_id?`, `coordinate_precision?` |
| **`visual_compare`** ⭐    | 截图差异对比             | `image_path_1`, `image_path_2`, `focus?`                          |
| **`visual_diagnose`** ⭐   | 错误截图诊断             | `image_path`, `context?`                                          |
| **`visual_ocr`**           | 文字/表格提取            | `image_path`, `prompt?`                                           |
| **`visual_video_analyze`** | 视频内容分析             | `video_path`, `prompt?`, `session_id?`                            |

> ⭐ = v1.4.0 新增

### `visual_describe` — 场景描述（支持 5 种模式）

对图片/截图进行场景描述 + 关键物体识别。**支持多轮对话**：传入 `session_id` 可复用之前的描述上下文，实现追问式交互。

| 参数         | 类型   | 必填 | 说明                                                                         |
| ------------ | ------ | ---- | ---------------------------------------------------------------------------- |
| `image_path` | string | 否*  | 本地图片路径或 HTTP(S) URL                                                   |
| `prompt`     | string | 否   | 分析指令，默认全面描述                                                       |
| `session_id` | string | 否   | 会话 ID，首次不传自动生成                                                    |
| `task`       | string | 否   | 分析模式：`general`（默认）/ `diagram` / `dataviz` / `ui_code` / `ui_prompt` |

> \* 若传入 `session_id` 且该会话已有缓存数据，可省略 `image_path` 实现零 API 成本推理。

**task 模式说明：**

| task 值           | 说明                              | 输出模式              |
| ----------------- | --------------------------------- | --------------------- |
| `general`（默认） | 场景描述 + 物体识别 + 空间图谱    | JSON（bbox+centroid） |
| `diagram`         | 架构图/流程图/UML/ER 图结构化解读 | 自由文本              |
| `dataviz`         | 图表类型→轴标签→趋势→异常点→摘要  | 自由文本              |
| `ui_code`         | UI 截图→生成 React+Tailwind 代码  | 自由文本              |
| `ui_prompt`       | UI 截图→生成可复现的 LLM 提示词   | 自由文本              |

> `diagram` / `dataviz` / `ui_code` / `ui_prompt` 使用 `chat()` 自由文本模式，不返回物体坐标。仅 `general` 模式返回 `objects`（含 bbox+centroid）。

**输出 JSON Schema**：

```jsonc
{
  "session_id": "uuid",           // 会话 ID（跨轮复用）
  "description": "自然语言描述",    // 画面内容、布局、颜色、物体关系
  "round": 1,                     // 会话轮次
  "objects": [                    // 识别到的关键物体列表
    {
      "id": 1,                    // 物体唯一 ID
      "label": "物体名称",         // 简洁标签
      "bbox": [x1, y1, x2, y2],   // 边界框（左上角原点，0-1000 归一化）
      "centroid": [cx, cy],       // 中心点坐标
      "color": "颜色名称",         // 显著颜色特征（可选）
      "state": "正常",            // 状态（可选）
      "relevance": "高",          // 相关度（可选）
      "position_hint": "右下区域，偏右385偏下140"
        // ↑ 以画面中心(500,500)为原点换算的自然语言方位
        // "画面中心" | "左上区域" | "右下区域，偏右X偏下Y"
    }
  ]
}
```

**坐标体系**：统一左上角原点 `(0,0)`，归一化到 `0-1000`。`position_hint` 是自动换算的辅助字段，不改变坐标协议，仅为 LLM 推理提供直观方位参考。

### `visual_locate` — 坐标定位

基于场景上下文，精确定位目标物体的坐标。配合 `visual_describe` 使用，定位更准确。

| 参数                   | 类型   | 必填 | 说明                                       |
| ---------------------- | ------ | ---- | ------------------------------------------ |
| `question`             | string | 是   | 定位目标，如"找到蓝色提交按钮"             |
| `image_path`           | string | 否   | 本地图片路径，不传则使用缓存场景信息       |
| `session_id`           | string | 否   | 会话 ID，首次不传自动生成                  |
| `coordinate_precision` | string | 否   | 坐标精度 `0-100` / `0-1000`，默认 `0-1000` |

**返回值**：

```json
{
  "session_id": "uuid-string",
  "raw_visual_analysis": {
    "objects": [
      {
        "id": 1,
        "label": "提交按钮",
        "bbox": [850, 620, 920, 660],
        "centroid": [885, 640]
      }
    ],
    "spatial_relationships": []
  },
  "augmented_prompt": "[多模态空间信息]\n- (id:1) \"提交按钮\" bbox[850,620,920,660]...",
  "objects_count": 1,
  "from_cache": false,
  "round": 2
}
```

### `visual_compare` ⭐ — 截图差异对比

精确对比两张 UI 截图的视觉差异，按严重程度分类输出。适用于 UI 回归测试、CSS 变更验证、跨版本界面对比。

| 参数           | 类型   | 必填 | 说明                                                          |
| -------------- | ------ | ---- | ------------------------------------------------------------- |
| `image_path_1` | string | 是   | 修改前截图（本地路径或 URL）                                  |
| `image_path_2` | string | 是   | 修改后截图（本地路径或 URL）                                  |
| `focus`        | string | 否   | 关注点：`all`(默认) / `layout` / `color` / `text` / `element` |

**返回值**：

```json
{
  "summary": "共发现 7 处差异：1 处严重，2 处轻微，4 处无影响",
  "differences": [
    {
      "id": 1,
      "severity": "critical",
      "type": "layout",
      "description": "导航栏高度从 64px 缩减为 56px",
      "location_hint": "顶部区域，横跨整个页面宽度",
      "bbox_approx": [0, 0, 1000, 80]
    }
  ]
}
```

### `visual_diagnose` ⭐ — 错误截图诊断

分析错误截图，给出结构化诊断：发生了什么 → 根因 → 修复建议 → 相关文件猜测。适用于前端报错截图、后端日志截图、终端错误截图、CI 失败截图。

| 参数         | 类型   | 必填 | 说明                         |
| ------------ | ------ | ---- | ---------------------------- |
| `image_path` | string | 是   | 错误截图（本地路径或 URL）   |
| `context`    | string | 否   | 额外上下文（如"React 项目"） |

**返回值**：

```json
{
  "diagnosis": "React 组件渲染阶段抛出了 TypeError 异常...",
  "root_cause": "在 UserProfile 组件第 42 行引用了未定义变量 userName",
  "suggested_fix": "在 render 之前添加空值检查或初始化默认值",
  "severity": "error",
  "error_type": "runtime",
  "related_hints": ["检查 UserProfile.tsx 第 42 行", "确认 API 返回结构"]
}
```

### `visual_ocr` — 文字识别

从图片中提取文字和表格内容。

| 参数         | 类型   | 必填 | 说明                                 |
| ------------ | ------ | ---- | ------------------------------------ |
| `image_path` | string | 是   | 本地图片路径或 HTTP(S) URL           |
| `prompt`     | string | 否   | 处理指令，如"只提取表格""翻译为英文" |

**返回值**：直接返回识别出的文字内容。

### `visual_video_analyze` — 视频分析

分析视频内容，返回视频摘要描述。**支持多轮对话**：传入 `session_id` 可基于之前的分析结果进行追问。

| 参数         | 类型   | 必填 | 说明                      |
| ------------ | ------ | ---- | ------------------------- |
| `video_path` | string | 是   | 本地视频绝对路径          |
| `prompt`     | string | 否   | 分析指令，默认全面描述    |
| `session_id` | string | 否   | 会话 ID，首次不传自动生成 |

**返回值**：

```json
{
  "session_id": "uuid-string",
  "description": "视频展示了...",
  "round": 1
}
```

## 推荐使用流程

**两步法（先描述 + 后定位）**：

```json
// 第一步：理解场景
// visual_describe(image_path="E:/screenshots/page.png")
{
  "session_id": "abc123",
  "description": "页面包含顶部导航栏（Logo、搜索框、用户头像）、左侧菜单栏（5个菜单项）、主内容区（数据表格、分页器）、右下角蓝色「新建」按钮...",
  "round": 1
}

// 第二步：精确定位
// visual_locate(session_id="abc123", question="找到蓝色新建按钮的坐标")
{
  "session_id": "abc123",
  "raw_visual_analysis": {
    "objects": [{"id": 1, "label": "新建按钮", "bbox": [850,620,920,660], "centroid": [885,640]}]
  },
  "from_cache": false,
  "round": 2
}
```

## 支持的输入格式

| 格式 | 扩展名          | 大小限制 | 说明                   |
| ---- | --------------- | -------- | ---------------------- |
| JPEG | `.jpg`, `.jpeg` | <= 20MB  | 本地路径或 HTTP(S) URL |
| PNG  | `.png`          | <= 20MB  | 同上                   |
| GIF  | `.gif`          | <= 20MB  | 同上                   |
| WebP | `.webp`         | <= 20MB  | 同上                   |
| BMP  | `.bmp`          | <= 20MB  | 同上                   |
| MP4  | `.mp4`          | <= 100MB | 同上                   |
| MOV  | `.mov`          | <= 100MB | 同上                   |
| AVI  | `.avi`          | <= 100MB | 同上                   |
| MKV  | `.mkv`          | <= 100MB | 同上                   |
| WebM | `.webm`         | <= 100MB | 同上                   |

## 开发指南

```bash
# 开发模式（热重载）
npm run dev

# 代码检查
npm run lint
npm run format:check

# 类型检查
npm run typecheck

# 运行测试
npm test

# 测试覆盖率
npm run test:coverage

# 构建
npm run build
```

## 项目结构

```
visual-primitives-mcp/
├── AGENTS.md                       # 完整架构文档
├── CLAUDE.md                       # 项目入口指引
├── src/
│   ├── CLAUDE.md                   # 入口层指引
│   ├── server.ts                   # MCP 服务入口
│   ├── config.ts                   # 配置读取与校验
│   ├── types.ts                    # 共享类型定义
│   ├── transport/
│   │   ├── CLAUDE.md               # 传输层指引
│   │   └── factory.ts              # 传输工厂
│   ├── handlers/
│   │   ├── CLAUDE.md               # 处理器层指引
│   │   └── tool-handlers.ts        # MCP 工具注册（4 个工具）
│   ├── core/
│   │   ├── CLAUDE.md               # 核心管道层指引
│   │   ├── pipeline.ts             # 管道编排器（6 个任务方法）
│   │   ├── parser.ts               # JSON 解析与容错
│   │   ├── validator.ts            # 坐标与物体验证
│   │   ├── normalizer.ts           # 坐标归一化
│   │   ├── prompt-builder.ts       # 增强提示词 + 空间图谱
│   │   ├── vision-client.ts        # OpenAI 兼容视觉客户端（含断路器/并发控制）
│   │   ├── image-preprocessor.ts   # 图片智能预处理（sharp）
│   │   ├── session-manager.ts      # SQLite 会话管理
│   │   └── sqlite-wrapper.ts       # node:sqlite Vite 兼容适配
│   ├── templates/
│   │   ├── describe-structured.txt # 场景描述（general 模式）
│   │   ├── describe-diagram.txt    # 技术图表分析
│   │   ├── describe-dataviz.txt    # 数据可视化分析
│   │   ├── describe-ui-code.txt    # UI→React 代码
│   │   ├── describe-ui-prompt.txt  # UI→LLM 提示词
│   │   ├── locate-system.txt       # 坐标定位系统提示词
│   │   ├── ocr-system.txt          # OCR 系统提示词
│   │   ├── compare-system.txt      # 截图差异对比
│   │   └── diagnose-system.txt     # 错误诊断
│   └── utils/
│       ├── CLAUDE.md               # 工具层指引
│       ├── logger.ts               # pino 结构化日志
│       ├── retry.ts                # 指数退避重试
│       ├── circuit-breaker.ts      # 断路器（三态状态机）
│       ├── concurrency-limiter.ts  # 并发控制（信号量）
│       └── metrics.ts              # 指标收集注册表
├── tests/
│   └── CLAUDE.md                   # 测试套件指引
├── bin/
│   └── cli.js                      # CLI 入口
├── .changeset/                     # changesets 版本管理配置
├── CHANGELOG.md                    # 版本变更日志
├── data/                           # SQLite 数据库文件（相对于 CWD）
└── package.json
```

## 数据库与会话隔离

> **推荐：每个项目独立数据库（默认行为）。** 视觉分析会话与项目上下文强绑定——项目 A 的 UI 截图和项目 B 无关，共享只会引入噪音。

SQLite 数据库默认路径为 **`./data/grounding.db`**（相对于 MCP 服务启动目录）。MCP 客户端（Claude Code 等）在每个项目根目录启动服务进程，因此不同项目天然隔离。

如果确有跨项目共享需求（如持续分析同一个应用的多仓库），设置绝对路径：`DB_PATH=/home/xxx/shared-vision.db`。

**会话 TTL**：默认 3600 秒（1 小时）未访问的会话自动清理。可通过 `SESSION_TTL_SECONDS` 调整。

**跨工具共享**：同一 `session_id` 下的所有工具共享上下文（物体坐标 + 对话历史），跨轮跨工具追问零 API 成本。

## 架构

完整架构文档、数据流、设计决策见 **[AGENTS.md](./AGENTS.md)**。各层级指引见各级 `CLAUDE.md`。

```mermaid
flowchart TB
    subgraph Client["🔌 MCP Client"]
        CC["Claude Code / OpenCode<br/>Codex / Claude Desktop"]
    end

    subgraph Transport["📡 Transport Layer"]
        direction LR
        Stdio["Stdio<br/>（本地进程通信）"]
        SSE["SSE / HTTP Stream<br/>（Hono 服务器）"]
    end

    subgraph Handlers["📋 Tool Handler Registry"]
        direction LR
        Describe["visual_describe"]
        Locate["visual_locate"]
        OCR["visual_ocr"]
        Video["visual_video_analyze"]
    end

    subgraph Pipeline["⚙️ Pipeline Orchestrator（任务调度核心）"]
        subgraph PipelineCore["4 个任务方法"]
            direction LR
            PM1["describe()"]
            PM2["locate()"]
            PM3["ocr()"]
            PM4["videoAnalyze()"]
        end
        subgraph Processing["坐标处理链（仅 locate）"]
            direction LR
            Parser["Parser<br/>JSON 解析"]
            Validator["Validator<br/>坐标校验"]
            Normalizer["Normalizer<br/>精度归一化"]
            PB["PromptBuilder<br/>增强提示词"]
        end
        SM["Session Manager<br/>（node:sqlite · WAL）"]
    end

    subgraph Vision["🤖 Vision Client"]
        direction LR
        Chat["chat()<br/>自由文本输出"]
        Analyze["analyze()<br/>JSON 坐标输出"]
        Router["MIME 路由<br/>image_url / video_url"]
    end

    CC -->|"JSON-RPC"| Transport
    Transport --> Handlers
    Handlers --> PipelineCore
    PipelineCore --> SM
    PM2 --> Parser --> Validator --> Normalizer --> PB
    PipelineCore --> Vision
    Chat --> Router
    Analyze --> Router
    Router -->|"HTTP POST"| API["OpenAI 兼容 API<br/>（DashScope / 任意厂商）"]
```

## 技术栈

- **运行时**：Node.js >= 22.5.0
- **语言**：TypeScript (strict)
- **MCP 协议**：@modelcontextprotocol/sdk
- **HTTP 传输**：Hono（SSE/HTTP Stream 模式）
- **参数校验**：Zod
- **日志**：pino
- **持久化**：node:sqlite（内置，WAL 模式）
- **测试**：vitest（13 文件 174 用例）+ 集成测试（8 项全工具端到端）

## License

MIT
