/**
 * 模态路由器：根据 media_type 分发到对应的媒体适配器
 *
 * 注册表模式，预注册 image 和 video 适配器。
 * 未知媒体类型抛出 ModalityRouterError。
 */
import type { MediaAdapter } from '../types.js';
import { ImageAdapter } from './adapters/image-adapter.js';
import { VideoAdapter } from './adapters/video-adapter.js';
import { logger } from '../utils/logger.js';

export class ModalityRouterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModalityRouterError';
  }
}

export class ModalityRouter {
  private adapters = new Map<string, MediaAdapter>();

  register(mediaType: string, adapter: MediaAdapter): void {
    this.adapters.set(mediaType, adapter);
    logger.info({ mediaType }, 'ModalityRouter: 注册适配器');
  }

  route(mediaType: string): MediaAdapter {
    const adapter = this.adapters.get(mediaType);
    if (!adapter) {
      const supported = [...this.adapters.keys()].join(', ');
      throw new ModalityRouterError(
        `不支持的媒体类型: "${mediaType}"，当前支持: ${supported}`
      );
    }
    return adapter;
  }
}

const modalityRouter = new ModalityRouter();
modalityRouter.register('image', new ImageAdapter());
modalityRouter.register('video', new VideoAdapter());

export { modalityRouter };
