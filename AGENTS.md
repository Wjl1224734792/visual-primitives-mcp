# Visual Primitives MCP — 架构文档

基于 DeepSeek《Thinking with Visual Primitives》论文的多模态空间锚定 MCP 服务器。

---

## 1. 项目概述

将视觉模型的坐标锚点推理能力封装为 MCP 工具 `multimodal_grounding_augment`，使纯文本模型能通过调用它获得精确的空间推理能力。核心思想：**坐标不是事后标注的答案，而是推理过程中消除歧义的空间锚点**。

| 属性     | 值                             |
| -------- | ------------------------------ |
| 运行时   | Node.js >= 22.5.0              |
| 语言     | TypeScript (strict)            |
| MCP 协议 | @modelcontextprotocol/sdk v1.x |
| HTTP 层  | Hono（仅 SSE/HTTP Stream）     |
| 持久化   | node:sqlite（内置）            |
| 校验     | Zod                            |
| 日志     | pino（敏感字段脱敏）           |
| 测试     | vitest（10 文件 147 用例）     |

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
│  tool-handlers.ts            │
├──────────────────────────────┤
│       核心管道层 (core/)     │
│  ┌────────────────────────┐  │
│  │ pipeline.ts (编排器)   │  │
│  │ modality-router.ts     │  │
│  │ parser.ts / validator  │  │
│  │ normalizer.ts          │  │
│  │ prompt-builder.ts      │  │
│  │ vision-client.ts       │  │
│  │ session-manager.ts     │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │   适配器层 (adapters/) │  │
│  │  Image / Video / Doc   │  │
│  └────────────────────────┘  │
├──────────────────────────────┤
│       工具层 (utils/)        │
│  logger.ts / retry.ts        │
├──────────────────────────────┤
│       模板层 (templates/)    │
│  vision-system.txt           │
│  augmented-prompt.txt        │
└──────────────────────────────┘
```

---

## 3. 各层详解

### 3.1 入口层 (`src/`)

#### `server.ts` — 服务主入口

- 初始化链：`SessionManager → VisionClient → PipelineOrchestrator → McpServer`
- 根据 `MCP_TRANSPORT` 环境变量选择传输模式（stdio / sse / http-stream）
- Hono 仅在 SSE/HTTP Stream 模式动态加载，stdio 零开销
- 启动 60s 间隔的 TTL 会话清理定时器
- SIGINT/SIGTERM 优雅关闭：清定时器 → 关 SQLite → 退出

#### `config.ts` — 配置体系

- Zod schema 校验 12 个环境变量（3 必填 9 可选）
- 必填项缺失时拒绝启动并输出明确错误
- `DB_PATH` 目录不存在时自动 `mkdirSync`
- 导出单例 `config: AppConfig`（懒加载）

#### `types.ts` — 共享类型

- 所有接口/类型统一定义于此，全项目只读引用
- 核心：`MediaAdapter`, `AppConfig`, `PipelineInput/Output`, `SessionContext`
- 冻结点：此文件完成后不再修改签名

---

### 3.2 传输层 (`src/transport/`)

#### `factory.ts` — 传输工厂

- `createTransport(mode)` 返回对应传输实例
- stdio → `StdioServerTransport`（原生 MCP SDK）
- sse/http-stream → `StreamableHTTPServerTransport`（stateless 模式）
- Hono 仅做健康检查端点，MCP 消息由 SDK 处理

---

### 3.3 处理器层 (`src/handlers/`)

#### `tool-handlers.ts` — MCP 工具注册

- 注册 `multimodal_grounding_augment` 工具
- Zod 校验输入：6 个参数，`media_base64` 和 `media_type` 交叉校验
- 未传 `session_id` 时自动生成 UUID
- 调用 `PipelineOrchestrator.execute()` 获取结果
- 返回 MCP 标准 `{ content: [{ type: 'text', text: '...' }] }` 格式

---

### 3.4 核心管道层 (`src/core/`)

#### `pipeline.ts` — 管道编排器（集成核心）

完整多轮处理流程：

```
1. 解析输入参数
2. getOrCreateSession
3. 判断来源
   ├─ fromCache（无新 media_base64）
   │   └─ 跳过 4-7
   └─ fromVision（有新 media_base64）
       ├─ 4. ModalityRouter.route() → 选择适配器
       ├─ 5. Adapter.adapt() → Base64Image[]
       ├─ 6. VisionClient.analyze() → JSON
       ├─ 7. Parser → Validator → Normalizer
       └─ 8. SessionManager.upsertObjects()
