/**
 * 管道编排器（Pipeline Orchestrator）
 *
 * 协调 SessionManager + ModalityRouter + VisionClient + Parser +
 * Validator + Normalizer + PromptBuilder，执行完整的多轮增强提示词管道。
 *
 * 核心流程（PRD 3.5 节）：
 *   1. 获取/创建会话 → 2. 判断坐标来源（cache vs vision）
 *   3. 若 fromVision：路由适配器 → VisionClient 分析 → 解析/校验/归一化 → 合并物体
 *   4. PromptBuilder 构建增强提示词 → 5. 记录对话轮次 → 6. 返回结果
 *
 * 降级原则（REQ-N05）：任何子模块异常不导致进程崩溃，返回降级 PipelineOutput。
 *
 * 映射需求：REQ-001, REQ-016, REQ-017, REQ-N01, REQ-N02, REQ-N05
 * 任务 ID：TASK-006
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  PipelineInput,
  PipelineOutput,
  VisualAnalysisResult,
  SessionObject,
  VisualObject,
  ConversationTurn,
} from '../types.js';

import { SessionManager } from './session-manager.js';
import { VisionClient } from './vision-client.js';
import { ModalityRouter } from './modality-router.js';
import { parseResponse } from './parser.js';
import { validateObjects } from './validator.js';
import { normalizeObjects } from './normalizer.js';
import { buildAugmentedPrompt } from './prompt-builder.js';
import { logger } from '../utils/logger.js';

// ---- 系统提示词缓存 ----

/**
 * 模块加载时读取视觉模型系统提示词模板并缓存，
 * 避免每次 execute() 调用都执行文件 I/O。
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATE_DIR = join(__dirname, '..', 'templates');
let systemPrompt: string;

try {
  systemPrompt = readFileSync(join(TEMPLATE_DIR, 'vision-system.txt'), 'utf-8');
} catch (error) {
  // 极端情况：模板文件丢失，使用内联后备提示词
  const errMsg = error instanceof Error ? error.message : String(error);
  logger.error({ error: errMsg }, '无法加载系统提示词模板，使用后备提示词');
  systemPrompt =
    '你是一个基于"视觉原语"方法论的多模态推理模型。请用 JSON 格式输出分析结果。';
}

// ---- 辅助函数 ----

/**
 * 将 VisualAnalysisResult 中的 VisualObject 数组转换为 SessionObject 数组
 *
 * @param objects - 视觉模型返回的原始物体数组
 * @param mediaType - 当前输入的媒体类型（作为回退值）
 * @param round - 当前会话轮次（用于 created_round 赋值）
 * @returns 持久化格式的会话物体数组
 */
function visualAnalysisToSessionObjects(
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
    state: obj.state || '正常',
    relevance: obj.relevance || '中',
    page: obj.page ?? undefined,
    timestamp_start: obj.timestamp_range?.[0],
    timestamp_end: obj.timestamp_range?.[1],
    media_type: obj.media_type || mediaType,
    created_round: round,
  }));
}

/**
 * 从会话历史的最近对话中推算当前轮次
 * @param history 对话记录列表
 * @returns 当前轮次编号（1 起始）
 */
function calculateRound(history: ConversationTurn[]): number {
  if (history.length === 0) {
    return 1;
  }
  const lastTurn = history[history.length - 1];
  if (!lastTurn) {
    return 1;
  }
  return lastTurn.round + 1;
}

/**
 * 构建降级 PipelineOutput，确保任何异常情况都返回合法结构
 */
function buildDegradedOutput(
  sessionId: string,
  question: string
): PipelineOutput {
  return {
    sessionId,
    visualAnalysis: null,
    augmentedPrompt: `[降级提示词]\n\n系统在分析过程中遇到暂时性问题。以下是用户的原始问题：\n\n${question}\n\n请直接根据已有知识尽力回答。`,
    objectsCount: 0,
    fromCache: true,
    round: 1,
  };
}

// ---- PipelineOrchestrator ----

export class PipelineOrchestrator {
  private sessionManager: SessionManager;
  private visionClient: VisionClient;
  private router: ModalityRouter;

