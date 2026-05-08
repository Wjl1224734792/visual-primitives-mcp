/**
 * 响应解析器：从视觉模型原始响应中提取 VisualAnalysisResult
 *
 * 主路径：JSON.parse(choices[0].message.content)
 * 备用路径：正则提取第一个完整 JSON 对象
 */
import type { VisualAnalysisResult } from '../types.js';

/** 解析失败时抛出的错误 */
export class AnalysisParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalysisParseError';
  }
}

/**
 * 解析视觉模型原始响应，提取结构化分析结果
 *
 * @param rawContent - 视觉模型 API 返回的原始响应字符串
 * @returns 解析后的 VisualAnalysisResult
 * @throws {AnalysisParseError} 无法解析或 objects 为空时
 */
export function parseResponse(rawContent: string): VisualAnalysisResult {
  let contentStr = rawContent;

  // 主路径：尝试解析为 API 响应，提取 choices[0].message.content
  try {
    const apiResponse = JSON.parse(rawContent) as Record<string, unknown>;
    const choices = apiResponse.choices as
      | Array<{
          message?: { content?: string };
        }>
      | undefined;
    if (choices?.[0]?.message?.content) {
      contentStr = choices[0].message.content;
    }
  } catch {
    // rawContent 不是有效 JSON API 响应，直接将其作为内容处理
  }

  // 尝试直接解析 contentStr 为 VisualAnalysisResult
  const directResult = tryParseContent(contentStr);
  if (directResult !== null) {
    return directResult;
  }

  // 备用路径：正则提取第一个完整 JSON 对象
  const match = contentStr.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new AnalysisParseError(
      'unable to parse analysis response: no valid JSON found'
    );
  }

  const fallbackResult = tryParseContent(match[0]);
  if (fallbackResult === null) {
    throw new AnalysisParseError(
      'unable to parse analysis response: extracted JSON is invalid'
    );
  }

  return fallbackResult;
}

/**
 * 尝试将 JSON 字符串解析为 VisualAnalysisResult
 *
 * @returns 解析成功时返回结果，JSON 语法错误返回 null
 * @throws {AnalysisParseError} objects 数组为空时
 */
function tryParseContent(jsonStr: string): VisualAnalysisResult | null {
  let result: Record<string, unknown>;

  try {
    result = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    return null;
  }

  const objects = result.objects as VisualAnalysisResult['objects'] | undefined;
  if (!objects || !Array.isArray(objects) || objects.length === 0) {
    throw new AnalysisParseError('no objects found in analysis result');
  }

  return {
    reasoning:
      typeof result.reasoning === 'string' ? result.reasoning : undefined,
    objects,
    spatial_relationships: Array.isArray(result.spatial_relationships)
      ? (result.spatial_relationships as string[])
      : undefined,
  };
}
