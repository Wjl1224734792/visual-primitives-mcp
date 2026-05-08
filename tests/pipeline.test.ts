/**
 * 管道编排器集成测试
 *
 * 使用 mock 隔离外部依赖，测试 PipelineOrchestrator 的 4 个任务方法。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  Session,
  SessionObject,
  SessionContext,
  Base64Image,
  MediaAdapter,
} from '../src/types.js';

// ---- Mock 适配器 ----

class MockImageAdapter implements MediaAdapter {
  readonly mediaType = 'image';
  adapt(_input: string): Promise<Base64Image[]> {
    return Promise.resolve([{ base64: 'mock-data', mime_type: 'image/jpeg' }]);
  }
}

class MockEmptyAdapter implements MediaAdapter {
  readonly mediaType = 'broken';
  adapt(_input: string): Promise<Base64Image[]> {
    return Promise.resolve([]);
  }
}

// ---- 辅助 ----

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

const MOCK_VISION_SUCCESS = JSON.stringify({
  reasoning: '分析成功',
  objects: [
    {
      id: 1,
      label: '红色水杯',
      bbox: [100, 200, 300, 400],
      centroid: [200, 300],
      state: '正常',
      relevance: '高',
    },
    {
      id: 2,
      label: '蓝色笔记本',
      bbox: [400, 200, 600, 400],
      centroid: [500, 300],
      state: '正常',
      relevance: '高',
    },
  ],
  spatial_relationships: ['物体1在物体2的左侧'],
});

// ---- Mocks ----

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
  ValidationError: class extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'ValidationError';
    }
  },
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
}));

vi.mock('../src/utils/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../src/config.js', () => ({
  config: {
    vision: {
      baseUrl: 'https://mock.example.com/v1',
      apiKey: 'mock-key',
      model: 'default-model',
    },
    describe: {
      baseUrl: 'https://mock.example.com/v1',
      apiKey: 'mock-key',
      model: 'default-model',
    },
    locate: {
      baseUrl: 'https://mock.example.com/v1',
      apiKey: 'mock-key',
      model: 'default-model',
    },
    ocr: {
      baseUrl: 'https://mock.example.com/v1',
      apiKey: 'mock-key',
      model: 'default-model',
    },
    video: {
      baseUrl: 'https://mock.example.com/v1',
      apiKey: 'mock-key',
      model: 'default-model',
    },
    coordinatePrecision: '0-1000',
    mcpTransport: 'stdio',
    logLevel: 'info',
    timeoutMs: 45000,
    sessionTtlSeconds: 3600,
    dbPath: ':memory:',
    port: 3000,
  },
}));

vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockReturnValue('你是一个视觉推理模型。'),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
}));

describe('PipelineOrchestrator', () => {
  let PipelineOrchestrator: {
    PipelineOrchestrator: new (
      sm: Record<string, unknown>,
      vc: Record<string, unknown>,
      router: Record<string, unknown>
    ) => {
      describe: (
        input: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
      locate: (
        input: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
      ocr: (input: Record<string, unknown>) => Promise<string>;
      videoAnalyze: (
        input: Record<string, unknown>
      ) => Promise<Record<string, unknown>>;
    };
  };
  let ModalityRouter: {
    ModalityRouter: new () => Record<string, unknown>;
    ModalityRouterError: new (msg: string) => Error;
  };

  let parseResponseMock: ReturnType<typeof vi.fn>;
  let validateObjectsMock: ReturnType<typeof vi.fn>;
  let normalizeObjectsMock: ReturnType<typeof vi.fn>;
  let buildAugmentedPromptMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const parserModule = await import('../src/core/parser.js');
    parseResponseMock = parserModule.parseResponse;
    const validatorModule = await import('../src/core/validator.js');
    validateObjectsMock = validatorModule.validateObjects;
    const normalizerModule = await import('../src/core/normalizer.js');
    normalizeObjectsMock = normalizerModule.normalizeObjects;
    const promptBuilderModule = await import('../src/core/prompt-builder.js');
    buildAugmentedPromptMock = promptBuilderModule.buildAugmentedPrompt;

    parseResponseMock.mockReturnValue({
      reasoning: '分析成功',
      objects: [
        {
          id: 1,
          label: '测试',
          bbox: [100, 200, 300, 400],
          centroid: [200, 300],
          state: '正常',
          relevance: '高',
        },
      ],
      spatial_relationships: [],
    });
    validateObjectsMock.mockImplementation(() => {});
    buildAugmentedPromptMock.mockImplementation(
      (params: { question: string }) =>
        `[增强提示词] ${params.question}\n\n请基于空间信息回答。`
    );

    PipelineOrchestrator = await import('../src/core/pipeline.js');
    ModalityRouter = await import('../src/core/modality-router.js');
  });

  // ============================================================
  // describe()
  // ============================================================
  describe('describe()', () => {
    it('应返回场景描述文本并记录会话', async () => {
      const mockSessionManager = {
        getSession: vi.fn().mockReturnValue({
          session: {
            session_id: 'd1',
            media_type: 'image',
            created_at: Date.now() / 1000,
            last_accessed_at: Date.now() / 1000,
          },
          objects: [],
          recentHistory: [],
        } as SessionContext),
        createSession: vi.fn(),
        addConversationTurn: vi.fn(),
      };

      const mockVisionClient = {
        chat: vi
          .fn()
          .mockResolvedValue('登录页面，包含用户名输入框和密码输入框'),
        analyze: vi.fn(),
      };

      const router = new ModalityRouter.ModalityRouter() as {
        register: (t: string, a: MediaAdapter) => void;
      };
      router.register('image', new MockImageAdapter());

      const pipeline = new PipelineOrchestrator.PipelineOrchestrator(
        mockSessionManager,
        mockVisionClient,
        router
      );
      const result = await pipeline.describe({
        sessionId: 'd1',
        imageBase64: 'test',
        mediaType: 'image',
      });

      expect(result.sessionId).toBe('d1');
      expect(result.description).toBe('登录页面，包含用户名输入框和密码输入框');
      expect(result.round).toBeGreaterThan(0);
      expect(mockVisionClient.chat).toHaveBeenCalled();
      expect(mockSessionManager.addConversationTurn).toHaveBeenCalledTimes(2);
    });

    it('适配器返回空数组时返回降级描述', async () => {
      const mockSessionManager = {
        getSession: vi.fn().mockReturnValue({
          session: {
            session_id: 'd2',
            media_type: 'broken',
            created_at: Date.now() / 1000,
            last_accessed_at: Date.now() / 1000,
          },
          objects: [],
          recentHistory: [],
        } as SessionContext),
        createSession: vi.fn(),
        addConversationTurn: vi.fn(),
      };

      const mockVisionClient = { chat: vi.fn(), analyze: vi.fn() };
      const router = new ModalityRouter.ModalityRouter() as {
        register: (t: string, a: MediaAdapter) => void;
      };
      router.register('broken', new MockEmptyAdapter());

      const pipeline = new PipelineOrchestrator.PipelineOrchestrator(
        mockSessionManager,
        mockVisionClient,
        router
      );
      const result = await pipeline.describe({
        sessionId: 'd2',
        imageBase64: 'bad',
        mediaType: 'broken',
      });

      expect(result.description).toContain('降级');
      expect(mockVisionClient.chat).not.toHaveBeenCalled();
    });

    it('VisionClient 异常时返回降级描述', async () => {
      const mockSessionManager = {
        getSession: vi.fn().mockReturnValue({
          session: {
            session_id: 'd3',
            media_type: 'image',
            created_at: Date.now() / 1000,
            last_accessed_at: Date.now() / 1000,
          },
          objects: [],
          recentHistory: [],
        } as SessionContext),
        createSession: vi.fn(),
        addConversationTurn: vi.fn(),
      };

      const mockVisionClient = {
        chat: vi.fn().mockRejectedValue(new Error('网络超时')),
        analyze: vi.fn(),
      };

      const router = new ModalityRouter.ModalityRouter() as {
        register: (t: string, a: MediaAdapter) => void;
      };
      router.register('image', new MockImageAdapter());

      const pipeline = new PipelineOrchestrator.PipelineOrchestrator(
        mockSessionManager,
        mockVisionClient,
        router
      );
      const result = await pipeline.describe({
        sessionId: 'd3',
        imageBase64: 'test',
        mediaType: 'image',
      });

      expect(result.description).toContain('降级');
      expect(result.description).toContain('网络超时');
    });
  });

  // ============================================================
  // locate()
  // ============================================================
  describe('locate()', () => {
    it('传入图像时应调用视觉管道返回坐标', async () => {
      const newSession: Session = {
        session_id: 'loc-new',
        media_type: 'image',
        created_at: Math.floor(Date.now() / 1000),
        last_accessed_at: Math.floor(Date.now() / 1000),
      };

      const mockSessionManager = {
        getSession: vi
          .fn()
          .mockReturnValueOnce(null)
          .mockReturnValue({
            session: newSession,
            objects: [makeSessionObject(1, '提交按钮')],
            recentHistory: [],
          } as SessionContext),
        createSession: vi.fn(),
        upsertObjects: vi.fn(),
        addConversationTurn: vi.fn(),
      };

      const mockVisionClient = {
        chat: vi.fn().mockResolvedValue(MOCK_VISION_SUCCESS),
        analyze: vi.fn(),
      };

      const router = new ModalityRouter.ModalityRouter() as {
        register: (t: string, a: MediaAdapter) => void;
      };
      router.register('image', new MockImageAdapter());

      const pipeline = new PipelineOrchestrator.PipelineOrchestrator(
        mockSessionManager,
        mockVisionClient,
        router
      );
      const result = await pipeline.locate({
        sessionId: 'loc-new',
        imageBase64: 'test',
        mediaType: 'image',
        question: '找到提交按钮',
        coordinatePrecision: '0-1000',
      });

      expect(result.sessionId).toBe('loc-new');
      expect(result.augmentedPrompt).toBeTruthy();
      expect(result.objectsCount).toBe(1);
      expect(result.fromCache).toBe(false);
    });

    it('不传图像时应从缓存读取（fromCache=true）', async () => {
      const existingSession: Session = {
        session_id: 'loc-cache',
        media_type: 'image',
        created_at: Math.floor(Date.now() / 1000),
        last_accessed_at: Math.floor(Date.now() / 1000),
      };

      const mockSessionManager = {
        getSession: vi.fn().mockReturnValue({
          session: existingSession,
          objects: [makeSessionObject(1, '已有按钮')],
          recentHistory: [
            {
              round: 1,
              role: 'user',
              content: '描述图片',
              created_at: Date.now() / 1000 - 50,
            },
            {
              round: 1,
              role: 'assistant',
              content: '页面包含一个蓝色按钮',
              created_at: Date.now() / 1000 - 49,
            },
          ],
        } as SessionContext),
        createSession: vi.fn(),
        upsertObjects: vi.fn(),
        addConversationTurn: vi.fn(),
      };

      const mockVisionClient = { chat: vi.fn(), analyze: vi.fn() };
      const router = new ModalityRouter.ModalityRouter() as {
        register: (t: string, a: MediaAdapter) => void;
      };
      router.register('image', new MockImageAdapter());

      const pipeline = new PipelineOrchestrator.PipelineOrchestrator(
        mockSessionManager,
        mockVisionClient,
        router
      );
      const result = await pipeline.locate({
        sessionId: 'loc-cache',
        question: '按钮在哪里？',
        coordinatePrecision: '0-1000',
      });

      expect(result.fromCache).toBe(true);
      expect(mockVisionClient.chat).not.toHaveBeenCalled();
      expect(result.augmentedPrompt).toBeTruthy();
    });

    it('视觉分析失败时回退缓存不崩溃', async () => {
      const mockSessionManager = {
        getSession: vi
          .fn()
          .mockReturnValueOnce(null)
          .mockReturnValue({
            session: {
              session_id: 'loc-fail',
              media_type: 'image',
              created_at: Date.now() / 1000,
              last_accessed_at: Date.now() / 1000,
            },
            objects: [],
            recentHistory: [],
          } as SessionContext),
        createSession: vi.fn(),
        upsertObjects: vi.fn(),
        addConversationTurn: vi.fn(),
      };

      const mockVisionClient = {
        chat: vi.fn().mockRejectedValue(new Error('API 不可用')),
        analyze: vi.fn(),
      };

      const router = new ModalityRouter.ModalityRouter() as {
        register: (t: string, a: MediaAdapter) => void;
      };
      router.register('image', new MockImageAdapter());

      const pipeline = new PipelineOrchestrator.PipelineOrchestrator(
        mockSessionManager,
        mockVisionClient,
        router
      );
      const result = await pipeline.locate({
        sessionId: 'loc-fail',
        imageBase64: 'test',
        mediaType: 'image',
        question: '找到按钮',
        coordinatePrecision: '0-1000',
      });

      expect(result.augmentedPrompt).toBeTruthy();
      expect(result.objectsCount).toBe(0);
    });
  });

  // ============================================================
  // ocr()
  // ============================================================
  describe('ocr()', () => {
    it('应返回 OCR 识别的文字内容', async () => {
      const mockVisionClient = {
        chat: vi.fn().mockResolvedValue('识别结果：\n第一行文字\n第二行文字'),
        analyze: vi.fn(),
      };

      const router = new ModalityRouter.ModalityRouter() as {
        register: (t: string, a: MediaAdapter) => void;
      };
      router.register('image', new MockImageAdapter());

      const pipeline = new PipelineOrchestrator.PipelineOrchestrator(
        {} as Record<string, unknown>,
        mockVisionClient,
        router
      );
      const result = await pipeline.ocr({
        imageBase64: 'test',
        mediaType: 'image',
      });

      expect(result).toBe('识别结果：\n第一行文字\n第二行文字');
      expect(mockVisionClient.chat).toHaveBeenCalled();
    });

    it('适配器返回空数组时返回降级文本', async () => {
      const mockVisionClient = { chat: vi.fn(), analyze: vi.fn() };
      const router = new ModalityRouter.ModalityRouter() as {
        register: (t: string, a: MediaAdapter) => void;
      };
      router.register('broken', new MockEmptyAdapter());

      const pipeline = new PipelineOrchestrator.PipelineOrchestrator(
        {} as Record<string, unknown>,
        mockVisionClient,
        router
      );
      const result = await pipeline.ocr({
        imageBase64: 'bad',
        mediaType: 'broken',
      });

      expect(result).toContain('降级');
      expect(mockVisionClient.chat).not.toHaveBeenCalled();
    });

    it('VisionClient 异常时返回降级文本', async () => {
      const mockVisionClient = {
        chat: vi.fn().mockRejectedValue(new Error('服务不可用')),
        analyze: vi.fn(),
      };
      const router = new ModalityRouter.ModalityRouter() as {
        register: (t: string, a: MediaAdapter) => void;
      };
      router.register('image', new MockImageAdapter());

      const pipeline = new PipelineOrchestrator.PipelineOrchestrator(
        {} as Record<string, unknown>,
        mockVisionClient,
        router
      );
      const result = await pipeline.ocr({
        imageBase64: 'test',
        mediaType: 'image',
      });

      expect(result).toContain('降级');
      expect(result).toContain('服务不可用');
    });
  });

  // ============================================================
  // videoAnalyze()
  // ============================================================
  describe('videoAnalyze()', () => {
    it('应返回视频分析描述', async () => {
      const mockSessionManager = {
        getSession: vi.fn().mockReturnValue({
          session: {
            session_id: 'v1',
            media_type: 'video',
            created_at: Date.now() / 1000,
            last_accessed_at: Date.now() / 1000,
          },
          objects: [],
          recentHistory: [],
        } as SessionContext),
        createSession: vi.fn(),
        addConversationTurn: vi.fn(),
      };

      const mockVisionClient = {
        chat: vi.fn().mockResolvedValue('视频展示了一个人在公园散步'),
        analyze: vi.fn(),
      };

      const router = new ModalityRouter.ModalityRouter() as {
        register: (t: string, a: MediaAdapter) => void;
      };
      router.register('video', new MockImageAdapter());

      const pipeline = new PipelineOrchestrator.PipelineOrchestrator(
        mockSessionManager,
        mockVisionClient,
        router
      );
      const result = await pipeline.videoAnalyze({
        sessionId: 'v1',
        videoBase64: 'video-data',
        mediaType: 'video',
      });

      expect(result.sessionId).toBe('v1');
      expect(result.description).toBe('视频展示了一个人在公园散步');
      expect(result.round).toBeGreaterThan(0);
      expect(mockVisionClient.chat).toHaveBeenCalled();
    });

    it('适配器返回空数组时返回降级描述', async () => {
      const mockSessionManager = {
        getSession: vi.fn().mockReturnValue({
          session: {
            session_id: 'v2',
            media_type: 'broken',
            created_at: Date.now() / 1000,
            last_accessed_at: Date.now() / 1000,
          },
          objects: [],
          recentHistory: [],
        } as SessionContext),
        createSession: vi.fn(),
        addConversationTurn: vi.fn(),
      };

      const mockVisionClient = { chat: vi.fn(), analyze: vi.fn() };
      const router = new ModalityRouter.ModalityRouter() as {
        register: (t: string, a: MediaAdapter) => void;
      };
      router.register('broken', new MockEmptyAdapter());

      const pipeline = new PipelineOrchestrator.PipelineOrchestrator(
        mockSessionManager,
        mockVisionClient,
        router
      );
      const result = await pipeline.videoAnalyze({
        sessionId: 'v2',
        videoBase64: 'bad',
        mediaType: 'broken',
      });

      expect(result.description).toContain('降级');
      expect(mockVisionClient.chat).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // ModalityRouter 独立测试
  // ============================================================
  describe('ModalityRouter', () => {
    it('register 后 route 应返回对应适配器', () => {
      const router = new ModalityRouter.ModalityRouter() as {
        register: (t: string, a: MediaAdapter) => void;
        route: (t: string) => MediaAdapter;
      };

      const adapter = new MockImageAdapter();
      router.register('image', adapter);
      expect(router.route('image')).toBe(adapter);
    });

    it('route 未知类型应抛出 ModalityRouterError', () => {
      const router = new ModalityRouter.ModalityRouter() as {
        register: (t: string, a: MediaAdapter) => void;
        route: (t: string) => MediaAdapter;
      };

      router.register('image', new MockImageAdapter());
      expect(() => router.route('audio')).toThrow();
      try {
        router.route('audio');
      } catch (error) {
        const err = error as Error;
        expect(err.name).toBe('ModalityRouterError');
        expect(err.message).toContain('audio');
        expect(err.message).toContain('image');
      }
    });
  });
});
