/**
 * 视频适配器：将 Base64 视频解码并抽帧为统一的 Base64Image 数组
 *
 * Implements MediaAdapter 接口。
 * 支持 MP4/MOV/AVI/MKV/WebM 格式。
 * 优先使用 ffmpeg-static 内嵌二进制，不可用时 fallback 到系统 PATH 上的 ffmpeg。
 * 抽帧策略（MVP）：固定每 3 秒一帧，帧数不超过 config.maxVideoFrames。
 * ffmpeg 不可用或抽帧失败时返回空数组（降级兜底，不抛异常）。
 */
import { execFileSync } from 'node:child_process';
import {
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import * as _ffmpeg from 'ffmpeg-static';

import type { MediaAdapter, Base64Image } from '../../types.js';
import { config } from '../../config.js';
import { logger } from '../../utils/logger.js';

/**
 * ffmpeg 二进制路径。
 * 优先使用 ffmpeg-static 内嵌二进制，不可用时 fallback 到系统 PATH 上的 "ffmpeg" 命令。
 * 返回 null 表示完全不可用，适配器将降级返回空数组。
 */
const ffmpegPath: string | null =
  (_ffmpeg as unknown as { default: string | null }).default ?? 'ffmpeg';

/** 匹配 data: URL 前缀的正则，捕获到 ;base64, 为止 */
const DATA_URL_PREFIX_REGEX = /^data:[^;]*;base64,/i;

/** 默认视频扩展名（无法从 MIME 推断时使用） */
const DEFAULT_EXTENSION = '.mp4';

/**
 * 去除 data: URL 前缀，返回纯 Base64 数据
 * @param input Base64 输入字符串（可含 data: URL 前缀）
 * @returns 纯 Base64 数据
 */
function stripDataUrlPrefix(input: string): string {
  const match = DATA_URL_PREFIX_REGEX.exec(input);
  if (match) {
    return input.slice(match[0].length);
  }
  return input;
}

export class VideoAdapter implements MediaAdapter {
  /** 适配器支持的媒体类型标识 */
  readonly mediaType = 'video';

  /**
   * 将 Base64 视频适配为关键帧 Base64Image 数组
   * @param input Base64 编码的视频字符串（可含 data: URL 前缀）
   * @returns 抽帧后的 Base64Image 数组；失败时返回空数组
   */
  adapt(input: string): Promise<Base64Image[]> {
    // 空输入 / 纯空白输入
    if (!input || input.trim().length === 0) {
      logger.warn('VideoAdapter: 输入为空或仅含空白，返回空数组');
      return Promise.resolve([]);
    }

    const rawBase64 = stripDataUrlPrefix(input);

    // ffmpeg 不可用
    if (!ffmpegPath) {
      logger.warn('VideoAdapter: ffmpeg 不可用，返回空数组');
      return Promise.resolve([]);
    }

    const videoBuffer = Buffer.from(rawBase64, 'base64');

    // 创建临时工作目录
    const workDir = join(tmpdir(), `vision-mcp-video-${randomUUID()}`);
    mkdirSync(workDir, { recursive: true });

    const videoFile = join(workDir, `input${DEFAULT_EXTENSION}`);

    try {
      // 写入视频临时文件
      writeFileSync(videoFile, videoBuffer);

      const maxFrames = config.maxVideoFrames;

      // 使用 fps 滤镜每 3 秒抽一帧
      const fps = 1 / 3;
      const outputPattern = join(workDir, 'frame_%d.jpg');

      execFileSync(
        ffmpegPath,
        [
          '-y', // 覆盖已有输出文件
          '-i',
          videoFile,
          '-vf',
          `fps=${String(fps)}`,
          '-frames:v',
          String(maxFrames),
          '-q:v',
          '2', // JPEG 质量约 85%
          outputPattern,
        ],
        {
          timeout: 120_000, // 2 分钟超时
          stdio: ['ignore', 'ignore', 'pipe'],
        }
      );

      // 收集生成的帧文件
      const frames: Base64Image[] = [];
      for (let frameIndex = 1; frameIndex <= maxFrames; frameIndex++) {
        const frameFile = join(workDir, `frame_${String(frameIndex)}.jpg`);
        if (!existsSync(frameFile)) {
          break; // 没有更多帧
        }

        const frameBuffer = readFileSync(frameFile);
        const base64Data = frameBuffer.toString('base64');
        // 近似时间戳：每帧间隔 3 秒
        const timestampSec = (frameIndex - 1) * 3;

        frames.push({
          base64: base64Data,
          mime_type: 'image/jpeg',
          timestamp_sec: timestampSec,
        });
      }

      logger.info({ frameCount: frames.length }, 'VideoAdapter: 视频抽帧完成');

      return Promise.resolve(frames);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.warn({ error: errMsg }, 'VideoAdapter: 视频抽帧失败，返回空数组');
      return Promise.resolve([]);
    } finally {
      // 清理所有临时文件
      try {
        rmSync(workDir, { recursive: true, force: true });
      } catch {
        // 清理失败不阻塞
      }
    }
  }
}
