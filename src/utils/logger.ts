/**
 * 结构化日志，基于 pino
 *
 * 安全要求：自动过滤敏感字段（Base64、API Key、token 等），
 * 确保日志中不泄露敏感数据
 */
import { pino } from 'pino';
import type { Logger } from 'pino';
import type { LogLevel } from '../types.js';

/** 需要脱敏的敏感字段关键词（小写，支持部分匹配） */
const SENSITIVE_KEYS = [
  'base64',
  'media_base64',
  'image_base64',
  'apikey',
  'api_key',
  'vision_api_key',
  'authorization',
  'token',
  'secret',
  'password',
];

/**
 * 对对象中的敏感字段进行脱敏处理
 * 匹配规则：key 转小写后包含任一敏感关键词即替换为 [REDACTED]
 * @param obj 需要脱敏的对象（不修改原对象）
 * @returns 脱敏后的新对象
 */
function redactSensitive(
  obj: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_KEYS.some(k => lowerKey.includes(k));
    result[key] = isSensitive ? '[REDACTED]' : value;
  }
  return result;
}

/**
 * 创建指定级别的 pino 日志器实例，附带敏感字段过滤
 * @param level 日志级别
 * @returns 配置了敏感字段脱敏的 Logger 实例
 */
export function createLogger(level: LogLevel): Logger {
  return pino({
    level,
    hooks: {
      logMethod(inputArgs, method) {
        // 遍历所有参数，对对象类型参数进行敏感字段脱敏
        for (let i = 0; i < inputArgs.length; i++) {
          if (typeof inputArgs[i] === 'object' && inputArgs[i] !== null) {
            inputArgs[i] = redactSensitive(
              inputArgs[i] as Record<string, unknown>
            );
          }
        }
        method.apply(this, inputArgs);
      },
    },
  });
}

/** 默认日志器实例（info 级别），附带敏感字段过滤 */
export const logger: Logger = createLogger('info');
