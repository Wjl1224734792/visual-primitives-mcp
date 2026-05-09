/**
 * 管道编排器（Pipeline Orchestrator）
 *
 * 任务调度核心：4 个任务方法，每个使用独立的模型配置和系统提示词。
 * 协调 SessionManager + VisionClient + Parser + Validator + Normalizer。
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  DescribeInput,
  DescribeOutput,
  DescribeObject,
  LocateInput,
  LocateOutput,
  OcrInput,
  VideoAnalyzeInput,
  VideoAnalyzeOutput,
  VisualAnalysisResult,
  SessionObject,
  VisualObject,
  ConversationTurn,
} from '../types.js';

import { config } from '../config.js';
import { SessionManager } from './session-manager.js';
import { VisionClient } from './vision-client.js';
import { parseResponse } from './parser.js';
import { validateObjects } from './validator.js';
import { normalizeObjects } from './normalizer.js';
import { buildAugmentedPrompt } from './prompt-builder.js';
import { logger } from '../utils/logger.js';

// ---- 系统提示词缓存 ----

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATE_DIR = join(__dirname, '..', 'templates');

function loadTemplate(filename: string, fallback: string): string {
  try {
    return readFileSync(join(TEMPLATE_DIR, filename), 'utf-8');
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error({ error: errMsg, filename }, '无法加载模板，使用后备提示词');
    return fallback;
  }
}

const describeSystemPrompt = loadTemplate(
  'describe-structured.txt',
  '你是一个结合场景描述与坐标定位的视觉分析专家。'
);

const locateSystemPrompt = loadTemplate(
  'locate-system.txt',
  '你是一个精确空间定位模型。请输出定位物体的 JSON 坐标。'
);

const ocrSystemPrompt = loadTemplate(
  'ocr-system.txt',
  '你是一个专业的 OCR 文字识别助手。请提取图片中的所有文字。'
);

// ---- 辅助函数 ----

function visualToSessionObjects(
  objects: VisualObject[],
  mediaType: string,
  round: number
): SessionObject[] {
  return objects.map(obj => ({
    object_id: obj.id,
    label: obj.label,
    x1: obj.bbox[0],
    y1: obj.bbox[1],
    x2: obj.bbox[2],
    y2: obj.bbox[3],
    cx: obj.centroid[0],
    cy: obj.centroid[1],
    state: obj.state ?? '正常',
    relevance: obj.relevance ?? '中',
    timestamp_start: obj.timestamp_range?.[0],
    timestamp_end: obj.timestamp_range?.[1],
    media_type: mediaType,
    created_round: round,
  }));
}

function getOrCreateSession(
  sessionManager: SessionManager,
  sessionId: string,
  mediaType: string,
  mediaBase64?: string
): void {
  if (!sessionManager.getSession(sessionId)) {
    sessionManager.createSession(sessionId, mediaType, mediaBase64);
  }
}

function nextRound(sessionManager: SessionManager, sessionId: string): number {
  const ctx = sessionManager.getSession(sessionId);
  return (ctx?.recentHistory.length ?? 0) + 1;
}

function contextFromHistory(history: ConversationTurn[]): string {
  const last = history.findLast(t => t.role === 'assistant');
  if (!last) return '';
  return `【已有场景上下文】之前的分析已识别出以下画面内容：\n${last.content}`;
}

/**
 * 以画面中心为原点计算自然语言位置提示
 *
 * 坐标归一化到 precision × precision 范围（通常 1000×1000），
 * 中心在 (precision/2, precision/2)。输出如"右下区域，偏右250偏下180"。
 */
function computePositionHint(
  centroid: [number, number],
  precision: number
): string {
  const center = precision / 2;
  const dx = centroid[0] - center;
  const dy = centroid[1] - center;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const nearCenter = adx < precision * 0.05 && ady < precision * 0.05;

  if (nearCenter) return '画面中心';

  const hLabel = adx < precision * 0.03 ? '' : dx > 0 ? '右' : '左';
  const vLabel = ady < precision * 0.03 ? '' : dy > 0 ? '下' : '上';
  const quadrant = `${vLabel}${hLabel}` || '中心';

  const parts: string[] = [];
  if (adx >= precision * 0.03) parts.push(`偏${hLabel}${Math.round(adx)}`);
  if (ady >= precision * 0.03) parts.push(`偏${vLabel}${Math.round(ady)}`);

  return `${quadrant}区域${parts.length > 0 ? `，${parts.join(' ')}` : ''}`;
}

