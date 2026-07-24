/**
 * Pipeline compare 方法集成测试
 *
 * 使用 mock 隔离外部依赖，测试 PipelineOrchestrator.compare()。
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

const COMPARE_JSON = JSON.stringify({
  summary: '共发现 3 处差异：1 处严重，2 处轻微',
  differences: [
    {
      id: 1,
      severity: 'critical',
      type: 'layout',
      description: '导航栏高度从 64px 缩减为 56px',
      location_hint: '顶部区域',
      bbox_approx: [0, 0, 1000, 80],
    },
    {
      id: 2,
      severity: 'minor',
      type: 'color',
      description: '按钮颜色从蓝色变为深蓝',
    },
  ],
});

describe('Pipeline.compare()', () => {
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

  it('应返回正确的差异 summary', async () => {
    const mockVisionClient = {
      chat: vi.fn().mockResolvedValue(COMPARE_JSON),
      analyze: vi.fn(),
    };

    const pipeline = new PipelineOrchestrator({}, mockVisionClient);
    const result = await pipeline.compare({
      imageBase64_1: 'data:image/png;base64,AAA',
      imageBase64_2: 'data:image/png;base64,BBB',
      mediaType: 'image/png',
    });

    expect(result.summary).toContain('3 处差异');
    expect(result.differences).toHaveLength(2);
  });

  it('focus=layout 时提示词包含 layout', async () => {
    const mockVisionClient = {
      chat: vi.fn().mockResolvedValue(COMPARE_JSON),
      analyze: vi.fn(),
    };

    const pipeline = new PipelineOrchestrator({}, mockVisionClient);
    await pipeline.compare({
      imageBase64_1: 'data:image/png;base64,A',
      imageBase64_2: 'data:image/png;base64,B',
      mediaType: 'image/png',
      focus: 'layout',
    });

    expect(mockVisionClient.chat).toHaveBeenCalled();
    const callArgs = mockVisionClient.chat.mock.calls[0] as unknown[];
    const userPrompt = callArgs[3] as string;
    expect(userPrompt).toContain('layout');
  });

  it('异常时返回降级空差异', async () => {
    const mockVisionClient = {
      chat: vi.fn().mockRejectedValue(new Error('API 不可用')),
      analyze: vi.fn(),
    };

    const pipeline = new PipelineOrchestrator({}, mockVisionClient);
    const result = await pipeline.compare({
      imageBase64_1: 'data:image/png;base64,A',
      imageBase64_2: 'data:image/png;base64,B',
      mediaType: 'image/png',
    });

    expect(result.summary).toContain('降级');
    expect(result.differences).toEqual([]);
  });

  it('无效 JSON 响应降级为空差异', async () => {
    const mockVisionClient = {
      chat: vi.fn().mockResolvedValue('纯文本，不是 JSON'),
      analyze: vi.fn(),
    };

    const pipeline = new PipelineOrchestrator({}, mockVisionClient);
    const result = await pipeline.compare({
      imageBase64_1: 'data:image/png;base64,A',
      imageBase64_2: 'data:image/png;base64,B',
      mediaType: 'image/png',
    });

    expect(result.differences).toEqual([]);
  });

  it('两张图二元组传入 visionClient.chat', async () => {
    const mockVisionClient = {
      chat: vi.fn().mockResolvedValue(COMPARE_JSON),
      analyze: vi.fn(),
    };

    const pipeline = new PipelineOrchestrator({}, mockVisionClient);
    await pipeline.compare({
      imageBase64_1: 'data:image/png;base64,IMG1',
      imageBase64_2: 'data:image/png;base64,IMG2',
      mediaType: 'image/png',
    });

    expect(mockVisionClient.chat).toHaveBeenCalled();
    const callArgs = mockVisionClient.chat.mock.calls[0] as unknown[];
    const dataUrls = callArgs[1] as string[];
    expect(dataUrls).toHaveLength(2);
  });
});
