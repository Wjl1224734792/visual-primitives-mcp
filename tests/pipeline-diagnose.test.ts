/**
 * Pipeline diagnose 方法集成测试
 *
 * 使用 mock 隔离外部依赖，测试 PipelineOrchestrator.diagnose()。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../src/core/parser.js', () => ({
  parseResponse: vi.fn(),
  AnalysisParseError: class extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'AnalysisParseError';
    }
  },
}));
vi.mock('../src/core/validator.js', () => ({
  validateObjects: vi.fn(),
}));
vi.mock('../src/core/normalizer.js', () => ({
  normalizeObjects: vi.fn((objects: Array<Record<string, unknown>>) => [
    ...objects.map(o => ({ ...o })),
  ]),
}));
vi.mock('../src/core/prompt-builder.js', () => ({
  buildAugmentedPrompt: vi.fn(
    (params: { question: string }) =>
      `[增强提示词] ${params.question}\n\n请基于空间信息回答。`
  ),
  buildSpatialGraph: vi.fn(() => []),
  formatSpatialGraph: vi.fn(() => '（无空间关系图谱）'),
}));
vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../src/utils/metrics.js', () => ({
  metricsRegistry: {
    recordCall: vi.fn(),
    recordError: vi.fn(),
    recordCacheHit: vi.fn(),
    recordLatency: vi.fn(),
    recordCircuitBreakerTrip: vi.fn(),
    recordPreprocessSkipped: vi.fn(),
  },
}));
vi.mock('../src/config.js', () => ({
  config: {
    vision: {
      baseUrl: 'https://mock.example.com/v1',
      apiKey: 'mock-key',
      model: 'default',
    },
    describe: {
      baseUrl: 'https://mock.example.com/v1',
      apiKey: 'mock-key',
      model: 'default',
    },
    locate: {
      baseUrl: 'https://mock.example.com/v1',
      apiKey: 'mock-key',
      model: 'default',
    },
    ocr: {
      baseUrl: 'https://mock.example.com/v1',
      apiKey: 'mock-key',
      model: 'default',
    },
    video: {
      baseUrl: 'https://mock.example.com/v1',
      apiKey: 'mock-key',
      model: 'default',
    },
    coordinatePrecision: '0-1000',
    mcpTransport: 'stdio',
    logLevel: 'info',
    timeoutMs: 45000,
    sessionTtlSeconds: 3600,
    dbPath: ':memory:',
    port: 3000,
    preprocessEnabled: false,
    circuitBreakerEnabled: false,
    circuitBreakerThreshold: 5,
    circuitBreakerRecoveryMs: 30000,
    maxConcurrency: 10,
    metricsEnabled: false,
  },
}));
vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockReturnValue('你是一个视觉推理模型。'),
}));

const DIAGNOSE_JSON = JSON.stringify({
  diagnosis: 'React 渲染阶段 TypeError',
  root_cause: 'UserProfile.tsx:42 未定义变量',
  suggested_fix: '添加空值检查',
  severity: 'error',
  error_type: 'runtime',
  related_hints: ['检查 UserProfile.tsx 第 42 行'],
});

describe('Pipeline.diagnose()', () => {
  let PipelineOrchestrator: any;

  beforeEach(async () => {
    const parserModule = await import('../src/core/parser.js');
    (parserModule.parseResponse as ReturnType<typeof vi.fn>).mockReturnValue({
      reasoning: 'ok',
      objects: [],
      spatial_relationships: [],
    });
    const validatorModule = await import('../src/core/validator.js');
    (
      validatorModule.validateObjects as ReturnType<typeof vi.fn>
    ).mockImplementation(() => {});
    const normalizerModule = await import('../src/core/normalizer.js');
    (
      normalizerModule.normalizeObjects as ReturnType<typeof vi.fn>
    ).mockImplementation((objects: Array<Record<string, unknown>>) => [
      ...objects.map(o => ({ ...o })),
    ]);
    const promptBuilderModule = await import('../src/core/prompt-builder.js');
    (
      promptBuilderModule.buildAugmentedPrompt as ReturnType<typeof vi.fn>
    ).mockReturnValue('[enhanced]');
    (
      promptBuilderModule.buildSpatialGraph as ReturnType<typeof vi.fn>
    ).mockReturnValue([]);
    (
      promptBuilderModule.formatSpatialGraph as ReturnType<typeof vi.fn>
    ).mockReturnValue('');

    PipelineOrchestrator = (await import('../src/core/pipeline.js'))
      .PipelineOrchestrator;
  });

  it('应返回结构化诊断结果', async () => {
    const mockVisionClient = {
      chat: vi.fn().mockResolvedValue(DIAGNOSE_JSON),
      analyze: vi.fn(),
    };

    const pipeline = new PipelineOrchestrator({}, mockVisionClient);
    const result = await pipeline.diagnose({
      imageBase64: 'data:image/png;base64,ERR',
      mediaType: 'image/png',
    });

    expect(result.diagnosis).toContain('TypeError');
    expect(result.root_cause).toContain('UserProfile');
    expect(result.severity).toBe('error');
    expect(result.error_type).toBe('runtime');
    expect(result.related_hints).toHaveLength(1);
  });

  it('context 注入到提示词', async () => {
    const mockVisionClient = {
      chat: vi.fn().mockResolvedValue(DIAGNOSE_JSON),
      analyze: vi.fn(),
    };

    const pipeline = new PipelineOrchestrator({}, mockVisionClient);
    await pipeline.diagnose({
      imageBase64: 'data:image/png;base64,ERR',
      mediaType: 'image/png',
      context: 'React 项目',
    });

    expect(mockVisionClient.chat).toHaveBeenCalled();
    const callArgs = mockVisionClient.chat.mock.calls[0] as unknown[];
    const userPrompt = callArgs[3] as string;
    expect(userPrompt).toContain('React 项目');
  });

  it('异常时返回降级诊断', async () => {
    const mockVisionClient = {
      chat: vi.fn().mockRejectedValue(new Error('网络超时')),
      analyze: vi.fn(),
    };

    const pipeline = new PipelineOrchestrator({}, mockVisionClient);
    const result = await pipeline.diagnose({
      imageBase64: 'data:image/png;base64,ERR',
      mediaType: 'image/png',
    });

    expect(result.diagnosis).toContain('降级');
    expect(result.diagnosis).toContain('网络超时');
    expect(result.severity).toBe('error');
    expect(result.error_type).toBe('unknown');
    expect(result.related_hints).toEqual([]);
  });

  it('无效 JSON 响应降级为无法解析', async () => {
    const mockVisionClient = {
      chat: vi.fn().mockResolvedValue('纯文本错误分析'),
      analyze: vi.fn(),
    };

    const pipeline = new PipelineOrchestrator({}, mockVisionClient);
    const result = await pipeline.diagnose({
      imageBase64: 'data:image/png;base64,ERR',
      mediaType: 'image/png',
    });

    expect(result.root_cause).toBe('无法解析结构化诊断');
    expect(result.error_type).toBe('unknown');
  });

  it('warning severity 正确解析', async () => {
    const warningJson = JSON.stringify({
      diagnosis: '一个警告',
      root_cause: '配置缺失',
      suggested_fix: '添加默认值',
      severity: 'warning',
      error_type: 'build',
      related_hints: [],
    });
    const mockVisionClient = {
      chat: vi.fn().mockResolvedValue(warningJson),
      analyze: vi.fn(),
    };

    const pipeline = new PipelineOrchestrator({}, mockVisionClient);
    const result = await pipeline.diagnose({
      imageBase64: 'data:image/png;base64,X',
      mediaType: 'image/png',
    });

    expect(result.severity).toBe('warning');
    expect(result.error_type).toBe('build');
  });
});
