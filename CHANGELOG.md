# Changelog

## 1.5.0

### Minor Changes

- **Prompt-Driven JSON：** 删除 `analyze()`（`response_format: json_object`），所有 API 调用统一使用 `chat()`。JSON 格式控制权从 API 参数层移至提示词模板层，消除厂商锁定（阿里云 `json_object` 要求 messages 含 "json" 词、禁止 `max_tokens` 等限制）
- **宽容解析：** `parseResponse()` 失败返回 `null` 而非抛异常，管线降级纯文本不中断
- **模板增强：** 结构化输出模板末尾追加 JSON 格式指令 + 空 objects 容错说明
- **描述字段回退：** `parser.ts` 支持 `description` 字段作为 `reasoning` 的回退（兼容不同模型命名偏好）
- **测试：** 176 用例全部通过，零回归

## 1.4.1

### Patch Changes

- **阿里云结构化输出兼容：** 移除 `max_tokens` 硬编码（阿里云文档明确要求结构化输出模式不设 `max_tokens`，截断会导致 JSON 不可解析）
- **文本任务路由：** `task=diagram/dataviz/ui_code/ui_prompt` 自动切换为 `chat()`（自由文本），避免 `json_object` 模式破坏图表分析/代码生成/提示词输出的自然语言格式
- **枚举规范化：** `visual_compare` 和 `visual_diagnose` 新增模型输出规范化层——自动将非标准值（`severity: "high"` → `"critical"`、`error_type: "authentication"` → `"network"` 等 50+ 映射）转为合法枚举，防止下游类型错误
- **断路器状态码提取：** 正则从仅匹配中文扩展为多语言（英语/日语/西班牙语）+ 4xx/5xx 通用回退，避免非中文错误信息导致断路器误判为故障
- **集成测试：** 新增 `integration-tests/` 目录（gitignore 保护），包含 8 项全工具端到端测试（describe 基础/缓存/task 模式、locate、OCR、compare、diagnose、video）

## 1.4.0

### Minor Changes

- **稳定性基座：** 图片智能预处理（sharp resize + 质量压缩，六工具独立预设）、断路器（三态状态机，5 次失败→30s 熔断）、并发控制（信号量模式，默认最大 10 并发）、可配置超时（TIMEOUT_MS 环境变量）、URL 输入支持（HTTP(S) URL 自动 fetch + Content-Type 校验）
- **工具扩展（4→6）：** `visual_describe` 新增 `task` 参数（general/diagram/dataviz/ui_code/ui_prompt）、新增 `visual_compare`（截图差异对比）、新增 `visual_diagnose`（错误截图诊断）
- **可观测性：** 指标收集（调用数/错误数/缓存命中/延迟/熔断次数）、`GET /metrics` 端点（SSE 模式）、请求追踪（8 位 hex traceId 注入所有日志点）
- **新增环境变量：** PREPROCESS_ENABLED, CIRCUIT_BREAKER_ENABLED, CIRCUIT_BREAKER_THRESHOLD, CIRCUIT_BREAKER_RECOVERY_MS, MAX_CONCURRENCY, METRICS_ENABLED
- **测试：** 从 114 → 174 用例（+60），零回归

## 1.2.1

### Patch Changes

- 版本徽章同步
- Build 脚本添加模板文件复制到 dist/

## 1.2.0

### Minor Changes

- 空间关系图谱：物体两两之间的方向与距离，纯本地计算零 API 成本
- describe 支持 image-free 缓存推理（fromCache 参数）
- JSON 模式 describe（结构化 template）
- 架构文档同步最新实现

## 1.1.0

### Minor Changes

- 初始发布：4 个视觉任务工具（visual_describe / visual_locate / visual_ocr / visual_video_analyze）
- 两阶段推理架构：session_id 复用上下文
- 基于 SQLite 的会话持久化
- 多模型分级配置（每工具独立 API 三元组）
