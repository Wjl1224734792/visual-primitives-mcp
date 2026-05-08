# TASK-007 视频适配器与文档适配器 -- 后端实现文档

## 1. 当前实现目标

完成视频适配器（VideoAdapter）与文档适配器（DocumentAdapter）的实现，使 MCP 服务具备将 Base64 视频抽帧为关键帧序列、将 Base64 文档渲染为页面图像的能力。两个适配器均实现 `MediaAdapter` 接口，遵循降级兜底原则（失败不抛异常，返回空数组）。

## 2. 对应需求 ID / 任务 ID

| 项目 | 编号                                                 |
| ---- | ---------------------------------------------------- |
| 任务 | TASK-007                                             |
| 需求 | REQ-004（视频输入与抽帧）、REQ-005（文档输入与渲染） |

## 3. 输入依据

- `docs/tasks/2026-05-08-visual-primitives-mcp-tasks.md` -- TASK-007 节
- `docs/prds/需求文档.md` -- 3.0.2 节 (VideoAdapter)、3.0.3 节 (DocumentAdapter)
- `src/types.ts` -- `MediaAdapter` 接口、`Base64Image` 类型
- `src/config.ts` -- `config` 单例（`maxVideoFrames`、`maxDocPages`）
- `src/core/adapters/image-adapter.ts` -- ImageAdapter 参考实现模式
- `src/core/vision-client.ts` -- `VisionClient` 类（输入消费者，非本次修改）

## 4. 变更文件 / 变更范围

| 文件                                      | 操作 | 说明                                                    |
| ----------------------------------------- | ---- | ------------------------------------------------------- |
| `src/core/adapters/video-adapter.ts`      | 新建 | `VideoAdapter implements MediaAdapter`，ffmpeg 抽帧     |
| `src/core/adapters/document-adapter.ts`   | 新建 | `DocumentAdapter implements MediaAdapter`，PDF/文本渲染 |
| `tests/adapters/video-adapter.test.ts`    | 新建 | VideoAdapter 单元测试（7 个用例）                       |
| `tests/adapters/document-adapter.test.ts` | 新建 | DocumentAdapter 单元测试（11 个用例）                   |
| `src/types/pdf-poppler.d.ts`              | 新建 | pdf-poppler CJS 模块 TypeScript 类型声明                |

未修改范围外文件（`src/types.ts`、`src/config.ts`、`src/core/adapters/base-adapter.ts`、`src/core/adapters/image-adapter.ts`、`src/core/vision-client.ts`、`package.json`、`tsconfig.json` 等）。

## 5. 实现说明

### 5.1 VideoAdapter（视频适配器）

**类签名**：`class VideoAdapter implements MediaAdapter`

**mediaType**：`'video'`

**adapt(input)** 处理流程：

1. **空输入检测**：空字符串或纯空白 → 返回 `Promise.resolve([])`
2. **data: URL 前缀去除**：正则 `/^data:[^;]*;base64,/i` 匹配并剥离前缀
3. **ffmpeg 可用性检查**：`ffmpeg-static` 提供二进制路径，若为 `null` → 返回 `[]` 并记录 warn 日志
4. **Base64 解码与临时文件**：
   - `Buffer.from(rawBase64, 'base64')` 解码
   - 写入 `os.tmpdir()/vision-mcp-video-{uuid}/input.mp4`
5. **ffmpeg 抽帧**（MVP 简化策略，不依赖 ffprobe）：
   - 使用 `-vf fps=1/3` 滤镜：每 3 秒抽一帧
   - `-frames:v {maxFrames}` 限制帧数不超过 `config.maxVideoFrames`
   - `-q:v 2` 控制 JPEG 质量约 85%
   - `execFileSync` 同步执行，120 秒超时
6. **帧收集**：读取生成的 `frame_1.jpg`, `frame_2.jpg`, ... → Base64 字符串
7. **时间戳计算**：`timestamp_sec = (frameIndex - 1) * 3`（近似值，基于 3 秒间隔假设）
8. **临时文件清理**：`finally` 块中使用 `rmSync(workDir, { recursive: true, force: true })`
9. **错误处理**：所有 execFileSync/文件操作异常 → catch 块记录 warn → 返回 `[]`

**技术决策**：

