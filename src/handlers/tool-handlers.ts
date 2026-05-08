/**
 * MCP 工具处理器：注册视觉任务调度工具
 *
 * 将 PipelineOrchestrator 的任务方法封装为独立 MCP 工具：
 *   - visual_describe：场景描述（自然语言）
 *   - visual_locate：坐标定位（JSON 坐标）
 *   - visual_ocr：文字/表格提取
 *   - visual_video_analyze：视频内容分析
 *
 * 映射需求：REQ-001（工具注册）
 * 任务 ID：TASK-008
 */
import { existsSync, statSync, createReadStream } from 'node:fs';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { PipelineOrchestrator } from '../core/pipeline.js';
import { logger } from '../utils/logger.js';

// ---- 文件读取辅助函数 ----

const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'bmp',
]);

const VIDEO_EXTENSIONS: ReadonlySet<string> = new Set([
  'mp4',
  'avi',
  'mov',
  'mkv',
  'webm',
]);

/** 根据文件扩展名推断 MIME 类型 */
function getMimeType(filePath: string): string | null {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    bmp: 'image/bmp',
    mp4: 'video/mp4',
    avi: 'video/avi',
    mov: 'video/mov',
    mkv: 'video/mkv',
    webm: 'video/webm',
  };
  return mimeMap[ext ?? ''] ?? null;
}

/** 将本地文件读取并编码为 Base64 data URL */
async function encodeFileBase64(filePath: string): Promise<{
  dataUrl: string;
  mediaType: 'image' | 'video';
}> {
  const mime = getMimeType(filePath);
  if (!mime) {
    throw new Error(
      `不支持的文件格式: ${filePath.split('.').pop() ?? '未知'}。支持的图片格式: ${[...IMAGE_EXTENSIONS].join(', ')}；视频格式: ${[...VIDEO_EXTENSIONS].join(', ')}`
    );
  }

  if (!existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }

  const stat = statSync(filePath);
  const MAX_IMAGE = 20 * 1024 * 1024;
  const MAX_VIDEO = 100 * 1024 * 1024;

  if (IMAGE_EXTENSIONS.has(filePath.split('.').pop()?.toLowerCase() ?? '')) {
    if (stat.size > MAX_IMAGE) {
      throw new Error(`图片文件过大: ${stat.size} bytes (上限 ${MAX_IMAGE})`);
    }
  } else if (
    VIDEO_EXTENSIONS.has(filePath.split('.').pop()?.toLowerCase() ?? '')
  ) {
    if (stat.size > MAX_VIDEO) {
      throw new Error(`视频文件过大: ${stat.size} bytes (上限 ${MAX_VIDEO})`);
    }
  }

  const chunks: Buffer[] = [];
  const stream = createReadStream(filePath);
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const b64 = Buffer.concat(chunks).toString('base64');

  const isVideo = VIDEO_EXTENSIONS.has(
    filePath.split('.').pop()?.toLowerCase() ?? ''
  );
  const mediaType = isVideo ? ('video' as const) : ('image' as const);

  return { dataUrl: `data:${mime};base64,${b64}`, mediaType };
}

// ---- 工具注册 ----

/**
 * 注册所有视觉任务工具到 MCP 服务器
 */
