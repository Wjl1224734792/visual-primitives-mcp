/**
 * 指标收集（Metrics Registry）
 *
 * 轻量级内存计数器，零依赖。按工具名索引的全局注册表。
 */

import { logger } from './logger.js';

// ---- 类型 ----

export interface ToolMetrics {
  calls: number;
  errors: number;
  cacheHits: number;
  totalLatencyMs: number;
  circuitBreakerTrips: number;
  preprocessSkipped: number;
}

/** 指标快照，包含时间戳 */
export interface MetricsSnapshot {
  timestamp: number;
  tools: Record<string, ToolMetrics>;
}

// ---- MetricsRegistry ----

export class MetricsRegistry {
  private tools: Map<string, ToolMetrics> = new Map();

  private ensureTool(tool: string): ToolMetrics {
    const existing = this.tools.get(tool);
    if (existing) return existing;

    const metrics: ToolMetrics = {
      calls: 0,
      errors: 0,
      cacheHits: 0,
      totalLatencyMs: 0,
      circuitBreakerTrips: 0,
      preprocessSkipped: 0,
    };
    this.tools.set(tool, metrics);
    return metrics;
  }

  recordCall(tool: string): void {
    this.ensureTool(tool).calls++;
  }

  recordError(tool: string): void {
    this.ensureTool(tool).errors++;
  }

  recordCacheHit(tool: string): void {
    this.ensureTool(tool).cacheHits++;
  }

  recordLatency(tool: string, ms: number): void {
    const m = this.ensureTool(tool);
    m.totalLatencyMs += ms;
  }

  recordCircuitBreakerTrip(tool: string): void {
    this.ensureTool(tool).circuitBreakerTrips++;
    logger.warn({ tool }, '断路器已跳闸');
  }

  recordPreprocessSkipped(tool: string): void {
    this.ensureTool(tool).preprocessSkipped++;
  }

  /** 获取所有工具的指标快照 */
  getSnapshot(): MetricsSnapshot {
    const tools: Record<string, ToolMetrics> = {};
    for (const [name, metrics] of this.tools) {
      tools[name] = { ...metrics };
    }
    return { timestamp: Date.now(), tools };
  }

  /** 重置所有指标 */
  reset(): void {
    this.tools.clear();
  }

  /** 获取平均延迟（毫秒） */
  getAverageLatency(tool: string): number {
    const m = this.tools.get(tool);
    if (!m || m.calls === 0) return 0;
    return Math.round(m.totalLatencyMs / m.calls);
  }
}

// ---- 全局单例 ----

export const metricsRegistry = new MetricsRegistry();
