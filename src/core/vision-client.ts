/**
 * OpenAI 兼容视觉模型客户端
 *
 * 支持任意 OpenAI Chat Completions 兼容接口。
 * 指数退避重试（最多 3 次），45s 超时。
 * 所有重试耗尽后返回降级结果（不抛异常，符合 REQ-017 降级兜底原则）。
 * 日志不记录 Base64 图像数据或 API Key（logger 内置脱敏）。
 */
import { config } from '../config.js';
import { withRetry } from '../utils/retry.js';
import { logger } from '../utils/logger.js';
import type { Base64Image } from '../types.js';

/** 所有重试耗尽后返回的降级 JSON 结果 */
const DEGRADED_RESULT = JSON.stringify({
  reasoning: '视觉模型暂时不可用',
  objects: [],
  spatial_relationships: [],
});

/**
 * 去除 URL 末尾的斜杠，避免路径拼接时出现双斜杠
 * @param url 原始 URL
 * @returns 不含末尾斜杠的 URL
 */
function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/**
 * 构建 OpenAI Chat Completions API 的 messages 数组
 * 将多张图片作为 image_url content block 放入同一请求
 */
function buildMessages(
  images: Base64Image[],
  systemPrompt: string
): Array<Record<string, unknown>> {
  return [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        { type: 'text', text: '请分析上传的内容，按照 JSON 格式输出。' },
        ...images.map(img => ({
          type: 'image_url',
          image_url: {
            url: `data:${img.mime_type};base64,${img.base64}`,
          },
        })),
      ],
    },
  ];
}

/**
 * 从错误消息中提取 HTTP 状态码
 * @param errorMessage 错误消息
 * @returns 状态码；无法提取时返回 0
 */
function extractStatusCode(errorMessage: string): number {
  const match = errorMessage.match(/错误状态 (\d{3})/);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  return 0;
}

export class VisionClient {
  /**
   * 调用视觉模型分析图像
   * @param images 多模态适配器输出的 Base64Image 数组
   * @param systemPrompt 视觉模型系统提示词
   * @returns 模型返回的 JSON 字符串；失败时返回降级 JSON
   */
  async analyze(images: Base64Image[], systemPrompt: string): Promise<string> {
    const baseUrl = normalizeBaseUrl(config.visionApiBaseUrl);
    const url = `${baseUrl}/chat/completions`;
    const messages = buildMessages(images, systemPrompt);

    const requestBody = {
      model: config.visionModelName,
      messages,
      response_format: { type: 'json_object' as const },
      max_tokens: 4096,
    };

    logger.info(
      { model: config.visionModelName, imageCount: images.length },
      'VisionClient: 开始调用视觉模型 API'
    );

    try {
      const result = await withRetry(
        async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => {
            controller.abort();
          }, config.timeoutMs);

          try {
            const response = await fetch(url, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${config.visionApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(requestBody),
              signal: controller.signal,
            });

            if (!response.ok) {
              const status = response.status;
              const errorText = await response
                .text()
                .catch(() => '无法读取错误响应体');
              throw new Error(
                `视觉 API 返回错误状态 ${String(status)}: ${errorText}`
              );
            }

            const raw = (await response.json()) as Record<string, unknown>;
            const rawChoices = raw.choices;

            const choices = Array.isArray(rawChoices)
              ? (rawChoices as Array<{ message?: { content?: string } }>)
              : undefined;
            const content = choices?.[0]?.message?.content;

            if (typeof content !== 'string' || content.length === 0) {
              throw new Error('视觉 API 返回的内容为空或格式不正确');
            }

            return content;
          } finally {
            clearTimeout(timeoutId);
          }
        },
        {
          maxAttempts: 3,
          baseDelayMs: 1000,
          maxDelayMs: 30000,
          shouldRetry: (error: unknown) => {
            if (!(error instanceof Error)) {
              return true;
            }

            // 超时错误（AbortError）
            if (error.name === 'AbortError') {
              return true;
            }

            const msg = error.message;

            // 网络错误（fetch 自身失败，非 HTTP 错误）
            if (
              error.name === 'TypeError' &&
              (msg.includes('fetch') || msg.includes('Failed'))
            ) {
              return true;
            }

            // HTTP 状态码判断
            const status = extractStatusCode(msg);
            if (status === 429 || status === 503 || status >= 500) {
              return true;
            }
            if (status > 0 && status < 500) {
              // 4xx 非 429 不重试
              return false;
            }

            // 未知错误，保守重试
            return true;
          },
        }
      );

      logger.info('VisionClient: 视觉模型 API 调用成功');
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(
        { error: errorMsg },
        'VisionClient: 所有重试耗尽，返回降级结果'
      );
      return DEGRADED_RESULT;
    }
  }
}
