# Changelog

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
