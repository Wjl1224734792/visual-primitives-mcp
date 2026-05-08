/**
 * 配置校验测试（TDD Red 阶段）
 * 测试 config.ts 的环境变量校验逻辑
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const CONFIG_MODULE = '../src/config.js';

let savedEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  vi.resetModules();
  savedEnv = { ...process.env };
  delete process.env.VISION_API_BASE_URL;
  delete process.env.VISION_API_KEY;
  delete process.env.VISION_MODEL_NAME;
  delete process.env.VISION_DESCRIBE_BASE_URL;
  delete process.env.VISION_DESCRIBE_API_KEY;
  delete process.env.VISION_DESCRIBE_MODEL;
  delete process.env.VISION_LOCATE_BASE_URL;
  delete process.env.VISION_LOCATE_API_KEY;
  delete process.env.VISION_LOCATE_MODEL;
  delete process.env.VISION_OCR_BASE_URL;
  delete process.env.VISION_OCR_API_KEY;
  delete process.env.VISION_OCR_MODEL;
  delete process.env.VISION_VIDEO_BASE_URL;
  delete process.env.VISION_VIDEO_API_KEY;
  delete process.env.VISION_VIDEO_MODEL;
  delete process.env.COORDINATE_PRECISION;
  delete process.env.MCP_TRANSPORT;
  delete process.env.LOG_LEVEL;
  delete process.env.TIMEOUT_MS;
  delete process.env.SESSION_TTL_SECONDS;
  delete process.env.DB_PATH;
  delete process.env.PORT;
});

afterEach(() => {
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

  it('未设置 PORT 时默认值为 3000', async () => {
    const { config } = await import(CONFIG_MODULE);
    expect(config.port).toBe(3000);
  });
});

describe('ConfigLoader - 分级模型配置', () => {
  beforeEach(() => {
    process.env.VISION_API_BASE_URL = 'https://api.test.com/v1';
    process.env.VISION_API_KEY = 'sk-test';
    process.env.VISION_MODEL_NAME = 'default-model';
  });

  it('未设置专用模型时所有任务使用默认模型', async () => {
    const { config } = await import(CONFIG_MODULE);
    expect(config.describe.model).toBe('default-model');
    expect(config.locate.model).toBe('default-model');
    expect(config.ocr.model).toBe('default-model');
    expect(config.video.model).toBe('default-model');
  });

  it('设置 VISION_DESCRIBE_MODEL 时 describe 任务使用专用模型', async () => {
    process.env.VISION_DESCRIBE_MODEL = 'describe-model';
    const { config } = await import(CONFIG_MODULE);
    expect(config.describe.model).toBe('describe-model');
    expect(config.locate.model).toBe('default-model');
    // baseUrl/apiKey 应回退到默认值
    expect(config.describe.baseUrl).toBe('https://api.test.com/v1');
    expect(config.describe.apiKey).toBe('sk-test');
  });

  it('设置 VISION_LOCATE_MODEL 时 locate 任务使用专用模型', async () => {
    process.env.VISION_LOCATE_MODEL = 'locate-model';
    const { config } = await import(CONFIG_MODULE);
    expect(config.locate.model).toBe('locate-model');
    expect(config.describe.model).toBe('default-model');
  });

  it('所有任务可独立配置不同模型', async () => {
    process.env.VISION_DESCRIBE_MODEL = 'm1';
    process.env.VISION_LOCATE_MODEL = 'm2';
    process.env.VISION_OCR_MODEL = 'm3';
    process.env.VISION_VIDEO_MODEL = 'm4';
    const { config } = await import(CONFIG_MODULE);
    expect(config.describe.model).toBe('m1');
    expect(config.locate.model).toBe('m2');
    expect(config.ocr.model).toBe('m3');
    expect(config.video.model).toBe('m4');
  });

  it('任务可独立覆盖 baseUrl 和 apiKey', async () => {
    process.env.VISION_OCR_BASE_URL = 'https://ocr-api.example.com/v1';
    process.env.VISION_OCR_API_KEY = 'sk-ocr-key';
    process.env.VISION_OCR_MODEL = 'ocr-model';
    const { config } = await import(CONFIG_MODULE);
    expect(config.ocr.baseUrl).toBe('https://ocr-api.example.com/v1');
    expect(config.ocr.apiKey).toBe('sk-ocr-key');
    expect(config.ocr.model).toBe('ocr-model');
    // 其他任务仍使用默认值
    expect(config.describe.baseUrl).toBe('https://api.test.com/v1');
    expect(config.describe.apiKey).toBe('sk-test');
  });

  it('部分覆盖时未覆盖字段回退默认值', async () => {
    process.env.VISION_DESCRIBE_MODEL = 'custom-model';
    // 不设 VISION_DESCRIBE_BASE_URL 和 VISION_DESCRIBE_API_KEY
    const { config } = await import(CONFIG_MODULE);
    expect(config.describe.model).toBe('custom-model');
    expect(config.describe.baseUrl).toBe('https://api.test.com/v1');
    expect(config.describe.apiKey).toBe('sk-test');
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
