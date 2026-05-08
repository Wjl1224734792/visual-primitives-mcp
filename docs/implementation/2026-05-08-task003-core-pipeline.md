# TASK-003 图片核心管道 -- 后端实现文档

**日期**: 2026-05-08 | **状态**: 完成

---

## 1. 当前实现目标

实现图片核心管道的 4 个子模块 + 2 个模板文件，构成从视觉模型原始响应到增强提示词的完整处理链路。

## 2. 对应需求 ID / 任务 ID

| 标识     | 说明                                           |
| -------- | ---------------------------------------------- |
| TASK-003 | 图片核心管道（解析/校验/归一化/提示词构建）    |
| REQ-006  | 非标 JSON 备用正则解析恢复                     |
| REQ-007  | 坐标验证：范围/合法性/唯一性/质心在 bbox 内    |
| REQ-008  | 坐标归一化到可配置精度                         |
| REQ-009  | 增强提示词含物体标签/bbox/中心点/状态/空间关系 |

## 3. 输入依据

- `docs/tasks/2026-05-08-visual-primitives-mcp-tasks.md` -- TASK-003 完整规范
- `docs/prds/需求文档.md` -- 第三章（Parser/Validator/Prompt Builder）、第九章（视觉模型系统提示词）
- `src/types.ts` -- `VisualObject`, `VisualAnalysisResult`, `SessionObject`, `ConversationTurn` 等共享类型
- `src/config.ts` -- `config` 单例（当前 TASK 未直接使用，预留给调用方）

## 4. 变更文件 / 变更范围

### 新建文件（9 个）

| 文件                                 | 行数 | 说明                                            |
| ------------------------------------ | ---- | ----------------------------------------------- |
| `src/core/parser.ts`                 | ~92  | JSON 主解析 + 正则备用解析 + AnalysisParseError |
| `src/core/validator.ts`              | ~156 | 坐标范围/合法性/唯一性校验 + ValidationError    |
| `src/core/normalizer.ts`             | ~55  | 坐标精度归一化（不可变操作）                    |
| `src/core/prompt-builder.ts`         | ~220 | 增强提示词构建器（含会话历史注入）              |
| `src/templates/vision-system.txt`    | ~20  | 视觉模型系统提示词（与 PRD 第九章一致）         |
| `src/templates/augmented-prompt.txt` | ~22  | 增强提示词参考模板（含 `{{VARIABLE}}` 占位符）  |
| `tests/parser.test.ts`               | ~200 | Parser 单元测试（12 个测试用例）                |
| `tests/validator.test.ts`            | ~260 | Validator 单元测试（31 个测试用例）             |
| `tests/normalizer.test.ts`           | ~180 | Normalizer 单元测试（14 个测试用例）            |

### 未修改文件

- `src/types.ts`（只读引用）
- `src/config.ts`（只读引用）
- 所有其他已有文件

## 5. 实现说明

### 5.1 Parser（`src/core/parser.ts`）

**TDD 流程**：Red（测试先行）-> Green（实现 tryParseContent + regex 回退）-> Refactor（提取 parseContent 为独立函数）

**核心逻辑**：

1. 尝试 `JSON.parse(rawContent)` 提取 `choices[0].message.content`
2. 尝试解析 content 为 `VisualAnalysisResult`
3. 失败时正则 `\{[\s\S]*\}` 贪婪匹配提取第一个完整 JSON 对象
4. 解析成功但 `objects` 为空 → 抛出 `AnalysisParseError`

**关键设计决策**：

- `tryParseContent` 在 JSON 语法错误时返回 `null`（而非抛出），确保触发备用路径
- 仅在 `objects` 为空时抛出 `AnalysisParseError`，JSON 语法错误允许回退到正则

### 5.2 Validator（`src/core/validator.ts`）

**校验规则**（按顺序执行，不通过时立即抛出 `ValidationError`）：

1. `objects` 数组非空
2. `id` 唯一性（Set 检测）
3. `bbox` 四个值均处于 `[0, precision]` 范围
4. `bbox` 合法性：`x1 < x2` 且 `y1 < y2`
5. `centroid` 位置：`cx in [x1, x2]`, `cy in [y1, y2]`
6. 可选字段：`page`（正整数）、`timestamp_range`（`[number, number]` 且 `[0] < [1]`）、`media_type`（合法 MediaType 枚举值）

**`media_type` 合法值集合**：`image`, `video`, `application/pdf`, 三个 Office MIME, `text/plain`, `text/markdown`

### 5.3 Normalizer（`src/core/normalizer.ts`）

**不可变操作**：不修改原数组，返回新数组。

**缩放算法**：

