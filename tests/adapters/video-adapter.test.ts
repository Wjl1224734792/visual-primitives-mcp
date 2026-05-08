/**
 * VideoAdapter 测试
 *
 * 覆盖：MediaAdapter 接口验证、空输入、ffmpeg 不可用降级
 * 跳过实际 FFmpeg 调用的集成测试（依赖外部二进制）
 */
import { describe, it, expect, vi } from 'vitest';

// 在模块加载前 mock 依赖
vi.mock('../../src/config.js', () => ({
  config: {
    maxVideoFrames: 10,
  },
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// 模拟 ffmpeg 不可用
vi.mock('ffmpeg-static', () => ({
  default: null,
}));

import { VideoAdapter } from '../../src/core/adapters/video-adapter.js';

describe('VideoAdapter - implements MediaAdapter', () => {
  it('mediaType 属性为 "video"', () => {
    const adapter = new VideoAdapter();
    expect(adapter.mediaType).toBe('video');
  });

  it('adapt 方法返回 Promise<Base64Image[]>', async () => {
    const adapter = new VideoAdapter();
    const result = await adapter.adapt('dGVzdA==');
    expect(Array.isArray(result)).toBe(true);
  });

  it('readonly mediaType 满足 MediaAdapter 接口', () => {
    const adapter = new VideoAdapter();
    expect(typeof adapter.mediaType).toBe('string');
    expect(adapter.mediaType).toBe('video');
  });
});

describe('VideoAdapter - 空输入', () => {
  it('空字符串返回空数组', async () => {
    const adapter = new VideoAdapter();
    const result = await adapter.adapt('');
    expect(result).toEqual([]);
  });

  it('纯空白字符串返回空数组', async () => {
    const adapter = new VideoAdapter();
    const result = await adapter.adapt('   ');
    expect(result).toEqual([]);
  });
});

describe('VideoAdapter - 降级处理', () => {
  it('ffmpeg 不可用时返回空数组（不抛异常）', async () => {
    const adapter = new VideoAdapter();
    const result = await adapter.adapt('dGVzdA==');
    expect(result).toEqual([]);
  });

  it('无效 Base64 内容不抛异常', async () => {
    const adapter = new VideoAdapter();
    const result = await adapter.adapt('!!!not-valid-base64!!!');
    expect(Array.isArray(result)).toBe(true);
  });
});
