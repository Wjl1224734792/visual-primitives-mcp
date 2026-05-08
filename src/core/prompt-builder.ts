/**
 * 增强提示词构建器：将结构化锚点数据 + 会话历史 + 用户问题
 * 拼接为文本模型可直接推理的增强提示词
 */
import type { SessionObject, ConversationTurn } from '../types.js';

/** 构建增强提示词的输入参数 */
export interface BuildPromptParams {
  objects: SessionObject[];
  question: string;
  recentHistory?: ConversationTurn[];
  coordinatePrecision: number;
  mediaType?: string;
}

/**
 * 构建增强提示词
 */
export function buildAugmentedPrompt(params: BuildPromptParams): string {
  const { objects, question, recentHistory, coordinatePrecision, mediaType } =
    params;

  const sections: string[] = [];

  sections.push('[多模态空间信息]');
  sections.push(
    '根据对上传内容的精确视觉分析，图中与你的任务相关的关键物体/区域及其坐标如下：'
  );

  sections.push('');
  sections.push('【图像区域】');
  for (const obj of objects) {
    sections.push(formatObject(obj));
  }

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

  sections.push('');
  sections.push('物体间的关键空间/时间/结构关系：');
  sections.push(buildRelationships(objects));

  sections.push('');
  sections.push('[你的推理规则]');
  sections.push(`- 坐标系原点在图像/帧/页面的左上角，x 轴右延，y 轴下延`);
  sections.push(`- 坐标归一化到 0-${String(coordinatePrecision)}`);
  sections.push('- 必须显式引用物体 ID 或坐标进行推理');
  if (mediaType === 'video') {
    sections.push('- 视频场景请结合时间戳和轨迹变化进行分析');
  }

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

  sections.push('');
  sections.push('[用户问题]');
  sections.push(question);
  sections.push('');
  sections.push('请严格依据以上空间信息，逐步推理并回答用户的问题。');

  return sections.join('\n');
}

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

function buildRelationships(objects: SessionObject[]): string {
  if (objects.length <= 1) {
    return '- （仅有一个物体，无空间关系）';
  }

  const relationships: string[] = [];
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

  if (relationships.length === 0) {
    return '- （物体分布密集，请结合坐标自行判断空间关系）';
  }

  return relationships.map(r => `- ${r}`).join('\n');
}
