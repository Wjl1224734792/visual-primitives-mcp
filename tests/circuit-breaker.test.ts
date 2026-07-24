/**
 * 断路器单元测试
 *
 * 测试 CircuitBreaker 三态状态机的转移逻辑、恢复行为、shouldCountAsFailure 过滤。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
} from '../src/utils/circuit-breaker.js';

// ---- 辅助 ----

function makeBreaker(options?: Record<string, unknown>): CircuitBreaker {
  return new CircuitBreaker('test', options);
}

function fakeError(message: string, name = 'Error'): Error {
  const err = new Error(message);
  err.name = name;
  return err;
}

describe('CircuitBreaker - 基本行为', () => {
  it('初始状态为 CLOSED', () => {
    const breaker = makeBreaker();
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('CLOSED 状态下正常执行不改变状态', async () => {
    const breaker = makeBreaker();
    const fn = vi.fn().mockResolvedValue('ok');

    const result = await breaker.execute(fn);

    expect(result).toBe('ok');
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('连续成功调用不累积失败计数', async () => {
    const breaker = makeBreaker({ failureThreshold: 2 });

    await breaker.execute(() => Promise.resolve('a'));
    await breaker.execute(() => Promise.resolve('b'));
    await breaker.execute(() => Promise.resolve('c'));

    expect(breaker.getState()).toBe('CLOSED');
  });

  it('执行成功后将错误传递出去', async () => {
    const breaker = makeBreaker({ failureThreshold: 2 });
    const err = fakeError('something went wrong');

    await expect(breaker.execute(() => Promise.reject(err))).rejects.toThrow(
      'something went wrong'
    );

    // 仅失败一次，未达到阈值，仍为 CLOSED
    expect(breaker.getState()).toBe('CLOSED');
  });
});

describe('CircuitBreaker - 三态转移', () => {
  it('连续失败达到 failureThreshold 后切换到 OPEN', async () => {
    const breaker = makeBreaker({ failureThreshold: 3 });

    for (let i = 0; i < 3; i++) {
      await breaker
        .execute(() => Promise.reject(fakeError(`fail ${i}`)))
        .catch(() => {});
    }

    expect(breaker.getState()).toBe('OPEN');
  });

  it('OPEN 状态下直接拒绝调用并抛出 CircuitBreakerOpenError', async () => {
    const breaker = makeBreaker({ failureThreshold: 1, recoveryTimeMs: 99999 });

    // 触发熔断
    await breaker
      .execute(() => Promise.reject(fakeError('fail')))
      .catch(() => {});
    expect(breaker.getState()).toBe('OPEN');

    // OPEN 状态下应抛出 CircuitBreakerOpenError
    await expect(breaker.execute(() => Promise.resolve('ok'))).rejects.toThrow(
      CircuitBreakerOpenError
    );

    await expect(breaker.execute(() => Promise.resolve('ok'))).rejects.toThrow(
      '熔断'
    );
  });
});

describe('CircuitBreaker - 恢复逻辑', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('超过 recoveryTimeMs 后切换到 HALF_OPEN', async () => {
    const breaker = makeBreaker({ failureThreshold: 1, recoveryTimeMs: 5000 });

    // 触发熔断
    await breaker
      .execute(() => Promise.reject(fakeError('fail')))
      .catch(() => {});
    expect(breaker.getState()).toBe('OPEN');

    // 前进 5000ms，再次 execute 应进入 HALF_OPEN 并尝试
    vi.advanceTimersByTime(5000);

    // HALF_OPEN 下成功执行应恢复到 CLOSED
    await breaker.execute(() => Promise.resolve('ok'));
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('HALF_OPEN 试探成功 → CLOSED', async () => {
    const breaker = makeBreaker({ failureThreshold: 1, recoveryTimeMs: 1000 });
    // OPEN
    await breaker
      .execute(() => Promise.reject(fakeError('fail')))
      .catch(() => {});
    expect(breaker.getState()).toBe('OPEN');

    vi.advanceTimersByTime(1000);

    // HALF_OPEN → 尝试成功 → CLOSED
    await breaker.execute(() => Promise.resolve('ok'));
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('HALF_OPEN 试探失败 → 重新 OPEN', async () => {
    const breaker = makeBreaker({ failureThreshold: 1, recoveryTimeMs: 1000 });
    // OPEN
    await breaker
      .execute(() => Promise.reject(fakeError('fail')))
      .catch(() => {});
    expect(breaker.getState()).toBe('OPEN');

    vi.advanceTimersByTime(1000);

    // HALF_OPEN → 尝试失败 → 重新 OPEN
    await breaker
      .execute(() => Promise.reject(fakeError('fail again')))
      .catch(() => {});
    expect(breaker.getState()).toBe('OPEN');
  });

  it('从 CLOSED 恢复到 OPEN 后重置失败计数', async () => {
    const breaker = makeBreaker({ failureThreshold: 3, recoveryTimeMs: 1000 });

    for (let i = 0; i < 3; i++) {
      await breaker
        .execute(() => Promise.reject(fakeError(`fail ${i}`)))
        .catch(() => {});
    }
    expect(breaker.getState()).toBe('OPEN');

    vi.advanceTimersByTime(1000);
    await breaker.execute(() => Promise.resolve('ok'));
    expect(breaker.getState()).toBe('CLOSED');

    // 此时失败计数应该已重置，再失败 1 次不应熔断
    await breaker
      .execute(() => Promise.reject(fakeError('fail')))
      .catch(() => {});
    expect(breaker.getState()).toBe('CLOSED');
  });
});

describe('CircuitBreaker - shouldCountAsFailure', () => {
  it('不满足计数条件时不累加 failureCount', async () => {
    const breaker = makeBreaker({
      failureThreshold: 2,
      shouldCountAsFailure: () => false,
    });

    for (let i = 0; i < 5; i++) {
      await breaker
        .execute(() => Promise.reject(fakeError(`fail ${i}`)))
        .catch(() => {});
    }

    expect(breaker.getState()).toBe('CLOSED');
  });

  it('默认判定 AbortError 计入失败', async () => {
    const breaker = makeBreaker({ failureThreshold: 2 });

    await breaker
      .execute(() => Promise.reject(fakeError('timeout', 'AbortError')))
      .catch(() => {});
    await breaker
      .execute(() => Promise.reject(fakeError('timeout2', 'AbortError')))
      .catch(() => {});

    expect(breaker.getState()).toBe('OPEN');
  });
});

describe('CircuitBreaker - HALF_OPEN 并发控制', () => {
  it('halfOpenMaxCalls=1 时只允许一个试探调用', async () => {
    const breaker = makeBreaker({
      failureThreshold: 1,
      recoveryTimeMs: 1,
      halfOpenMaxCalls: 1,
    });

    await breaker
      .execute(() => Promise.reject(fakeError('fail')))
      .catch(() => {});
    expect(breaker.getState()).toBe('OPEN');

    // 手动进入 HALF_OPEN
    vi.useFakeTimers();
    vi.advanceTimersByTime(1);

    // 启动第一个 HALF_OPEN 调用（不等待它完成）
    const p1 = breaker.execute(
      () => new Promise(resolve => setTimeout(resolve, 500, 'ok'))
    );

    // 第二个调用应立即失败（CircuitBreakerOpenError）
    await expect(breaker.execute(() => Promise.resolve('ok'))).rejects.toThrow(
      CircuitBreakerOpenError
    );

    vi.advanceTimersByTime(500);
    const result = await p1;
    expect(result).toBe('ok');
    vi.useRealTimers();
  });
});

describe('CircuitBreaker - reset()', () => {
  it('reset() 将状态恢复为 CLOSED', async () => {
    const breaker = makeBreaker({ failureThreshold: 1 });

    await breaker
      .execute(() => Promise.reject(fakeError('fail')))
      .catch(() => {});
    expect(breaker.getState()).toBe('OPEN');

    breaker.reset();
    expect(breaker.getState()).toBe('CLOSED');
  });

  it('reset() 后可以正常执行', async () => {
    const breaker = makeBreaker({ failureThreshold: 1 });

    await breaker
      .execute(() => Promise.reject(fakeError('fail')))
      .catch(() => {});
    expect(breaker.getState()).toBe('OPEN');

    breaker.reset();

    const result = await breaker.execute(() => Promise.resolve('recovered'));
    expect(result).toBe('recovered');
    expect(breaker.getState()).toBe('CLOSED');
  });
});

describe('CircuitBreaker - CircuitBreakerOpenError', () => {
  it('错误消息包含恢复时间', () => {
    const err = new CircuitBreakerOpenError('test-key', 15000);
    expect(err.message).toContain('test-key');
    expect(err.message).toContain('15');
    expect(err instanceof Error).toBe(true);
  });

  it('错误 name 为 CircuitBreakerOpenError', () => {
    const err = new CircuitBreakerOpenError('test-key', 1000);
    expect(err.name).toBe('CircuitBreakerOpenError');
  });
});
