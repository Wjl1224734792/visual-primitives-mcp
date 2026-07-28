/**
 * 管道编排器（Pipeline Orchestrator）
 *
 * 任务调度核心：4 个任务方法，每个使用独立的模型配置和系统提示词。
 * 协调 SessionManager + VisionClient + Parser + Validator + Normalizer。
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

import type {
  DescribeInput,
  DescribeOutput,
  DescribeObject,
  LocateInput,
  LocateOutput,
  OcrInput,
  CompareInput,
  CompareOutput,
  DiagnoseInput,
  DiagnoseOutput,
  DiagnoseErrorType,
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
import {
  buildAugmentedPrompt,
  buildSpatialGraph,
  formatSpatialGraph,
} from './prompt-builder.js';
import { logger } from '../utils/logger.js';
import { metricsRegistry } from '../utils/metrics.js';

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

// Phase 2 新增模板
const diagramSystemPrompt = loadTemplate(
  'describe-diagram.txt',
  '你是一个资深架构分析师，擅长解读技术图表。'
);
const datavizSystemPrompt = loadTemplate(
  'describe-dataviz.txt',
  '你是一个数据可视化分析专家，擅长解读各类数据图表。'
);
const uiCodeSystemPrompt = loadTemplate(
  'describe-ui-code.txt',
  '你是一个资深前端开发工程师，擅长将 UI 截图转化为 React 代码。'
);
const uiPromptSystemPrompt = loadTemplate(
  'describe-ui-prompt.txt',
  '你是一个 UI 设计转译专家，擅长将 UI 截图转化为 LLM 提示词。'
);
const compareSystemPrompt = loadTemplate(
  'compare-system.txt',
  '你是一个资深 UI 测试工程师，专精于像素级视觉回归测试。'
);
const diagnoseSystemPrompt = loadTemplate(
  'diagnose-system.txt',
  '你是一个全栈调试专家，拥有丰富的前端/后端/数据库排查经验。'
);

const TASK_PROMPT_MAP: Record<string, string> = {
  general: describeSystemPrompt,
  diagram: diagramSystemPrompt,
  dataviz: datavizSystemPrompt,
  ui_code: uiCodeSystemPrompt,
  ui_prompt: uiPromptSystemPrompt,
};

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

  /** 场景描述：JSON 模式输出自然语言 + 结构化物体坐标 + 空间关系图谱 */
  async describe(input: DescribeInput): Promise<DescribeOutput> {
    const { sessionId, imageBase64, mediaType, prompt, fromCache, task } =
      input;
    const traceId = randomBytes(4).toString('hex');
    const effectiveTask = task ?? 'general';

    metricsRegistry.recordCall('describe');
    const startTime = performance.now();

    logger.info(
      { sessionId, traceId, mediaType, fromCache, task: effectiveTask },
      'Pipeline.describe: 开始'
    );

    getOrCreateSession(this.sessionManager, sessionId, mediaType, imageBase64);
    const sessionCtx = this.sessionManager.getSession(sessionId);
    const recentHistory = sessionCtx?.recentHistory ?? [];
    const round = nextRound(this.sessionManager, sessionId);

    // task 参数路由：选择对应的系统提示词
    const selectedPrompt =
      TASK_PROMPT_MAP[effectiveTask] ?? describeSystemPrompt;

    try {
      const basePrompt = prompt ?? '请描述画面内容并识别所有关键物体。';
      const historyContext = contextFromHistory(recentHistory);
      const precision = 1000;

      let description: string;
      let objects: DescribeObject[];

      if (fromCache && sessionCtx && sessionCtx.objects.length > 0) {
        // 缓存模式：跳过视觉 API，直接从已有物体构建图谱推理
        metricsRegistry.recordCacheHit('describe');
        objects = sessionCtx.objects.map(obj => ({
          id: obj.object_id,
          label: obj.label,
          bbox: [obj.x1, obj.y1, obj.x2, obj.y2] as [
            number,
            number,
            number,
            number,
          ],
          centroid: [obj.cx, obj.cy] as [number, number],
          color: undefined,
          state: obj.state,
          relevance: obj.relevance,
          position_hint: computePositionHint(
            [obj.cx, obj.cy] as [number, number],
            precision
          ),
        }));

        const historyCtx = historyContext
          ? historyContext.substring(0, 200)
          : '';
        description = `[缓存推理 · ${String(sessionCtx.objects.length)}个物体] ${historyCtx}`;
      } else {
        // 正常模式：调用视觉 API
        const dataUrls = [imageBase64];
        const userPrompt = historyContext
          ? `${historyContext}\n\n现在请回答以下问题（注意结合之前的上下文）：${basePrompt}`
          : basePrompt;

        // diagram/dataviz/ui_code/ui_prompt 任务期望自由文本输出
        // （图表分析/数据洞察/React代码/提示词），使用 chat() 而非 analyze()
        const textTasks: ReadonlySet<string> = new Set([
          'diagram',
          'dataviz',
          'ui_code',
          'ui_prompt',
        ]);
        const isTextTask = textTasks.has(effectiveTask);

        if (isTextTask) {
          const raw = await this.visionClient.chat(
            config.describe,
            dataUrls,
            selectedPrompt,
            userPrompt
          );
          description = raw;
          objects = [];
        } else {
          const raw = await this.visionClient.chat(
            config.describe,
            dataUrls,
            selectedPrompt,
            userPrompt
          );

          const parsed = parseResponse(raw);

          if (parsed) {
            validateObjects(parsed.objects, precision);
            const normalized = normalizeObjects(
              parsed.objects,
              precision,
              precision
            );

            // 存储物体到会话
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

            objects = normalized.map(obj => ({
              id: obj.id,
              label: obj.label,
              bbox: obj.bbox,
              centroid: obj.centroid,
              color: obj.color,
              state: obj.state,
              relevance: obj.relevance,
              position_hint: computePositionHint(obj.centroid, precision),
            }));

            description =
              parsed.reasoning ?? '（视觉模型已识别画面中的关键物体）';
          } else {
            // JSON 提取失败，降级为纯文本
            objects = [];
            description =
              raw.length > 0
                ? raw.substring(0, 2000)
                : '（模型未返回有效结果）';
          }
        }
      }

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

      // 从会话中提取全部物体构建空间关系图谱（纯本地计算，零 API 成本）
      const allObjects =
        this.sessionManager.getSession(sessionId)?.objects ?? [];
      const graph = buildSpatialGraph(allObjects);
      const spatialGraph = formatSpatialGraph(graph);

      logger.info(
        {
          sessionId,
          traceId,
          round,
          fromCache,
          objectsCount: objects.length,
          graphEntries: graph.length,
        },
        'Pipeline.describe: 完成'
      );
      const elapsed = performance.now() - startTime;
      metricsRegistry.recordLatency('describe', elapsed);
      return {
        sessionId,
        description,
        round,
        objects,
        spatial_graph: spatialGraph,
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      metricsRegistry.recordError('describe');
      const elapsed = performance.now() - startTime;
      metricsRegistry.recordLatency('describe', elapsed);
      logger.error(
        { error: errMsg, sessionId, traceId },
        'Pipeline.describe: 失败'
      );
      return { sessionId, description: `[降级] ${errMsg}`, round };
    }
  }

  /** 坐标定位：JSON 输出，注入历史描述上下文 */
  async locate(input: LocateInput): Promise<LocateOutput> {
    const { sessionId, imageBase64, mediaType, question, coordinatePrecision } =
      input;
    const traceId = randomBytes(4).toString('hex');

    metricsRegistry.recordCall('locate');
    const startTime = performance.now();

    logger.info(
      { sessionId, traceId, mediaType, question: question.substring(0, 80) },
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

        const raw = await this.visionClient.chat(
          config.locate,
          dataUrls,
          locateSystemPrompt,
          userPrompt
        );

        const parsed = parseResponse(raw);

        if (parsed) {
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
        metricsRegistry.recordError('locate');
        logger.warn(
          { error: errMsg, sessionId, traceId },
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

    if (fromCache) {
      metricsRegistry.recordCacheHit('locate');
    }
    const elapsed = performance.now() - startTime;
    metricsRegistry.recordLatency('locate', elapsed);

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
    const traceId = randomBytes(4).toString('hex');

    metricsRegistry.recordCall('ocr');
    const startTime = performance.now();

    logger.info({ traceId, mediaType }, 'Pipeline.ocr: 开始');

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

      const elapsed = performance.now() - startTime;
      metricsRegistry.recordLatency('ocr', elapsed);

      return content;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      metricsRegistry.recordError('ocr');
      const elapsed = performance.now() - startTime;
      metricsRegistry.recordLatency('ocr', elapsed);
      logger.error({ error: errMsg, traceId }, 'Pipeline.ocr: 失败');
      return `[降级] ${errMsg}`;
    }
  }

  /** 视频分析：直接发送视频，模型原生理解，注入历史上下文支持多轮追问 */
  async videoAnalyze(input: VideoAnalyzeInput): Promise<VideoAnalyzeOutput> {
    const { sessionId, videoBase64, mediaType, prompt } = input;
    const traceId = randomBytes(4).toString('hex');

    metricsRegistry.recordCall('video_analyze');
    const startTime = performance.now();

    logger.info(
      { sessionId, traceId, mediaType },
      'Pipeline.videoAnalyze: 开始'
    );

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

      logger.info({ sessionId, traceId, round }, 'Pipeline.videoAnalyze: 完成');
      const elapsed = performance.now() - startTime;
      metricsRegistry.recordLatency('video_analyze', elapsed);
      return { sessionId, description: content, round };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      metricsRegistry.recordError('video_analyze');
      const elapsed = performance.now() - startTime;
      metricsRegistry.recordLatency('video_analyze', elapsed);
      logger.error(
        { error: errMsg, sessionId, traceId },
        'Pipeline.videoAnalyze: 失败'
      );
      return { sessionId, description: `[降级] ${errMsg}`, round };
    }
  }

  // ---- Phase 2 新增工具方法 ----

  /** 截图差异对比：两张图逐区域对比，按严重程度分类输出 */
  async compare(input: CompareInput): Promise<CompareOutput> {
    const { imageBase64_1, imageBase64_2, mediaType, focus } = input;
    const traceId = randomBytes(4).toString('hex');

    metricsRegistry.recordCall('compare');
    const startTime = performance.now();

    logger.info({ traceId, mediaType, focus }, 'Pipeline.compare: 开始');

    try {
      const basePrompt =
        focus && focus !== 'all'
          ? `请重点对比两张截图的「${focus}」方面的差异。`
          : '请逐区域对比两张截图，找出所有视觉差异。';
      const userPrompt = focus ? `${basePrompt}\n关注点: ${focus}` : basePrompt;

      const raw = await this.visionClient.chat(
        config.vision,
        [imageBase64_1, imageBase64_2],
        compareSystemPrompt,
        userPrompt
      );

      const result: CompareOutput = parseCompareResponse(raw);
      const elapsed = performance.now() - startTime;
      metricsRegistry.recordLatency('compare', elapsed);
      logger.info(
        { traceId, differencesCount: result.differences.length },
        'Pipeline.compare: 完成'
      );
      return result;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      metricsRegistry.recordError('compare');
      const elapsed = performance.now() - startTime;
      metricsRegistry.recordLatency('compare', elapsed);
      logger.error({ error: errMsg, traceId }, 'Pipeline.compare: 失败');
      return { summary: `[降级] ${errMsg}`, differences: [] };
    }
  }

  /** 错误截图诊断：分析错误 → 根因 → 修复建议 → 相关文件猜测 */
  async diagnose(input: DiagnoseInput): Promise<DiagnoseOutput> {
    const { imageBase64, mediaType, context } = input;
    const traceId = randomBytes(4).toString('hex');

    metricsRegistry.recordCall('diagnose');
    const startTime = performance.now();

    logger.info({ traceId, mediaType }, 'Pipeline.diagnose: 开始');

    try {
      const userPrompt = context
        ? `额外上下文: ${context}\n\n请分析该错误截图。`
        : '请分析该错误截图。';

      const raw = await this.visionClient.chat(
        config.vision,
        [imageBase64],
        diagnoseSystemPrompt,
        userPrompt
      );

      const result = parseDiagnoseResponse(raw);
      const elapsed = performance.now() - startTime;
      metricsRegistry.recordLatency('diagnose', elapsed);
      logger.info(
        { traceId, severity: result.severity },
        'Pipeline.diagnose: 完成'
      );
      return result;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      metricsRegistry.recordError('diagnose');
      const elapsed = performance.now() - startTime;
      metricsRegistry.recordLatency('diagnose', elapsed);
      logger.error({ error: errMsg, traceId }, 'Pipeline.diagnose: 失败');
      return {
        diagnosis: `[降级] ${errMsg}`,
        root_cause: '未知',
        suggested_fix: '请稍后重试',
        severity: 'error',
        error_type: 'unknown',
        related_hints: [],
      };
    }
  }
}

// ---- 解析辅助函数 ----

/** compare 差异类型合法值 */
const VALID_COMPARE_TYPES: ReadonlySet<string> = new Set([
  'layout',
  'color',
  'text',
  'element',
  'other',
]);

/** compare 严重程度合法值 */
const VALID_COMPARE_SEVERITIES: ReadonlySet<string> = new Set([
  'critical',
  'minor',
  'cosmetic',
]);

/** 模型输出的非标准 severity → 标准值映射（模型可能输出 high/major/error 等词） */
const SEVERITY_NORMALIZE: Record<string, string> = {
  high: 'critical',
  major: 'critical',
  error: 'critical',
  fatal: 'critical',
  warning: 'minor',
  low: 'cosmetic',
  info: 'cosmetic',
};

/** 模型输出的非标准 type → 标准值映射 */
const TYPE_NORMALIZE: Record<string, string> = {
  error: 'text',
  font: 'text',
  size: 'layout',
  position: 'layout',
  margin: 'layout',
  padding: 'layout',
  spacing: 'layout',
  alignment: 'layout',
  style: 'color',
  background: 'color',
  border: 'element',
  icon: 'element',
  button: 'element',
  image: 'element',
};

/** diagnose 错误类型合法值 */
const VALID_ERROR_TYPES: ReadonlySet<string> = new Set([
  'runtime',
  'build',
  'network',
  'database',
  'unknown',
]);

/** diagnose 严重程度合法值 */
const VALID_SEVERITIES: ReadonlySet<string> = new Set([
  'error',
  'warning',
  'info',
]);

/** 模型输出的非标准 error_type → 标准值映射 */
const ERROR_TYPE_NORMALIZE: Record<string, string> = {
  authentication: 'network',
  auth: 'network',
  authorization: 'network',
  permission: 'network',
  timeout: 'network',
  dns: 'network',
  ssl: 'network',
  certificate: 'network',
  connection: 'network',
  compile: 'build',
  syntax: 'build',
  typecheck: 'build',
  lint: 'build',
  bundle: 'build',
  query: 'database',
  sql: 'database',
  migration: 'database',
  schema: 'database',
  crash: 'runtime',
  nullpointer: 'runtime',
  undefined: 'runtime',
  exception: 'runtime',
  panic: 'runtime',
};

/**
 * 规范化任意字符串到合法 CompareFocus 类型，失败回退 other
 */
function normalizeType(raw: string): string {
  const lowered = raw.toLowerCase().trim();
  if (VALID_COMPARE_TYPES.has(lowered)) return lowered;
  return TYPE_NORMALIZE[lowered] ?? 'other';
}

/**
 * 规范化任意字符串到合法 severity，失败回退 minor
 */
function normalizeSeverity(raw: string): string {
  const lowered = raw.toLowerCase().trim();
  if (VALID_COMPARE_SEVERITIES.has(lowered)) return lowered;
  return SEVERITY_NORMALIZE[lowered] ?? 'minor';
}

/**
 * 规范化任意字符串到合法 DiagnoseErrorType，失败回退 unknown
 */
function normalizeErrorType(raw: string): DiagnoseErrorType {
  const lowered = raw.toLowerCase().trim();
  if (VALID_ERROR_TYPES.has(lowered)) return lowered as DiagnoseErrorType;
  const normalized = ERROR_TYPE_NORMALIZE[lowered] ?? 'unknown';
  return (
    VALID_ERROR_TYPES.has(normalized) ? normalized : 'unknown'
  ) as DiagnoseErrorType;
}

/**
 * 规范化任意字符串到合法 severity (error/warning/info)
 */
function normalizeDiagnoseSeverity(raw: string): 'error' | 'warning' | 'info' {
  const lowered = raw.toLowerCase().trim();
  if (VALID_SEVERITIES.has(lowered))
    return lowered as 'error' | 'warning' | 'info';
  // map common non-standard values
  if (lowered === 'critical' || lowered === 'fatal' || lowered === 'high')
    return 'error';
  if (lowered === 'low' || lowered === 'minor' || lowered === 'cosmetic')
    return 'warning';
  return 'info';
}

/**
 * 解析 compare 响应为 CompareOutput，失败时返回降级结果
 */
function parseCompareResponse(raw: string): CompareOutput {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed.summary || !Array.isArray(parsed.differences)) {
      throw new Error('compare 响应格式不正确');
    }
    return {
      summary: String(parsed.summary),
      differences: (parsed.differences as Array<Record<string, unknown>>).map(
        (d, index) => ({
          id:
            typeof d.id === 'number'
              ? d.id
              : typeof d.id === 'string'
                ? parseInt(d.id, 10) || index + 1
                : index + 1,
          severity: normalizeSeverity(
            typeof d.severity === 'string' ? d.severity : 'minor'
          ),
          type: normalizeType(typeof d.type === 'string' ? d.type : 'other'),
          description: typeof d.description === 'string' ? d.description : '',
          location_hint:
            typeof d.location_hint === 'string' ? d.location_hint : undefined,
          bbox_approx: Array.isArray(d.bbox_approx)
            ? (d.bbox_approx.slice(0, 4).map(Number) as [
                number,
                number,
                number,
                number,
              ])
            : undefined,
        })
      ) as CompareOutput['differences'],
    };
  } catch {
    // 尝试从文本中提取 JSON
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const extracted = JSON.parse(match[0]) as Record<string, unknown>;
        if (extracted.summary && Array.isArray(extracted.differences)) {
          return parseCompareResponse(match[0]); // 递归用规范化逻辑
        }
      } catch {
        // 降级
      }
    }
    return {
      summary: '（无法解析对比结果）',
      differences: [],
    };
  }
}

