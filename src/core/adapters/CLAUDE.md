# src/core/adapters/ — 模态适配器层

将不同模态输入统一转为 `Base64Image[]`，使核心管道无需关心输入类型。

## 接口契约

```typescript
interface MediaAdapter {
  readonly mediaType: string;
  adapt(input: string): Promise<Base64Image[]>;
}
```

所有适配器必须 `implements MediaAdapter`，接口定义在 [src/types.ts](../types.ts)。

## 适配器

| 文件                  | 输入                     | 输出                   | 特殊处理                                       |
| --------------------- | ------------------------ | ---------------------- | ---------------------------------------------- |
| `base-adapter.ts`     | —                        | —                      | 重新导出 `MediaAdapter` 类型                   |
| `image-adapter.ts`    | JPEG/PNG/GIF/WebP Base64 | 单元素 `Base64Image[]` | >20MB 拒绝，MIME 检测                          |
| `video-adapter.ts`    | MP4/MOV/AVI Base64       | N 帧 `Base64Image[]`   | FFmpeg 抽帧 `fps=1/3`，上限 `MAX_VIDEO_FRAMES` |
| `document-adapter.ts` | PDF/TXT/MD Base64        | N 页 `Base64Image[]`   | pdf-poppler / sharp 渲染，Office MVP 不支持    |

## 降级规则

- 适配器返回空数组 → pipeline 回退到缓存模式
- 任何异常不抛到上层，只 log warn

## 扩展

新增模态：创建新适配器 class `implements MediaAdapter` → 在 `modality-router.ts` 注册一行。

## 参考

- [AGENTS.md](../../AGENTS.md) — 完整架构文档，见 3.5 节适配器层详解