- 使用 `ffmpeg-static` npm 包（零系统依赖，自动下载二进制）
- 不依赖 `ffprobe`（ffmpeg-static 不包含，且避免额外系统依赖）
- 使用 `child_process.execFileSync` 同步调用 ffmpeg（简化 MVP，后续可改为异步流式处理）
- ffmpeg-static 的 ESM 导入使用 `import * as _ffmpeg from 'ffmpeg-static'` + `_ffmpeg.default` 解决 CJS/ESM 互操作问题

### 5.2 DocumentAdapter（文档适配器）

**类签名**：`class DocumentAdapter implements MediaAdapter`

**构造函数**：`constructor(mimeType: string)` -- `mediaType` 从构造参数设置

**adapt(input)** 处理流程（按 MIME 类型分发）：

**PDF 处理**（`application/pdf`）：

1. Base64 解码为 Buffer
2. 写入临时 `.pdf` 文件
3. 使用 `pdf-poppler.convert()` 渲染所有页面为 PNG（pdf-poppler 捆绑 poppler 二进制，零系统依赖）
4. 收集生成的 PNG 文件，按文件名排序保证页码顺序
5. 页数不超过 `config.maxDocPages`
6. 返回 `Base64Image[]`（含 `page_number`）
7. `finally` 块清理临时文件

**TXT/MD 处理**（`text/plain`、`text/markdown`）：

1. Base64 解码为 UTF-8 字符串
2. 按 ~3000 字符/页 分页
3. 每页按 ~80 字符/行 折行
4. 构建 SVG 字符串（800px 宽，白色背景，monospace 14px 黑色文字）
5. 使用 `sharp(Buffer.from(svg))` 渲染 SVG → PNG
6. 返回 `Base64Image[]`（含 `page_number`）
7. 页数不超过 `config.maxDocPages`

**Office 文档处理**（`application/vnd.openxmlformats-officedocument.*`）：

- 记录 warn 日志："Office 文档暂不支持，请转换为 PDF 后重试"
- 返回 `Promise.resolve([])`
- 不抛异常

**未知类型处理**：

- 记录 warn 日志
- 返回 `Promise.resolve([])`
- 不抛异常

**错误处理**：所有渲染步骤异常 → catch 块记录 warn → 返回 `[]`

**技术决策**：

- PDF 渲染使用 `pdf-poppler`（捆绑 poppler 二进制，支持 Windows/Mac）
- `sharp` 本身不支持 PDF（此环境 libvips 未包含 poppler），因此 pDF 不依赖 sharp
- 文本渲染使用 SVG + sharp：sharp 的 librsvg 支持渲染 SVG 为 PNG
- pdf-poppler 类型声明独立于 `src/types/pdf-poppler.d.ts`（不污染共享类型空间）

### 5.3 类型声明文件

`src/types/pdf-poppler.d.ts`：为 CJS 模块 `pdf-poppler` 提供 TypeScript 类型声明，声明了 `convert`、`info`、`imgdata`、`path`、`exec_options` 等导出。

## 6. 测试和验证结果

### 6.1 TypeCheck

```
$ npx tsc --noEmit
(无错误输出)
```

### 6.2 单元测试

```
$ npx vitest run tests/adapters/video-adapter.test.ts tests/adapters/document-adapter.test.ts

Test Files  2 passed (2)
Tests      18 passed (18)
```

**video-adapter.test.ts**（7 个测试）：

- `implements MediaAdapter`：mediaType 验证、adapt 返回类型验证、接口契约验证
- 空输入：空字符串返回 `[]`、空白字符串返回 `[]`
- 降级处理：ffmpeg 不可用时返回 `[]`、无效输入不抛异常

**document-adapter.test.ts**（11 个测试）：

- `implements MediaAdapter`：PDF/TXT/MD 类型 mediaType 验证、adapt 返回类型验证、接口契约验证
- 空输入：PDF/TXT 空字符串返回 `[]`
- Office 文档降级：DOCX/PPTX/XLSX 均返回 `[]` 且不抛异常
- 未知类型降级：`application/octet-stream` 返回 `[]` 且不抛异常

### 6.3 全量测试

```
$ npx vitest run
Test Files  9 passed (9)
Tests      133 passed (133)
```

无回归。

