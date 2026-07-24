/**
 * 并发控制（Concurrency Limiter）
 *
 * 信号量模式，限制同时进行的视觉 API 调用数量。
 * 约 50 行，零外部依赖。
 */

import { logger } from './logger.js';

/**
 * 信号量（Semaphore）：最大并发限制
 */
export class ConcurrencyLimiter {
  private running = 0;
  private readonly queue: Array<{
    resolve: () => void;
    reject: (err: Error) => void;
  }> = [];
  private readonly maxConcurrent: number;

  constructor(maxConcurrent = 10) {
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * 获取信号量许可（自动排队等待）
   */
  acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      this.queue.push({ resolve, reject });
    });
  }

  /**
   * 释放信号量许可（唤醒一个等待者）
   */
  release(): void {
    this.running--;

    const next = this.queue.shift();
    if (next) {
      this.running++;
      next.resolve();
    }
  }

  /**
   * 在并发限制下执行异步函数
   *
   * @param fn 需要执行的函数
   * @returns fn 的返回值
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  /** 当前正在运行的任务数 */
  get runningCount(): number {
    return this.running;
  }

  /** 队列中等待的任务数 */
  get waitingCount(): number {
    return this.queue.length;
  }
}

/** 全局并发限制器单例（默认最大 10 并发） */
let globalLimiter: ConcurrencyLimiter | null = null;

export function getGlobalLimiter(maxConcurrent?: number): ConcurrencyLimiter {
  if (!globalLimiter) {
    globalLimiter = new ConcurrencyLimiter(maxConcurrent ?? 10);
    logger.info(
      { maxConcurrent: maxConcurrent ?? 10 },
      '全局并发限制器已初始化'
    );
  }
  return globalLimiter;
}
