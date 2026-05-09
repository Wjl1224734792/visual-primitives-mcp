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

/**
 * 空间关系图谱条目：描述两个物体之间的位置关系
 */
export interface SpatialGraphEntry {
  /** "1-2"（小ID-大ID） */
  pair: string;
  /** id 较小的物体 label */
  a_label: string;
  /** id 较大的物体 label */
  b_label: string;
  /** 相对方向关系：如 "右侧"、"上方"、"左上方"、"重叠" */
  relation: string;
  /** 近似像素距离（基于归一化坐标的相对偏移，范围 -1000~1000） */
  dx: number;
  dy: number;
}

/**
 * 构建空间关系图谱：计算所有物体两两之间的位置关系
 *
 * 对 N 个物体生成 N×(N-1)/2 条关系记录，包含方向、距离、重叠判断。
 * 纯数学计算，零 API 调用。
 */
export function buildSpatialGraph(
  objects: SessionObject[]
): SpatialGraphEntry[] {
  if (objects.length <= 1) return [];

  const entries: SpatialGraphEntry[] = [];
  const sorted = [...objects].sort((a, b) => a.object_id - b.object_id);

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      if (!a || !b) continue;
      const dx = b.cx - a.cx;
      const dy = b.cy - a.cy;

      // 判断重叠
      const overlapX = Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1));
      const overlapY = Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));
      const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
      const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
      const overlapRatio =
        Math.min(areaA, areaB) > 0
          ? (overlapX * overlapY) / Math.min(areaA, areaB)
          : 0;

      let relation: string;
      if (overlapRatio > 0.5) {
        relation = '重叠/包含';
      } else {
        const hDir = Math.abs(dx) < 30 ? '' : dx > 0 ? '右侧' : '左侧';
        const vDir = Math.abs(dy) < 30 ? '' : dy > 0 ? '下方' : '上方';
        relation = `${vDir}${hDir}` || '重叠';
      }

      entries.push({
        pair: `${String(a.object_id)}-${String(b.object_id)}`,
        a_label: a.label,
        b_label: b.label,
        relation,
        dx: Math.round(dx),
        dy: Math.round(dy),
      });
    }
  }

  return entries;
}

/**
 * 将空间图谱格式化为文本模型可读的自然语言
 */
export function formatSpatialGraph(entries: SpatialGraphEntry[]): string {
  if (entries.length === 0) return '（物体数量不足，无空间关系图谱）';

  const lines = entries.map(
    e =>
      `- ${e.a_label}(id:${e.pair.split('-')[0]}) 与 ${e.b_label}(id:${e.pair.split('-')[1]}): ` +
      `${e.relation}，水平偏移${e.dx} 垂直偏移${e.dy}`
  );

  return `【预计算空间关系图谱 · 共${String(entries.length)}条关系】\n${lines.join('\n')}`;
}
