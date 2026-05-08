/**
 * 文档适配器：将 Base64 文档渲染为统一的 Base64Image 数组
 *
 * Implements MediaAdapter 接口。
 * 支持 PDF / DOCX / PPTX / XLSX / TXT / MD。
 * MVP 阶段仅实现 P0 视觉渲染路径：
 *   - PDF：使用 pdf-poppler 渲染每页为 PNG
 *   - TXT/MD：使用 sharp 将文本渲染为 SVG → PNG 图像
 *   - Office 文档（DOCX/PPTX/XLSX）：返回空数组 + 警告日志
 * 渲染失败时返回空数组（降级兜底，不抛异常）。
 */
import {
  writeFileSync,
  readFileSync,
  readdirSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';

import sharp from 'sharp';
import * as pdfPoppler from 'pdf-poppler';

import type { MediaAdapter, Base64Image } from '../../types.js';
import { config } from '../../config.js';
import { logger } from '../../utils/logger.js';

/** 匹配 data: URL 前缀的正则 */
const DATA_URL_PREFIX_REGEX = /^data:[^;]*;base64,/i;

/** 文本渲染：每页最大字符数 */
const CHARS_PER_PAGE = 3000;
/** 文本渲染：每行最大字符数 */
const CHARS_PER_LINE = 80;
/** 文本渲染：行高（像素） */
const LINE_HEIGHT = 20;
/** 文本渲染：SVG 内边距（像素） */
const SVG_PADDING = 40;

/** Office 文档 MIME 类型前缀 */
const OFFICE_MIME_PREFIX = 'application/vnd.openxmlformats-officedocument.';

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

/**
 * 对文本进行 XML 转义，防止 SVG 注入
 * @param text 原始文本
 * @returns 转义后的文本
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class DocumentAdapter implements MediaAdapter {
  /** 适配器支持的媒体类型标识（从构造函数注入） */
  readonly mediaType: string;

  /**
   * @param mimeType 文档的 MIME 类型（如 application/pdf）
   */
  constructor(mimeType: string) {
    this.mediaType = mimeType;
  }

  /**
   * 将 Base64 文档适配为页面图像数组
   * @param input Base64 编码的文档字符串（可含 data: URL 前缀）
   * @returns 渲染后的 Base64Image 数组；失败时返回空数组
   */
  async adapt(input: string): Promise<Base64Image[]> {
    // 空输入 / 纯空白输入
    if (!input || input.trim().length === 0) {
      logger.warn('DocumentAdapter: 输入为空或仅含空白，返回空数组');
      return [];
    }

    const rawBase64 = stripDataUrlPrefix(input);

    try {
      // PDF 渲染路径
      if (this.mediaType === 'application/pdf') {
        return await this.handlePdf(rawBase64);
      }

      // 纯文本渲染路径
      if (
        this.mediaType === 'text/plain' ||
        this.mediaType === 'text/markdown'
      ) {
        return await this.handleText(rawBase64);
      }

      // Office 文档：MVP 阶段暂不支持
      if (this.mediaType.startsWith(OFFICE_MIME_PREFIX)) {
        logger.warn(
          { mediaType: this.mediaType },
          'DocumentAdapter: Office 文档暂不支持，请转换为 PDF 后重试'
        );
        return [];
      }

      // 未知文档类型
      logger.warn(
        { mediaType: this.mediaType },
        'DocumentAdapter: 不支持的文档类型，返回空数组'
      );
      return [];
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.warn(
        { error: errMsg, mediaType: this.mediaType },
        'DocumentAdapter: 渲染失败，返回空数组'
      );
      return [];
    }
  }

  /**
   * PDF 渲染：每页转换为 Base64 PNG
   * 使用 pdf-poppler 调用系统 poppler-utils 进行渲染
   * @param rawBase64 纯 Base64 编码的 PDF 数据
   * @returns 每页的 Base64Image 数组
   */
  private async handlePdf(rawBase64: string): Promise<Base64Image[]> {
    const pdfBuffer = Buffer.from(rawBase64, 'base64');

    // 创建临时工作目录
    const workDir = join(tmpdir(), `vision-mcp-pdf-${randomUUID()}`);
    mkdirSync(workDir, { recursive: true });

    const pdfFile = join(workDir, 'input.pdf');

    try {
      writeFileSync(pdfFile, pdfBuffer);

      // 使用 pdf-poppler 将 PDF 转换为 PNG
      await pdfPoppler.convert(pdfFile, {
        format: 'png',
        out_dir: workDir,
        out_prefix: 'page',
        // page: null 表示所有页面
      });

      // 收集生成的 PNG 文件
      const pngFiles = readdirSync(workDir)
        .filter(f => extname(f).toLowerCase() === '.png')
        .sort(); // 按文件名排序保证页码顺序

      const maxPages = config.maxDocPages;
      const results: Base64Image[] = [];

      for (let i = 0; i < Math.min(pngFiles.length, maxPages); i++) {
        const file = pngFiles[i];
        if (!file) continue;

        const pngBuffer = readFileSync(join(workDir, file));
        results.push({
          base64: pngBuffer.toString('base64'),
          mime_type: 'image/png',
          page_number: i + 1,
        });
      }

      logger.info(
        { pageCount: results.length, mediaType: this.mediaType },
        'DocumentAdapter: PDF 渲染完成'
      );

      return results;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.warn(
        { error: errMsg },
        'DocumentAdapter: PDF 渲染失败，返回空数组'
      );
      return [];
    } finally {
      // 清理临时文件
      try {
        rmSync(workDir, { recursive: true, force: true });
      } catch {
        // 清理失败不阻塞
      }
    }
  }

  /**
   * 文本渲染：将纯文本/Markdown 渲染为 SVG → PNG 图像
   * @param rawBase64 纯 Base64 编码的文本数据
   * @returns 每页的 Base64Image 数组
   */
  private async handleText(rawBase64: string): Promise<Base64Image[]> {
    const textContent = Buffer.from(rawBase64, 'base64').toString('utf-8');

    const maxPages = config.maxDocPages;
    const results: Base64Image[] = [];
    let offset = 0;
    let pageNum = 0;

    while (offset < textContent.length && pageNum < maxPages) {
      const chunk = textContent.slice(offset, offset + CHARS_PER_PAGE);
      offset += CHARS_PER_PAGE;

      const lines = this.wrapLines(chunk, CHARS_PER_LINE);
      const svgHeight = lines.length * LINE_HEIGHT + SVG_PADDING * 2;
      const svgContent = this.buildTextSvg(lines, svgHeight);

      const pngBuffer = await sharp(Buffer.from(svgContent, 'utf-8'))
        .png()
        .toBuffer();

      results.push({
        base64: pngBuffer.toString('base64'),
        mime_type: 'image/png',
        page_number: pageNum + 1,
      });

      pageNum++;
    }

    logger.info(
      { pageCount: results.length, mediaType: this.mediaType },
      'DocumentAdapter: 文本渲染完成'
    );

    return results;
  }

  /**
   * 将文本按最大行宽拆分为行数组
   * @param text 原始文本
   * @param maxCharsPerLine 每行最大字符数
   * @returns 拆分后的行数组
   */
  private wrapLines(text: string, maxCharsPerLine: number): string[] {
    const lines: string[] = [];
    for (const paragraph of text.split('\n')) {
      if (paragraph.length === 0) {
        lines.push('');
        continue;
      }
      let pos = 0;
      while (pos < paragraph.length) {
        lines.push(paragraph.slice(pos, pos + maxCharsPerLine));
        pos += maxCharsPerLine;
      }
    }
    return lines;
  }

  /**
   * 构建包含文本内容的 SVG 字符串
   * @param lines 文本行数组
   * @param height SVG 高度（像素）
   * @returns SVG Markup 字符串
   */
  private buildTextSvg(lines: string[], height: number): string {
    const initialY = SVG_PADDING + 16; // 首行基线 y 坐标
    const paddingStr = String(SVG_PADDING);
    const lineHeightStr = String(LINE_HEIGHT);
    const tspans = lines
      .map(
        (line, i) =>
          `<tspan x="${paddingStr}" dy="${i === 0 ? '0' : lineHeightStr}">${escapeXml(line)}</tspan>`
      )
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${String(height)}">
  <rect width="100%" height="100%" fill="white"/>
  <text font-family="monospace" font-size="14" fill="black" x="${paddingStr}" y="${String(initialY)}">
${tspans}
  </text>
</svg>`;
  }
}
