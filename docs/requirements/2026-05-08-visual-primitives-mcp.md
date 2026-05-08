# Visual Primitives MCP — 需求规格文档

> 基于 DeepSeek《Thinking with Visual Primitives》论文的多模态空间锚定 MCP 服务器
> 状态：confirmed | 日期：2026-05-08

## 项目信息

- **项目名称**：visual-primitives-mcp
- **技术栈**：Node.js ≥ 22.5.0 + TypeScript + @modelcontextprotocol/sdk + Hono（SSE/HTTP 传输层）
- **开发范围**：一次性全实现（ImageAdapter + SessionManager + ModalityRouter + VideoAdapter + DocumentAdapter）
- **参考 PRD**：[docs/prds/需求文档.md](../prds/需求文档.md)

---

## 需求矩阵

### 功能需求

| 编号    | 需求                                                                              | 优先级 | 映射原 FR |
| ------- | --------------------------------------------------------------------------------- | ------ | --------- |
| REQ-001 | 注册 MCP 工具 `multimodal_grounding_augment`，支持 stdio/SSE/HTTP Stream 三种传输 | P0     | FR1       |
| REQ-002 | 与任意 OpenAI 兼容视觉模型通信，获取结构化 JSON 坐标数据                          | P0     | FR2       |
| REQ-003 | 支持图片输入（JPEG/PNG/GIF/WebP），Base64 直传，>20MB 拒绝                        | P0     | FR3       |
| REQ-004 | 支持视频输入（MP4/MOV/AVI/MKV/WebM），FFmpeg 抽帧后多图分析                       | P0     | FR4       |
| REQ-005 | 支持文档输入（PDF/DOCX/PPTX/XLSX/TXT/MD），渲染为图像后分析                       | P0     | FR5       |
| REQ-006 | 视觉模型返回非标 JSON 时备用正则解析恢复                                          | P0     | FR6       |
| REQ-007 | 坐标验证：范围 0-1000、x1<x2、y1<y2、ID 唯一、质心在 bbox 内                      | P0     | FR7       |
| REQ-008 | 坐标归一化到可配置精度（0-100 或 0-1000）                                         | P0     | FR8       |
| REQ-009 | 增强提示词包含：物体标签/bbox/中心点/状态/空间关系，视频加时间戳，文档加页码      | P0     | FR9       |
| REQ-010 | 配置通过环境变量注入，启动时校验必填项，缺失拒绝启动                              | P0     | FR10      |
| REQ-011 | 基于 node:sqlite 的会话管理，创建/查询/更新/删除独立会话                          | P0     | FR11      |
| REQ-012 | 同一会话后续轮次复用缓存物体，0 视觉 API 成本                                     | P0     | FR12      |
| REQ-013 | 跨轮物体 ID 一致性（SQLite 持久化保证）                                           | P0     | FR13      |
| REQ-014 | 会话物体列表增量更新（augment 策略，新 ID 不冲突）                                | P1     | FR14      |
| REQ-015 | 会话 TTL 自动过期清理                                                             | P1     | FR15      |
| REQ-016 | 多轮增强提示词包含会话历史摘要                                                    | P1     | FR16      |
| REQ-017 | 视觉分析失败时降级提示词，不中断服务                                              | P1     | FR17      |
| REQ-018 | 结构化日志（pino），不记录 Base64/API Key                                         | P1     | FR18      |
| REQ-019 | Hono 提供 SSE 和 HTTP Stream 传输模式的 HTTP 服务器基础设施                       | P0     | 新增      |

### 非功能需求

| 编号    | 需求                                                                   | 目标   | 映射原 NFR |
| ------- | ---------------------------------------------------------------------- | ------ | ---------- |
| REQ-N01 | 低延迟：单模态 P95 < 5s，多模态 P95 < 10s                              | 性能   | NFR1       |
| REQ-N02 | 高可用：含重试成功率 > 99.5%                                           | 可用性 | NFR2       |
| REQ-N03 | 安全：API Key 仅环境变量，日志不记录敏感数据                           | 安全   | NFR3       |
| REQ-N04 | 可扩展：实现 MediaAdapter 接口即可接入新模态                           | 扩展性 | NFR4       |
| REQ-N05 | 稳定性：任何单点异常不导致进程崩溃                                     | 稳定性 | NFR5       |
| REQ-N06 | 持久化可靠性：SQLite WAL 模式，重启不丢失                              | 可靠性 | NFR6       |
| REQ-N07 | 代码质量：ESLint + Prettier + TypeScript strict 模式，Git hooks 自动化 | 质量   | 新增       |
| REQ-N08 | CI/CD：lint → type-check → unit → build 流水线                         | 质量   | 新增       |

### 工程配置需求

| 编号    | 需求                                                           | 优先级 |
| ------- | -------------------------------------------------------------- | ------ |
| REQ-C01 | npm 项目初始化，package.json 含完整元数据                      | P0     |
| REQ-C02 | TypeScript 严格模式配置（tsconfig.json）                       | P0     |
| REQ-C03 | ESLint + Prettier 统一格式化配置                               | P0     |
| REQ-C04 | .gitignore 排除 node_modules/dist/data/.env                    | P0     |
| REQ-C05 | Git hooks（husky + lint-staged）：pre-commit 自动格式化 + lint | P0     |
| REQ-C06 | commitlint 校验 Conventional Commits                           | P0     |
| REQ-C07 | README.md 含安装/配置/使用/多轮示例                            | P0     |

---

## 技术决策

| 决策点      | 结论                             | 理由                                  |
| ----------- | -------------------------------- | ------------------------------------- |
| MCP 协议    | @modelcontextprotocol/sdk        | 官方 SDK，完整协议支持                |
| HTTP 传输层 | Hono                             | 轻量高性能，用于 SSE/HTTP Stream 模式 |
| 会话持久化  | node:sqlite (Node.js 22.5+ 内置) | 零外部依赖、同步 API、WAL 模式        |
| 参数校验    | Zod                              | 运行时类型安全，自动类型推导          |
| 日志        | pino                             | Node.js 生态性能最优结构化日志        |
| 视频处理    | ffmpeg-static + FFmpeg 抽帧      | 无缝复用图片管道                      |
| 文档处理    | pdf-to-png / sharp 渲染为图像    | MVP 只做视觉路径                      |

---

## 验收标准

| 序号  | 验收项         | 判定标准                                            |
| ----- | -------------- | --------------------------------------------------- |
| AC-01 | MCP 工具可发现 | 客户端 list_tools 可见 multimodal_grounding_augment |
| AC-02 | 图片分析       | Base64 图片 + 问题 → 含坐标的 augmented_prompt      |
| AC-03 | 视频分析       | MP4 + 问题 → 含时间戳坐标的结果                     |
| AC-04 | 文档分析       | PDF + 问题 → 含页码坐标的结果                       |
| AC-05 | 多轮缓存命中   | 同 session_id 第二轮 → from_cache=true，0 API 调用  |
| AC-06 | 跨轮 ID 一致   | 同物体跨轮 object_id 不变                           |
| AC-07 | 增量更新       | augment 模式下新旧数据共存，ID 不冲突               |
| AC-08 | 降级处理       | API 异常时返回降级提示词，不 crash                  |
| AC-09 | 配置校验       | 缺少必填环境变量时拒绝启动                          |
| AC-10 | 日志安全       | 日志无 Base64/API Key                               |
| AC-11 | 代码质量门     | lint + type-check + build 全通过                    |
