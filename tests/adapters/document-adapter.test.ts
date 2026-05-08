/**
 * DocumentAdapter 测试
 *
 * 覆盖：MediaAdapter 接口验证、空输入、Office 文档降级、未知类型降级
 * PDF/文本渲染的集成测试跳过（依赖外部二进制 pdf-poppler）
 */
import { describe, it, expect, vi } from 'vitest';

// 在模块加载前 mock 依赖
vi.mock('../../src/config.js', () => ({
  config: {
    maxDocPages: 20,
  },
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock sharp：返回模拟的 PNG Buffer
vi.mock('sharp', () => {
  const mockToBuffer = vi.fn().mockResolvedValue(Buffer.from('mock-png-data'));
  const mockPng = vi.fn().mockReturnValue({ toBuffer: mockToBuffer });
  const mockSharp = vi.fn(() => ({ png: mockPng }));
  return { default: mockSharp };
});

// Mock pdf-poppler：模拟转换成功
vi.mock('pdf-poppler', () => ({
  default: {
    convert: vi.fn().mockResolvedValue(undefined),
  },
}));

import { DocumentAdapter } from '../../src/core/adapters/document-adapter.js';

describe('DocumentAdapter - implements MediaAdapter', () => {
  it('mediaType 从构造函数设置 - PDF', () => {
    const adapter = new DocumentAdapter('application/pdf');
    expect(adapter.mediaType).toBe('application/pdf');
  });

  it('mediaType 从构造函数设置 - TXT', () => {
    const adapter = new DocumentAdapter('text/plain');
    expect(adapter.mediaType).toBe('text/plain');
  });

  it('mediaType 从构造函数设置 - MD', () => {
    const adapter = new DocumentAdapter('text/markdown');
    expect(adapter.mediaType).toBe('text/markdown');
  });

  it('adapt 方法返回 Promise<Base64Image[]>', async () => {
    const adapter = new DocumentAdapter('application/pdf');
    const result = await adapter.adapt('dGVzdA==');
    expect(Array.isArray(result)).toBe(true);
  });

  it('readonly mediaType 满足 MediaAdapter 接口', () => {
    const adapter = new DocumentAdapter('application/pdf');
    expect(typeof adapter.mediaType).toBe('string');
  });
});

describe('DocumentAdapter - 空输入', () => {
  it('空字符串返回空数组', async () => {
    const adapter = new DocumentAdapter('application/pdf');
    const result = await adapter.adapt('');
    expect(result).toEqual([]);
  });

  it('纯空白字符串返回空数组', async () => {
    const adapter = new DocumentAdapter('text/plain');
    const result = await adapter.adapt('   ');
    expect(result).toEqual([]);
  });
});

describe('DocumentAdapter - Office 文档降级', () => {
  it('DOCX 返回空数组且不抛异常', async () => {
    const adapter = new DocumentAdapter(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    const result = await adapter.adapt('dGVzdA==');
    expect(result).toEqual([]);
  });

  it('PPTX 返回空数组且不抛异常', async () => {
    const adapter = new DocumentAdapter(
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );
    const result = await adapter.adapt('dGVzdA==');
    expect(result).toEqual([]);
  });

  it('XLSX 返回空数组且不抛异常', async () => {
    const adapter = new DocumentAdapter(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    const result = await adapter.adapt('dGVzdA==');
    expect(result).toEqual([]);
  });
});

describe('DocumentAdapter - 未知类型降级', () => {
  it('未知 MIME 类型返回空数组且不抛异常', async () => {
    const adapter = new DocumentAdapter('application/octet-stream');
    const result = await adapter.adapt('dGVzdA==');
    expect(result).toEqual([]);
  });
});
