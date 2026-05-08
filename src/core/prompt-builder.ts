/**
 * 增强提示词构建器：将结构化锚点数据 + 会话历史 + 用户问题
 * 拼接为文本模型可直接推理的增强提示词
 */
import type { SessionObject, ConversationTurn } from '../types.js';

/** 构建增强提示词的输入参数 */
export interface BuildPromptParams {
  /** 会话中累积的全部物体 */
  objects: SessionObject[];
  /** 用户当前问题 */
  question: string;
  /** 最近 N 轮会话历史（可选） */
  recentHistory?: ConversationTurn[];
  /** 坐标精度（100 或 1000） */
  coordinatePrecision: number;
  /** 当前会话媒体类型（可选，用于判断显示视频/文档区域） */
  mediaType?: string;
}

/** 文档类媒体类型 */
const DOCUMENT_MEDIA_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/markdown',
]);

/**
 * 构建增强提示词
 *
 * @param params - 构建参数
 * @returns 拼接完成的增强提示词字符串
 */
export function buildAugmentedPrompt(params: BuildPromptParams): string {
  const { objects, question, recentHistory, coordinatePrecision, mediaType } =
    params;

  const sections: string[] = [];

  // 多模态空间信息头
  sections.push('[多模态空间信息]');
  sections.push(
    '根据对上传内容的精确视觉分析，图中与你的任务相关的关键物体/区域及其坐标如下：'
  );

  // 图像区域
  sections.push('');
  sections.push('【图像区域】');
  for (const obj of objects) {
    sections.push(formatObject(obj));
  }

  // 视频关键帧索引（仅在 video 模态且有 timestamp 数据时显示）
  const hasVideoData =
    mediaType === 'video' && objects.some(o => o.timestamp_start !== undefined);
  if (hasVideoData) {
    sections.push('');
    sections.push('【视频关键帧索引】');
    for (const obj of objects) {
      if (obj.timestamp_start !== undefined) {
        sections.push(formatVideoObject(obj));
      }
    }
  }

  // 文档页面区域（仅在文档模态且有 page 数据时显示）
  const hasDocumentData =
    mediaType !== undefined &&
    DOCUMENT_MEDIA_TYPES.has(mediaType) &&
    objects.some(o => o.page !== undefined);
  if (hasDocumentData) {
    sections.push('');
    sections.push('【文档页面区域】');
    for (const obj of objects) {
      if (obj.page !== undefined) {
        sections.push(formatDocumentObject(obj));
      }
    }
  }

  // 空间/时间/结构关系
  sections.push('');
  sections.push('物体间的关键空间/时间/结构关系：');
  sections.push(buildRelationships(objects));

  // 推理规则
  sections.push('');
  sections.push('[你的推理规则]');
  sections.push(`- 坐标系原点在图像/帧/页面的左上角，x 轴右延，y 轴下延`);
  sections.push(`- 坐标归一化到 0-${String(coordinatePrecision)}`);
  sections.push('- 必须显式引用物体 ID 或坐标进行推理');
  if (mediaType === 'video') {
    sections.push('- 视频场景请结合时间戳和轨迹变化进行分析');
  }
  if (mediaType !== undefined && DOCUMENT_MEDIA_TYPES.has(mediaType)) {
    sections.push('- 文档场景请结合页码和区域位置进行分析');
  }

  // 会话历史（仅当 recentHistory 非空时显示，最多 3 轮）
  if (recentHistory !== undefined && recentHistory.length > 0) {
    sections.push('');
    sections.push('[会话历史]');
    const historyTurns = recentHistory.slice(-3);
    const lastAssistantTurn = historyTurns.findLast(
      t => t.role === 'assistant'
    );
    const lastUserTurn = historyTurns.findLast(t => t.role === 'user');

    const prevObjects = objects.filter(
      o => lastUserTurn !== undefined && o.created_round < lastUserTurn.round
    );

    if (prevObjects.length > 0) {
      sections.push('上一轮你识别并讨论了以下物体：');
      for (const obj of prevObjects) {
        sections.push(`- (id:${String(obj.object_id)}) "${obj.label}" ……`);
      }
    }

    if (lastUserTurn) {
      sections.push(
        `用户上次问的是："${lastUserTurn.content}"${lastAssistantTurn ? `，你回答："${lastAssistantTurn.content}"` : ''}`
      );
    }
  }

  // 用户问题
  sections.push('');
  sections.push('[用户问题]');
  sections.push(question);
  sections.push('');
  sections.push('请严格依据以上空间信息，逐步推理并回答用户的问题。');

  return sections.join('\n');
}

/** 格式化单个图像区域物体 */
function formatObject(obj: SessionObject): string {
  const bboxStr = [
    String(obj.x1),
    String(obj.y1),
    String(obj.x2),
    String(obj.y2),
  ].join(',');
  const centroidStr = [String(obj.cx), String(obj.cy)].join(',');
  const parts: string[] = [
    `- (id:${String(obj.object_id)}) "${obj.label}": bbox[${bboxStr}], 中心[${centroidStr}]`,
  ];
  if (obj.state) {
    parts.push(`  状态: ${obj.state}`);
  }
  if (obj.relevance) {
    parts.push(`  相关度: ${obj.relevance}`);
  }
  return parts.join('\n');
}

/** 格式化视频物体 */
function formatVideoObject(obj: SessionObject): string {
  const tsStart =
    obj.timestamp_start !== undefined
      ? `${obj.timestamp_start.toFixed(1)}s`
      : '?';
  const tsEnd =
    obj.timestamp_end !== undefined ? `${obj.timestamp_end.toFixed(1)}s` : '?';
  const bboxStr = [
    String(obj.x1),
    String(obj.y1),
    String(obj.x2),
    String(obj.y2),
  ].join(',');
  return `- (id:${String(obj.object_id)}) "${obj.label}": 时间段[${tsStart}-${tsEnd}], bbox[${bboxStr}]`;
}

/** 格式化文档物体 */
function formatDocumentObject(obj: SessionObject): string {
  const page = obj.page !== undefined ? `Page ${String(obj.page)}` : '?';
  const bboxStr = [
    String(obj.x1),
    String(obj.y1),
    String(obj.x2),
    String(obj.y2),
  ].join(',');
  return `- (id:${String(obj.object_id)}) "${obj.label}": 位置[${page}], bbox[${bboxStr}]`;
}

/** 基于物体数据生成简单的空间关系描述 */
function buildRelationships(objects: SessionObject[]): string {
  if (objects.length <= 1) {
    return '- （仅有一个物体，无空间关系）';
  }

  const relationships: string[] = [];

  // 基于 bbox 的位置排序，描述相对位置
  const sortedByX = [...objects].sort((a, b) => a.x1 - b.x1);
  for (let i = 0; i < sortedByX.length - 1; i++) {
    const current = sortedByX[i];
    const next = sortedByX[i + 1];
    if (current !== undefined && next !== undefined && current.x2 <= next.x1) {
      relationships.push(
        `(id:${String(current.object_id)}) 在 (id:${String(next.object_id)}) 的左侧`
      );
    }
  }

  // 基于 media_type 区分来源
  const mediaTypes = new Set(objects.map(o => o.media_type).filter(Boolean));
  if (mediaTypes.size > 1) {
    relationships.push(
      '注意：物体来自不同媒体源，ID 前缀相同的物体属于同一来源'
    );
  }

  if (relationships.length === 0) {
    return '- （物体分布密集，请结合坐标自行判断空间关系）';
  }

  return relationships.map(r => `- ${r}`).join('\n');
}
