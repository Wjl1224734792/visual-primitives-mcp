/**
 * OpenAI 兼容视觉模型客户端
 *
 * 支持任意 OpenAI Chat Completions 兼容接口。
 * 提供两个入口：
 *   - chat()：自由文本输出（describe, ocr, video_analyze）
 *   - analyze()：JSON 输出（locate 坐标定位）
 *
 * 图片用 image_url，视频用 video_url，直接发送不做帧提取。
 * 指数退避重试（最多 3 次）。
 */
import { withRetry } from '../utils/retry.js';
import { logger } from '../utils/logger.js';
import type { Base64Image, ModelConfig } from '../types.js';

const VIDEO_MIMES = new Set([
  'video/mp4',
  'video/avi',
  'video/mov',
  'video/mkv',
  'video/webm',
]);

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function buildMessages(
  images: Base64Image[],
  systemPrompt: string,
  userPrompt?: string
): Array<Record<string, unknown>> {
  const userContent: Record<string, unknown>[] = [];
  for (const img of images) {
    const dataUrl = `data:${img.mime_type};base64,${img.base64}`;
    if (VIDEO_MIMES.has(img.mime_type)) {
      userContent.push({ type: 'video_url', video_url: { url: dataUrl } });
    } else {
      userContent.push({ type: 'image_url', image_url: { url: dataUrl } });
    }
  }
  userContent.unshift({
    type: 'text',
    text: userPrompt ?? '请按照系统提示词的要求完成分析。',
  });

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ];
}

function extractStatusCode(errorMessage: string): number {
  const match = errorMessage.match(/错误状态 (\d{3})/);
  if (match && match[1]) return parseInt(match[1], 10);
  return 0;
}

function shouldRetry(error: unknown): boolean {
  if (!(error instanceof Error)) return true;
  if (error.name === 'AbortError') return true;
  if (
    error.name === 'TypeError' &&
    (error.message.includes('fetch') || error.message.includes('Failed'))
  )
    return true;
  const status = extractStatusCode(error.message);
  if (status === 429 || status === 503 || status >= 500) return true;
  if (status > 0 && status < 500) return false;
  return true;
}

const DEGRADED_JSON = JSON.stringify({
  objects: [],
  spatial_relationships: [],
});

export class VisionClient {
  /**
   * 自由文本输出（describe / ocr / video_analyze 用）
   */
  async chat(
    modelConfig: ModelConfig,
    images: Base64Image[],
    systemPrompt: string,
    userPrompt?: string
  ): Promise<string> {
    const url = `${normalizeBaseUrl(modelConfig.baseUrl)}/chat/completions`;
    const messages = buildMessages(images, systemPrompt, userPrompt);

    const body: Record<string, unknown> = {
      model: modelConfig.model,
      messages,
      max_tokens: 4096,
    };

    logger.info(
      { model: modelConfig.model, imageCount: images.length },
      'VisionClient.chat: 开始调用'
    );

    try {
      return await withRetry(
        () => this.doFetch(url, modelConfig.apiKey, body),
        { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 30000, shouldRetry }
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, 'VisionClient.chat: 重试耗尽，降级');
      return '（视觉模型暂时不可用，请稍后重试）';
    }
  }

  /**
   * JSON 输出（locate 坐标定位用）
   */
  async analyze(
    modelConfig: ModelConfig,
    images: Base64Image[],
    systemPrompt: string,
    userPrompt?: string
  ): Promise<string> {
    const url = `${normalizeBaseUrl(modelConfig.baseUrl)}/chat/completions`;
    const messages = buildMessages(images, systemPrompt, userPrompt);

    const body: Record<string, unknown> = {
      model: modelConfig.model,
      messages,
      response_format: { type: 'json_object' as const },
      max_tokens: 4096,
    };

    logger.info(
      { model: modelConfig.model, imageCount: images.length },
      'VisionClient.analyze: 开始调用'
    );

    try {
      return await withRetry(
        () => this.doFetch(url, modelConfig.apiKey, body),
        { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 30000, shouldRetry }
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, 'VisionClient.analyze: 重试耗尽，降级');
      return DEGRADED_JSON;
    }
  }

  private async doFetch(
    url: string,
    apiKey: string,
    body: Record<string, unknown>
  ): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const status = response.status;
        const text = await response.text().catch(() => '无法读取响应体');
        throw new Error(`视觉 API 返回错误状态 ${String(status)}: ${text}`);
      }

      const raw = (await response.json()) as Record<string, unknown>;
      const choices = Array.isArray(raw.choices)
        ? (raw.choices as Array<{ message?: { content?: string } }>)
        : undefined;
      const content = choices?.[0]?.message?.content;

      if (typeof content !== 'string' || content.length === 0) {
        throw new Error('视觉 API 返回的内容为空或格式不正确');
      }

      return content;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
