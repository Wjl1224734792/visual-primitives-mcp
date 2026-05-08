# TASK-004 图片适配器与视觉客户端 -- 后端实现文档

## 1. 当前实现目标

完成图片适配器（ImageAdapter）与视觉模型客户端（VisionClient）的实现，使 MCP 服务具备将 Base64 图像输入适配为统一格式并调用 OpenAI 兼容视觉模型 API 的能力。

## 2. 对应需求 ID / 任务 ID

| 项目 | 编号                                                 |
| ---- | ---------------------------------------------------- |
| 任务 | TASK-004                                             |
| 需求 | REQ-003（图片输入支持）、REQ-N04（可扩展适配器接口） |

## 3. 输入依据

- `docs/tasks/2026-05-08-visual-primitives-mcp-tasks.md` -- TASK-004 节
- `docs/prds/需求文档.md` -- 3.0.1 节 (ImageAdapter)、3.1 节 (VisionClient)
- `src/types.ts` -- `MediaAdapter` 接口、`Base64Image` 类型、`VisualAnalysisResult` 类型
- `src/config.ts` -- `config` 单例（`visionApiBaseUrl`、`visionApiKey`、`visionModelName`、`timeoutMs`）
- `src/utils/retry.ts` -- `withRetry` 指数退避重试函数
- `src/utils/logger.ts` -- pino 日志器（含敏感字段脱敏）

## 4. 变更文件 / 变更范围

| 文件                                   | 操作 | 说明                                                           |
| -------------------------------------- | ---- | -------------------------------------------------------------- |
| `src/core/adapters/base-adapter.ts`    | 新建 | 适配器包入口，重新导出 `MediaAdapter` 类型                     |
| `src/core/adapters/image-adapter.ts`   | 新建 | `ImageAdapter implements MediaAdapter`，Base64 透传 + 大小校验 |
| `src/core/vision-client.ts`            | 新建 | `VisionClient` 类，OpenAI 兼容 API 调用封装                    |
| `tests/adapters/image-adapter.test.ts` | 新建 | ImageAdapter 单元测试（8 个用例）                              |

未修改范围外文件（`src/types.ts`、`src/config.ts`、`src/utils/*`、`package.json`、`tsconfig.json` 等）。

## 5. 实现说明

### 5.1 base-adapter.ts（适配器包入口）

- 从 `src/types.ts` 重新导出 `MediaAdapter` 类型
- 作为 `src/core/adapters/` 包的入口，所有模态适配器通过此处引用统一接口
- 遵循任务文档要求：实际接口定义在 types.ts 中已冻结，此处仅为 re-export

### 5.2 ImageAdapter（图片适配器）

**类签名**：`class ImageAdapter implements MediaAdapter`

**核心行为**：

1. `readonly mediaType = 'image'` -- 标识支持的媒体类型
2. `adapt(input: string): Promise<Base64Image[]>` -- 将输入适配为 Base64 图像数组

**处理流程**：

1. 空/纯空白输入 --> 记录 warn 日志，返回空数组（不抛异常）
2. 大小检查：`input.length > maxBase64Length`（默认 26,666,667 字符，约 20MB） --> 记录 warn 日志，返回空数组
3. MIME 类型检测：
   - 若匹配 `data:image/xxx;base64,` 前缀 --> 提取 `image/xxx`
   - 否则默认 `image/jpeg`
4. data: URL 前缀剥离：去除 `data:image/xxx;base64,` 前缀，保留纯 Base64 数据
5. 返回 `[{ base64, mime_type }]`

**设计决策**：

- `maxBase64Length` 作为构造函数参数（默认值来自常量），便于测试时使用较小值，无需生成 26MB 字符串
- 不使用 `async` 关键字（适配逻辑为同步），显式调用 `Promise.resolve()` 满足接口的 `Promise<Base64Image[]>` 返回类型
- 所有异常情况返回空数组而非抛异常，遵循降级兜底原则

### 5.3 VisionClient（视觉模型客户端）

**类签名**：`class VisionClient`

**核心方法**：`async analyze(images: Base64Image[], systemPrompt: string): Promise<string>`

**请求构建**：

- URL：`${normalizeBaseUrl(config.visionApiBaseUrl)}/chat/completions`（处理末尾斜杠）
- Headers：`Authorization: Bearer ${config.visionApiKey}`、`Content-Type: application/json`
- Body：`{ model, messages, response_format: { type: "json_object" }, max_tokens: 4096 }`
- Messages 格式：
  ```typescript
  [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        { type: 'text', text: '请分析上传的内容，按照 JSON 格式输出。' },
        ...images.map(img => ({
          type: 'image_url',
          image_url: { url: `data:${img.mime_type};base64,${img.base64}` },
        })),
      ],
    },
  ];
  ```

**超时控制**：

- 使用 `AbortController` + `setTimeout` 实现 `config.timeoutMs` 超时（默认 45s）
- `clearTimeout` 在 finally 块中确保资源清理

**重试策略**（通过 `withRetry` 包装）：

- `maxAttempts: 3`, `baseDelayMs: 1000`, `maxDelayMs: 30000`
- `shouldRetry` 自定义逻辑：
  - `AbortError`（超时）--> 重试
  - `TypeError` + fetch/network 消息 --> 重试
  - HTTP 429/503/5xx --> 重试
  - HTTP 4xx（非 429）--> 不重试（客户端错误无意义重试）
  - 未知错误 --> 保守重试

**降级处理**：

