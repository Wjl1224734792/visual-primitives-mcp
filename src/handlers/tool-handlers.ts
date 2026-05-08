/**
 * MCP 工具处理器：注册 multimodal_grounding_augment 工具
 *
 * 将 PipelineOrchestrator 封装为 MCP 工具，处理：
 *   - 输入参数 Zod 校验
 *   - Pipeline 执行调度
 *   - MCP 标准响应格式（PRD 4.2 节）
 *
 * 映射需求：REQ-001（工具注册）
 * 任务 ID：TASK-008
 */
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PipelineOrchestrator } from '../core/pipeline.js';
import { logger } from '../utils/logger.js';
import type { PipelineInput, PipelineOutput } from '../types.js';

/**
 * 注册 multimodal_grounding_augment 工具到 MCP 服务器
 *
 * @param server - McpServer 实例（来自 @modelcontextprotocol/sdk）
 * @param pipeline - PipelineOrchestrator 实例，实际执行多模态增强管道
 */
export function registerTool(
  server: McpServer,
  pipeline: PipelineOrchestrator
): void {
  server.registerTool(
    'multimodal_grounding_augment',
    {
      title: '多模态空间锚定增强',
      description:
        '分析图像/视频/文档等多模态内容，生成带精确坐标锚点的增强提示词，供文本模型进行空间推理。支持多轮会话中复用已标注物体。',
      inputSchema: {
        session_id: z
          .string()
          .optional()
          .describe('会话 ID，多轮复用。首次调用自动生成'),
        media_base64: z
          .string()
          .optional()
          .describe('媒体内容 Base64。首次调用或需要新文件时提供'),
        media_type: z
          .enum([
            'image',
            'video',
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/plain',
            'text/markdown',
          ])
          .optional()
          .describe('媒体类型。传入 media_base64 时必填'),
        question: z.string().min(1).describe('对媒体内容提出的自然语言问题'),
        merge_strategy: z
          .enum(['replace', 'augment'])
          .default('augment')
          .describe('合并策略：replace 清空重建，augment 增量追加'),
        coordinate_precision: z
          .enum(['0-100', '0-1000'])
          .default('0-1000')
          .describe('坐标归一化精度'),
      },
    },
    async params => {
      // 生成或使用传入的 session_id
      const sessionId: string = params.session_id ?? randomUUID();

      // 交叉校验：传了 media_base64 但未传 media_type
      if (params.media_base64 && !params.media_type) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                session_id: sessionId,
                error: '传入 media_base64 时必须同时指定 media_type',
                augmented_prompt: '',
                objects_count: 0,
                from_cache: false,
                round: 0,
              }),
            },
          ],
          isError: true,
        };
      }

      // 构建 PipelineInput（字段已规范化，驼峰命名）
      const pipelineInput: PipelineInput = {
        sessionId,
        mediaBase64: params.media_base64,
        mediaType: params.media_type,
        question: params.question,
        mergeStrategy: params.merge_strategy,
        coordinatePrecision: params.coordinate_precision,
      };

      logger.info(
        { sessionId, mediaType: params.media_type },
        'ToolHandler: 开始执行 multimodal_grounding_augment'
      );

      try {
        // 执行管道
        const result: PipelineOutput = await pipeline.execute(pipelineInput);

        // 返回 MCP 标准响应格式（PRD 4.2 节）
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                session_id: result.sessionId,
                raw_visual_analysis: result.visualAnalysis,
                augmented_prompt: result.augmentedPrompt,
                objects_count: result.objectsCount,
                from_cache: result.fromCache,
                round: result.round,
              }),
            },
          ],
        };
      } catch (error) {
        // 兜底：pipeline.execute 内部已捕获大部分异常，
        // 此处仅防御未捕获的极端情况
        const errMsg = error instanceof Error ? error.message : String(error);
        logger.error(
          { error: errMsg, sessionId },
          'ToolHandler: 管道执行发生未预期异常'
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                session_id: sessionId,
                error: errMsg,
                augmented_prompt: '',
                objects_count: 0,
                from_cache: false,
                round: 0,
              }),
            },
          ],
          isError: true,
        };
      }
    }
  );

  logger.info('ToolHandler: multimodal_grounding_augment 工具已注册');
}
