/**
 * 指数退避重试工具测试（TDD Red 阶段）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const RETRY_MODULE = '../src/utils/retry.js';

describe('withRetry - 基本行为', () => {
  it('第一次执行成功时不重试', async () => {
    const { withRetry } = await import(RETRY_MODULE);
    const fn = vi.fn().mockResolvedValue('success');

    const result = await withRetry(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('前 2 次失败第 3 次成功', async () => {
    const { withRetry } = await import(RETRY_MODULE);
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const result = await withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 10,
      maxDelayMs: 100,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('全部失败抛出最后一次错误', async () => {
    const { withRetry } = await import(RETRY_MODULE);
    const lastError = new Error('final failure');
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockRejectedValue(lastError);

    await expect(
      withRetry(fn, {
        maxAttempts: 3,
        baseDelayMs: 10,
        maxDelayMs: 100,
      })
    ).rejects.toThrow('final failure');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('shouldRetry 返回 false 时立即终止重试', async () => {
    const { withRetry } = await import(RETRY_MODULE);
    const error = new Error('non-retryable');
    const fn = vi.fn().mockRejectedValue(error);

    await expect(
      withRetry(fn, {
        maxAttempts: 5,
        baseDelayMs: 10,
        shouldRetry: () => false,
      })
    ).rejects.toThrow('non-retryable');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('shouldRetry 返回 true 时继续重试', async () => {
    const { withRetry } = await import(RETRY_MODULE);
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('retry 1'))
      .mockRejectedValueOnce(new Error('retry 2'))
      .mockResolvedValue('ok');

    const result = await withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 10,
      shouldRetry: () => true,
    });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('withRetry - 延迟时间递增', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('延迟应符合指数退避公式', async () => {
    const { withRetry } = await import(RETRY_MODULE);
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('e1'))
      .mockRejectedValueOnce(new Error('e2'))
      .mockResolvedValue('ok');

    // 使用 mock timer 来验证延迟
    const promise = withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      backoffFactor: 2,
    });

    // 第 1 次失败后应等待 1000ms (1000 * 2^0)
    await vi.advanceTimersByTimeAsync(999);
    expect(fn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    // 现在应该触发了第 2 次调用
    expect(fn).toHaveBeenCalledTimes(2);

    // 第 2 次失败后应等待 2000ms (1000 * 2^1)
    await vi.advanceTimersByTimeAsync(1999);
    expect(fn).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(3);

    const result = await promise;
    expect(result).toBe('ok');
  });

  it('延迟不超过 maxDelayMs', async () => {
    const { withRetry } = await import(RETRY_MODULE);
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    const promise = withRetry(fn, {
      maxAttempts: 3,
      baseDelayMs: 20000,
      maxDelayMs: 5000,
      backoffFactor: 2,
    }).catch(() => {
      // 预期最终失败
    });

    // 第 1 次失败后 delay = min(20000 * 2^0, 5000) = 5000
    await vi.advanceTimersByTimeAsync(5000);
    expect(fn).toHaveBeenCalledTimes(2);

    // 第 2 次失败后 delay = min(20000 * 2^1, 5000) = 5000
    await vi.advanceTimersByTimeAsync(5000);
    expect(fn).toHaveBeenCalledTimes(3);

    await promise;
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe('withRetry - 默认参数', () => {
  it('不传 options 时使用默认值', async () => {
    const { withRetry } = await import(RETRY_MODULE);
    // 默认 maxAttempts=3，第一次失败后再试 2 次
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('e1'))
      .mockRejectedValueOnce(new Error('e2'))
      .mockResolvedValue('ok');

    const result = await withRetry(fn);

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
