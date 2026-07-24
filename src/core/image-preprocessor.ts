/**
 * 图片智能预处理
 *
 * 根据工具类型预设，对输入图片进行 resize + 质量压缩，减少 token 消耗。
 * 使用 sharp 进行流式处理，处理失败时降级为原图。
 */

import { logger } from '../utils/logger.js';
import type { VisualTask } from '../types.js';

// ---- 类型 ----

export interface PreprocessOptions {
  maxDimension: number;
  quality: number;
  format: 'jpeg' | 'png';
}

/** 各工具预设配置 */
const TOOL_PRESETS: Record<string, PreprocessOptions> = {
  describe: { maxDimension: 2048, quality: 80, format: 'jpeg' },
  locate: { maxDimension: 2048, quality: 80, format: 'jpeg' },
  ocr: { maxDimension: 4096, quality: 90, format: 'png' },
  diagnose: { maxDimension: 2048, quality: 80, format: 'jpeg' },
  compare: { maxDimension: 1536, quality: 80, format: 'jpeg' },
  video_analyze: { maxDimension: 0, quality: 80, format: 'jpeg' }, // 不处理
};

/** 支持的图片 MIME 类型 */
const IMAGE_MIME_PATTERN = /^image\/(jpeg|png|webp|gif|bmp)$/i;

// ---- 导出函数 ----

/**
 * 获取工具对应的预处理预设
 *
 * @param tool 视觉任务类型
 * @returns 预处理配置
 */
export function getToolPreset(
  tool: VisualTask | 'compare' | 'diagnose'
): PreprocessOptions {
  const preset = TOOL_PRESETS[tool] ?? TOOL_PRESETS['describe'];
  if (!preset) {
    return { maxDimension: 2048, quality: 80, format: 'jpeg' };
  }
  return preset;
}

/**
 * 对图片进行预处理（resize + 压缩）
 *
 * sharp 流式处理：sharp(buffer).resize(...).jpeg({ quality }).toBuffer()，自动管理内存。
 * 处理失败时降级为原图，记录 warn 日志，不阻断流程。
 *
 * @param dataUrl 原始 data URL（data:image/xxx;base64,...）
 * @param mediaType MIME 类型字符串
 * @param preset 预处理配置
 * @returns 处理后的 data URL
 */
export async function preprocessImage(
  dataUrl: string,
  mediaType: string,
  preset: PreprocessOptions
): Promise<string> {
  // 只处理图片，视频跳过
  if (!IMAGE_MIME_PATTERN.test(mediaType)) {
    return dataUrl;
  }

  // video_analyze 的占位预设
  if (preset.maxDimension === 0) {
    return dataUrl;
  }

  try {
    const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64, 'base64');

    // 动态导入 sharp（避免 require 在非安装时崩溃）
    const sharp = await loadSharp();

    // 先获取原图尺寸
    const metadata = await sharp(buffer).metadata();
    const originalWidth = metadata.width ?? 0;
    const originalHeight = metadata.height ?? 0;

    if (originalWidth === 0 || originalHeight === 0) {
      logger.warn({ mediaType }, '无法获取原图尺寸，跳过预处理');
      return dataUrl;
    }

    // 原图尺寸 ≤ maxDimension 时跳过 resize，仅做质量压缩
    const needsResize =
      originalWidth > preset.maxDimension ||
      originalHeight > preset.maxDimension;

    let sharpInstance = sharp(buffer);

    if (needsResize) {
      sharpInstance = sharpInstance.resize({
        width: preset.maxDimension,
        height: preset.maxDimension,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    // 格式转换 + 质量压缩
    const outputMime = preset.format === 'png' ? 'image/png' : 'image/jpeg';
    const processedBuffer =
      preset.format === 'png'
        ? await sharpInstance.png({ quality: preset.quality }).toBuffer()
        : await sharpInstance.jpeg({ quality: preset.quality }).toBuffer();

    const newBase64 = processedBuffer.toString('base64');

    const originalSize = buffer.length;
    const newSize = processedBuffer.length;
    const reduction =
      originalSize > 0 ? Math.round((1 - newSize / originalSize) * 100) : 0;

    logger.info(
      {
        originalWidth,
        originalHeight,
        preset,
        originalSize,
        newSize,
        reductionPercent: reduction,
        didResize: needsResize,
      },
      `图片预处理完成：${originalWidth}x${originalHeight} → ${needsResize ? `${preset.maxDimension}px` : '等大'}，压缩率 ${reduction}%`
    );

    return `data:${outputMime};base64,${newBase64}`;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.warn({ error: errMsg }, '图片预处理失败，降级使用原图');
    return dataUrl;
  }
}

/**
 * 判断是否为可远程获取的 HTTP(S) URL
 */
export function isRemoteUrl(imagePath: string): boolean {
  return /^https?:\/\//i.test(imagePath);
}

/** sharp 模块缓存 */
let sharpModule: typeof import('sharp').default | null = null;

async function loadSharp(): Promise<typeof import('sharp').default> {
  if (sharpModule) return sharpModule;
  const mod = await import('sharp');
  sharpModule = mod.default;
  if (!sharpModule) {
    throw new Error('sharp 模块加载失败');
  }
  return sharpModule;
}
