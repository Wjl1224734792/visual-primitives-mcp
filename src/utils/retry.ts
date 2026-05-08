/**
 * 指数退避重试工具
 *
 * 用于视觉模型 API 调用的自动重试，不记录完整 base64 到日志
 */

/** 重试选项 */
export interface RetryOptions {
  /** 最大尝试次数（含首次），默认 3 */
  maxAttempts?: number;
  /** 基础延迟时间（毫秒），默认 1000 */
  baseDelayMs?: number;
  /** 最大延迟时间（毫秒），默认 30000 */
  maxDelayMs?: number;
  /** 退避因子，默认 2 */
  backoffFactor?: number;
  /** 判断错误是否应重试，默认所有错误都重试 */
  shouldRetry?: (error: unknown) => boolean;
}

/**
 * 对异步函数执行指数退避重试
 *
 * 每次重试的延迟 = min(baseDelayMs * backoffFactor^attempt, maxDelayMs)
 * 重试耗尽后抛出最后一次错误
 *
 * @param fn 需要重试的异步函数
 * @param options 重试选项
 * @returns fn 的返回值
 * @throws 所有重试都失败时抛出最后一次错误
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    backoffFactor = 2,
    shouldRetry = () => true,
  } = options ?? {};

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // 最后一次尝试或不应重试时，立即抛出
      if (attempt === maxAttempts - 1 || !shouldRetry(error)) {
        throw error;
      }

      // 计算指数退避延迟
      const delay = Math.min(
        baseDelayMs * Math.pow(backoffFactor, attempt),
        maxDelayMs
      );

      // 延迟日志不记录完整 base64，仅记录错误类型
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.warn(
        `[retry] 第 ${String(attempt + 1)} 次尝试失败，${String(delay)}ms 后重试（${String(maxAttempts - attempt - 1)} 次剩余）: ${errorMessage}`
      );

      await new Promise<void>(resolve => setTimeout(resolve, delay));
    }
  }

  // 理论上不会执行到这里（循环内已处理）
  throw lastError;
}
