/**
 * ImageAdapter 测试
 *
 * 覆盖：正常 Base64 透传、超大输入拒绝、空输入、MIME 类型检测
 */
import { describe, it, expect } from 'vitest';
import { ImageAdapter } from '../../src/core/adapters/image-adapter.js';

/** 有效的 JPEG Base64 数据（最小验证用） */
const VALID_JPEG_BASE64 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAA==';

describe('ImageAdapter - adapt()', () => {
  it('正常 JPEG Base64 输入返回单元素 Base64Image[]', async () => {
    const adapter = new ImageAdapter();
    const result = await adapter.adapt(VALID_JPEG_BASE64);

    expect(result).toHaveLength(1);
    expect(result[0]).toBeDefined();
    expect(result[0]?.base64).toBe(VALID_JPEG_BASE64);
    expect(result[0]?.mime_type).toBe('image/jpeg');
  });

  it('data: URL 前缀携带 PNG 类型时正确提取 MIME 类型', async () => {
    const adapter = new ImageAdapter();
    const dataUrl = `data:image/png;base64,${VALID_JPEG_BASE64}`;
    const result = await adapter.adapt(dataUrl);

    expect(result).toHaveLength(1);
    expect(result[0]?.mime_type).toBe('image/png');
    // 应去除 data: URL 前缀
    expect(result[0]?.base64).toBe(VALID_JPEG_BASE64);
  });

  it('空字符串输入返回空数组', async () => {
    const adapter = new ImageAdapter();

    const result1 = await adapter.adapt('');
    expect(result1).toHaveLength(0);

    const result2 = await adapter.adapt('   ');
    expect(result2).toHaveLength(0);
  });

  it('超过大小限制的 Base64 返回空数组', async () => {
    // 使用较小的 maxBase64Length 以便快速测试
    const adapter = new ImageAdapter(100);
    const largeInput = 'a'.repeat(101);
    const result = await adapter.adapt(largeInput);

    expect(result).toHaveLength(0);
  });

  it('恰好等于限制的 Base64 通过校验', async () => {
    const adapter = new ImageAdapter(100);
    const exactInput = 'a'.repeat(100);
    const result = await adapter.adapt(exactInput);

    expect(result).toHaveLength(1);
    expect(result[0]?.mime_type).toBe('image/jpeg');
  });
});

describe('ImageAdapter - mediaType', () => {
  it('mediaType 属性为 "image"', () => {
    const adapter = new ImageAdapter();
    expect(adapter.mediaType).toBe('image');
  });
});

describe('ImageAdapter - implements MediaAdapter', () => {
  it('readonly mediaType 满足接口', () => {
    const adapter = new ImageAdapter();
    expect(typeof adapter.mediaType).toBe('string');
  });

  it('adapt 方法返回 Promise<Base64Image[]>', async () => {
    const adapter = new ImageAdapter();
    const result = await adapter.adapt(VALID_JPEG_BASE64);
    expect(Array.isArray(result)).toBe(true);
  });
});
