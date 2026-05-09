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
        '对图片/截图进行场景描述与关键物体识别（含坐标+颜色+位置提示）。' +
        '★ 如果用户在同一轮对话中追问图片相关内容，务必传入上次返回的 session_id，' +
        '这样后续调用无需重新上传图片即可复用上下文，节省 API 调用成本。',
      inputSchema: {
        image_path: z
          .string()
          .optional()
          .describe(
            '本地图片文件的绝对路径。★ 若传入 session_id 且该会话已有缓存数据，可省略此参数实现零 API 成本的图谱推理'
          ),
        prompt: z
          .string()
          .optional()
          .describe('对图片的提问或分析指令（可选，默认进行全面描述）'),
        session_id: z
          .string()
          .optional()
          .describe(
            '★ 追问同一图片时必须传入上次返回的 session_id，复用上下文避免重复上传分析'
          ),
      },
    },
    async params => {
      const sessionId: string = params.session_id ?? randomUUID();

      try {
        let dataUrl: string;
        let mediaType: 'image' | 'video';

        if (params.image_path) {
          const encoded = await encodeFileBase64(params.image_path);
          dataUrl = encoded.dataUrl;
          mediaType = encoded.mediaType;
        } else if (params.session_id) {
          // 无新图片：fromCache 模式，跳过视觉 API 直接从缓存推理
          const result = await pipeline.describe({
            sessionId,
            imageBase64: '',
            mediaType: 'image',
            prompt: params.prompt,
            fromCache: true,
          });
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  session_id: result.sessionId,
                  description: result.description,
                  round: result.round,
                  objects: result.objects,
                  spatial_graph: result.spatial_graph,
                }),
              },
            ],
          };
        } else {
          throw new Error('必须提供 image_path 或 session_id（含缓存数据）');
        }

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
                objects: result.objects,
                spatial_graph: result.spatial_graph,
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
        '精确定位目标物体的坐标。★ 如果先调用了 visual_describe，务必传入它返回的 session_id，' +
        '可直接从缓存读取物体坐标而无需再次调用视觉 API。' +
        '如未调用过 describe，则需传入 image_path 进行独立定位。',
      inputSchema: {
        question: z
          .string()
          .min(1)
          .describe('要定位的目标物体描述，如"找到蓝色的提交按钮"'),
        image_path: z
          .string()
          .optional()
          .describe(
            '本地图片路径。如果传了 session_id 且该会话已有缓存物体，可省略此参数节省调用'
          ),
        session_id: z
          .string()
          .optional()
          .describe(
            '★ 复用 visual_describe 返回的 session_id 可从缓存读取物体，零 API 成本定位'
          ),
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
        '分析视频内容（事件/动作识别、场景变化、摘要）。' +
        '★ 追问同一视频时务必传入上次返回的 session_id 以复用上下文。',
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
          .describe(
            '★ 追问同一视频时必须传入上次返回的 session_id，复用上下文'
          ),
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