### 6.4 Build

```
$ npx tsc
(BUILD PASSED)
```

`dist/core/adapters/` 目录包含 `video-adapter.js`、`document-adapter.js` 及对应的 `.d.ts` 声明文件。

### 6.5 Lint

```
$ npx eslint src/core/adapters/video-adapter.ts src/core/adapters/document-adapter.ts
(无错误输出)
```

测试文件的 ESLint parserOptions 错误为项目已有配置问题（所有测试文件均受影响，非本次引入）。

## 7. 数据与接口边界

### 7.1 MediaAdapter 接口契约

两个适配器均正确实现 `MediaAdapter` 接口：

```typescript
interface MediaAdapter {
  readonly mediaType: string;
  adapt(input: string): Promise<Base64Image[]>;
}
```

### 7.2 VideoAdapter 输入/输出

| 项目      | 说明                                                                                |
| --------- | ----------------------------------------------------------------------------------- |
| 输入      | Base64 编码的视频字符串（MP4/MOV/AVI/MKV/WebM），可含 `data:video/...;base64,` 前缀 |
| 输出      | `Base64Image[]`，每帧含 `base64`/`mime_type`/`timestamp_sec`                        |
| MIME 类型 | `image/jpeg`（ffmpeg JPEG 输出）                                                    |
| 帧数上限  | `config.maxVideoFrames`（默认 10）                                                  |
| 时间间隔  | 每 3 秒一帧（MVP 固定策略）                                                         |

### 7.3 DocumentAdapter 输入/输出

| MIME 类型         | 处理路径          | 输出 `mime_type` | `page_number` |
| ----------------- | ----------------- | ---------------- | ------------- |
| `application/pdf` | pdf-poppler → PNG | `image/png`      | 有            |
| `text/plain`      | sharp SVG → PNG   | `image/png`      | 有            |
| `text/markdown`   | sharp SVG → PNG   | `image/png`      | 有            |
| Office 文档类型   | 降级：log + `[]`  | --               | --            |
| 其他未知类型      | 降级：log + `[]`  | --               | --            |

页数上限：`config.maxDocPages`（默认 20）。

## 8. 风险 / 未解决项

| 风险                                         | 影响                    | 缓解                                                           |
| -------------------------------------------- | ----------------------- | -------------------------------------------------------------- |
| ffmpeg-static 在某些平台不可用               | 视频抽帧不可用          | 降级返回 `[]` + warn 日志                                      |
| pdf-poppler 要求系统 poppler（Linux 未捆绑） | Linux 上 PDF 渲染不可用 | 降级返回 `[]` + warn 日志；pdf-poppler 捆绑 Windows/Mac 二进制 |
| sharp 的 librsvg 对复杂 SVG 可能渲染异常     | 文本渲染出错            | 降级返回 `[]` + warn 日志（catch 块兜底）                      |
| 抽帧时间戳为近似值（基于 3s 间隔）           | 时间戳不够精确          | MVP 可接受；后续版本可通过 ffprobe 获得精确时间                |
| Office 文档不渲染                            | DOCX/PPTX/XLSX 不可用   | 按计划 MVP 阶段跳过；返回明确提示让用户转 PDF                  |
| 视频处理为同步操作（execFileSync）           | 大视频可能阻塞事件循环  | MVP 可接受；后续可改为异步流式处理或 Worker 线程               |

## 9. 需要前端配合的点

无。两个适配器均为后端内部模块，通过 `ModalityRouter` 注册后自动参与管道编排，前端无需感知。

## 10. 推荐的下一步

1. **TASK-006（管道编排器与模态路由器）**：在 `modality-router.ts` 中注册 VideoAdapter 和 DocumentAdapter，完成多模态路由闭环。
2. **集成测试**：准备真实小样本 MP4 和 PDF 文件（<1MB），验证完整抽帧/渲染流程。
3. **后续迭代**：
   - 引入 `ffprobe` 精确获取视频时长，实现 PRD 3.0.2 节的分档抽帧策略（≤30s/30-120s/>120s）
   - Office 文档渲染（通过 LibreOffice 或第三方 API 将 DOCX/PPTX 转 PDF 后渲染）
   - 视频抽帧改为异步+流式处理，避免同步 FFmpeg 阻塞