  /**
   * @param sessionManager - 会话管理器实例
   * @param visionClient - 视觉模型客户端实例
   * @param router - 模态路由器实例
   */
  constructor(
    sessionManager: SessionManager,
    visionClient: VisionClient,
    router: ModalityRouter
  ) {
    this.sessionManager = sessionManager;
    this.visionClient = visionClient;
    this.router = router;
  }

  /**
   * 执行多模态增强提示词管道
   *
   * 根据输入参数判断坐标来源（缓存或视觉分析），执行完整的处理流程，
   * 最终返回包含增强提示词和会话统计的结果。
   *
   * 任何异常均被内部捕获，返回降级 PipelineOutput，不抛出到调用方。
   *
   * @param input - 管道输入参数（字段已规范化）
   * @returns 包含 enhancedPrompt、fromCache 等字段的结果
   */
  async execute(input: PipelineInput): Promise<PipelineOutput> {
    const {
      sessionId,
      mediaBase64,
      mediaType,
      question,
      mergeStrategy,
      coordinatePrecision,
    } = input;

    logger.info(
      { sessionId, mediaType, question: question.substring(0, 80) },
      'PipelineOrchestrator: 开始执行管道'
    );

    try {
      // ---- 步骤 1-2：获取或创建会话 ----
      let sessionCtx = this.sessionManager.getSession(sessionId);

      if (!sessionCtx) {
        // 首次调用：需要创建会话
        if (mediaBase64 && mediaType) {
          this.sessionManager.createSession(sessionId, mediaType, mediaBase64);
        } else {
          // 无媒体的纯文本会话（允许追问场景）
          this.sessionManager.createSession(sessionId, 'text');
        }
        sessionCtx = this.sessionManager.getSession(sessionId);
      }

      // ---- 步骤 3：计算轮次 ----
      const recentHistory = sessionCtx?.recentHistory ?? [];
      const round = calculateRound(recentHistory);

      // ---- 步骤 4-7：判断坐标来源并执行视觉管道 ----
      let visualAnalysis: VisualAnalysisResult | null = null;

      // 使用 ref 对象允许多个步骤修改 fromCache 状态
      const fromCacheRef = { value: false };

      if (!mediaBase64) {
        // 无新媒体输入 → 从缓存读取
        fromCacheRef.value = true;
        logger.info({ sessionId, round }, 'PipelineOrchestrator: 缓存命中');
      } else if (mediaType) {
        // 有新媒体输入 → 走视觉分析管道
        fromCacheRef.value = false;

        visualAnalysis = await this.executeVisionPipeline(
          sessionId,
          mediaBase64,
          mediaType,
          mergeStrategy,
          coordinatePrecision,
          round,
          fromCacheRef
        );
      }

      // ---- 步骤 8：获取最新会话上下文，构建增强提示词 ----
      const updatedCtx = this.sessionManager.getSession(sessionId);

      const precisionValue = coordinatePrecision === '0-100' ? 100 : 1000;

      const augmentedPrompt = buildAugmentedPrompt({
        objects: updatedCtx?.objects ?? [],
        question,
        recentHistory: updatedCtx?.recentHistory ?? [],
        coordinatePrecision: precisionValue,
        mediaType: mediaType ?? updatedCtx?.session.media_type ?? undefined,
      });

      // ---- 步骤 9：记录本轮对话 ----
      this.sessionManager.addConversationTurn(
        sessionId,
        round,
        'user',
        question
      );

      // 截断存储 assistant 内容（最多 500 字符）
      const assistantContent =
        augmentedPrompt.length > 500
          ? augmentedPrompt.substring(0, 500)
          : augmentedPrompt;
      this.sessionManager.addConversationTurn(
        sessionId,
        round,
        'assistant',
        assistantContent
      );

      // ---- 步骤 10：返回结果 ----
      const result: PipelineOutput = {
        sessionId,
        visualAnalysis,
        augmentedPrompt,
        objectsCount: updatedCtx?.objects.length ?? 0,
        fromCache: fromCacheRef.value,
        round,
      };

      logger.info(
        {
          sessionId,
          round,
          fromCache: fromCacheRef.value,
          objectsCount: result.objectsCount,
        },
        'PipelineOrchestrator: 管道执行完成'
      );

      return result;
    } catch (error) {
      // 最外层兜底：任何未预期的异常都不应崩溃
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error(
        { error: errMsg, sessionId },
        'PipelineOrchestrator: 管道执行发生未预期异常，返回降级结果'
      );
      return buildDegradedOutput(sessionId, question);
    }
  }

