/**
 * 图片预处理器单元测试
 *
 * 测试 getToolPreset 预设区分、isRemoteUrl URL 检测，preprocessImage 的降级兜底。
 * preprocessImage 实际 resize 行为依赖 sharp，难以在纯 mock 环境验证，
 * 此处聚焦预设配置和降级路径。
 */
import { describe, it, expect } from 'vitest';
import {
  getToolPreset,
  isRemoteUrl,
  preprocessImage,
  type PreprocessOptions,
} from '../src/core/image-preprocessor.js';

// ---- 辅助 ----

const PNG_DATA_URL = 'data:image/png;base64,iVBORw0KGgo=';

describe('getToolPreset - 各工具预设', () => {
  it('describe 预设 maxDimension=2048, quality=80, format=jpeg', () => {
    const preset = getToolPreset('describe');
    expect(preset.maxDimension).toBe(2048);
    expect(preset.quality).toBe(80);
    expect(preset.format).toBe('jpeg');
  });

  it('locate 预设 maxDimension=2048, quality=80, format=jpeg', () => {
    const preset = getToolPreset('locate');
    expect(preset.maxDimension).toBe(2048);
    expect(preset.quality).toBe(80);
    expect(preset.format).toBe('jpeg');
  });

  it('ocr 预设 maxDimension=4096, quality=90, format=png', () => {
    const preset = getToolPreset('ocr');
    expect(preset.maxDimension).toBe(4096);
    expect(preset.quality).toBe(90);
    expect(preset.format).toBe('png');
  });

  it('compare 预设 maxDimension=1536, quality=80, format=jpeg', () => {
    const preset = getToolPreset('compare');
    expect(preset.maxDimension).toBe(1536);
    expect(preset.quality).toBe(80);
    expect(preset.format).toBe('jpeg');
  });

  it('video_analyze 预设 maxDimension=0（不处理）', () => {
    const preset = getToolPreset('video_analyze');
    expect(preset.maxDimension).toBe(0);
  });

  it('未知工具名回退 describe 预设', () => {
    const preset = getToolPreset('unknown' as 'describe');
    expect(preset.maxDimension).toBe(2048);
    expect(preset.quality).toBe(80);
    expect(preset.format).toBe('jpeg');
  });

  it('describe 与 ocr 预设应不同', () => {
    const desc = getToolPreset('describe');
    const ocr = getToolPreset('ocr');
    expect(desc.maxDimension).not.toBe(ocr.maxDimension);
    expect(desc.quality).not.toBe(ocr.quality);
  });
});

describe('isRemoteUrl', () => {
  it('http:// 开头返回 true', () => {
    expect(isRemoteUrl('http://example.com/img.png')).toBe(true);
  });

  it('https:// 开头返回 true', () => {
    expect(isRemoteUrl('https://cdn.example.com/photo.jpg')).toBe(true);
  });

  it('HTTP 开头也匹配（大小写不敏感）', () => {
    expect(isRemoteUrl('HTTP://example.com/img.png')).toBe(true);
  });

  it('本地绝对路径返回 false', () => {
    expect(isRemoteUrl('/home/user/img.png')).toBe(false);
  });

  it('Windows 路径返回 false', () => {
    expect(isRemoteUrl('E:\\images\\photo.png')).toBe(false);
  });

  it('相对路径返回 false', () => {
    expect(isRemoteUrl('./images/photo.png')).toBe(false);
  });
});

describe('preprocessImage - 降级兜底', () => {
  it('视频 mediaType 直接返回原数据', async () => {
    const data = 'data:video/mp4;base64,AAAA';
    const result = await preprocessImage(data, 'video/mp4', {
      maxDimension: 2048,
      quality: 80,
      format: 'jpeg',
    });
    expect(result).toBe(data);
  });

  it('preset.maxDimension=0 直接返回原数据', async () => {
    const result = await preprocessImage(PNG_DATA_URL, 'image/png', {
      maxDimension: 0,
      quality: 80,
      format: 'jpeg',
    });
    expect(result).toBe(PNG_DATA_URL);
  });

  it('无效 data URL 触发降级返回原数据', async () => {
    const invalid = 'not-a-valid-data-url';
    const result = await preprocessImage(invalid, 'image/png', {
      maxDimension: 2048,
      quality: 80,
      format: 'jpeg',
    });
    // 降级返回原数据
    expect(result).toBe(invalid);
  });

  it('非图片 MIME type 直接跳过', async () => {
    const data = 'data:application/pdf;base64,AAAA';
    const result = await preprocessImage(data, 'application/pdf', {
      maxDimension: 2048,
      quality: 80,
      format: 'jpeg',
    });
    expect(result).toBe(data);
  });
});

describe('PreprocessOptions 接口', () => {
  it('maxDimension、quality、format 必须全部提供', () => {
    const opt: PreprocessOptions = {
      maxDimension: 2048,
      quality: 80,
      format: 'jpeg',
    };
    expect(opt.maxDimension).toBe(2048);
    expect(opt.quality).toBe(80);
    expect(opt.format).toBe('jpeg');
  });
});
