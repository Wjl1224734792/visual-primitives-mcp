# Visual Primitives MCP — 架构文档

基于 DeepSeek《Thinking with Visual Primitives》论文的多模态视觉理解 MCP 服务器。核心创新：**任务调度 + 两阶段推理**——先让模型看清画面（describe），再基于完整上下文追问坐标（locate），每一步专注做好一件事。

---

## 1. 项目概述

将视觉模型的场景理解和坐标定位能力封装为 4 个专注 MCP 工具，通过任务调度机制实现两阶段精确空间推理。`visual_describe` 先理解场景 → `visual_locate` 再精确定位 → 两者通过共享会话上下文联动。

| 属性     | 值                             |
| -------- | ------------------------------ |
| 运行时   | Node.js >= 22.5.0              |
| 语言     | TypeScript (strict)            |
| MCP 协议 | @modelcontextprotocol/sdk v1.x |
| HTTP 层  | Hono（仅 SSE/HTTP Stream）     |
| 持久化   | node:sqlite（内置）            |
| 校验     | Zod                            |
| 日志     | pino（敏感字段脱敏）           |
| 测试     | vitest（7 文件 114 用例）      |

---

## 2. 架构分层

```
┌──────────────────────────────┐
│         入口层 (src/)         │
│  server.ts / config.ts       │
│  types.ts                    │
├──────────────────────────────┤
│       传输层 (transport/)    │
│  factory.ts                  │
├──────────────────────────────┤
│      处理器层 (handlers/)    │
│  tool-handlers.ts (4 工具)   │
│  encodeFileBase64() 读文件   │
├──────────────────────────────┤
│       核心管道层 (core/)     │
│  ┌────────────────────────┐  │
│  │ pipeline.ts (任务调度)  │  │
│  │  describe | locate     │  │
│  │  ocr | video_analyze   │  │
│  │ parser.ts / validator  │  │
│  │ normalizer.ts          │  │
│  │ prompt-builder.ts      │  │
│  │ vision-client.ts       │  │
│  │ session-manager.ts     │  │
│  └────────────────────────┘  │
├──────────────────────────────┤
│       工具层 (utils/)        │
│  logger.ts / retry.ts        │
├──────────────────────────────┤
│       模板层 (templates/)    │
│  describe-system.txt         │
│  locate-system.txt           │
│  ocr-system.txt              │
└──────────────────────────────┘
```

---

## 3. 各层详解

### 3.1 入口层 (`src/`)

#### `server.ts` — 服务主入口

- 初始化链：`SessionManager → VisionClient → PipelineOrchestrator → McpServer`
- 注册 4 个视觉任务工具（describe/locate/ocr/video 均支持多轮会话上下文注入）
- 根据 `MCP_TRANSPORT` 环境变量选择传输模式（stdio / sse / http-stream）
- Hono 仅在 SSE/HTTP Stream 模式动态加载，stdio 零开销
- 启动 60s 间隔的 TTL 会话清理定时器
- SIGINT/SIGTERM 优雅关闭：清定时器 → 关 SQLite → 退出

#### `config.ts` — 配置体系

- Zod schema 校验 24 个环境变量（3 必填 21 可选）
- 分级模型配置：每工具独立三元组 (baseUrl, apiKey, model)，不配逐字段回退默认值
- 必填项缺失时拒绝启动并输出明确错误
- `DB_PATH` 目录不存在时自动 `mkdirSync`
- 导出单例 `config: AppConfig`

#### `types.ts` — 共享类型

- 所有接口/类型统一定义于此，全项目只读引用
- 核心：`AppConfig`, `ModelConfig`, `SessionContext`
- 任务输入/输出：`DescribeInput/Output`, `LocateInput/Output`, `OcrInput`, `VideoAnalyzeInput/Output`

---

### 3.2 传输层 (`src/transport/`)

#### `factory.ts` — 传输工厂

- `createTransport(mode)` 返回对应传输实例
- stdio → `StdioServerTransport`（原生 MCP SDK）
- sse/http-stream → `StreamableHTTPServerTransport`（stateless 模式）

---

### 3.3 处理器层 (`src/handlers/`)

#### `tool-handlers.ts` — MCP 工具注册

注册 4 个工具，每个工具聚焦单一任务：

| 工具名                 | 任务                                  | 系统提示词                |
| ---------------------- | ------------------------------------- | ------------------------- |
| `visual_describe`      | 场景描述 + 物体识别 + 图谱，JSON 输出 | `describe-structured.txt` |
| `visual_locate`        | 坐标定位，JSON 输出                   | `locate-system.txt`       |
| `visual_ocr`           | 文字/表格提取                         | `ocr-system.txt`          |
| `visual_video_analyze` | 视频内容分析                          | `describe-system.txt`     |

- 每个工具独立 Zod 校验，自动生成 `session_id`
- `encodeFileBase64()` 读取本地文件 → Base64 data URL
- 文件格式和大小校验在 handler 层一次完成，pipeline 直接消费 data URL

