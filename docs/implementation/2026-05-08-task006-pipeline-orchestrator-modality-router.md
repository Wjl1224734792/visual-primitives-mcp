# TASK-006：管道编排器与模态路由器 -- 实现文档

## 1. 当前实现目标

实现 `PipelineOrchestrator`（管道编排器）和 `ModalityRouter`（模态路由器），这是整个项目的集成核心，协调所有已完成模块。任何单点异常不导致进程崩溃（REQ-N05）。

## 2. 对应需求 ID / 任务 ID

| 标识     | 说明                                 |
| -------- | ------------------------------------ |
| TASK-006 | 管道编排器与模态路由器               |
| REQ-001  | 管道核心逻辑（多轮处理流程）         |
| REQ-016  | 多轮增强提示词包含会话历史摘要       |
| REQ-017  | 视觉分析失败时降级提示词，不中断服务 |
| REQ-N01  | 低延迟：单模态 P95 < 5s              |
| REQ-N02  | 高可用：含重试成功率 > 99.5%         |
| REQ-N05  | 稳定性：任何单点异常不导致进程崩溃   |

## 3. 变更文件 / 变更范围

| 文件                          | 操作 | 行数  |
| ----------------------------- | ---- | ----- |
| `src/core/modality-router.ts` | 新建 | ~100  |
| `src/core/pipeline.ts`        | 新建 | ~440  |
| `tests/pipeline.test.ts`      | 新建 | ~1140 |

**总计**：~1,680 行（含测试）

## 4. 业务规则说明

### 4.1 ModalityRouter（注册表模式）

- 私有 `Map<string, MediaAdapter>` 注册表
- `register(mediaType, adapter)`：注册适配器到映射表
- `route(mediaType)`：查找适配器，未知类型抛出 `ModalityRouterError`（含支持的媒体类型列表）
- `getSupportedTypes()`：返回所有已注册的 mediaType
- 模块加载时预注册 8 种媒体类型的所有适配器（Image、Video、PDF、TXT、MD、DOCX、PPTX、XLSX）

### 4.2 PipelineOrchestrator（多轮处理流程）

完整流程（PRD 3.5 节）：

```
1. 获取或创建会话（幂等：重复创建返回已有会话）
2. 计算对话轮次（从 recentHistory 推算，首轮=1）
3. 判断坐标来源：
   ├─ 无 mediaBase64 → fromCache=true，跳过视觉管道
   └─ 有 mediaBase64 + mediaType → 执行视觉管道：
       4. ModalityRouter 路由选择适配器
       5. Adapter.adapt() 转换媒体为 Base64Image[]
       6. VisionClient.analyze() 调用视觉模型
       7. parseResponse() + validateObjects() + normalizeObjects()
       8. SessionManager.upsertObjects() 合并入库
4. 获取最新会话上下文
5. PromptBuilder.buildAugmentedPrompt() 构建增强提示词
6. 记录本轮对话（user + assistant）
7. 返回 PipelineOutput
```

### 4.3 视觉分析辅助函数

`visualAnalysisToSessionObjects()`：将 `VisualObject[]` 转换为 `SessionObject[]`，映射字段：

- `obj.id` → `object_id`
- `obj.bbox[0..3]` → `x1, y1, x2, y2`
- `obj.centroid[0..1]` → `cx, cy`
- `obj.state || '正常'` → `state`
- `obj.relevance || '中'` → `relevance`
- `obj.page ?? undefined` → `page`
- `obj.timestamp_range?.[0..1]` → `timestamp_start, timestamp_end`
- `obj.media_type || inputMediaType` → `media_type`
- `round` → `created_round`

## 5. 状态机 / 状态转换说明

### 5.1 fromCache 状态转换