export function registerTool(
  server: McpServer,
  pipeline: PipelineOrchestrator
): void {
  // ---- visual_describe ----
  server.registerTool(
    'visual_describe',
    {
      title: '视觉场景描述',
      description:
        '对图片/截图进行全面、细致的自然语言描述。专注场景理解，不要求坐标输出。支持 UI 截图分析、场景描述、物体识别。传入本地图片文件路径，返回模型对该图片的详细描述。',
      inputSchema: {
        image_path: z
          .string()
          .describe('本地图片文件的绝对路径，支持 png/jpg/webp/gif/bmp'),
        prompt: z
          .string()
          .optional()
          .describe('对图片的提问或分析指令（可选，默认进行全面描述）'),
        session_id: z
          .string()
          .optional()
          .describe('会话 ID，多轮复用时传入。首次调用自动生成'),
      },
    },
    async params => {
      const sessionId: string = params.session_id ?? randomUUID();

      try {
        const { dataUrl, mediaType } = await encodeFileBase64(
          params.image_path
        );

        const result = await pipeline.describe({
          sessionId,
          imageBase64: dataUrl,
          mediaType,
          prompt: params.prompt,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                session_id: result.sessionId,
                description: result.description,
                round: result.round,
              }),
            },
          ],
        };
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `❌ 错误: ${errMsg}` }],
          isError: true,
        };
      }
    }
  );

  // ---- visual_locate ----
  server.registerTool(
    'visual_locate',
    {
      title: '视觉坐标定位',
      description:
        '在场景理解基础上精确定位目标物体，输出带坐标锚点的增强提示词。配合 visual_describe 使用：先用 describe 理解场景，再用 locate 定位坐标。也可单独使用传入新图像进行定位。',
      inputSchema: {
        question: z
          .string()
          .min(1)
          .describe('要定位的目标物体描述，如"找到蓝色的提交按钮"'),
        image_path: z
          .string()
          .optional()
          .describe('本地图片文件的绝对路径。不传则使用当前会话缓存的场景信息'),
        session_id: z
          .string()
          .optional()
          .describe('会话 ID，多轮复用时传入。首次调用自动生成'),
        coordinate_precision: z
          .enum(['0-100', '0-1000'])
          .default('0-1000')
          .describe('坐标归一化精度'),
      },
    },
    async params => {
      const sessionId: string = params.session_id ?? randomUUID();

      try {
        let dataUrl: string | undefined;
        let mediaType: 'image' | 'video' | undefined;

        if (params.image_path) {
          const encoded = await encodeFileBase64(params.image_path);
          dataUrl = encoded.dataUrl;
          mediaType = encoded.mediaType;
        }

        const result = await pipeline.locate({
          sessionId,
          imageBase64: dataUrl,
          mediaType,
          question: params.question,
          coordinatePrecision: params.coordinate_precision,
        });

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
        const errMsg = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `❌ 错误: ${errMsg}` }],
          isError: true,
        };
      }
    }
  );

  // ---- visual_ocr ----
  server.registerTool(
    'visual_ocr',
    {
      title: '视觉 OCR 文字识别',
      description:
        '从图片中提取文字和表格内容。擅长：文档扫描件识别、UI 文字提取、表格结构化提取、手写体识别。传入本地图片文件路径，返回识别出的文字内容。',
      inputSchema: {
        image_path: z
          .string()
          .describe('本地图片文件的绝对路径，支持 png/jpg/webp/gif/bmp'),
        prompt: z
          .string()
          .optional()
          .describe(
            '对 OCR 结果的额外处理指令（可选），例如"只提取表格""翻译为英文""格式化为 Markdown 表格"'
          ),
      },
    },
    async params => {
      try {
        const { dataUrl, mediaType } = await encodeFileBase64(
          params.image_path
        );

        const text = await pipeline.ocr({
          imageBase64: dataUrl,
          mediaType,
          prompt: params.prompt,
        });

        return {
          content: [{ type: 'text' as const, text }],
        };
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `❌ 错误: ${errMsg}` }],
          isError: true,
        };
      }
    }
  );

  // ---- visual_video_analyze ----
  server.registerTool(
    'visual_video_analyze',
    {
      title: '视觉视频分析',
      description:
        '分析视频内容，包括事件/动作识别、场景变化检测、视频摘要。传入本地视频文件路径，返回对视频内容的分析结果。短视频（<3 分钟）效果最佳。',
      inputSchema: {
        video_path: z
          .string()
          .describe('本地视频文件的绝对路径，支持 mp4/avi/mov/mkv/webm'),
        prompt: z
          .string()
          .optional()
          .describe(
            '对视频的提问或分析指令（可选），例如"描述视频中发生了什么""视频中有哪些物体"'
          ),
        session_id: z
          .string()
          .optional()
          .describe('会话 ID，多轮复用时传入。首次调用自动生成'),
      },
    },
    async params => {
      const sessionId: string = params.session_id ?? randomUUID();

      try {
        const { dataUrl, mediaType } = await encodeFileBase64(
          params.video_path
        );

        const result = await pipeline.videoAnalyze({
          sessionId,
          videoBase64: dataUrl,
          mediaType,
          prompt: params.prompt,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                session_id: result.sessionId,
                description: result.description,
                round: result.round,
              }),
            },
          ],
        };
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `❌ 错误: ${errMsg}` }],
          isError: true,
        };
      }
    }
  );

  logger.info('ToolHandler: 4 个视觉任务工具已注册');
}