// ---- PipelineOrchestrator ----

export class PipelineOrchestrator {
  private sessionManager: SessionManager;
  private visionClient: VisionClient;

  constructor(sessionManager: SessionManager, visionClient: VisionClient) {
    this.sessionManager = sessionManager;
    this.visionClient = visionClient;
  }

  /** 场景描述：JSON 模式输出自然语言 + 结构化物体坐标，注入历史上下文 */
  async describe(input: DescribeInput): Promise<DescribeOutput> {
    const { sessionId, imageBase64, mediaType, prompt } = input;

    logger.info({ sessionId, mediaType }, 'Pipeline.describe: 开始');

    getOrCreateSession(this.sessionManager, sessionId, mediaType, imageBase64);
    const sessionCtx = this.sessionManager.getSession(sessionId);
    const recentHistory = sessionCtx?.recentHistory ?? [];
    const round = nextRound(this.sessionManager, sessionId);

    try {
      const dataUrls = [imageBase64];
      const basePrompt = prompt ?? '请描述画面内容并识别所有关键物体。';
      const historyContext = contextFromHistory(recentHistory);
      const userPrompt = historyContext
        ? `${historyContext}\n\n现在请回答以下问题（注意结合之前的上下文）：${basePrompt}`
        : basePrompt;

      // 使用 JSON 模式：一次调用同时拿到描述文本 + 结构化物体坐标
      const raw = await this.visionClient.analyze(
        config.describe,
        dataUrls,
        describeSystemPrompt,
        userPrompt
      );

      const parsed: VisualAnalysisResult = parseResponse(raw);
      const precision = 1000;
      validateObjects(parsed.objects, precision);
      const normalized = normalizeObjects(parsed.objects, precision, precision);

      // 存储物体到会话
      const sessionObjects = visualToSessionObjects(
        normalized,
        mediaType,
        round
      );
      if (sessionObjects.length > 0) {
        this.sessionManager.upsertObjects(sessionId, sessionObjects, 'augment');
      }

      // 为每个物体计算中心原点位置提示
      const objects: DescribeObject[] = normalized.map(obj => ({
        id: obj.id,
        label: obj.label,
        bbox: obj.bbox,
        centroid: obj.centroid,
        color: obj.color,
        state: obj.state,
        relevance: obj.relevance,
        position_hint: computePositionHint(obj.centroid, precision),
      }));

      const description =
        parsed.reasoning ?? '（视觉模型已识别画面中的关键物体）';

      this.sessionManager.addConversationTurn(
        sessionId,
        round,
        'user',
        basePrompt
      );
      this.sessionManager.addConversationTurn(
        sessionId,
        round,
        'assistant',
        description.substring(0, 500)
      );

      logger.info(
        { sessionId, round, objectsCount: objects.length },
        'Pipeline.describe: 完成'
      );
      return { sessionId, description, round, objects };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error({ error: errMsg, sessionId }, 'Pipeline.describe: 失败');
      return { sessionId, description: `[降级] ${errMsg}`, round };
    }
  }

