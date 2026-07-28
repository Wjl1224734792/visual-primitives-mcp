/**
 * OpenAI 兼容视觉模型客户端
 *
 * 支持任意 OpenAI Chat Completions 兼容接口。
 * 只有一个入口：chat()。
 *
 * JSON 结构化的控制权在提示词层（模板末尾注入格式指令），
 * 不在 API 参数层（不使用 response_format / max_tokens）。
 *
 * 直接接受 data URL，根据 MIME 前缀自动选 image_url / video_url。
 * 指数退避重试（最多 3 次）。
 */
import { withRetry } from '../utils/retry.js';
import { logger } from '../utils/logger.js';
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
} from '../utils/circuit-breaker.js';
import { getGlobalLimiter } from '../utils/concurrency-limiter.js';
import { metricsRegistry } from '../utils/metrics.js';
import { config } from '../config.js';
import type { ModelConfig } from '../types.js';

function normalizeBaseUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function extractStatusCode(errorMessage: string): number {
  const match = errorMessage.match(/错误状态 (\d{3})/);
  if (match?.[1]) return parseInt(match[1], 10);
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

export class VisionClient {
  private readonly defaultTimeoutMs: number;
  /** 每模型/工具独立的断路器实例 */
  private readonly breakers: Map<string, CircuitBreaker> = new Map();

  constructor(defaultTimeoutMs?: number) {
    this.defaultTimeoutMs = defaultTimeoutMs ?? config.timeoutMs;
  }

  /** 获取或创建断路器实例，key 为 model-toolName */
  private getBreaker(
    toolName: string,
    modelConfig: ModelConfig
  ): CircuitBreaker {
    const key = `${modelConfig.model}-${toolName}`;
    const existing = this.breakers.get(key);
    if (existing) return existing;

    const breaker = new CircuitBreaker(key, {
      failureThreshold: config.circuitBreakerThreshold,
      recoveryTimeMs: config.circuitBreakerRecoveryMs,
    });
    this.breakers.set(key, breaker);
    return breaker;
  }

  /**
   * 统一视觉 API 调用入口
   *
   * 发送图片/视频 + 提示词到 OpenAI 兼容端点，返回模型原始文本。
   * 不设 response_format / max_tokens —— JSON 格式由提示词模板驱动。
   *
   * @param modelConfig 模型配置（baseUrl/apiKey/model）
   * @param dataUrls Base64 data URL 数组
   * @param systemPrompt 系统提示词（含格式指令）
   * @param userPrompt 用户提示词（可选）
   * @param timeoutMs 超时时间（可选，默认使用配置值）
   * @returns 模型原始文本响应
   */
  async chat(
    modelConfig: ModelConfig,
    dataUrls: string[],
    systemPrompt: string,
    userPrompt?: string,
    timeoutMs?: number
  ): Promise<string> {
    const url = `${normalizeBaseUrl(modelConfig.baseUrl)}/chat/completions`;

    // 构建 user content：图片/视频 media + 文本提示词
    const userContent: Record<string, unknown>[] = [];
    for (const dataUrl of dataUrls) {
      const isVideo = /^data:video\//i.test(dataUrl);
      if (isVideo) {
        userContent.push({ type: 'video_url', video_url: { url: dataUrl } });
      } else {
        userContent.push({ type: 'image_url', image_url: { url: dataUrl } });
      }
    }
    userContent.unshift({
      type: 'text',
      text: userPrompt ?? '请按照系统提示词的要求完成分析。',
    });

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ];

    const body: Record<string, unknown> = {
      model: modelConfig.model,
      messages,
    };
    // 无 response_format、无 max_tokens、无 injectJsonHint
    // 所有厂商统一用这个请求格式

    const effectiveTimeout = timeoutMs ?? this.defaultTimeoutMs;

    logger.info(
      { model: modelConfig.model, dataUrlCount: dataUrls.length },
      'VisionClient.chat: 开始调用'
    );

    try {
      const result = await this.executeWithBreaker('chat', modelConfig, () =>
        withRetry(
          () => this.doFetch(url, modelConfig.apiKey, body, effectiveTimeout),
          { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 30000, shouldRetry }
        )
      );
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, 'VisionClient.chat: 重试耗尽，降级');
      return `（视觉模型暂时不可用，请稍后重试。错误详情：${msg}）`;
    }
  }

  /**
   * 在断路器和并发控制的保护下执行 API 调用
   */
  private async executeWithBreaker<T>(
    toolName: string,
    modelConfig: ModelConfig,
    fn: () => Promise<T>
  ): Promise<T> {
    if (!config.circuitBreakerEnabled) {
      return getGlobalLimiter(config.maxConcurrency).execute(fn);
    }

    const breaker = this.getBreaker(toolName, modelConfig);

    try {
      return await breaker.execute(() =>
        getGlobalLimiter(config.maxConcurrency).execute(fn)
      );
    } catch (error) {
      if (error instanceof CircuitBreakerOpenError) {
        metricsRegistry.recordCircuitBreakerTrip(toolName);
      }
      throw error;
    }
  }

  private async doFetch(
    url: string,
    apiKey: string,
    body: Record<string, unknown>,
    timeoutMs: number
  ): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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