9. PromptBuilder.build()
10. 返回 PipelineOutput
```

- 每个步骤独立 try/catch，任何异常不崩溃（REQ-N05）
- 降级模式：分析失败时返回仅含用户问题+系统说明的提示词

#### `modality-router.ts` — 模态路由器

- 注册表模式：`Map<string, MediaAdapter>`
- 预注册 8 种媒体类型：image / video / pdf / docx / pptx / xlsx / txt / md
- 单例导出 `modalityRouter`
- 未知类型抛 `ModalityRouterError`（含支持的列表）

#### `parser.ts` — 响应解析器

- 主路径：`JSON.parse(content)`
- 备用路径：正则提取第一个完整 JSON `/\{[\s\S]*\}/`
- 失败抛 `AnalysisParseError`

#### `validator.ts` — 坐标校验器

6 条规则：objects 非空 / ID 唯一 / bbox 范围 / x1<x2 y1<y2 / centroid 在 bbox 内 / 扩展字段格式

#### `normalizer.ts` — 坐标归一化器

- 0-1000 → 0-100 等比缩放
- 同精度跳过
- 不可变操作：返回新数组，不修改原对象

#### `prompt-builder.ts` — 提示词构建器

- 输出结构：`[多模态空间信息] → [推理规则] → [会话历史] → [用户问题]`
- 会话历史注入最近 3 轮
- 按模态类型分区域：图像区域 / 视频关键帧索引 / 文档页面区域

#### `vision-client.ts` — 视觉模型客户端

- OpenAI Chat Completions 兼容接口
- 多图单次请求（视频多帧/文档多页在同一 messages 数组）
- 指数退避重试 + 45s 超时
- 异常降级：返回 `{ objects: [] }` 空结构

#### `session-manager.ts` — 会话管理器

- 基于 `node:sqlite` 同步 API + WAL 模式
- 聚合根 `Session`，实体 `SessionObject` / `ConversationTurn`
- 7 个方法：createSession / getSession / upsertObjects / addConversationTurn / getRecentHistory / cleanupExpired / deleteSession
- augment 策略：新对象从已有最大 ID+1 开始分配，避免冲突
- replace 策略：清空旧对象后重建

---

### 3.5 适配器层 (`src/core/adapters/`)

所有适配器实现 `MediaAdapter` 接口：

```typescript
interface MediaAdapter {
  readonly mediaType: string;
  adapt(input: string): Promise<Base64Image[]>;
}
```

#### `image-adapter.ts` — 图片适配器

- 直接透传 Base64，校验 >20MB 拒绝
- MIME 检测：data: URL 前缀或默认 `image/jpeg`

#### `video-adapter.ts` — 视频适配器

- FFmpeg 抽帧，`fps=1/3` 固定间隔
- 帧数受 `MAX_VIDEO_FRAMES` 限制
- 每帧输出 Base64 JPEG + 时间戳
- FFmpeg 不可用 → 空数组 + warn 日志

#### `document-adapter.ts` — 文档适配器

- PDF → `pdf-poppler` 渲染每页为 PNG
- TXT/MD → `sharp` 渲染 SVG 文本为 PNG
- Office 文档 → 空数组 + warn 日志（MVP 不支持）
- 页数受 `MAX_DOC_PAGES` 限制

---

### 3.6 工具层 (`src/utils/`)

#### `logger.ts` — 结构化日志

- pino 实例，`hooks.logMethod` 脱敏敏感字段
- 自动替换：base64 / apiKey / token / secret / password → `[REDACTED]`

#### `retry.ts` — 指数退避重试

- `withRetry<T>(fn, options?)`
- 公式：`min(baseDelay * backoffFactor^attempt, maxDelay)`
- 支持自定义 `shouldRetry` 判断

---

### 3.7 模板层 (`src/templates/`)

#### `vision-system.txt`

视觉模型系统提示词，定义"视觉原语"输出格式：每个物体含 id/label/bbox/centroid/state/relevance，严格 JSON 输出。

#### `augmented-prompt.txt`

增强提示词模板，含 `{{VARIABLE}}` 占位符，运行时由 `prompt-builder.ts` 替换。

---

## 4. 数据流全景

```
MCP Client (Claude Code / OpenCode / Codex)
    │ JSON-RPC (stdio)
    ▼