  /** 坐标定位：JSON 输出，注入历史描述上下文 */
  async locate(input: LocateInput): Promise<LocateOutput> {
    const { sessionId, imageBase64, mediaType, question, coordinatePrecision } =
      input;

    logger.info(
      { sessionId, mediaType, question: question.substring(0, 80) },
      'Pipeline.locate: 开始'
    );

    getOrCreateSession(
      this.sessionManager,
      sessionId,
      mediaType ?? 'text',
      imageBase64
    );

    const sessionCtx = this.sessionManager.getSession(sessionId);
    const recentHistory = sessionCtx?.recentHistory ?? [];
    const round =
      recentHistory.length > 0
        ? (recentHistory[recentHistory.length - 1]?.round ?? 0) + 1
        : 1;
    let fromCache = true;

    let visualAnalysis: VisualAnalysisResult | null = null;

    if (mediaType && imageBase64) {
      try {
        fromCache = false;
        const dataUrls = [imageBase64];
        const historyContext = contextFromHistory(recentHistory);
        const userPrompt = historyContext
          ? `${historyContext}\n\n现在请定位以下目标物体：${question}`
          : question;

        const raw = await this.visionClient.analyze(
          config.locate,
          dataUrls,
          locateSystemPrompt,
          userPrompt
        );

        const parsed: VisualAnalysisResult = parseResponse(raw);
        const precision = coordinatePrecision === '0-100' ? 100 : 1000;
        validateObjects(parsed.objects, precision);

        let normalized = parsed.objects;
        if (precision === 100) {
          normalized = normalizeObjects(parsed.objects, 100, 1000);
        }

        const sessionObjects = visualToSessionObjects(
          normalized,
          mediaType,
          round
        );

        if (sessionObjects.length > 0) {
          this.sessionManager.upsertObjects(
            sessionId,
            sessionObjects,
            'augment'
          );
        }

        visualAnalysis = {
          reasoning: parsed.reasoning,
          objects: normalized,
          spatial_relationships: parsed.spatial_relationships,
        };
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        logger.warn(
          { error: errMsg, sessionId },
          'Pipeline.locate: 视觉分析失败，回退缓存'
        );
      }
    }

    const updatedCtx = this.sessionManager.getSession(sessionId);
    const precisionValue = coordinatePrecision === '0-100' ? 100 : 1000;
    const augmentedPrompt = buildAugmentedPrompt({
      objects: updatedCtx?.objects ?? [],
      question,
      recentHistory: updatedCtx?.recentHistory ?? [],
      coordinatePrecision: precisionValue,
      mediaType: mediaType ?? updatedCtx?.session.media_type ?? undefined,
    });

    this.sessionManager.addConversationTurn(sessionId, round, 'user', question);
    this.sessionManager.addConversationTurn(
      sessionId,
      round,
      'assistant',
      augmentedPrompt.substring(0, 500)
    );

    return {
      sessionId,
      visualAnalysis,
      augmentedPrompt,
      objectsCount: updatedCtx?.objects.length ?? 0,
      fromCache,
      round,
    };
  }

  /** OCR 文字提取 */
  async ocr(input: OcrInput): Promise<string> {
    const { imageBase64, mediaType, prompt } = input;

    logger.info({ mediaType }, 'Pipeline.ocr: 开始');

    try {
      const dataUrls = [imageBase64];
      const userPrompt =
        prompt ??
        '请提取并输出这张图片中的所有文字内容。如有表格请保持表格结构。';
      const content = await this.visionClient.chat(
        config.ocr,
        dataUrls,
        ocrSystemPrompt,
        userPrompt
      );

      return content;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error({ error: errMsg }, 'Pipeline.ocr: 失败');
      return `[降级] ${errMsg}`;
    }
  }

  /** 视频分析：直接发送视频，模型原生理解，注入历史上下文支持多轮追问 */
  async videoAnalyze(input: VideoAnalyzeInput): Promise<VideoAnalyzeOutput> {
    const { sessionId, videoBase64, mediaType, prompt } = input;

    logger.info({ sessionId, mediaType }, 'Pipeline.videoAnalyze: 开始');

    getOrCreateSession(this.sessionManager, sessionId, mediaType, videoBase64);
    const sessionCtx = this.sessionManager.getSession(sessionId);
    const recentHistory = sessionCtx?.recentHistory ?? [];
    const round = nextRound(this.sessionManager, sessionId);

    try {
      const dataUrls = [videoBase64];
      const basePrompt =
        prompt ??
        '请分析这个视频的内容，包括：发生了什么事件或动作、出现了哪些人物或物体、场景环境、整体氛围。';
      const historyContext = contextFromHistory(recentHistory);
      const userPrompt = historyContext
        ? `${historyContext}\n\n现在请回答以下问题（注意结合之前的上下文）：${basePrompt}`
        : basePrompt;

      const content = await this.visionClient.chat(
        config.video,
        dataUrls,
        describeSystemPrompt,
        userPrompt
      );

      this.sessionManager.addConversationTurn(
        sessionId,
        round,
        'user',
        basePrompt
      );
      this.sessionManager.addConversationTurn(
        sessionId,
        round,
        'assistant',
        content.substring(0, 500)
      );

      logger.info({ sessionId, round }, 'Pipeline.videoAnalyze: 完成');
      return { sessionId, description: content, round };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error({ error: errMsg, sessionId }, 'Pipeline.videoAnalyze: 失败');
      return { sessionId, description: `[降级] ${errMsg}`, round };
    }
  }
}
