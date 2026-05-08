# Visual Primitives MCP

基于 DeepSeek《Thinking with Visual Primitives》论文的多模态空间锚定 MCP 服务器。将视觉模型的精确坐标推理能力封装为标准 MCP 工具，使任何纯文本模型都能通过调用它获得精确的空间推理能力。

## 核心能力

- **坐标锚点注入推理**：模型自动输出 `[x1,y1,x2,y2]` 边界框和 `[cx,cy]` 中心点，嵌入思维链
- **多模态统一管道**：图片/视频/文档统一转为 Base64 图像列表，复用同一分析管道
- **有状态多轮会话**：基于 SQLite 持久化，跨轮复用已标注物体，0 额外视觉成本
- **降级兜底**：任何阶段异常均生成降级提示词，不中断服务

## 前置要求

- Node.js >= 22.5.0（`node:sqlite` 内置模块要求）
- 可选：FFmpeg（视频处理需要，`ffmpeg-static` 会自动下载二进制）
- 视觉模型 API Key（推荐 [阿里云百炼平台](https://dashscope.aliyun.com/)）

## 推荐视觉模型

| 模型                     | 平台       | API URL                                             | 特点                                     |
| ------------------------ | ---------- | --------------------------------------------------- | ---------------------------------------- |
| **qwen3.5-plus**         | 阿里云百炼 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 视觉能力强、性价比高、与 OpenAI 接口兼容 |
| deepseek-v4-flash-vision | DeepSeek   | `https://api.deepseek.com/v1`                       | 原生视觉原语能力                         |
| gpt-4o                   | OpenAI     | `https://api.openai.com/v1`                         | 通用视觉推理                             |
| glm-4.6                  | 智谱       | `https://open.bigmodel.cn/api/paas/v4`              | 国产多模态模型                           |

## 安装

```bash
npm install -g visual-primitives-mcp
```

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
        "VISION_MODEL_NAME": "qwen3.5-plus"
      }
    }
  }
}
```

如果是本地源码开发，用 `node` 直接启动：

```json
{
  "mcpServers": {
    "visual-primitives": {
      "type": "stdio",
      "command": "node",
      "args": ["dist/server.js"],
      "env": {
        "VISION_API_BASE_URL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "VISION_API_KEY": "你的百炼 API Key",
        "VISION_MODEL_NAME": "qwen3.5-plus"
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
        "VISION_MODEL_NAME": "qwen3.5-plus"
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
        "VISION_MODEL_NAME": "qwen3.5-plus"
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
VISION_MODEL_NAME = "qwen3.5-plus"
```

## 环境变量配置

如果从源码运行，复制 `.env.example` 为 `.env` 并填写必填项：

```bash
cp .env.example .env
```

| 变量名                 | 说明                                      | 默认值                | 必填 |
| ---------------------- | ----------------------------------------- | --------------------- | ---- |
| `VISION_API_BASE_URL`  | 视觉模型 API 基础 URL                     | —                     | 是   |
| `VISION_API_KEY`       | API 密钥                                  | —                     | 是   |
| `VISION_MODEL_NAME`    | 模型名称                                  | —                     | 是   |
| `COORDINATE_PRECISION` | 坐标归一化精度（`0-100` 或 `0-1000`）     | `0-1000`              | 否   |
| `MCP_TRANSPORT`        | 传输协议（`stdio`/`sse`/`http-stream`）   | `stdio`               | 否   |
| `LOG_LEVEL`            | 日志级别（`debug`/`info`/`warn`/`error`） | `info`                | 否   |
| `TIMEOUT_MS`           | API 调用超时（毫秒）                      | `45000`               | 否   |
| `SESSION_TTL_SECONDS`  | 会话过期时间（秒）                        | `3600`                | 否   |
| `DB_PATH`              | SQLite 数据库文件路径                     | `./data/grounding.db` | 否   |
| `MAX_VIDEO_FRAMES`     | 视频抽帧最大数量                          | `10`                  | 否   |
| `MAX_DOC_PAGES`        | 文档渲染最大页数                          | `20`                  | 否   |
| `PORT`                 | SSE/HTTP Stream 模式端口                  | `3000`                | 否   |

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

### `multimodal_grounding_augment`

分析图像/视频/文档等多模态内容，生成带精确坐标锚点的增强提示词，供文本模型进行空间推理。

| 参数                   | 类型                   | 必填 | 说明                                        |
| ---------------------- | ---------------------- | ---- | ------------------------------------------- |
| `session_id`           | string                 | 否   | 会话 ID，多轮复用。首次不传自动生成         |
| `media_base64`         | string                 | 否   | 媒体内容 Base64。首次调用或需要新文件时提供 |
| `media_type`           | string                 | 否   | 媒体类型。传入 media_base64 时必填          |
| `question`             | string                 | 是   | 对媒体内容提出的自然语言问题                |
| `merge_strategy`       | `replace` \| `augment` | 否   | 合并策略，默认 `augment`                    |
| `coordinate_precision` | `0-100` \| `0-1000`    | 否   | 坐标精度，默认 `0-1000`                     |

**支持的 `media_type`**：

| 值                | 说明                      |
| ----------------- | ------------------------- |
| `image`           | JPEG/PNG/GIF/WebP 图片    |
| `video`           | MP4/MOV/AVI/MKV/WebM 视频 |
| `application/pdf` | PDF 文档                  |
| `text/plain`      | 纯文本                    |
| `text/markdown`   | Markdown 文本             |

### 返回值

```json
{
  "session_id": "uuid-string",
  "raw_visual_analysis": { "objects": [...], "spatial_relationships": [...] },
  "augmented_prompt": "[多模态空间信息]\n- (id:1) ...\n[用户问题]\n...",
  "objects_count": 5,
  "from_cache": false,
  "round": 1
}
```

## 多轮调用示例

**第一轮（上传图像）**：

```json
// Client → MCP
{
  "session_id": "session_abc123",
  "media_base64": "iVBORw0KGgo...",
  "media_type": "image",
  "question": "左下角有什么？",
  "merge_strategy": "replace"
}
// MCP → Client
{
  "session_id": "session_abc123",
  "from_cache": false,
  "round": 1,
  "augmented_prompt": "[多模态空间信息]\n- (id:1) \"红色水杯\" bbox[50,100,300,400]...\n\n[用户问题]\n左下角有什么？"
}
```

**第二轮（追问，0 视觉成本）**：

```json
// Client → MCP（不传 media_base64）
{
  "session_id": "session_abc123",
  "question": "它右边的呢？"
}
// MCP → Client（from_cache: true）
{
  "from_cache": true,
  "round": 2,
  "augmented_prompt": "[会话历史]\n上一轮你关注了 (id:1)...\n\n[当前空间信息]\n- (id:1) \"红色水杯\"...\n\n[用户问题]\n它右边的呢？"
}
```

**第三轮（上传新文件，增补物体）**：

```json
{
  "session_id": "session_abc123",
  "media_base64": "JVBERi0xLj...",
  "media_type": "application/pdf",
  "question": "PDF 里的数据表和水杯有什么关系？",
  "merge_strategy": "augment"
}
```

## 支持的输入格式

| 格式 | 扩展名          | 大小限制 | 说明                        |
| ---- | --------------- | -------- | --------------------------- |
| JPEG | `.jpg`, `.jpeg` | <= 20MB  | Base64 直传                 |
| PNG  | `.png`          | <= 20MB  | Base64 直传                 |
| GIF  | `.gif`          | <= 20MB  | Base64 直传                 |
| WebP | `.webp`         | <= 20MB  | Base64 直传                 |
| MP4  | `.mp4`          | 无硬限制 | FFmpeg 抽帧，默认最多 10 帧 |
| MOV  | `.mov`          | 无硬限制 | 同上                        |
| AVI  | `.avi`          | 无硬限制 | 同上                        |
| PDF  | `.pdf`          | 无硬限制 | 视觉渲染，默认最多 20 页    |
| TXT  | `.txt`          | 无硬限制 | 渲染为文本图像              |
| MD   | `.md`           | 无硬限制 | 渲染为文本图像              |

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
├── CLAUDE.md                       # 项目入口指引 → AGENTS.md
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
│   │   └── tool-handlers.ts        # MCP 工具注册
│   ├── core/
│   │   ├── CLAUDE.md               # 核心管道层指引
│   │   ├── pipeline.ts             # 管道编排器
│   │   ├── modality-router.ts      # 模态路由器
│   │   ├── parser.ts               # JSON 解析与容错
│   │   ├── validator.ts            # 坐标与物体验证
│   │   ├── normalizer.ts           # 坐标归一化
│   │   ├── prompt-builder.ts       # 增强提示词构建器
│   │   ├── vision-client.ts        # OpenAI 兼容视觉客户端
│   │   ├── session-manager.ts      # SQLite 会话管理
│   │   └── adapters/
│   │       ├── CLAUDE.md           # 适配器层指引
│   │       ├── base-adapter.ts     # 适配器接口
│   │       ├── image-adapter.ts    # 图片适配器
│   │       ├── video-adapter.ts    # 视频适配器
│   │       └── document-adapter.ts # 文档适配器
│   ├── templates/
│   │   ├── vision-system.txt       # 视觉模型系统提示词
│   │   └── augmented-prompt.txt    # 增强提示词模板
│   └── utils/
│       ├── CLAUDE.md               # 工具层指引
│       ├── logger.ts               # 结构化日志
│       └── retry.ts                # 指数退避重试
├── tests/
│   └── CLAUDE.md                   # 测试套件指引
├── bin/
│   └── cli.js                      # CLI 入口
├── data/                           # SQLite 数据库文件
└── package.json
```

## 架构

完整架构文档、数据流、设计决策见 **[AGENTS.md](./AGENTS.md)**。各层级指引见各级 `CLAUDE.md`。

```
MCP Client（Claude Code / OpenCode / Codex / Claude Desktop）
       │ JSON-RPC（stdio / SSE / HTTP Stream）
       ▼
┌──────────────────────────────────────┐
│         Visual Primitives MCP        │
│  ┌────────────────────────────────┐  │
│  │     Transport Layer            │  │
│  │  (Stdio / Hono SSE / Stream)   │  │
│  └───────────┬────────────────────┘  │
│  ┌───────────▼────────────────────┐  │
│  │    Tool Handler Registry       │  │
│  └───────────┬────────────────────┘  │
│  ┌───────────▼────────────────────┐  │
│  │    Pipeline Orchestrator       │  │
│  │  ┌──────┬──────┬──────┬─────┐ │  │
│  │  │Router│Parser│Valid.│Norm.│ │  │
│  │  └──┬───┴──┬───┴──┬───┴──┬─┘ │  │
│  │     │      │      │      │    │  │
│  │  ┌──▼──────▼──────▼──────▼─┐  │  │
│  │  │  Session Manager (SQLite)│  │  │
│  │  └─────────────────────────┘  │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │  Modality Adapters            │  │
│  │  Image │ Video │ Document     │  │
│  └───────────────────────────────┘  │
└──────────────────────────────────────┘
```

## 技术栈

- **运行时**：Node.js >= 22.5.0
- **语言**：TypeScript (strict)
- **MCP 协议**：@modelcontextprotocol/sdk
- **HTTP 传输**：Hono（SSE/HTTP Stream 模式）
- **参数校验**：Zod
- **日志**：pino
- **持久化**：node:sqlite（内置，WAL 模式）
- **视频处理**：ffmpeg-static
- **文档渲染**：sharp + pdf-poppler
- **测试**：vitest

## License

MIT
