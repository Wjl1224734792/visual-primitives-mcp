/**
 * 图片适配器：将 Base64 图像输入透传为统一的 Base64Image 数组
 *
 * Implements MediaAdapter 接口。
 * 支持 JPEG/PNG/GIF/WebP 格式。
 * 超过 20MB（Base64 编码后约 26,666,667 字符）的输入将被拒绝。
 * 空或无效输入不抛异常，返回空数组（降级兜底原则）。
 */
import type { MediaAdapter, Base64Image } from '../../types.js';
import { logger } from '../../utils/logger.js';

/** Base64 编码后约 20MB 原始数据的字符数上限 */
const DEFAULT_MAX_BASE64_LENGTH = 26_666_667;

/** 匹配 data: URL 前缀的正则，捕获 MIME 类型 */
const DATA_URL_PREFIX_REGEX = /^data:(image\/[a-z]+);base64,/i;

/**
 * 检测 Base64 输入的 MIME 类型
 * - 若包含 data: URL 前缀，提取其中的 MIME 类型
 * - 否则默认 image/jpeg
 * @param input Base64 输入字符串
 * @returns MIME 类型字符串
 */
function detectMimeType(input: string): string {
  const match = DATA_URL_PREFIX_REGEX.exec(input);
  if (match && match[1]) {
    return match[1].toLowerCase();
  }
  return 'image/jpeg';
}

/**
 * 去除 data: URL 前缀，返回纯 Base64 数据
 * @param input Base64 输入字符串
 * @returns 纯 Base64 数据（不含 data: URL 前缀）
 */
function stripDataUrlPrefix(input: string): string {
  const match = DATA_URL_PREFIX_REGEX.exec(input);
  if (match) {
    return input.slice(match[0].length);
  }
  return input;
}

export class ImageAdapter implements MediaAdapter {
  /** 适配器支持的媒体类型标识 */
  readonly mediaType = 'image';

  /** 允许的最大 Base64 字符长度（可在测试时传入较小值） */
  private readonly maxBase64Length: number;

  /**
   * @param maxBase64Length 最大 Base64 长度限制，默认约 20MB 编码后长度
   */
  constructor(maxBase64Length?: number) {
    this.maxBase64Length = maxBase64Length ?? DEFAULT_MAX_BASE64_LENGTH;
  }

  /**
   * 适配输入为 Base64Image 数组
   * @param input Base64 图像字符串（可含 data: URL 前缀）
   * @returns Base64Image[] 单元素数组；过大或空输入返回空数组
   */
  adapt(input: string): Promise<Base64Image[]> {
    // 空输入 / 纯空白输入
    if (!input || input.trim().length === 0) {
      logger.warn('ImageAdapter: 输入为空或仅含空白，返回空数组');
      return Promise.resolve([]);
    }

    // 大小检查：超过 20MB 限制
    if (input.length > this.maxBase64Length) {
      logger.warn(
        { inputLength: input.length, maxLength: this.maxBase64Length },
        'ImageAdapter: 输入超过大小限制，返回空数组'
      );
      return Promise.resolve([]);
    }

    const mimeType = detectMimeType(input);
    const rawBase64 = stripDataUrlPrefix(input);

    return Promise.resolve([{ base64: rawBase64, mime_type: mimeType }]);
  }
}
