/**
 * 视频适配器：将 Base64 视频输入透传为 Base64Image 数组
 *
 * 直接透传 Base64，不做帧提取——DashScope 等视觉模型原生理解视频。
 * 支持 MP4/AVI/MOV/MKV/WebM 格式。
 * 超过 100MB 的输入将被拒绝。
 */
import type { MediaAdapter, Base64Image } from '../../types.js';
import { logger } from '../../utils/logger.js';

const MAX_BASE64_LENGTH = 133_333_333; // 约 100MB 编码后

const DATA_URL_PREFIX_REGEX = /^data:(video\/[a-z0-9]+);base64,/i;

function detectMimeType(input: string): string {
  const match = DATA_URL_PREFIX_REGEX.exec(input);
  if (match && match[1]) return match[1].toLowerCase();
  return 'video/mp4';
}

function stripDataUrlPrefix(input: string): string {
  const match = DATA_URL_PREFIX_REGEX.exec(input);
  if (match) return input.slice(match[0].length);
  return input;
}

export class VideoAdapter implements MediaAdapter {
  readonly mediaType = 'video';

  adapt(input: string): Promise<Base64Image[]> {
    if (!input || input.trim().length === 0) {
      logger.warn('VideoAdapter: 输入为空，返回空数组');
      return Promise.resolve([]);
    }

    if (input.length > MAX_BASE64_LENGTH) {
      logger.warn(
        { inputLength: input.length, maxLength: MAX_BASE64_LENGTH },
        'VideoAdapter: 超过 100MB 限制，返回空数组'
      );
      return Promise.resolve([]);
    }

    const mimeType = detectMimeType(input);
    const rawBase64 = stripDataUrlPrefix(input);

    return Promise.resolve([{ base64: rawBase64, mime_type: mimeType }]);
  }
}