server.ts → McpServer.connect(StdioServerTransport)
    │
    ▼ CallToolRequest
tool-handlers.ts → Zod 校验 → PipelineOrchestrator.execute()
    │
    ├─ [Cache Hit] 直接从 SQLite 读历史物体 → PromptBuilder → 返回
    │
    └─ [Cache Miss]
         ModalityRouter → Adapter.adapt() → Base64Image[]
         → VisionClient.analyze() → JSON string
         → Parser → Validator → Normalizer
         → SessionManager.upsertObjects() → SQLite 持久化
         → PromptBuilder.build() → augmented_prompt
         → 返回
```

---

## 5. 多轮会话机制

```
Round 1: 用户上传图片 "左下角有什么？"
  → Vision API 调用 (from_cache=false)
  → 识别 (id:1) "红色水杯" 存储到 SQLite
  → round=1

Round 2: 追问 "它右边的呢？"（不传 media_base64）
  → 从 SQLite 加载 (id:1) 历史物体 (from_cache=true)
  → 0 视觉 API 成本
  → round=2

Round 3: 上传 PDF (augment 策略)
  → Vision API 调用，新物体从已有最大 ID+1 分配
  → 新旧物体共存于 SQLite
  → round=3
```

---

## 6. 降级策略

| 阶段       | 异常                     | 处理                             |
| ---------- | ------------------------ | -------------------------------- |
| 适配器     | FFmpeg 不可用 / 渲染失败 | 返回空数组，不抛异常             |
| 视觉客户端 | 网络/超时/429/5xx        | 指数退避 3 次 → 降级 JSON        |
| 解析器     | JSON 格式错误            | 正则备用 → `AnalysisParseError`  |
| 校验器     | 坐标越界/ID 重复         | `ValidationError` → 跳过此轮     |
| 整体       | 任何未捕获异常           | `buildDegradedOutput()` → 不崩溃 |

---

## 7. 关键设计决策

| 决策       | 选择                                | 理由                             |
| ---------- | ----------------------------------- | -------------------------------- |
| 模态统一   | 所有输入 → Base64Image[] → 同一管道 | 适配器只做格式转换，核心逻辑复用 |
| 视频处理   | FFmpeg 抽帧，不依赖 ffprobe         | 简化 MVP，固定间隔抽帧           |
| 文档处理   | 视觉渲染路径（不提取文本）          | 版式复杂场景表现好，零额外逻辑   |
| 会话持久化 | node:sqlite (Node.js 内置)          | 零依赖、同步 API、WAL 事务安全   |
| 多模态适配 | 注册表模式                          | 新增模态只需注册一行，不改管道   |
| 降级兜底   | 每步独立 try/catch                  | 任何单点故障不影响服务可用性     |

---

## 8. 开发命令

```bash
npm run dev          # 热重载开发
npm run build        # 编译到 dist/
npm run lint         # ESLint 检查
npm run typecheck    # TypeScript 类型检查
npm test             # 运行 147 个测试
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
