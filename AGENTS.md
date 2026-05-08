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
| 测试     | vitest（10 文件 153 用例）     |

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
│  tool-handlers.ts (5 工具)   │
├──────────────────────────────┤
│       核心管道层 (core/)     │
│  ┌────────────────────────┐  │
│  │ pipeline.ts (任务调度)  │  │
│  │  describe | locate     │  │
│  │  ocr | video_analyze   │  │
│  │ modality-router.ts     │  │
│  │ parser.ts / validator  │  │
│  │ normalizer.ts          │  │
│  │ prompt-builder.ts      │  │
│  │ vision-client.ts       │  │
│  │ session-manager.ts     │  │
│  └────────────────────────┘  │
│  ┌────────────────────────┐  │
│  │   适配器层 (adapters/) │  │
│  │  Image / Video         │  │
│  └────────────────────────┘  │
├──────────────────────────────┤
│       工具层 (utils/)        │
│  logger.ts / retry.ts        │
├──────────────────────────────┤
│       模板层 (templates/)    │
│  describe-system.txt         │
│  locate-system.txt           │
│  ocr-system.txt              │
│  vision-system.txt (兼容)    │
│  augmented-prompt.txt        │
└──────────────────────────────┘
```

---

## 3. 各层详解

### 3.1 入口层 (`src/`)

#### `server.ts` — 服务主入口

- 初始化链：`SessionManager → VisionClient → PipelineOrchestrator → McpServer`
- 注册 5 个工具（4 新 + 1 兼容）
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
- 新增：`TaskType`, `DescribeInput/Output`, `LocateInput/Output`, `OcrInput`, `VideoAnalyzeInput/Output`
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

注册 5 个工具，每个工具聚焦单一任务：

| 工具名                         | 任务                   | 系统提示词            |
| ------------------------------ | ---------------------- | --------------------- |
| `visual_describe`              | 场景描述，自然语言输出 | `describe-system.txt` |
| `visual_locate`                | 坐标定位，JSON 输出    | `locate-system.txt`   |
| `visual_ocr`                   | 文字/表格提取          | `ocr-system.txt`      |
| `visual_video_analyze`         | 视频内容分析           | `describe-system.txt` |
| `multimodal_grounding_augment` | 兼容旧版，内部转发     | `vision-system.txt`   |

每个工具独立 Zod 校验，自动生成 `session_id`，调用 PipelineOrchestrator 对应方法，返回 MCP 标准响应格式。

---

### 3.4 核心管道层 (`src/core/`)

#### `pipeline.ts` — 管道编排器（任务调度核心）

替代旧版单一 `execute()` 方法，提供任务调度：

```
visual_describe:
  1. 路由适配器 → Base64Image[]
  2. VisionClient.chat(describe-system) → 自然语言描述
  3. 存储描述到会话历史 → 返回

visual_locate:
  1. [可选] 新媒体 → 路由适配器 → VisionClient
  2. 注入会话上下文中之前的 describe 结果
  3. VisionClient.chat(locate-system) → JSON
  4. 解析/校验/归一化坐标 → 入库 → 返回

visual_ocr:
  1. 路由适配器 → Base64Image[]
  2. VisionClient.chat(ocr-system) → 返回文字

visual_video_analyze:
  1. VideoAdapter 抽帧 → Base64Image[]
  2. VisionClient.chat(describe-system) → 返回描述
```

旧版 `execute()` 保留，转发到 locate 管道以兼容旧版调用方。

#### `modality-router.ts` — 模态路由器

- 注册表模式：`Map<string, MediaAdapter>`
- 预注册 image / video 两种媒体类型
- 单例导出 `modalityRouter`
- 未知类型抛 `ModalityRouterError`

#### `parser.ts` — 响应解析器

- 主路径：`JSON.parse(content)`
- 备用路径：正则提取第一个完整 JSON `/\{[\s\S]*\}/`
- 仅 `visual_locate` 使用

#### `validator.ts` — 坐标校验器

- 6 条规则：objects 非空 / ID 唯一 / bbox 范围 / x1<x2 y1<y2 / centroid 在 bbox 内 / 扩展字段格式
- 仅 `visual_locate` 使用

#### `normalizer.ts` — 坐标归一化器

- 0-1000 → 0-100 等比缩放
- 同精度跳过
- 不可变操作
- 仅 `visual_locate` 使用

#### `prompt-builder.ts` — 提示词构建器

- 输出结构：`[多模态空间信息] → [推理规则] → [会话历史] → [用户问题]`
- 会话历史注入包含之前的 describe 结果，为 locate 提供上下文
- 按模态类型分区域：图像区域 / 视频关键帧索引

#### `vision-client.ts` — 视觉模型客户端

- OpenAI Chat Completions 兼容接口
- 两个入口：
  - `analyze(images, systemPrompt)` — 旧版兼容，输出 JSON
  - `chat(images, systemPrompt, userPrompt?)` — 新版通用，输出自由文本
- 多图单次请求（视频多帧在同一 messages 数组）
- 指数退避重试 + 45s 超时
- 异常降级

#### `session-manager.ts` — 会话管理器

- 基于 `node:sqlite` 同步 API + WAL 模式
- 聚合根 `Session`，实体 `SessionObject` / `ConversationTurn`
- 7 个方法：createSession / getSession / upsertObjects / addConversationTurn / getRecentHistory / cleanupExpired / deleteSession
- augment 策略：新物体从已有最大 ID+1 开始分配
- replace 策略：清空旧物体后重建

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
- **优先级**：`ffmpeg-static` 内嵌二进制 → 系统 PATH `ffmpeg` 命令 → 降级空数组

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

| 模板文件               | 用途                                    | 关联工具                                  |
| ---------------------- | --------------------------------------- | ----------------------------------------- |
| `describe-system.txt`  | 场景描述提示词（自然语言输出）          | `visual_describe`, `visual_video_analyze` |
| `locate-system.txt`    | 坐标定位提示词（JSON 输出）             | `visual_locate`                           |
| `ocr-system.txt`       | OCR 文字提取提示词                      | `visual_ocr`                              |
| `vision-system.txt`    | 旧版视觉原语提示词                      | `multimodal_grounding_augment`（兼容）    |
| `augmented-prompt.txt` | 增强提示词模板（`{{VARIABLE}}` 占位符） | `prompt-builder.ts`                       |

---

## 4. 数据流全景

### 两阶段推理流程（推荐）

```
Step 1: visual_describe
  MCP Client → tool-handlers.ts → 读文件 + encodeFileBase64
  → PipelineOrchestrator.describe()
  → ModalityRouter → ImageAdapter.adapt() → Base64Image[]
  → VisionClient.chat(describe-system)
  → 自然语言描述存入会话历史
  → 返回 description

