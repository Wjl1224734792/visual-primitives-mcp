/**
 * 配置体系：从环境变量读取并校验，生成 AppConfig
 *
 * 必填变量缺失时抛出明确错误并拒绝启动
 * 可选变量提供合法默认值
 * DB_PATH 目录不存在时自动创建
 */
import { z } from 'zod';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AppConfig } from './types.js';

// ---- Zod Schema ----

const envSchema = z.object({
  /** 视觉模型 API 基础 URL（必填） */
  VISION_API_BASE_URL: z.string().min(1, 'VISION_API_BASE_URL 是必填项'),
  /** 视觉模型 API 密钥（必填） */
  VISION_API_KEY: z.string().min(1, 'VISION_API_KEY 是必填项'),
  /** 视觉模型名称（必填） */
  VISION_MODEL_NAME: z.string().min(1, 'VISION_MODEL_NAME 是必填项'),
  /** 坐标归一化精度，默认 0-1000 */
  COORDINATE_PRECISION: z.enum(['0-100', '0-1000']).default('0-1000'),
  /** MCP 传输协议，默认 stdio */
  MCP_TRANSPORT: z.enum(['stdio', 'sse', 'http-stream']).default('stdio'),
  /** 日志级别，默认 info */
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  /** API 调用超时时间（毫秒），默认 45000 */
  TIMEOUT_MS: z
    .string()
    .default('45000')
    .transform(v => parseInt(v, 10))
    .pipe(z.number().int().positive()),
  /** 会话过期时间（秒），默认 3600 */
  SESSION_TTL_SECONDS: z
    .string()
    .default('3600')
    .transform(v => parseInt(v, 10))
    .pipe(z.number().int().positive()),
  /** SQLite 数据库文件路径，默认 ./data/grounding.db */
  DB_PATH: z.string().default('./data/grounding.db'),
  /** 视频抽帧最大数量，默认 10 */
  MAX_VIDEO_FRAMES: z
    .string()
    .default('10')
    .transform(v => parseInt(v, 10))
    .pipe(z.number().int().min(1).max(30)),
  /** 文档渲染最大页数，默认 20 */
  MAX_DOC_PAGES: z
    .string()
    .default('20')
    .transform(v => parseInt(v, 10))
    .pipe(z.number().int().min(1).max(50)),
  /** HTTP 服务端口（SSE / HTTP Stream 模式），默认 3000 */
  PORT: z
    .string()
    .default('3000')
    .transform(v => parseInt(v, 10))
    .pipe(z.number().int().min(1024).max(65535)),
});

// ---- 配置加载 ----

/**
 * 从 process.env 读取并校验所有配置变量
 * @returns 校验通过后的 AppConfig 对象
 * @throws 必填项缺失或校验失败时抛出 ZodError
 */
export function loadConfig(): AppConfig {
  const parsed = envSchema.parse(process.env);

  // 自动创建 DB_PATH 所在的目录
  const dbDir = dirname(parsed.DB_PATH);
  mkdirSync(dbDir, { recursive: true });

  return {
    visionApiBaseUrl: parsed.VISION_API_BASE_URL,
    visionApiKey: parsed.VISION_API_KEY,
    visionModelName: parsed.VISION_MODEL_NAME,
    coordinatePrecision: parsed.COORDINATE_PRECISION,
    mcpTransport: parsed.MCP_TRANSPORT,
    logLevel: parsed.LOG_LEVEL,
    timeoutMs: parsed.TIMEOUT_MS,
    sessionTtlSeconds: parsed.SESSION_TTL_SECONDS,
    dbPath: parsed.DB_PATH,
    maxVideoFrames: parsed.MAX_VIDEO_FRAMES,
    maxDocPages: parsed.MAX_DOC_PAGES,
    port: parsed.PORT,
  };
}

// ---- 单例 ----

/** 应用配置单例，首次访问时从环境变量加载 */
export const config: AppConfig = loadConfig();
