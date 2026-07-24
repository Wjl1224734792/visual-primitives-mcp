/**
 * MCP 工具处理器：注册视觉任务调度工具
 *
 * 将 PipelineOrchestrator 的任务方法封装为独立 MCP 工具：
 *   - visual_describe：场景描述（自然语言）
 *   - visual_locate：坐标定位（JSON 坐标）
 *   - visual_ocr：文字/表格提取
 *   - visual_video_analyze：视频内容分析
 *
 * Phase 1 增强：
 *   - URL 输入支持（resolveImageSource）
 *   - 图片智能预处理（preprocessImage）
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
import { metricsRegistry } from '../utils/metrics.js';
import { config } from '../config.js';
import {
  preprocessImage,
  getToolPreset,
  isRemoteUrl,
} from '../core/image-preprocessor.js';

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

const MAX_REDIRECTS = 3;

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

/** 从 HTTP(S) URL 获取媒体文件并编码为 Base64 data URL */
async function fetchUrlBase64(
  url: string,
  mediaType: 'image' | 'video'
): Promise<{
  dataUrl: string;
  mediaType: 'image' | 'video';
}> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    let currentUrl = url;
    let remainingRedirects = MAX_REDIRECTS;

    while (remainingRedirects >= 0) {
      const response = await fetch(currentUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'visual-primitives-mcp/1.0' },
        signal: controller.signal,
        redirect: 'manual',
      });

      // 处理重定向
      if (
        response.status >= 300 &&
        response.status < 400 &&
        response.headers.get('location')
      ) {
        if (remainingRedirects === 0) {
          throw new Error(`URL 重定向超过 ${String(MAX_REDIRECTS)} 次限制`);
        }
        remainingRedirects--;
        const location = response.headers.get('location');
        const baseUrlObj = new URL(currentUrl);
        currentUrl = new URL(location ?? '', baseUrlObj.origin).href;
        continue;
      }

      if (!response.ok) {
        throw new Error(`URL 不可达: HTTP ${String(response.status)}`);
      }

      const contentType = response.headers.get('content-type') ?? '';
      const allowedPrefix =
        mediaType === 'image'
          ? 'image/'
          : mediaType === 'video'
            ? 'video/'
            : '';
      if (!contentType.startsWith(allowedPrefix)) {
        throw new Error(
          `URL 返回的格式不支持: ${contentType}（需要 ${allowedPrefix}*）`
        );
      }

      const maxSize =
        mediaType === 'image' ? 20 * 1024 * 1024 : 100 * 1024 * 1024;
      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > maxSize) {
        throw new Error(
          `URL 返回的文件过大: ${contentLength} bytes (上限 ${String(maxSize)})`
        );
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > maxSize) {
        throw new Error(
          `URL 返回的文件过大: ${String(buffer.length)} bytes (上限 ${String(maxSize)})`
        );
      }

      const b64 = buffer.toString('base64');
      const dataUrl = `data:${contentType.split(';')[0] ?? contentType};base64,${b64}`;
      return { dataUrl, mediaType };
    }

    throw new Error('URL 获取失败：重定向循环');
  } finally {
    clearTimeout(timeoutId);
  }
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

/**
 * 解析图片来源：URL 远程获取 or 本地文件读取
 *
 * URL 判定：以 http:// 或 https:// 开头 → fetch
 * 本地路径：原有流程
 */
async function resolveImageSource(
  imagePath: string,
  expectedType?: 'image' | 'video'
): Promise<{
  dataUrl: string;
  mediaType: 'image' | 'video';
}> {
  if (isRemoteUrl(imagePath)) {
    // 从 URL 推断期望类型
    const ext = imagePath.split('?')[0]?.split('.').pop()?.toLowerCase() ?? '';
    const guessedType: 'image' | 'video' =
      expectedType ?? (VIDEO_EXTENSIONS.has(ext) ? 'video' : 'image');
    return fetchUrlBase64(imagePath, guessedType);
  }
  return encodeFileBase64(imagePath);
}

// ---- 图片预处理包装 ----

/**
 * 对图片 dataUrl 进行智能预处理（resize + 压缩）
 *
 * 仅当 config.preprocessEnabled 为 true 且媒体类型为图片时生效。
 * 处理失败时降级返回原图。
 */
async function preprocessIfEnabled(
  dataUrl: string,
  mediaType: 'image' | 'video',
  toolName: string
): Promise<string> {
  if (mediaType === 'video') return dataUrl;
  if (!config.preprocessEnabled) return dataUrl;

  try {
    const preset = getToolPreset(toolName as 'describe' | 'locate' | 'ocr');
    return await preprocessImage(
      dataUrl,
      getMimeTypeForDataUrl(dataUrl) ?? 'image/png',
      preset
    );
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.warn({ error: errMsg, toolName }, '预处理失败，降级使用原图');
    metricsRegistry.recordPreprocessSkipped(toolName);
    return dataUrl;
  }
}