  /**
   * 执行视觉分析子管道（步骤 4-7）
   *
   * 包括：路由适配器 → 转换 → VisionClient 分析 → 解析 → 校验 → 归一化 → 合并入库
   * 每个步骤的异常独立捕获，不向上传播。失败时返回 null。
   *
   * @returns 解析成功的 VisualAnalysisResult，失败时返回 null
   */
  private async executeVisionPipeline(
    sessionId: string,
    mediaBase64: string,
    mediaType: string,
    mergeStrategy: PipelineInput['mergeStrategy'],
    coordinatePrecision: PipelineInput['coordinatePrecision'],
    round: number,
    fromCacheRef: { value: boolean }
  ): Promise<VisualAnalysisResult | null> {
    try {
      // ---- 步骤 4：ModalityRouter 路由 + Adapter 转换 ----
      let adapter;
      try {
        adapter = this.router.route(mediaType);
      } catch (routeError) {
        const routeMsg =
          routeError instanceof Error ? routeError.message : String(routeError);
        logger.warn(
          { sessionId, mediaType, error: routeMsg },
          'PipelineOrchestrator: 模态路由失败，降级为缓存模式'
        );
        fromCacheRef.value = true;
        return null;
      }

      let images;
      try {
        images = await adapter.adapt(mediaBase64);
      } catch (adapterError) {
        const adaptMsg =
          adapterError instanceof Error
            ? adapterError.message
            : String(adapterError);
        logger.warn(
          { sessionId, mediaType, error: adaptMsg },
          'PipelineOrchestrator: 适配器处理失败，降级为缓存模式'
        );
        fromCacheRef.value = true;
        return null;
      }

      if (images.length === 0) {
        logger.warn(
          { sessionId, mediaType },
          'PipelineOrchestrator: 适配器返回空图像数组，降级为缓存模式'
        );
        fromCacheRef.value = true;
        return null;
      }

      // ---- 步骤 5：VisionClient 分析 ----
      let rawContent: string;
      try {
        rawContent = await this.visionClient.analyze(images, systemPrompt);
      } catch (visionError) {
        const visionMsg =
          visionError instanceof Error
            ? visionError.message
            : String(visionError);
        logger.warn(
          { sessionId, mediaType, error: visionMsg },
          'PipelineOrchestrator: 视觉分析失败'
        );
        return null;
      }

      // ---- 步骤 6-7：解析 + 校验 + 归一化 + 合并入库 ----
      try {
        const parsed: VisualAnalysisResult = parseResponse(rawContent);

        const precisionValue = coordinatePrecision === '0-100' ? 100 : 1000;
        validateObjects(parsed.objects, precisionValue);

        // 归一化：视觉模型固定输出 0-1000，目标精度为 0-100 时需要缩放
        let normalizedObjects = parsed.objects;
        if (precisionValue === 100) {
          normalizedObjects = normalizeObjects(parsed.objects, 100, 1000);
        }

        // 转换为 SessionObject 格式并入库
        const sessionObjects = visualAnalysisToSessionObjects(
          normalizedObjects,
          mediaType,
          round
        );

        if (sessionObjects.length > 0) {
          this.sessionManager.upsertObjects(
            sessionId,
            sessionObjects,
            mergeStrategy
          );

          logger.info(
            { sessionId, mediaType, objectsCount: sessionObjects.length },
            '领域事件：ObjectsMerged（来自视觉分析管道）'
          );
        }

        return {
          reasoning: parsed.reasoning,
          objects: normalizedObjects,
          spatial_relationships: parsed.spatial_relationships,
        };
      } catch (parseError) {
        const parseMsg =
          parseError instanceof Error ? parseError.message : String(parseError);
        logger.warn(
          { sessionId, mediaType, error: parseMsg },
          'PipelineOrchestrator: 解析/校验/归一化失败，visualAnalysis 置空'
        );
        return null;
      }
    } catch (error) {
      // executeVisionPipeline 层的兜底：任何未预期异常
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.warn(
        { sessionId, mediaType, error: errMsg },
        'PipelineOrchestrator: 视觉管道子流程发生未预期异常'
      );
      return null;
    }
  }
}