- `scale = targetPrecision / sourcePrecision`
- `bbox` 和 `centroid` 每个分量乘以 `scale` 后四舍五入
- 缩放后保证 `x1 < x2`（若 `x1 >= x2` 则设 `x2 = x1 + 1`，同理 `y1 < y2`）
- 同精度时直接返回浅拷贝

### 5.4 Prompt Builder（`src/core/prompt-builder.ts`）

**输出格式**严格遵循 PRD 3.3 节模板，分段构建：

| 段落                          | 显示条件                                   |
| ----------------------------- | ------------------------------------------ |
| `[多模态空间信息]` + 图像区域 | 始终显示                                   |
| `[视频关键帧索引]`            | `mediaType === 'video'` 且对象含 timestamp |
| `[文档页面区域]`              | `mediaType` 为文档类型且对象含 page        |
| 空间关系                      | 始终显示（单物体提示无关系）               |
| `[推理规则]`                  | 始终显示，含坐标系统说明 + 模态特定规则    |
| `[会话历史]`                  | `recentHistory` 非空（最多取最近 3 轮）    |
| `[用户问题]`                  | 始终显示                                   |

**会话历史注入**：

- 显示上一轮已识别物体列表（`created_round < lastUserTurn.round`）
- 显示上一轮用户问题和助手回答

## 6. 测试和验证结果

### TDD 循环

| 阶段         | 结果                                                                              |
| ------------ | --------------------------------------------------------------------------------- |
| **Red**      | 3 个测试文件全部因模块不存在而加载失败（3 failed suites, 0 tests）                |
| **Green**    | 12+31+14=57 个测试全部通过                                                        |
| **Refactor** | 提取 `tryParseContent` 辅助函数，消除重复的 JSON.parse 错误处理；消除所有非空断言 |

### 最终测试结果

```
tests/parser.test.ts      12 passed
tests/validator.test.ts    31 passed
tests/normalizer.test.ts   14 passed
tests/config.test.ts       26 passed
tests/retry.test.ts         8 passed
tests/adapters/image-adapter.test.ts  8 passed
tests/session-manager.test.ts         16 passed
-----------------------------------------
Total:                    115 passed (7 files)
```

### 自动化验证

| 检查项                                                                                                  | 结果             |
| ------------------------------------------------------------------------------------------------------- | ---------------- |
| `npm run typecheck`                                                                                     | 通过，零类型错误 |
| `npx vitest run`                                                                                        | 通过，115 个测试 |
| `npx eslint src/core/parser.ts src/core/validator.ts src/core/normalizer.ts src/core/prompt-builder.ts` | 通过，零错误     |

## 7. 数据与接口边界

### 导出接口

```typescript
// parser.ts
export class AnalysisParseError extends Error { ... }
export function parseResponse(rawContent: string): VisualAnalysisResult;

// validator.ts
export class ValidationError extends Error { ... }
export function validateObjects(objects: VisualObject[], precision: number): void;

// normalizer.ts
export function normalizeObjects(
  objects: VisualObject[], targetPrecision: number, sourcePrecision: number
): VisualObject[];

// prompt-builder.ts
export interface BuildPromptParams { ... }
export function buildAugmentedPrompt(params: BuildPromptParams): string;
```

### 依赖关系

```
parser.ts     → src/types.ts (VisualAnalysisResult)
validator.ts  → src/types.ts (VisualObject, MediaType)
normalizer.ts → src/types.ts (VisualObject)
prompt-builder.ts → src/types.ts (SessionObject, ConversationTurn)
```

所有模块均为纯函数，无外部副作用。

## 8. 风险 / 未解决项

| 风险                       | 等级 | 说明                                                                                                                  |
| -------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------- |
| 正则贪婪匹配边界           | 低   | 当 content 含多个 JSON 对象且第一个不是分析结果时，可能误提取。当前假设视觉模型输出中第一个 JSON 对象即为分析结果     |
| 空间关系生成               | 低   | `buildRelationships` 基于 bbox x 坐标排序生成简单左右关系，未覆盖上下、重叠等复杂空间关系。实际空间推理由文本模型完成 |
| `noUncheckedIndexedAccess` | 无   | 已通过使用具体索引访问替代解构 + `!` 来规避                                                                           |

## 9. 需要前端配合的点

无。TASK-003 为纯后端核心管道模块，无前端依赖。

## 10. 推荐的下一步

1. **TASK-006（管道编排器）**：将 parser/validator/normalizer/prompt-builder 串联为完整处理流程
2. **Prompt Builder 增强**：在 SessionManager 就绪后，`buildAugmentedPrompt` 可接收来自 `getRecentHistory` 的会话历史数据进行注入
3. **系统提示词注入**：`vision-system.txt` 应由 VisionClient 在构建 API 请求时加载并注入