Step 2: visual_locate
  MCP Client → tool-handlers.ts → [可选] encodeFileBase64
  → PipelineOrchestrator.locate()
  → 从 SessionManager 加载之前的 describe 结果作为上下文
  → VisionClient.chat(locate-system) → JSON 坐标
  → Parser → Validator → Normalizer
  → SessionManager.upsertObjects → 持久化
  → 返回 augmented_prompt + coordinates
```

### OCR 流程

```
visual_ocr
  → ModalityRouter → ImageAdapter
  → VisionClient.chat(ocr-system)
  → 直接返回文字内容
```

### 视频分析流程

```
visual_video_analyze
  → ModalityRouter → VideoAdapter（FFmpeg 抽帧）
  → VisionClient.chat(describe-system)
  → 返回视频描述
```

### 兼容流程（旧版 multimodal_grounding_augment）

```
→ PipelineOrchestrator.execute()（转发到 locate 管道）
  → 行为与 visual_locate 一致
```

---

## 5. 多轮会话机制

```
Round 1: visual_describe（上传 UI 截图）
  → 场景描述存入会话历史
  → round=1

Round 2: visual_locate（"找到蓝色提交按钮"）
  → 从会话历史加载 Round 1 的场景描述
  → 将描述注入 locate 系统提示词作为上下文
  → 模型已有完整场景认知，定位精准
  → 物体入库 → round=2

Round 3: visual_locate（"表格右上角的分页器"）
  → 从缓存读取已有物体（from_cache=true）
  → 加上之前的描述上下文
  → 0 视觉 API 成本 → round=3
```

---

## 6. 降级策略

| 阶段       | 异常              | 处理                                          |
| ---------- | ----------------- | --------------------------------------------- |
| 适配器     | FFmpeg 不可用     | 先 fallback 到系统 ffmpeg，仍不可用返回空数组 |
| 视觉客户端 | 网络/超时/429/5xx | 指数退避 3 次 → 降级结果                      |
| 解析器     | JSON 格式错误     | 正则备用 → `AnalysisParseError`               |
| 校验器     | 坐标越界/ID 重复  | `ValidationError` → 跳过此轮                  |
| 整体       | 任何未捕获异常    | 降级输出 → 不崩溃                             |

---

## 7. 关键设计决策

| 决策         | 选择                                 | 理由                                         |
| ------------ | ------------------------------------ | -------------------------------------------- |
| 任务调度     | 4 个独立工具 + 管道方法分发          | 每个工具专注一件事，系统提示词独立优化       |
| 两阶段推理   | describe（自然语言）→ locate（JSON） | 先理解再定位，避免同时做两件事导致的精度下降 |
| 上下文注入   | locate 时注入历史 describe 结果      | 模型已有完整场景认知，定位准确度显著提升     |
| 模态统一     | 所有输入 → Base64Image[] → 同一管道  | 适配器只做格式转换，核心逻辑复用             |
| 视频处理     | FFmpeg 抽帧 + 系统 PATH 兜底         | 优先用内嵌二进制，不可用时 try 系统 ffmpeg   |
| 会话持久化   | node:sqlite (Node.js 内置)           | 零依赖、同步 API、WAL 事务安全               |
| 多模态适配   | 注册表模式                           | 新增模态只需注册一行，不改管道               |
| 降级兜底     | 每步独立 try/catch                   | 任何单点故障不影响服务可用性                 |
| 文件路径支持 | 直接传本地路径，内部编码 Base64      | 用户无需手动编码，使用体验等同于 dashscope   |

---

## 8. 开发命令

```bash
npm run dev          # 热重载开发
npm run build        # 编译到 dist/
npm run lint         # ESLint 检查
npm run typecheck    # TypeScript 类型检查
npm test             # 运行 153 个测试
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