- 所有重试耗尽后 catch 异常，**不抛异常**，返回降级 JSON：
  ```json
  {
    "reasoning": "视觉模型暂时不可用",
    "objects": [],
    "spatial_relationships": []
  }
  ```
- 错误信息通过 logger.error 记录（不含 Base64/API Key，logger 内置脱敏）

**响应解析**：

- 从 `choices[0].message.content` 提取字符串
- 对 `choices` 进行 Array.isArray 校验，防止非预期响应结构导致崩溃

**安全措施**：

- 日志中不记录 Base64 数据或 API Key（logger 的 `redactSensitive` 机制自动处理）
- `Authorization` header 仅在 fetch 调用中使用，不泄露到日志或其他输出

## 6. 测试和验证结果

### 6.1 测试覆盖（8 个用例全部通过）

| 测试用例                                        | 说明      | 结果 |
| ----------------------------------------------- | --------- | ---- |
| 正常 JPEG Base64 输入返回单元素 Base64Image[]   | 正向路径  | PASS |
| data: URL 前缀携带 PNG 类型时正确提取 MIME 类型 | MIME 检测 | PASS |
| 空字符串输入返回空数组                          | 边界条件  | PASS |
| 纯空白输入返回空数组                            | 边界条件  | PASS |
| 超过大小限制的 Base64 返回空数组                | 大小拒绝  | PASS |
| 恰好等于限制的 Base64 通过校验                  | 边界条件  | PASS |
| mediaType 属性为 "image"                        | 接口契约  | PASS |
| adapt 方法返回 Promise<Base64Image[]>           | 接口契约  | PASS |

### 6.2 自动化验证

| 验证项              | 命令                                                          | 结果               |
| ------------------- | ------------------------------------------------------------- | ------------------ |
| TypeScript 类型检查 | `npx tsc --noEmit`                                            | PASS（零类型错误） |
| ESLint（源文件）    | `npx eslint src/core/adapters/*.ts src/core/vision-client.ts` | PASS（零错误）     |
| 单元测试            | `npx vitest run tests/adapters/image-adapter.test.ts`         | PASS（8/8）        |

### 6.3 已知的不通过项（非 TASK-004 范围）

- `tests/parser.test.ts` 3 个失败 -- TASK-003 问题，parser 正则备用解析逻辑与测试数据不匹配
- `tests/session-manager.test.ts` -- TASK-005 问题，vitest 无法解析 `node:sqlite` 模块
- `tests/*.test.ts` 的 eslint parse error -- TASK-001 遗留问题，`tsconfig.json` 排除 `tests/` 但 eslint 使用 `project: true`

## 7. 数据与接口边界

### 7.1 对外接口契约

**ImageAdapter 实现 `MediaAdapter` 接口**：

```typescript
interface MediaAdapter {
  readonly mediaType: string;
  adapt(input: string): Promise<Base64Image[]>;
}
```

**VisionClient 公共方法**：

```typescript
class VisionClient {
  analyze(images: Base64Image[], systemPrompt: string): Promise<string>;
}
```

### 7.2 导入依赖

| 模块                   | 导入自               | 用法                                                       |
| ---------------------- | -------------------- | ---------------------------------------------------------- |
| `MediaAdapter`（类型） | `../../types.js`     | ImageAdapter implements                                    |
| `Base64Image`（类型）  | `../../types.js`     | adapt 返回值类型                                           |
| `config`               | `../config.js`       | visionApiBaseUrl, visionApiKey, visionModelName, timeoutMs |
| `withRetry`            | `../utils/retry.js`  | 指数退避重试包装                                           |
| `logger`               | `../utils/logger.js` | 结构化日志                                                 |

### 7.3 向外导出

| 导出                        | 模块路径                      | 使用者                              |
| --------------------------- | ----------------------------- | ----------------------------------- |
| `ImageAdapter`              | `./adapters/image-adapter.js` | TASK-006（modality-router.ts）      |
| `VisionClient`              | `./vision-client.js`          | TASK-006（pipeline.ts）             |
| `MediaAdapter`（re-export） | `./adapters/base-adapter.js`  | TASK-007（video/document adapters） |

## 8. 风险 / 未解决项

| 风险                                         | 说明                                         | 缓解                                           |
| -------------------------------------------- | -------------------------------------------- | ---------------------------------------------- |
| `response_format: { type: "json_object" }`   | 部分 OpenAI 兼容 API 可能不支持此参数        | 已在 catch 中实现降级处理                      |
| VisionClient 未做实际 HTTP 调用测试          | 测试阶段使用 mock，生产需要实际 API Key 验证 | 集成测试阶段（TASK-006/008）覆盖               |
| data: URL MIME 检测正则仅匹配 `image/[a-z]+` | 不匹配 `image/svg+xml` 等带特殊字符的 MIME   | 按需求文档仅支持 JPEG/PNG/GIF/WebP，MVP 范围外 |

## 9. 需要前端配合的点

无。此任务为纯后端实现，不涉及前端变更。

## 10. 推荐的下一步

1. TASK-005（SessionManager）完成后，TASK-006（Pipeline Orchestrator）将导入 `ImageAdapter` 和 `VisionClient` 完成端到端集成
2. TASK-007（VideoAdapter / DocumentAdapter）将 `implements MediaAdapter`（从 `base-adapter.ts` 导入）
3. 建议在集成测试阶段（TASK-008）使用真实 API Key 验证 VisionClient 的降级和重试行为
