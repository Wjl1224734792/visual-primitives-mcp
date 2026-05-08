/**
 * 配置校验测试（TDD Red 阶段）
 * 测试 config.ts 的环境变量校验逻辑
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// 需要测试的模块路径
const CONFIG_MODULE = '../src/config.js';

// 保存和恢复环境变量的工具函数
let savedEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  vi.resetModules();
  // 保存原始环境变量
  savedEnv = { ...process.env };
  // 清除所有配置相关的环境变量，确保测试隔离
  delete process.env.VISION_API_BASE_URL;
  delete process.env.VISION_API_KEY;
  delete process.env.VISION_MODEL_NAME;
  delete process.env.COORDINATE_PRECISION;
  delete process.env.MCP_TRANSPORT;
  delete process.env.LOG_LEVEL;
  delete process.env.TIMEOUT_MS;
  delete process.env.SESSION_TTL_SECONDS;
  delete process.env.DB_PATH;
  delete process.env.MAX_VIDEO_FRAMES;
  delete process.env.MAX_DOC_PAGES;
  delete process.env.PORT;
});

afterEach(() => {
  // 恢复原始环境变量
  process.env = savedEnv;
});

describe('ConfigLoader - 必填项校验', () => {
  it('缺少 VISION_API_BASE_URL 时应抛出明确错误', async () => {
    process.env.VISION_API_KEY = 'sk-test';
    process.env.VISION_MODEL_NAME = 'test-model';

    await expect(import(CONFIG_MODULE)).rejects.toThrow(/VISION_API_BASE_URL/i);
  });

  it('缺少 VISION_API_KEY 时应抛出明确错误', async () => {
    process.env.VISION_API_BASE_URL = 'https://api.test.com/v1';
    process.env.VISION_MODEL_NAME = 'test-model';

    await expect(import(CONFIG_MODULE)).rejects.toThrow(/VISION_API_KEY/i);
  });

  it('缺少 VISION_MODEL_NAME 时应抛出明确错误', async () => {
    process.env.VISION_API_BASE_URL = 'https://api.test.com/v1';
    process.env.VISION_API_KEY = 'sk-test';

    await expect(import(CONFIG_MODULE)).rejects.toThrow(/VISION_MODEL_NAME/i);
  });
});

describe('ConfigLoader - 可选变量默认值', () => {
  beforeEach(() => {
    // 设置必填项
    process.env.VISION_API_BASE_URL = 'https://api.test.com/v1';
    process.env.VISION_API_KEY = 'sk-test';
    process.env.VISION_MODEL_NAME = 'test-model';
  });

  it('未设置 COORDINATE_PRECISION 时默认值为 0-1000', async () => {
    const { config } = await import(CONFIG_MODULE);
    expect(config.coordinatePrecision).toBe('0-1000');
  });

  it('未设置 MCP_TRANSPORT 时默认值为 stdio', async () => {
    const { config } = await import(CONFIG_MODULE);
    expect(config.mcpTransport).toBe('stdio');
  });

  it('未设置 LOG_LEVEL 时默认值为 info', async () => {
    const { config } = await import(CONFIG_MODULE);
    expect(config.logLevel).toBe('info');
  });

  it('未设置 TIMEOUT_MS 时默认值为 45000', async () => {
    const { config } = await import(CONFIG_MODULE);
    expect(config.timeoutMs).toBe(45000);
  });

  it('未设置 SESSION_TTL_SECONDS 时默认值为 3600', async () => {
    const { config } = await import(CONFIG_MODULE);
    expect(config.sessionTtlSeconds).toBe(3600);
  });

  it('未设置 DB_PATH 时默认值为 ./data/grounding.db', async () => {
    const { config } = await import(CONFIG_MODULE);
    expect(config.dbPath).toBe('./data/grounding.db');
  });

  it('未设置 MAX_VIDEO_FRAMES 时默认值为 10', async () => {
    const { config } = await import(CONFIG_MODULE);
    expect(config.maxVideoFrames).toBe(10);
  });

  it('未设置 MAX_DOC_PAGES 时默认值为 20', async () => {
    const { config } = await import(CONFIG_MODULE);
    expect(config.maxDocPages).toBe(20);
  });

  it('未设置 PORT 时默认值为 3000', async () => {
    const { config } = await import(CONFIG_MODULE);
    expect(config.port).toBe(3000);
  });
});

describe('ConfigLoader - 可选变量校验', () => {
  beforeEach(() => {
    process.env.VISION_API_BASE_URL = 'https://api.test.com/v1';
    process.env.VISION_API_KEY = 'sk-test';
    process.env.VISION_MODEL_NAME = 'test-model';
  });

  it('COORDINATE_PRECISION 设置为无效值时应抛出错误', async () => {
    process.env.COORDINATE_PRECISION = '0-500';
    await expect(import(CONFIG_MODULE)).rejects.toThrow();
  });

  it('COORDINATE_PRECISION 设置为 0-100 时应生效', async () => {
    process.env.COORDINATE_PRECISION = '0-100';
    const { config } = await import(CONFIG_MODULE);
    expect(config.coordinatePrecision).toBe('0-100');
  });

  it('COORDINATE_PRECISION 设置为 0-1000 时应生效', async () => {
    process.env.COORDINATE_PRECISION = '0-1000';
    const { config } = await import(CONFIG_MODULE);
    expect(config.coordinatePrecision).toBe('0-1000');
  });

  it('MCP_TRANSPORT 设置为无效值时应抛出错误', async () => {
    process.env.MCP_TRANSPORT = 'websocket';
    await expect(import(CONFIG_MODULE)).rejects.toThrow();
  });

  it('LOG_LEVEL 设置为无效值时应抛出错误', async () => {
    process.env.LOG_LEVEL = 'verbose';
    await expect(import(CONFIG_MODULE)).rejects.toThrow();
  });

  it('TIMEOUT_MS 设置为负数时应抛出错误', async () => {
    process.env.TIMEOUT_MS = '-100';
    await expect(import(CONFIG_MODULE)).rejects.toThrow();
  });

  it('PORT 设置为超出范围值时应抛出错误', async () => {
    process.env.PORT = '99999';
    await expect(import(CONFIG_MODULE)).rejects.toThrow();
  });

  it('MAX_VIDEO_FRAMES 设置为 0 时应抛出错误', async () => {
    process.env.MAX_VIDEO_FRAMES = '0';
    await expect(import(CONFIG_MODULE)).rejects.toThrow();
  });

  it('MAX_DOC_PAGES 设置为 100 时应抛出错误', async () => {
    process.env.MAX_DOC_PAGES = '100';
    await expect(import(CONFIG_MODULE)).rejects.toThrow();
  });
});

describe('ConfigLoader - 自定义值生效', () => {
  beforeEach(() => {
    process.env.VISION_API_BASE_URL = 'https://custom.api.com/v2';
    process.env.VISION_API_KEY = 'sk-custom';
    process.env.VISION_MODEL_NAME = 'custom-model';
  });

  it('设置 TIMEOUT_MS=60000 应正确解析', async () => {
    process.env.TIMEOUT_MS = '60000';
    const { config } = await import(CONFIG_MODULE);
    expect(config.timeoutMs).toBe(60000);
  });

  it('设置 SESSION_TTL_SECONDS=7200 应正确解析', async () => {
    process.env.SESSION_TTL_SECONDS = '7200';
    const { config } = await import(CONFIG_MODULE);
    expect(config.sessionTtlSeconds).toBe(7200);
  });

  it('设置 PORT=8080 应正确解析', async () => {
    process.env.PORT = '8080';
    const { config } = await import(CONFIG_MODULE);
    expect(config.port).toBe(8080);
  });

  it('设置 MCP_TRANSPORT=sse 应正确解析', async () => {
    process.env.MCP_TRANSPORT = 'sse';
    const { config } = await import(CONFIG_MODULE);
    expect(config.mcpTransport).toBe('sse');
  });

  it('设置 LOG_LEVEL=debug 应正确解析', async () => {
    process.env.LOG_LEVEL = 'debug';
    const { config } = await import(CONFIG_MODULE);
    expect(config.logLevel).toBe('debug');
  });
});
