/**
 * 配置体系：从环境变量读取并校验，生成 AppConfig
 *
 * 分级模型配置：
 *   VISION_API_BASE_URL / VISION_API_KEY / VISION_MODEL_NAME 作为默认值
 *   每个工具可覆盖：VISION_MODEL_DESCRIBE / VISION_MODEL_LOCATE / VISION_MODEL_OCR / VISION_MODEL_VIDEO
 *   不配置则使用默认值，全部 OpenAI 兼容接口
 *
 * 必填变量缺失时抛出明确错误并拒绝启动
 */
import { z } from 'zod';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AppConfig } from './types.js';

// ---- Zod Schema ----

const envSchema = z.object({
  /** 视觉模型 API 基础 URL（必填，所有工具默认使用） */
  VISION_API_BASE_URL: z.string().min(1, 'VISION_API_BASE_URL 是必填项'),
  /** 视觉模型 API 密钥（必填，所有工具默认使用） */
  VISION_API_KEY: z.string().min(1, 'VISION_API_KEY 是必填项'),
  /** 默认视觉模型名称（必填） */
  VISION_MODEL_NAME: z.string().min(1, 'VISION_MODEL_NAME 是必填项'),

  /** visual_describe 专用模型（可选，不配则用 VISION_MODEL_NAME） */
  VISION_MODEL_DESCRIBE: z.string().optional(),
  /** visual_locate 专用模型（可选） */
  VISION_MODEL_LOCATE: z.string().optional(),
  /** visual_ocr 专用模型（可选） */
  VISION_MODEL_OCR: z.string().optional(),
  /** visual_video_analyze 专用模型（可选） */
  VISION_MODEL_VIDEO: z.string().optional(),

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

  const defaultModel = {
    baseUrl: parsed.VISION_API_BASE_URL,
    apiKey: parsed.VISION_API_KEY,
    model: parsed.VISION_MODEL_NAME,
  };

  return {
    vision: defaultModel,
    describe: {
      ...defaultModel,
      model: parsed.VISION_MODEL_DESCRIBE ?? parsed.VISION_MODEL_NAME,
    },
    locate: {
      ...defaultModel,
      model: parsed.VISION_MODEL_LOCATE ?? parsed.VISION_MODEL_NAME,
    },
    ocr: {
      ...defaultModel,
      model: parsed.VISION_MODEL_OCR ?? parsed.VISION_MODEL_NAME,
    },
    video: {
      ...defaultModel,
      model: parsed.VISION_MODEL_VIDEO ?? parsed.VISION_MODEL_NAME,
    },
    coordinatePrecision: parsed.COORDINATE_PRECISION,
    mcpTransport: parsed.MCP_TRANSPORT,
    logLevel: parsed.LOG_LEVEL,
    timeoutMs: parsed.TIMEOUT_MS,
    sessionTtlSeconds: parsed.SESSION_TTL_SECONDS,
    dbPath: parsed.DB_PATH,
    port: parsed.PORT,
  };
}

// ---- 单例 ----

/** 应用配置单例，首次访问时从环境变量加载 */
export const config: AppConfig = loadConfig();