---

### 3.4 核心管道层 (`src/core/`)

#### `pipeline.ts` — 管道编排器（任务调度核心）

提供 4 个独立任务方法：

```
visual_describe:
  1. 注入历史上下文 → [fromCache?] 跳过视觉 API | 调用 VisionClient.analyze(describe-structured) → JSON
  2. 解析/校验/归一化物体坐标 → 入库
  3. 构建空间关系图谱（纯本地计算）→ 返回 description + objects + spatial_graph

visual_locate:
  1. [可选] 新媒体 → VisionClient.analyze(locate-system) → JSON
  2. 注入会话上下文（历史描述 + 物体缓存 + 图谱）
  3. 解析/校验/归一化坐标 → 入库 → 返回

visual_ocr:
  1. data URL → VisionClient.chat(ocr-system) → 返回文字

visual_video_analyze:
  1. 注入历史上下文 → data URL → VisionClient.chat(describe-system) → 返回描述
```

- PipelineOrchestrator 只依赖 SessionManager + VisionClient，无中间适配层
- data URL 由 handler 的 `encodeFileBase64()` 一次性准备好，pipeline 直接消费
- describe / video_analyze / locate 均自动注入最近一轮的 assistant 响应作为上下文
- describe 支持 `fromCache` 模式：有缓存物体时跳过视觉 API，零成本图谱推理

#### `vision-client.ts` — 视觉模型客户端

- OpenAI Chat Completions 兼容接口
- 直接接受 data URL（`data:image/...;base64,...` 或 `data:video/...;base64,...`）
- 根据 MIME 前缀自动选 `image_url` / `video_url`，视频不做帧提取
- 两个入口：
  - `chat(modelConfig, dataUrls, systemPrompt, userPrompt?)` — 自由文本输出
  - `analyze(modelConfig, dataUrls, systemPrompt, userPrompt?)` — JSON 输出（`response_format: json_object`）
- `modelConfig` 由各任务方法从 `config.describe` / `config.locate` / `config.ocr` / `config.video` 传入
- 指数退避重试（最多 3 次）+ 120s 超时

#### `parser.ts` — 响应解析器

- 主路径：`JSON.parse(content)`
- 备用路径：正则提取第一个完整 JSON `/\{[\s\S]*\}/`
- `visual_describe` 和 `visual_locate` 共用

#### `validator.ts` — 坐标校验器

- 6 条规则：objects 非空 / ID 唯一 / bbox 范围 / x1<x2 y1<y2 / centroid 在 bbox 内 / 扩展字段格式
- `visual_describe` 和 `visual_locate` 共用

#### `normalizer.ts` — 坐标归一化器

- 0-1000 → 0-100 等比缩放，同精度跳过，不可变操作
- `visual_describe` 和 `visual_locate` 共用

#### `prompt-builder.ts` — 提示词 + 空间图谱构建器

- `buildAugmentedPrompt()`：`[多模态空间信息] → [推理规则] → [会话历史] → [用户问题]`
- `buildSpatialGraph()`：计算 N×(N-1)/2 条物体两两空间关系（纯数学，零 API 成本）
- `formatSpatialGraph()`：格式化为文本模型可读的自然语言图谱
- 会话历史注入包含之前的 describe 结果，为 locate 提供上下文

#### `session-manager.ts` — 会话管理器

- 基于 `node:sqlite` 同步 API + WAL 模式（通过 `sqlite-wrapper.ts` 兼容 Vite）
- 聚合根 `Session`，实体 `SessionObject` / `ConversationTurn`
- 7 个方法：createSession / getSession / upsertObjects / addConversationTurn / getRecentHistory / cleanupExpired / deleteSession
- augment 策略：新物体从已有最大 ID+1 开始分配

---

### 3.5 工具层 (`src/utils/`)

#### `logger.ts` — 结构化日志

- pino 实例，`hooks.logMethod` 脱敏敏感字段
- 自动替换：base64 / apiKey / token / secret / password → `[REDACTED]`

#### `retry.ts` — 指数退避重试

- `withRetry<T>(fn, options?)`
- 公式：`min(baseDelay * backoffFactor^attempt, maxDelay)`
- 支持自定义 `shouldRetry` 判断

---

### 3.6 模板层 (`src/templates/`)

| 模板文件                  | 用途                                   | 关联工具          |
| ------------------------- | -------------------------------------- | ----------------- |
| `describe-structured.txt` | 场景描述 + 坐标定位提示词（JSON 输出） | `visual_describe` |
| `describe-system.txt`     | 场景描述提示词（自然语言，已废弃）     | —                 |
| `locate-system.txt`       | 坐标定位提示词（JSON 输出）            | `visual_locate`   |
| `ocr-system.txt`          | OCR 文字提取提示词                     | `visual_ocr`      |

---

