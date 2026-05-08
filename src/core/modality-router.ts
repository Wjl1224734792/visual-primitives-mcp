/**
 * 模态路由器：根据 media_type 分发到对应的媒体适配器
 *
 * 使用注册表模式（Map<string, MediaAdapter>），在模块加载时预注册所有适配器。
 * 未知媒体类型抛出 ModalityRouterError（含支持的媒体类型列表），
 * 由调用方（PipelineOrchestrator）捕获并降级处理。
 *
 * 映射需求：REQ-016（模态路由分发）
 * 任务 ID：TASK-006
 */
import type { MediaAdapter } from '../types.js';

import { ImageAdapter } from './adapters/image-adapter.js';
import { VideoAdapter } from './adapters/video-adapter.js';
import { DocumentAdapter } from './adapters/document-adapter.js';
import { logger } from '../utils/logger.js';

/** 模态路由错误：未知的 media_type */
export class ModalityRouterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModalityRouterError';
  }
}

export class ModalityRouter {
  /** 注册表：mediaType → 对应的 MediaAdapter 实例 */
  private adapters = new Map<string, MediaAdapter>();

  /**
   * 注册一个媒体适配器
   * @param mediaType 媒体类型标识（如 'image'、'application/pdf'）
   * @param adapter 适配器实例
   */
  register(mediaType: string, adapter: MediaAdapter): void {
    this.adapters.set(mediaType, adapter);
    logger.info({ mediaType }, 'ModalityRouter: 注册适配器');
  }

  /**
   * 根据媒体类型查找对应的适配器
   * @param mediaType 媒体类型标识
   * @returns 对应的 MediaAdapter 实例
   * @throws {ModalityRouterError} 未知媒体类型时抛出，消息包含所有已注册的支持类型
   */
  route(mediaType: string): MediaAdapter {
    const adapter = this.adapters.get(mediaType);
    if (!adapter) {
      const supported = [...this.adapters.keys()].join(', ');
      const errorMsg = `不支持的媒体类型: "${mediaType}"，当前支持的类型: ${supported}`;
      logger.warn({ mediaType, supported }, 'ModalityRouter: 未知媒体类型');
      throw new ModalityRouterError(errorMsg);
    }
    return adapter;
  }

  /**
   * 获取所有已注册的媒体类型列表
   * @returns 媒体类型标识数组
   */
  getSupportedTypes(): string[] {
    return [...this.adapters.keys()];
  }
}

/** 全局模态路由器单例，预注册所有适配器 */
const modalityRouter = new ModalityRouter();

// ---- 预注册所有已实现的适配器 ----

// 图片适配器（TASK-004）
modalityRouter.register('image', new ImageAdapter());

// 视频适配器（TASK-007）
modalityRouter.register('video', new VideoAdapter());

// 文档适配器 - PDF（TASK-007）
modalityRouter.register(
  'application/pdf',
  new DocumentAdapter('application/pdf')
);

// 文档适配器 - 纯文本
modalityRouter.register('text/plain', new DocumentAdapter('text/plain'));

// 文档适配器 - Markdown
modalityRouter.register('text/markdown', new DocumentAdapter('text/markdown'));

// 文档适配器 - Office 文档（MVP 返回空数组，不抛异常）
modalityRouter.register(
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  new DocumentAdapter(
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
);

modalityRouter.register(
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  new DocumentAdapter(
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  )
);

modalityRouter.register(
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  new DocumentAdapter(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  )
);

export { modalityRouter };
