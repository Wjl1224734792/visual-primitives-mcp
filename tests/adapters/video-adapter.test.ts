/**
 * VideoAdapter 测试
 *
 * 覆盖：MediaAdapter 接口验证、空输入、大小限制
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { VideoAdapter } from '../../src/core/adapters/video-adapter.js';

describe('VideoAdapter', () => {
  let adapter: VideoAdapter;

  beforeEach(() => {
    adapter = new VideoAdapter();
  });

  it('mediaType 应为 video', () => {
    expect(adapter.mediaType).toBe('video');
  });

  it('空字符串应返回空数组', async () => {
    const result = await adapter.adapt('');
    expect(result).toEqual([]);
  });

  it('纯空格字符串应返回空数组', async () => {
    const result = await adapter.adapt('   ');
    expect(result).toEqual([]);
  });

  it('有效 data URL 应解析并返回 Base64Image', async () => {
    const result = await adapter.adapt('data:video/mp4;base64,dGVzdA==');
    expect(result).toHaveLength(1);
    expect(result[0]!.base64).toBe('dGVzdA==');
    expect(result[0]!.mime_type).toBe('video/mp4');
  });

  it('mov 格式应正确检测', async () => {
    const result = await adapter.adapt('data:video/mov;base64,dGVzdA==');
    expect(result).toHaveLength(1);
    expect(result[0]!.mime_type).toBe('video/mov');
  });

  it('无 data URL 前缀时应默认为 video/mp4', async () => {
    const result = await adapter.adapt('dGVzdA==');
    expect(result).toHaveLength(1);
    expect(result[0]!.mime_type).toBe('video/mp4');
    expect(result[0]!.base64).toBe('dGVzdA==');
  });

  it('超过 100MB 限制应返回空数组', async () => {
    const huge = 'x'.repeat(133_333_334);
    const result = await adapter.adapt(huge);
    expect(result).toEqual([]);
  });
});