/** 从 data URL 中提取 MIME 类型 */
function getMimeTypeForDataUrl(dataUrl: string): string | null {
  const match = dataUrl.match(/^data:([^;]+);base64,/);
  return match?.[1] ?? null;
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
        task: z
          .enum(['general', 'diagram', 'dataviz', 'ui_code', 'ui_prompt'])
          .default('general')
          .describe(
            '分析模式：general=场景描述, diagram=技术图表, dataviz=数据可视化, ui_code=生成代码, ui_prompt=生成提示词'
          ),
      },
    },
    async params => {
      const sessionId: string = params.session_id ?? randomUUID();
      const startTime = performance.now();
      metricsRegistry.recordCall('describe');

      try {
        let dataUrl: string;
        let mediaType: 'image' | 'video';

        if (params.image_path) {
          const resolved = await resolveImageSource(params.image_path);
          dataUrl = await preprocessIfEnabled(
            resolved.dataUrl,
            resolved.mediaType,
            'describe'
          );
          mediaType = resolved.mediaType;
        } else if (params.session_id) {
          // 无新图片：fromCache 模式，跳过视觉 API 直接从缓存推理
          const result = await pipeline.describe({
            sessionId,
            imageBase64: '',
            mediaType: 'image',
            prompt: params.prompt,
            fromCache: true,
          });
          const elapsed = performance.now() - startTime;
          metricsRegistry.recordLatency('describe', elapsed);
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
          task: params.task,
        });

        const elapsed = performance.now() - startTime;
        metricsRegistry.recordLatency('describe', elapsed);
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
        metricsRegistry.recordError('describe');
        const elapsed = performance.now() - startTime;
        metricsRegistry.recordLatency('describe', elapsed);
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
            '本地图片路径或 HTTP(S) URL。如果传了 session_id 且该会话已有缓存物体，可省略此参数节省调用'
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
      const startTime = performance.now();
      metricsRegistry.recordCall('locate');

      try {
        let dataUrl: string | undefined;
        let mediaType: 'image' | 'video' | undefined;

        if (params.image_path) {
          const resolved = await resolveImageSource(params.image_path);
          dataUrl = await preprocessIfEnabled(
            resolved.dataUrl,
            resolved.mediaType,
            'locate'
          );
          mediaType = resolved.mediaType;
        }

        const result = await pipeline.locate({
          sessionId,
          imageBase64: dataUrl,
          mediaType,
          question: params.question,
          coordinatePrecision: params.coordinate_precision,
        });

        const elapsed = performance.now() - startTime;
        metricsRegistry.recordLatency('locate', elapsed);
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
        metricsRegistry.recordError('locate');
        const elapsed = performance.now() - startTime;
        metricsRegistry.recordLatency('locate', elapsed);
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
        '从图片中提取文字和表格内容。擅长：文档扫描件识别、UI 文字提取、表格结构化提取、手写体识别。传入本地图片文件路径或 HTTP(S) URL，返回识别出的文字内容。',
      inputSchema: {
        image_path: z
          .string()
          .describe(
            '本地图片文件的绝对路径或 HTTP(S) URL，支持 png/jpg/webp/gif/bmp'
          ),
        prompt: z
          .string()
          .optional()
          .describe(
            '对 OCR 结果的额外处理指令（可选），例如"只提取表格""翻译为英文""格式化为 Markdown 表格"'
          ),
      },
    },
    async params => {
      const startTime = performance.now();
      metricsRegistry.recordCall('ocr');

      try {
        const resolved = await resolveImageSource(params.image_path);
        const dataUrl = await preprocessIfEnabled(
          resolved.dataUrl,
          resolved.mediaType,
          'ocr'
        );

        const text = await pipeline.ocr({
          imageBase64: dataUrl,
          mediaType: resolved.mediaType,
          prompt: params.prompt,
        });

        const elapsed = performance.now() - startTime;
        metricsRegistry.recordLatency('ocr', elapsed);
        return {
          content: [{ type: 'text' as const, text }],
        };
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        metricsRegistry.recordError('ocr');
        const elapsed = performance.now() - startTime;
        metricsRegistry.recordLatency('ocr', elapsed);
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
          .describe(
            '本地视频文件的绝对路径或 HTTP(S) URL，支持 mp4/avi/mov/mkv/webm'
          ),
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
      const startTime = performance.now();
      metricsRegistry.recordCall('video_analyze');

      try {
        const resolved = await resolveImageSource(params.video_path, 'video');
        // 视频不做预处理
        const dataUrl = resolved.dataUrl;

        const result = await pipeline.videoAnalyze({
          sessionId,
          videoBase64: dataUrl,
          mediaType: resolved.mediaType,
          prompt: params.prompt,
        });

        const elapsed = performance.now() - startTime;
        metricsRegistry.recordLatency('video_analyze', elapsed);
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
        metricsRegistry.recordError('video_analyze');
        const elapsed = performance.now() - startTime;
        metricsRegistry.recordLatency('video_analyze', elapsed);
        return {
          content: [{ type: 'text' as const, text: `❌ 错误: ${errMsg}` }],
          isError: true,
        };
      }
    }
  );

  // ---- visual_compare ----
  server.registerTool(
    'visual_compare',
    {
      title: '截图差异对比',
      description:
        '精确对比两张 UI 截图的视觉差异，按严重程度分类输出。' +
        '适用于：UI 回归测试、CSS 变更验证、跨版本界面对比。',
      inputSchema: {
        image_path_1: z
          .string()
          .describe('修改前截图（本地路径或 HTTP(S) URL）'),
        image_path_2: z
          .string()
          .describe('修改后截图（本地路径或 HTTP(S) URL）'),
        focus: z
          .enum(['all', 'layout', 'color', 'text', 'element'])
          .default('all')
          .optional()
          .describe(
            '关注点：all=全面对比, layout=布局, color=颜色, text=文字, element=元素'
          ),
      },
    },
    async params => {
      const startTime = performance.now();
      metricsRegistry.recordCall('compare');

      try {
        const [resolved1, resolved2] = await Promise.all([
          resolveImageSource(params.image_path_1),
          resolveImageSource(params.image_path_2),
        ]);

        const [dataUrl1, dataUrl2] = await Promise.all([
          preprocessIfEnabled(
            resolved1.dataUrl,
            resolved1.mediaType,
            'compare'
          ),
          preprocessIfEnabled(
            resolved2.dataUrl,
            resolved2.mediaType,
            'compare'
          ),
        ]);

        const result = await pipeline.compare({
          imageBase64_1: dataUrl1,
          imageBase64_2: dataUrl2,
          mediaType: resolved1.mediaType,
          focus: params.focus,
        });

        const elapsed = performance.now() - startTime;
        metricsRegistry.recordLatency('compare', elapsed);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                summary: result.summary,
                differences: result.differences,
              }),
            },
          ],
        };
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        metricsRegistry.recordError('compare');
        const elapsed = performance.now() - startTime;
        metricsRegistry.recordLatency('compare', elapsed);
        return {
          content: [{ type: 'text' as const, text: `❌ 错误: ${errMsg}` }],
          isError: true,
        };
      }
    }
  );

  // ---- visual_diagnose ----
  server.registerTool(
    'visual_diagnose',
    {
      title: '错误截图诊断',
      description:
        '分析错误截图，给出结构化诊断：发生了什么 → 根因 → 修复建议 → 相关文件猜测。' +
        '适用于：前端报错截图、后端日志截图、终端错误截图、CI 失败截图。',
      inputSchema: {
        image_path: z.string().describe('错误截图（本地路径或 HTTP(S) URL）'),
        context: z
          .string()
          .optional()
          .describe('额外上下文（如"React 项目"、数据库迁移报错）'),
      },
    },
    async params => {
      const startTime = performance.now();
      metricsRegistry.recordCall('diagnose');

      try {
        const resolved = await resolveImageSource(params.image_path);
        const dataUrl = await preprocessIfEnabled(
          resolved.dataUrl,
          resolved.mediaType,
          'diagnose'
        );

        const result = await pipeline.diagnose({
          imageBase64: dataUrl,
          mediaType: resolved.mediaType,
          context: params.context,
        });

        const elapsed = performance.now() - startTime;
        metricsRegistry.recordLatency('diagnose', elapsed);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                diagnosis: result.diagnosis,
                root_cause: result.root_cause,
                suggested_fix: result.suggested_fix,
                severity: result.severity,
                error_type: result.error_type,
                related_hints: result.related_hints,
              }),
            },
          ],
        };
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        metricsRegistry.recordError('diagnose');
        const elapsed = performance.now() - startTime;
        metricsRegistry.recordLatency('diagnose', elapsed);
        return {
          content: [{ type: 'text' as const, text: `❌ 错误: ${errMsg}` }],
          isError: true,
        };
      }
    }
  );

  logger.info('ToolHandler: 6 个视觉任务工具已注册');
}