```
初始: fromCache = false

┌─ 无 mediaBase64 ─────────────────────► fromCache = true（直接缓存命中）
│
├─ 有 mediaBase64 + mediaType
│   ├─ 路由失败 / 适配器失败 / 空数组 ──► fromCache = true（降级为缓存）
│   ├─ 视觉 API 调用成功但解析失败 ─────► fromCache = false（API 成本已发生）
│   └─ 全部成功 ───────────────────────► fromCache = false（正常路径）
│
└─ 仅 mediaBase64 无 mediaType
    └─ fromCache 保持初始值 = false（无操作路径）
```

### 5.2 visualAnalysis 状态

```
visualAnalysis = null（初始）

├─ 缓存路径 ──────────────────────────► visualAnalysis = null
├─ 视觉管道成功 ──────────────────────► visualAnalysis = { reasoning, objects, spatial_relationships }
└─ 视觉管道任何步骤失败 ──────────────► visualAnalysis = null（降级，不崩溃）
```

## 6. 权限与幂等性说明

- **幂等性**：
  - `createSession()`：使用 `INSERT OR IGNORE`，重复调用返回已有会话
  - `upsertObjects()`：augment 策略为新物体分配递增 ID；replace 策略先清空再插入
  - 整体 `execute()` 方法：同一输入多次调用产生一致的会话状态
- **权限**：无用户级别权限控制（MCP 工具由上层注册层控制访问）
- **会话隔离**：不同 session_id 的数据完全隔离（SQLite WHERE session_id 过滤）

## 7. 测试和验证结果

### 7.1 测试覆盖

| 测试编号 | 测试名称                                                   | 状态 |
| -------- | ---------------------------------------------------------- | ---- |
| T1       | Cache Hit：无新媒体 → from_cache=true，不调用 VisionClient | PASS |
| T2       | Cache Miss + Image：新会话 + 图片 → 完整管道               | PASS |
| T3       | Augment 策略：新旧物体共存                                 | PASS |
| T4       | Replace 策略：旧物体被替换                                 | PASS |
| T5       | 降级：VisionClient 返回不可解析 JSON → 降级提示词          | PASS |
| T6       | 降级：适配器返回空数组 → fromCache=true                    | PASS |
| T7       | 降级：未知 media_type → ModalityRouter 抛出 → 降级         | PASS |
| T8       | 降级：整体异常（SessionManager 抛异常）→ 不崩溃            | PASS |
| T9       | 多轮对话记录：3 轮后 round 正确                            | PASS |
| T10      | from_cache 字段正确性：无媒体=true，有媒体=false           | PASS |
| T11      | ModalityRouter: register/route/getSupportedTypes           | PASS |
| T12      | 降级：Validator 校验失败 → 降级提示词                      | PASS |

### 7.2 自动化验证

```
TypeScript type-check: PASS (zero errors)
ESLint (source files): PASS (zero errors)
Unit tests (pipeline): 14/14 PASS
Full test suite: 147/147 PASS (10 test suites)
```

## 8. 风险 / 未解决项

| 风险                      | 等级 | 说明                                                     | 缓解                          |
| ------------------------- | ---- | -------------------------------------------------------- | ----------------------------- |
| 系统提示词文件不存在      | 低   | `vision-system.txt` 丢失时使用内联后备提示词             | 模块加载时 catch + 降级       |
| 会话上下文为 null         | 低   | getSession 返回 null 时 objects/recentHistory 使用空数组 | `??` 运算符兜底               |
| ModalityRouter 预注册失败 | 低   | 适配器构造函数无副作用                                   | 注册失败会在首次 route 时发现 |
| 测试文件 ESLint 报错      | 已知 | `project: true` 但 tsconfig 不包含 tests/                | 不影响功能，为全局配置问题    |

## 9. 推荐的下一步

1. **TASK-008**：MCP 服务入口、传输层与工具处理器 —— 将 PipelineOrchestrator 挂载到 MCP 工具 `multimodal_grounding_augment`
2. 接口冻结：`modality-router.ts` 和 `pipeline.ts` 的公共接口已稳定，后续 TASK 可安全依赖
