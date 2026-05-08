/**
 * 管道编排器（Pipeline Orchestrator）
 *
 * 任务调度核心：4 个任务方法，每个使用独立的模型配置和系统提示词。
 * 协调 SessionManager + ModalityRouter + VisionClient + Parser + Validator + Normalizer。
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  DescribeInput,
  DescribeOutput,
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
import { ModalityRouter } from './modality-router.js';
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
  'describe-system.txt',
  '你是一个专业的视觉分析助手。请详细描述图片/截图的内容。'
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

// ---- PipelineOrchestrator ----

export class PipelineOrchestrator {
  private sessionManager: SessionManager;
  private visionClient: VisionClient;
  private router: ModalityRouter;

  constructor(
    sessionManager: SessionManager,
    visionClient: VisionClient,
    router: ModalityRouter
  ) {
    this.sessionManager = sessionManager;
    this.visionClient = visionClient;
    this.router = router;
  }

  /** 场景描述：自然语言输出，存入会话供 locate 注入上下文 */
  async describe(input: DescribeInput): Promise<DescribeOutput> {
    const { sessionId, imageBase64, mediaType, prompt } = input;

    logger.info({ sessionId, mediaType }, 'Pipeline.describe: 开始');

    getOrCreateSession(this.sessionManager, sessionId, mediaType, imageBase64);
    const round = nextRound(this.sessionManager, sessionId);

    try {
      const adapter = this.router.route(mediaType);
      const images = await adapter.adapt(imageBase64);

      if (images.length === 0) {
        return {
          sessionId,
          description: '[降级] 无法解析图像，请检查文件格式。',
          round,
        };
      }

      const userPrompt = prompt ?? '请详细描述这张图片/截图的内容。';
      const content = await this.visionClient.chat(
        config.describe,
        images,
        describeSystemPrompt,
        userPrompt
      );

      this.sessionManager.addConversationTurn(
        sessionId,
        round,
        'user',
        userPrompt
      );
      this.sessionManager.addConversationTurn(
        sessionId,
        round,
        'assistant',
        content.substring(0, 500)
      );

      logger.info({ sessionId, round }, 'Pipeline.describe: 完成');
      return { sessionId, description: content, round };
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
        const adapter = this.router.route(mediaType);
        const images = await adapter.adapt(imageBase64);

        if (images.length > 0) {
          fromCache = false;
          const historyContext = contextFromHistory(recentHistory);
          const userPrompt = historyContext
            ? `${historyContext}\n\n现在请定位以下目标物体：${question}`
            : question;

          const raw = await this.visionClient.analyze(
            config.locate,
            images,
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
        }
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
      const adapter = this.router.route(mediaType);
      const images = await adapter.adapt(imageBase64);

      if (images.length === 0) {
        return '[降级] 无法解析图像，请检查文件格式。';
      }

      const userPrompt =
        prompt ??
        '请提取并输出这张图片中的所有文字内容。如有表格请保持表格结构。';
      const content = await this.visionClient.chat(
        config.ocr,
        images,
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

  /** 视频分析：直接发送视频，模型原生理解 */
  async videoAnalyze(input: VideoAnalyzeInput): Promise<VideoAnalyzeOutput> {
    const { sessionId, videoBase64, mediaType, prompt } = input;

    logger.info({ sessionId, mediaType }, 'Pipeline.videoAnalyze: 开始');

    getOrCreateSession(this.sessionManager, sessionId, mediaType, videoBase64);
    const round = nextRound(this.sessionManager, sessionId);

    try {
      const adapter = this.router.route(mediaType);
      const images = await adapter.adapt(videoBase64);

      if (images.length === 0) {
        return {
          sessionId,
          description: '[降级] 无法解析视频，请检查文件格式。',
          round,
        };
      }

      const userPrompt =
        prompt ??
        '请分析这个视频的内容，包括：发生了什么事件或动作、出现了哪些人物或物体、场景环境、整体氛围。';
      const content = await this.visionClient.chat(
        config.video,
        images,
        describeSystemPrompt,
        userPrompt
      );

      this.sessionManager.addConversationTurn(
        sessionId,
        round,
        'user',
        userPrompt
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
