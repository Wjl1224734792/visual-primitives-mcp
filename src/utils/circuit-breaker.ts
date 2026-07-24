/**
 * 断路器（Circuit Breaker）
 *
 * 三态状态机，零外部依赖，约 80 行。
 * 对连续失败自动熔断，保护下游视觉 API 服务。
 *
 * 状态转移：
 *   CLOSED ──连续失败 ≥ failureThreshold──→ OPEN
 *   OPEN   ──recoveryTimeMs 后────────→ HALF_OPEN
 *   HALF_OPEN ──试探成功──────────────→ CLOSED
 *   HALF_OPEN ──试探失败──────────────→ OPEN
 */

import { logger } from './logger.js';

// ---- 类型 ----

export interface CircuitBreakerOptions {
  /** 连续失败 N 次后熔断，默认 5 */
  failureThreshold: number;
  /** 熔断恢复时间（毫秒），默认 30_000 */
  recoveryTimeMs: number;
  /** 半开状态最大试探调用数，默认 1 */
  halfOpenMaxCalls: number;
  /** 判断错误是否计入失败计数，默认只计 5xx / 网络 / 超时 */
  shouldCountAsFailure?: (error: Error) => boolean;
}

type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/** 断路器熔断时抛出的错误 */
export class CircuitBreakerOpenError extends Error {
  constructor(breakerKey: string, retryAfterMs: number) {
    super(
      `[熔断] 服务 "${breakerKey}" 暂时不可用，${Math.ceil(retryAfterMs / 1000)} 秒后自动恢复`
    );
    this.name = 'CircuitBreakerOpenError';
  }
}

// ---- 默认配置 ----

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  recoveryTimeMs: 30_000,
  halfOpenMaxCalls: 1,
};

/**
 * 默认故障判定：仅服务器错误（5xx）、网络错误、超时计入失败计数
 */
function defaultShouldCountAsFailure(error: Error): boolean {
  if (error.name === 'AbortError') return true;
  if (
    error.name === 'TypeError' &&
    (error.message.includes('fetch') || error.message.includes('Failed'))
  )
    return true;
  const status = extractStatusCode(error.message);
  if (status >= 500 || status === 429) return true;
  if (status > 0 && status < 500) return false;
  return true;
}

function extractStatusCode(message: string): number {
  const match = message.match(/错误状态 (\d{3})/);
  return match?.[1] ? parseInt(match[1], 10) : 0;
}

// ---- CircuitBreaker ----

export class CircuitBreaker {
  private state: BreakerState = 'CLOSED';
  private failureCount = 0;
  private openedAt = 0;
  private halfOpenCalls = 0;
  private readonly key: string;
  private readonly options: CircuitBreakerOptions;

  constructor(key: string, options?: Partial<CircuitBreakerOptions>) {
    this.key = key;
    this.options = {
      failureThreshold:
        options?.failureThreshold ?? DEFAULT_OPTIONS.failureThreshold,
      recoveryTimeMs: options?.recoveryTimeMs ?? DEFAULT_OPTIONS.recoveryTimeMs,
      halfOpenMaxCalls:
        options?.halfOpenMaxCalls ?? DEFAULT_OPTIONS.halfOpenMaxCalls,
      shouldCountAsFailure:
        options?.shouldCountAsFailure ?? defaultShouldCountAsFailure,
    };
  }

  /**
   * 在断路器保护下执行异步函数
   *
   * @param fn 需要被保护的异步函数
   * @returns fn 的返回值
   * @throws CircuitBreakerOpenError 断路器打开时
   * @throws 原错误 fn 执行失败时
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // 检查是否可以执行
    if (this.state === 'OPEN') {
      if (Date.now() - this.openedAt >= this.options.recoveryTimeMs) {
        this.transitionTo('HALF_OPEN');
      } else {
        const retryAfterMs =
          this.options.recoveryTimeMs - (Date.now() - this.openedAt);
        throw new CircuitBreakerOpenError(this.key, retryAfterMs);
      }
    }

    // HALF_OPEN 状态下的并发限制
    if (
      this.state === 'HALF_OPEN' &&
      this.halfOpenCalls >= this.options.halfOpenMaxCalls
    ) {
      throw new CircuitBreakerOpenError(this.key, this.options.recoveryTimeMs);
    }

    if (this.state === 'HALF_OPEN') {
      this.halfOpenCalls++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /** 获取当前状态（仅供测试和指标收集） */
  getState(): BreakerState {
    return this.state;
  }

  /** 重置到 CLOSED 状态（仅供测试） */
  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.openedAt = 0;
    this.halfOpenCalls = 0;
  }

  // ---- 私有方法 ----

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.transitionTo('CLOSED');
    }
    // CLOSED 状态下重置失败计数
    this.failureCount = 0;
    this.halfOpenCalls = 0;
  }

  private onFailure(error: Error): void {
    if (this.state === 'HALF_OPEN') {
      this.transitionTo('OPEN');
      return;
    }

    const shouldCount = this.options.shouldCountAsFailure?.(error);
    if (shouldCount !== true) return;

    this.failureCount++;
    if (
      this.state === 'CLOSED' &&
      this.failureCount >= this.options.failureThreshold
    ) {
      this.transitionTo('OPEN');
    }
  }

  private transitionTo(newState: BreakerState): void {
    const oldState = this.state;
    this.state = newState;

    if (newState === 'OPEN') {
      this.openedAt = Date.now();
      this.halfOpenCalls = 0;
      logger.info(
        { breakerKey: this.key, oldState, failureCount: this.failureCount },
        '断路器状态变更: OPEN（熔断）'
      );
    } else if (newState === 'HALF_OPEN') {
      this.halfOpenCalls = 0;
      logger.info(
        { breakerKey: this.key, oldState },
        '断路器状态变更: HALF_OPEN（试探恢复）'
      );
    } else if (newState === 'CLOSED') {
      this.failureCount = 0;
      this.halfOpenCalls = 0;
      logger.info(
        { breakerKey: this.key, oldState },
        '断路器状态变更: CLOSED（已恢复）'
      );
    }
  }
}