/**
 * 解析 diagnose 响应为 DiagnoseOutput，失败时返回降级结果
 */
function parseDiagnoseResponse(raw: string): DiagnoseOutput {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed.diagnosis || !parsed.root_cause) {
      throw new Error('diagnose 响应格式不正确');
    }
    return {
      diagnosis: String(parsed.diagnosis),
      root_cause: String(parsed.root_cause),
      suggested_fix:
        typeof parsed.suggested_fix === 'string'
          ? parsed.suggested_fix
          : '请稍后重试',
      severity: normalizeDiagnoseSeverity(
        typeof parsed.severity === 'string' ? parsed.severity : 'error'
      ),
      error_type: normalizeErrorType(
        typeof parsed.error_type === 'string' ? parsed.error_type : 'unknown'
      ),
      related_hints: Array.isArray(parsed.related_hints)
        ? (parsed.related_hints as string[]).map(String)
        : [],
    };
  } catch {
    // 尝试从文本中提取 JSON
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const extracted = JSON.parse(match[0]) as Record<string, unknown>;
        if (extracted.diagnosis && extracted.root_cause) {
          return parseDiagnoseResponse(match[0]); // 递归用规范化逻辑
        }
      } catch {
        // 降级
      }
    }
    return {
      diagnosis: `（原始响应）${raw.substring(0, 500)}`,
      root_cause: '无法解析结构化诊断',
      suggested_fix: '请检查原始响应内容',
      severity: 'error',
      error_type: 'unknown',
      related_hints: [],
    };
  }
}
