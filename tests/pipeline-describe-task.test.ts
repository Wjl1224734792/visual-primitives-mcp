/**
 * Pipeline describe task 参数集成测试
 *
 * 使用 mock 隔离外部依赖，测试不同 task 参数下的模板路由行为。
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
  readFileSync: vi.fn().mockImplementation((path: string) => {
    if (String(path).includes('describe-diagram'))
      return '你是一个资深架构分析师。';
    if (String(path).includes('describe-dataviz'))
      return '你是一个数据可视化分析专家。';
    if (String(path).includes('describe-ui-code'))
      return '你是一个资深前端开发工程师。';
    if (String(path).includes('describe-ui-prompt'))
      return '你是一个 UI 设计转译专家。';
    return '你是一个结合场景描述与坐标定位的视觉分析专家。';
  }),
}));

import type { Session, SessionObject, SessionContext } from '../src/types.js';

function makeSessionObject(
  objectId: number,
  label: string,
  overrides?: Partial<SessionObject>
): SessionObject {
  return {
    object_id: objectId,
    label,
    x1: 10 * objectId,
    y1: 20 * objectId,
    x2: 30 * objectId,
    y2: 40 * objectId,
    cx: 20 * objectId,
    cy: 30 * objectId,
    state: '正常',
    relevance: '高',
    media_type: 'image',
    created_round: 1,
    ...overrides,
  };
}

describe('Pipeline.describe() - task 参数', () => {
  let PipelineOrchestrator: any;

  beforeEach(async () => {
    const parserModule = await import('../src/core/parser.js');
    (parserModule.parseResponse as ReturnType<typeof vi.fn>).mockReturnValue({
      reasoning: '分析完成',
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

  function makeMockSessionManager() {
    const newSession: Session = {
      session_id: 'task-test',
      media_type: 'image',
      created_at: Math.floor(Date.now() / 1000),
      last_accessed_at: Math.floor(Date.now() / 1000),
    };

    return {
      getSession: vi.fn().mockReturnValue({
        session: newSession,
        objects: [makeSessionObject(1, '按钮')],
        recentHistory: [],
      } as SessionContext),
      createSession: vi.fn(),
      addConversationTurn: vi.fn(),
      upsertObjects: vi.fn(),
    };
  }

  it('task=general（默认）使用默认模板', async () => {
    const mockVisionClient = {
      chat: vi.fn(),
      analyze: vi.fn().mockResolvedValue(
        JSON.stringify({
          reasoning: '通用场景分析',
          objects: [],
          spatial_relationships: [],
        })
      ),
    };

    const pipeline = new PipelineOrchestrator(
      makeMockSessionManager(),
      mockVisionClient
    );

    const result = await pipeline.describe({
      sessionId: 'task-general',
      imageBase64: 'data:image/png;base64,X',
      mediaType: 'image',
      task: 'general',
    });

    expect(result.sessionId).toBe('task-general');
    expect(mockVisionClient.analyze).toHaveBeenCalled();
  });

  it('task=diagram 使用架构图模板', async () => {
    const mockVisionClient = {
      chat: vi.fn(),
      analyze: vi.fn().mockResolvedValue(
        JSON.stringify({
          reasoning: '微服务架构图',
          objects: [],
          spatial_relationships: [],
        })
      ),
    };

    const pipeline = new PipelineOrchestrator(
      makeMockSessionManager(),
      mockVisionClient
    );

    await pipeline.describe({
      sessionId: 'task-diagram',
      imageBase64: 'data:image/png;base64,X',
      mediaType: 'image',
      task: 'diagram',
    });

    expect(mockVisionClient.analyze).toHaveBeenCalled();
    // verify the system prompt was loaded from the diagram template
    const callArgs = mockVisionClient.analyze.mock.calls[0] as unknown[];
    const systemPrompt = callArgs[2] as string;
    expect(systemPrompt).toContain('架构分析师');
  });

  it('不传 task 默认使用 general', async () => {
    const mockVisionClient = {
      chat: vi.fn(),
      analyze: vi.fn().mockResolvedValue(
        JSON.stringify({
          reasoning: '默认分析',
          objects: [],
          spatial_relationships: [],
        })
      ),
    };

    const pipeline = new PipelineOrchestrator(
      makeMockSessionManager(),
      mockVisionClient
    );

    await pipeline.describe({
      sessionId: 'task-default',
      imageBase64: 'data:image/png;base64,X',
      mediaType: 'image',
    });

    expect(mockVisionClient.analyze).toHaveBeenCalled();
  });

  it('未知 task 值回退到 general', async () => {
    const mockVisionClient = {
      chat: vi.fn(),
      analyze: vi.fn().mockResolvedValue(
        JSON.stringify({
          reasoning: '回退分析',
          objects: [],
          spatial_relationships: [],
        })
      ),
    };

    const pipeline = new PipelineOrchestrator(
      makeMockSessionManager(),
      mockVisionClient
    );

    // 测试：未知 task 回退到 general
    await pipeline.describe({
      sessionId: 'task-unknown',
      imageBase64: 'data:image/png;base64,X',
      mediaType: 'image',

      task: 'not_a_real_task' as any,
    });

    expect(mockVisionClient.analyze).toHaveBeenCalled();
  });

  it('task=ui_code 仍正确设置会话和物体', async () => {
    // 覆盖 parser mock 使其返回有物体的结果
    const parserModule = await import('../src/core/parser.js');
    (
      parserModule.parseResponse as ReturnType<typeof vi.fn>
    ).mockReturnValueOnce({
      reasoning: '生成按钮组件代码',
      objects: [
        {
          id: 1,
          label: '提交按钮',
          bbox: [400, 600, 600, 660],
          centroid: [500, 630],
          state: '正常',
          relevance: '高',
        },
      ],
      spatial_relationships: [],
    });

    const mockVisionClient = {
      chat: vi.fn(),
      analyze: vi.fn().mockResolvedValue(
        JSON.stringify({
          reasoning: 'ok',
          objects: [
            {
              id: 1,
              label: '提交按钮',
              bbox: [400, 600, 600, 660],
              centroid: [500, 630],
              state: '正常',
              relevance: '高',
            },
          ],
          spatial_relationships: [],
        })
      ),
    };

    const sm = makeMockSessionManager();
    const pipeline = new PipelineOrchestrator(sm, mockVisionClient);

    const result = await pipeline.describe({
      sessionId: 'task-ui-code',
      imageBase64: 'data:image/png;base64,X',
      mediaType: 'image',
      task: 'ui_code',
    });

    expect(result.objects).toBeDefined();
    expect(sm.upsertObjects).toHaveBeenCalled();
  });
});