## 4. 数据流全景

### 两阶段推理流程（推荐）

```
Step 1: visual_describe (首次)
  MCP Client → tool-handlers.ts → encodeFileBase64() → data URL
  → PipelineOrchestrator.describe()
  → VisionClient.analyze(describe-structured) → JSON {description, objects}
  → Parser → Validator → Normalizer → 入库物体
  → buildSpatialGraph() 构建空间图谱（纯本地计算）
  → 返回 description + objects + spatial_graph

Step 1b: visual_describe (追问，fromCache 模式)
  MCP Client → tool-handlers.ts → 省略 image_path
  → PipelineOrchestrator.describe(fromCache=true)
  → 跳过视觉 API，从会话缓存加载物体
  → buildSpatialGraph() 重新计算最新图谱
  → 零 API 成本返回

Step 2: visual_locate (坐标定位)
  MCP Client → tool-handlers.ts → [可选] encodeFileBase64()
  → PipelineOrchestrator.locate()
  → 从 SessionManager 加载历史上下文 + 物体缓存 + 图谱
  → [新媒体] VisionClient.analyze(locate-system) → JSON 坐标
  → Parser → Validator → Normalizer → 入库
  → 返回 augmented_prompt + coordinates
```

### OCR 流程

```
visual_ocr
  → data URL → VisionClient.chat(ocr-system) → 直接返回文字内容
```

### 视频分析流程

```
visual_video_analyze
  → data URL → VisionClient.chat(describe-system) → 返回描述
  （视频直接发送，不做帧提取。DashScope 等兼容 OpenAI 的 API 原生支持 video_url）
```

---

## 5. 多轮会话机制

```
Round 1: visual_describe（上传 UI 截图）
  → 场景描述存入会话历史
  → round=1

Round 2: visual_locate（"找到蓝色提交按钮"）
  → 从会话历史加载 Round 1 的场景描述
  → 将描述注入 locate 用户提示词作为上下文
  → 模型已有完整场景认知，定位精准
  → 物体入库 → round=2

Round 3: visual_locate（"表格右上角的分页器"）
  → 从缓存读取已有物体（from_cache=true）
  → 加上之前的描述上下文
  → 0 视觉 API 成本 → round=3
```

---

## 6. 降级策略

| 阶段       | 异常              | 处理                            |
| ---------- | ----------------- | ------------------------------- |
| 视觉客户端 | 网络/超时/429/5xx | 指数退避 3 次 → 降级结果        |
| 解析器     | JSON 格式错误     | 正则备用 → `AnalysisParseError` |
| 校验器     | 坐标越界/ID 重复  | `ValidationError` → 跳过此轮    |
| 整体       | 任何未捕获异常    | 降级输出 → 不崩溃               |

---

## 7. 关键设计决策

| 决策          | 选择                                                      | 理由                                           |
| ------------- | --------------------------------------------------------- | ---------------------------------------------- |
| 任务调度      | 4 个独立工具 + 管道方法分发                               | 每个工具专注一件事，系统提示词独立优化         |
| 两阶段推理    | describe（自然语言）→ locate（JSON）                      | 先理解再定位，避免同时做两件事导致的精度下降   |
| 上下文注入    | locate 时注入历史 describe 结果                           | 模型已有完整场景认知，定位准确度显著提升       |
| 直传 data URL | handler 一次编码，pipeline 直接消费                       | 消除适配器中间层，无重复校验                   |
| 视频处理      | 直接发送 video_url，不做帧提取                            | DashScope 等视觉模型原生理解视频时序           |
| 会话持久化    | node:sqlite (Node.js 内置)                                | 零依赖、同步 API、WAL 事务安全                 |
| 分级模型配置  | 每工具独立三元组 (baseUrl/apiKey/model)，逐字段回退默认值 | 用户自由搭配不同厂商模型，按任务类型选最合适的 |
| 降级兜底      | 每步独立 try/catch                                        | 任何单点故障不影响服务可用性                   |
| 文件路径支持  | 直接传本地路径，内部编码 Base64                           | 用户无需手动编码，使用体验等同于 dashscope     |

---

## 8. 开发命令

```bash
npm run dev          # 热重载开发
npm run build        # 编译到 dist/
npm run lint         # ESLint 检查
npm run typecheck    # TypeScript 类型检查
npm test             # 运行 114 个测试
npm start            # 启动 MCP 服务（stdio）
```

## 9. 相关文档

| 文档     | 路径                                                  |
| -------- | ----------------------------------------------------- |
| 需求规格 | docs/requirements/2026-05-08-visual-primitives-mcp.md |
| 任务分解 | docs/tasks/2026-05-08-visual-primitives-mcp-tasks.md  |
| 执行计划 | docs/plans/2026-05-08-visual-primitives-mcp-plan.md   |
| 详细 PRD | docs/prds/需求文档.md                                 |
| 使用说明 | README.md                                             |
