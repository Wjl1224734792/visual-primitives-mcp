/**
 * 并发控制单元测试
 *
 * 测试 ConcurrencyLimiter 信号量模式的计数、并发上限、异常释放。
 */
import { describe, it, expect, vi } from 'vitest';
import { ConcurrencyLimiter } from '../src/utils/concurrency-limiter.js';

describe('ConcurrencyLimiter - 基本行为', () => {
  it('初始 runningCount 为 0', () => {
    const limiter = new ConcurrencyLimiter(3);
    expect(limiter.runningCount).toBe(0);
    expect(limiter.waitingCount).toBe(0);
  });

  it('async execute 执行并返回结果', async () => {
    const limiter = new ConcurrencyLimiter(3);
    const fn = vi.fn().mockResolvedValue('done');

    const result = await limiter.execute(fn);

    expect(result).toBe('done');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('并发数 ≤ maxConcurrent 时无需排队', async () => {
    const limiter = new ConcurrencyLimiter(3);

    const results = await Promise.all([
      limiter.execute(() => Promise.resolve(1)),
      limiter.execute(() => Promise.resolve(2)),
      limiter.execute(() => Promise.resolve(3)),
    ]);

    expect(results).toEqual([1, 2, 3]);
  });
});

describe('ConcurrencyLimiter - 排队行为', () => {
  it('超过 maxConcurrent 时后续任务排队等待', async () => {
    const limiter = new ConcurrencyLimiter(1);
    const order: number[] = [];

    const p1 = limiter.execute(
      () =>
        new Promise(resolve => {
          order.push(1);
          setTimeout(resolve, 20, 1);
        })
    );
    const p2 = limiter.execute(
      () =>
        new Promise(resolve => {
          order.push(2);
          setTimeout(resolve, 10, 2);
        })
    );

    const results = await Promise.all([p1, p2]);
    expect(results).toEqual([1, 2]);
    // p2 应在 p1 完成后才执行
    expect(order).toEqual([1, 2]);
  });

  it('任务结束后 waitingCount 归零', async () => {
    const limiter = new ConcurrencyLimiter(1);

    await limiter.execute(() => Promise.resolve('ok'));

    expect(limiter.runningCount).toBe(0);
    expect(limiter.waitingCount).toBe(0);
  });
});

describe('ConcurrencyLimiter - 异常释放', () => {
  it('execute 内抛出异常时仍释放信号量', async () => {
    const limiter = new ConcurrencyLimiter(1);

    await limiter
      .execute(() => Promise.reject(new Error('boom')))
      .catch(() => {});

    // 异常后信号量应已释放
    expect(limiter.runningCount).toBe(0);

    // 后续任务可正常执行
    const result = await limiter.execute(() => Promise.resolve('recovered'));
    expect(result).toBe('recovered');
  });

  it('多个 queued 任务异常不影响后续', async () => {
    const limiter = new ConcurrencyLimiter(1);
    const results: string[] = [];

    const p1 = limiter
      .execute(
        () =>
          new Promise(resolve => {
            setTimeout(resolve, 10, 'first');
          })
      )
      .then(r => results.push(r as string));
    const p2 = limiter
      .execute(() => Promise.reject(new Error('boom')))
      .catch(() => results.push('error'));
    const p3 = limiter
      .execute(() => Promise.resolve('third'))
      .then(r => results.push(r as string));

    await Promise.all([p1, p2, p3]);
    expect(results).toEqual(['first', 'error', 'third']);
  });
});

describe('ConcurrencyLimiter - 信号量', () => {
  it('runningCount 精确反映当前并发数', async () => {
    const limiter = new ConcurrencyLimiter(3);

    const promises = [
      limiter.execute(
        () =>
          new Promise(resolve => {
            setTimeout(resolve, 30, 1);
          })
      ),
      limiter.execute(
        () =>
          new Promise(resolve => {
            setTimeout(resolve, 30, 2);
          })
      ),
      limiter.execute(
        () =>
          new Promise(resolve => {
            setTimeout(resolve, 30, 3);
          })
      ),
    ];

    // 所有 3 个槽位已被占用
    expect(limiter.runningCount).toBe(3);

    await Promise.all(promises);

    expect(limiter.runningCount).toBe(0);
  });

  it('默认 maxConcurrent 为 10', () => {
    const limiter = new ConcurrencyLimiter();
    // 10 个并发任务都不应排队
    const tasks = Array.from({ length: 10 }, (_, i) =>
      limiter.execute(() => Promise.resolve(i))
    );

    return expect(Promise.all(tasks)).resolves.toHaveLength(10);
  });
});

describe('ConcurrencyLimiter - acquire / release', () => {
  it('手动 acquire/release 控制并发', async () => {
    const limiter = new ConcurrencyLimiter(2);

    await limiter.acquire();
    expect(limiter.runningCount).toBe(1);

    await limiter.acquire();
    expect(limiter.runningCount).toBe(2);

    // 第 3 次 acquire 会排队（返回未 resolve 的 Promise）
    const acquirePromise = limiter.acquire();

    // 释放一个
    limiter.release();
    expect(limiter.runningCount).toBe(2); // acquire 已被唤醒

    await acquirePromise;

    limiter.release();
    limiter.release();
    expect(limiter.runningCount).toBe(0);
  });
});
