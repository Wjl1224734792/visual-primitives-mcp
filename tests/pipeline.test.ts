/**
 * 管道编排器集成测试（TDD）
 *
 * 使用 mock 隔离所有外部依赖（SessionManager、VisionClient、Adapter），
 * 测试 PipelineOrchestrator.execute() 的完整流程和降级路径。
 *
 * 映射需求：REQ-001, REQ-016, REQ-017, REQ-N01, REQ-N02, REQ-N05
 * 任务 ID：TASK-006
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  Session,
  SessionObject,
  SessionContext,
  ConversationTurn,
  MergeStrategy,
  Base64Image,
  MediaAdapter,
  PipelineInput,
} from '../src/types.js';

// ---- Mock 适配器实现 ----

/** 模拟成功返回单张图片的适配器 */
class MockImageAdapter implements MediaAdapter {
  readonly mediaType = 'image';
  adapt(_input: string): Promise<Base64Image[]> {
    return Promise.resolve([
      { base64: 'mock-base64-data', mime_type: 'image/jpeg' },
    ]);
  }
}

/** 模拟返回空数组的适配器（降级测试用） */
class MockEmptyAdapter implements MediaAdapter {
  readonly mediaType = 'broken';
  adapt(_input: string): Promise<Base64Image[]> {
    return Promise.resolve([]);
  }
}

// ---- 辅助函数 ----

/** 创建标准 PipelineInput */
function makeInput(overrides?: Partial<PipelineInput>): PipelineInput {
  return {
    sessionId: 'test-session-001',
    question: '图中有什么物体？',
    mergeStrategy: 'augment' as MergeStrategy,
    coordinatePrecision: '0-1000',
    ...overrides,
  };
}

/** 创建测试用 SessionObject */
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

/** 模拟视觉模型返回的成功 JSON */
const MOCK_VISION_SUCCESS = JSON.stringify({
  reasoning: '图像中包含两个物体',
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

/** 模拟视觉模型返回的无效 JSON */
const MOCK_VISION_INVALID = '这不是合法的 JSON 数据';

/** 模拟视觉模型返回的降级 JSON（objects 为空） */
const MOCK_VISION_DEGRADED = JSON.stringify({
  reasoning: '分析失败',
  objects: [],
  spatial_relationships: [],
});

// 需要在测试中动态模拟的依赖模块
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
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../src/config.js', () => ({
  config: {
    visionApiBaseUrl: 'https://mock-api.example.com/v1',
    visionApiKey: 'mock-api-key',
    visionModelName: 'mock-model',
    coordinatePrecision: '0-1000',
    mcpTransport: 'stdio',
    logLevel: 'info',
    timeoutMs: 45000,
    sessionTtlSeconds: 3600,
    dbPath: ':memory:',
    maxVideoFrames: 10,
    maxDocPages: 20,
    port: 3000,
  },
}));

vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockReturnValue('你是一个基于视觉原语的推理模型。'),
  writeFileSync: vi.fn(),
  readFileSync_orig: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
}));

vi.mock('node:os', () => ({
  tmpdir: vi.fn().mockReturnValue('/tmp/mock'),
}));

vi.mock('sharp', () => ({
  default: vi.fn().mockReturnValue({
    png: vi.fn().mockReturnValue({
      toBuffer: vi.fn().mockResolvedValue(Buffer.from('mock-png-data')),
    }),
  }),
}));

vi.mock('pdf-poppler', () => ({
  default: { convert: vi.fn().mockResolvedValue(undefined) },
  convert: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('ffmpeg-static', () => ({
  default: '/mock/ffmpeg',
}));

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

vi.mock('node:crypto', () => ({
  randomUUID: vi.fn().mockReturnValue('00000000-0000-0000-0000-000000000000'),
}));

// ---- 测试套件 ----

describe('PipelineOrchestrator', () => {
  // 延迟导入，确保 mock 已生效
  let PipelineOrchestrator: {
    PipelineOrchestrator: new (
      sessionManager: Record<string, unknown>,
      visionClient: Record<string, unknown>,
      router: Record<string, unknown>
    ) => {
      execute: (input: PipelineInput) => Promise<Record<string, unknown>>;
    };
  };
  let ModalityRouter: {
    ModalityRouter: new () => Record<string, unknown>;
    ModalityRouterError: new (msg: string) => Error;
    modalityRouter: Record<string, unknown>;
  };

  let parseResponseMock: any;

  let validateObjectsMock: any;

  let normalizeObjectsMock: any;

  let buildAugmentedPromptMock: any;

  beforeEach(async () => {
    // 重新导入以获取最新的 mock 引用
    const parserModule = await import('../src/core/parser.js');
    parseResponseMock = parserModule.parseResponse;

    const validatorModule = await import('../src/core/validator.js');
    validateObjectsMock = validatorModule.validateObjects;

    const normalizerModule = await import('../src/core/normalizer.js');
    normalizeObjectsMock = normalizerModule.normalizeObjects;

    const promptBuilderModule = await import('../src/core/prompt-builder.js');
    buildAugmentedPromptMock = promptBuilderModule.buildAugmentedPrompt;

    // 设置默认 mock 行为
    parseResponseMock.mockReturnValue({
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
      ],
      spatial_relationships: [],
    });
    validateObjectsMock.mockImplementation(() => {});
    buildAugmentedPromptMock.mockImplementation(
      (params: { question: string }) =>
        `[增强提示词] ${params.question}\n\n请基于空间信息回答。`
    );

    // 动态加载模块
    PipelineOrchestrator = await import('../src/core/pipeline.js');
    ModalityRouter = await import('../src/core/modality-router.js');
  });

  // ================================================================
  // 测试 1：Cache Hit（缓存命中）
  // ================================================================
  describe('Cache Hit（缓存命中）', () => {
    it('同 session_id 第二轮无 media_base64 时应返回 from_cache=true，不调用视觉 API', async () => {
      const existingSession: Session = {
        session_id: 'test-session-001',
        media_type: 'image',
        created_at: Math.floor(Date.now() / 1000) - 100,
        last_accessed_at: Math.floor(Date.now() / 1000),
      };

      const existingObjects: SessionObject[] = [
        makeSessionObject(1, '红色水杯'),
      ];

      const existingHistory: ConversationTurn[] = [
        {
          round: 1,
          role: 'user',
          content: '图中有什么？',
          created_at: Math.floor(Date.now() / 1000) - 50,
        },
        {
          round: 1,
          role: 'assistant',
          content: '有一个红色水杯',
          created_at: Math.floor(Date.now() / 1000) - 49,
        },
      ];

      // Mock SessionManager
      const mockSessionManager = {
        getSession: vi.fn().mockReturnValue({
          session: existingSession,
          objects: existingObjects,
          recentHistory: existingHistory,
        } as SessionContext),
        createSession: vi.fn(),
        upsertObjects: vi.fn(),
        addConversationTurn: vi.fn(),
        getRecentHistory: vi.fn().mockReturnValue(existingHistory),
      };

      // Mock VisionClient
      const mockVisionClient = {
        analyze: vi.fn(),
      };

      // 使用真实 ModalityRouter 但注册 mock adapter
      const router = new ModalityRouter.ModalityRouter() as {
        register: (type: string, adapter: MediaAdapter) => void;
        route: (type: string) => MediaAdapter;
      };
      router.register('image', new MockImageAdapter());

      const pipeline = new PipelineOrchestrator.PipelineOrchestrator(
        mockSessionManager,
        mockVisionClient,
        router
      );

      const input = makeInput({ mediaBase64: undefined, mediaType: undefined });

      const result = await pipeline.execute(input);

      // 验证不调用视觉 API
      expect(mockVisionClient.analyze).not.toHaveBeenCalled();

      // 验证 from_cache = true
      expect(result.fromCache).toBe(true);

      // 验证 round 正确
      expect(result.round).toBe(2);

      // 验证返回了 augmentedPrompt
      expect(result.augmentedPrompt).toBeTruthy();
      expect(result.augmentedPrompt).toContain('图中有什么物体？');

      // 验证会话物体数正确
      expect(result.objectsCount).toBe(1);

      // 验证记录了对话轮次
      expect(mockSessionManager.addConversationTurn).toHaveBeenCalledTimes(2);
    });
  });

  // ================================================================
  // 测试 2：Cache Miss + Image（首次调用）
  // ================================================================
  describe('Cache Miss + Image（首次调用）', () => {
    it('新 session + image → 调用完整视觉管道，返回完整结果', async () => {
      const newSession: Session = {
        session_id: 'new-session-001',
        media_type: 'image',
        created_at: Math.floor(Date.now() / 1000),
        last_accessed_at: Math.floor(Date.now() / 1000),
      };

      // Mock SessionManager：首次 getSession 返回 null（新会话），createSession 后返回
      const mockSessionManager = {
        getSession: vi
          .fn()
          .mockReturnValueOnce(null) // 第一次：会话不存在
          .mockReturnValue({
            session: newSession,
            objects: [
              makeSessionObject(1, '红色水杯'),
              makeSessionObject(2, '蓝色笔记本'),
            ],
            recentHistory: [],
          } as SessionContext),
        createSession: vi.fn().mockReturnValue(newSession),
        upsertObjects: vi.fn().mockReturnValue(2),
        addConversationTurn: vi.fn(),
        getRecentHistory: vi.fn().mockReturnValue([]),
      };

      // Mock VisionClient
      const mockVisionClient = {
        analyze: vi.fn().mockResolvedValue(MOCK_VISION_SUCCESS),
      };

      // 真实 ModalityRouter
      const router = new ModalityRouter.ModalityRouter() as {
        register: (type: string, adapter: MediaAdapter) => void;
        route: (type: string) => MediaAdapter;
        getSupportedTypes: () => string[];
      };
      router.register('image', new MockImageAdapter());

      const pipeline = new PipelineOrchestrator.PipelineOrchestrator(
        mockSessionManager,
        mockVisionClient,
        router
      );

      const input = makeInput({
        sessionId: 'new-session-001',
        mediaBase64: 'new-base64-data',
        mediaType: 'image',
      });

      const result = await pipeline.execute(input);

      // 验证创建了会话
      expect(mockSessionManager.createSession).toHaveBeenCalledWith(
        'new-session-001',
        'image',
        'new-base64-data'
      );

      // 验证调用了视觉 API
      expect(mockVisionClient.analyze).toHaveBeenCalled();

      // 验证 from_cache = false
      expect(result.fromCache).toBe(false);

      // 验证 round = 1
      expect(result.round).toBe(1);

      // 验证返回了 augmentedPrompt 和 visualAnalysis
      expect(result.augmentedPrompt).toBeTruthy();
      expect(result.visualAnalysis).not.toBeNull();

      // 验证 objectsCount
      expect(result.objectsCount).toBe(2);

      // 验证会话 ID
      expect(result.sessionId).toBe('new-session-001');
    });
  });

  // ================================================================
  // 测试 3：Augment 策略
  // ================================================================
  describe('Augment 策略', () => {
    it('已有 session + 新 media + augment → 新旧物体共存', async () => {
      const existingSession: Session = {
        session_id: 'augment-session',
        media_type: 'image',
        created_at: Math.floor(Date.now() / 1000) - 100,
        last_accessed_at: Math.floor(Date.now() / 1000),
      };

      const existingObjects: SessionObject[] = [
        makeSessionObject(1, '旧物体A'),
      ];

      const mockSessionManager = {
        getSession: vi
          .fn()
          .mockReturnValueOnce({
            session: existingSession,
            objects: existingObjects,
            recentHistory: [
              {
                round: 1,
                role: 'user',
                content: '第一问',
                created_at: Date.now() / 1000 - 50,
              },
              {
                round: 1,
                role: 'assistant',
                content: '第一答',
                created_at: Date.now() / 1000 - 49,
              },
            ],
          } as SessionContext)
          .mockReturnValueOnce({
            session: existingSession,
            objects: [...existingObjects, makeSessionObject(2, '新物体B')],
            recentHistory: [
              {
                round: 1,
                role: 'user',
                content: '第一问',
                created_at: Date.now() / 1000 - 50,
              },
              {
                round: 1,
                role: 'assistant',
                content: '第一答',
                created_at: Date.now() / 1000 - 49,
              },
            ],
          } as SessionContext),
        createSession: vi.fn(),
        upsertObjects: vi.fn().mockReturnValue(2),
        addConversationTurn: vi.fn(),
        getRecentHistory: vi.fn().mockReturnValue([
          {
            round: 1,
            role: 'user',
            content: '第一问',
            created_at: Date.now() / 1000 - 50,
          },
          {
            round: 1,
            role: 'assistant',
            content: '第一答',
            created_at: Date.now() / 1000 - 49,
          },
        ]),
      };

      const mockVisionClient = {
        analyze: vi.fn().mockResolvedValue(MOCK_VISION_SUCCESS),
      };

      const router = new ModalityRouter.ModalityRouter() as {
        register: (type: string, adapter: MediaAdapter) => void;
      };
      router.register('image', new MockImageAdapter());

      const pipeline = new PipelineOrchestrator.PipelineOrchestrator(
        mockSessionManager,
        mockVisionClient,
        router
      );

      const input = makeInput({
        sessionId: 'augment-session',
        mediaBase64: 'new-image-base64',
        mediaType: 'image',
        mergeStrategy: 'augment',
      });

      const result = await pipeline.execute(input);

      // 验证调用了 upsertObjects 使用 augment 策略
      expect(mockSessionManager.upsertObjects).toHaveBeenCalled();
      const upsertCall = mockSessionManager.upsertObjects.mock.calls[0];
      expect(upsertCall[2]).toBe('augment');

      // 验证 from_cache = false
      expect(result.fromCache).toBe(false);

      // 验证 round = 2
      expect(result.round).toBe(2);

      // 验证 objectsCount
      expect(result.objectsCount).toBe(2);
    });
  });

  // ================================================================
  // 测试 4：Replace 策略
  // ================================================================
  describe('Replace 策略', () => {
    it('已有 session + 新 media + replace → 旧物体被替换', async () => {
      const existingSession: Session = {
        session_id: 'replace-session',
        media_type: 'image',
        created_at: Math.floor(Date.now() / 1000) - 100,
        last_accessed_at: Math.floor(Date.now() / 1000),
      };

      const oldObjects: SessionObject[] = [
        makeSessionObject(1, '旧物体A'),
        makeSessionObject(2, '旧物体B'),
      ];

      const mockSessionManager = {
        getSession: vi
          .fn()
          .mockReturnValueOnce({
            session: existingSession,
            objects: oldObjects,
            recentHistory: [
              {
                round: 1,
                role: 'user',
                content: '第一问',
                created_at: Date.now() / 1000 - 50,
              },
              {
                round: 1,
                role: 'assistant',
                content: '第一答',
                created_at: Date.now() / 1000 - 49,
              },
            ],
          } as SessionContext)
          .mockReturnValueOnce({
            session: existingSession,
            objects: [makeSessionObject(3, '新物体C')],
            recentHistory: [
              {
                round: 1,
                role: 'user',
                content: '第一问',
                created_at: Date.now() / 1000 - 50,
              },
              {
                round: 1,
                role: 'assistant',
                content: '第一答',
                created_at: Date.now() / 1000 - 49,
              },
            ],
          } as SessionContext),
        createSession: vi.fn(),
        upsertObjects: vi.fn().mockReturnValue(1),
        addConversationTurn: vi.fn(),
        getRecentHistory: vi.fn().mockReturnValue([
          {
            round: 1,
            role: 'user',
            content: '第一问',
            created_at: Date.now() / 1000 - 50,
          },
          {
            round: 1,
            role: 'assistant',
            content: '第一答',
            created_at: Date.now() / 1000 - 49,
          },
        ]),
      };

      const mockVisionClient = {
        analyze: vi.fn().mockResolvedValue(MOCK_VISION_SUCCESS),
      };

      const router = new ModalityRouter.ModalityRouter() as {
        register: (type: string, adapter: MediaAdapter) => void;
      };
      router.register('image', new MockImageAdapter());

      const pipeline = new PipelineOrchestrator.PipelineOrchestrator(
        mockSessionManager,
        mockVisionClient,
        router
      );

      const input = makeInput({
        sessionId: 'replace-session',
        mediaBase64: 'new-base64',
        mediaType: 'image',
        mergeStrategy: 'replace',
      });

      const result = await pipeline.execute(input);

      // 验证调用了 upsertObjects 使用 replace 策略
      expect(mockSessionManager.upsertObjects).toHaveBeenCalled();
      const upsertCall = mockSessionManager.upsertObjects.mock.calls[0];
      expect(upsertCall[2]).toBe('replace');

      // 旧物体被替换后 objectsCount 为 1
      expect(result.objectsCount).toBe(1);
    });
  });

  // ================================================================
  // 测试 5：降级 - VisionClient 返回不可解析 JSON
  // ================================================================
  describe('降级：VisionClient 返回不可解析 JSON', () => {
    it('parseResponse 抛出时返回降级提示词，不崩溃', async () => {
      const existingSession: Session = {
        session_id: 'degrade-parse',
        media_type: 'image',
        created_at: Math.floor(Date.now() / 1000),
        last_accessed_at: Math.floor(Date.now() / 1000),
      };

      const mockSessionManager = {
        getSession: vi
          .fn()
          .mockReturnValueOnce(null)
          .mockReturnValue({
            session: existingSession,
            objects: [],
            recentHistory: [],
          } as SessionContext),
        createSession: vi.fn().mockReturnValue(existingSession),
        upsertObjects: vi.fn(),
        addConversationTurn: vi.fn(),
        getRecentHistory: vi.fn().mockReturnValue([]),
      };

      const mockVisionClient = {
        analyze: vi.fn().mockResolvedValue(MOCK_VISION_INVALID),
      };

      // Mock parseResponse 抛出错误
      parseResponseMock.mockImplementation(() => {
        throw new Error('无法解析');
      });

      const router = new ModalityRouter.ModalityRouter() as {
        register: (type: string, adapter: MediaAdapter) => void;
      };
      router.register('image', new MockImageAdapter());

      const pipeline = new PipelineOrchestrator.PipelineOrchestrator(
        mockSessionManager,
        mockVisionClient,
        router
      );

      const input = makeInput({
        sessionId: 'degrade-parse',
        mediaBase64: 'some-base64',
        mediaType: 'image',
      });

      const result = await pipeline.execute(input);

      // 不崩溃，返回降级结果
      expect(result.visualAnalysis).toBeNull();
      expect(result.augmentedPrompt).toBeTruthy();
      expect(result.fromCache).toBe(false);
      // 尽管解析失败，仍然返回合法的 PipelineOutput
      expect(result.sessionId).toBe('degrade-parse');
    });
  });

  // ================================================================
  // 测试 6：降级 - 适配器返回空数组
  // ================================================================
  describe('降级：适配器返回空数组', () => {
    it('适配器返回空数组时不调用视觉 API，尝试从缓存获取', async () => {
      const existingSession: Session = {
        session_id: 'degrade-adapter',
        media_type: 'image',
        created_at: Math.floor(Date.now() / 1000) - 100,
        last_accessed_at: Math.floor(Date.now() / 1000),
      };

      const mockSessionManager = {
        getSession: vi.fn().mockReturnValue({
          session: existingSession,
          objects: [makeSessionObject(1, '缓存物体')],
          recentHistory: [
            {
              round: 1,
              role: 'user',
              content: '第一问',
              created_at: Date.now() / 1000 - 50,
            },
            {
              round: 1,
              role: 'assistant',
              content: '第一答',
              created_at: Date.now() / 1000 - 49,
            },
          ],
        } as SessionContext),
        createSession: vi.fn(),
        upsertObjects: vi.fn(),
        addConversationTurn: vi.fn(),
        getRecentHistory: vi.fn().mockReturnValue([
          {
            round: 1,
            role: 'user',
            content: '第一问',
            created_at: Date.now() / 1000 - 50,
          },
          {
            round: 1,
            role: 'assistant',
            content: '第一答',
            created_at: Date.now() / 1000 - 49,
          },
        ]),
      };

      const mockVisionClient = {
        analyze: vi.fn(),
      };

      const router = new ModalityRouter.ModalityRouter() as {
        register: (type: string, adapter: MediaAdapter) => void;
      };
      router.register('broken', new MockEmptyAdapter());

      const pipeline = new PipelineOrchestrator.PipelineOrchestrator(
        mockSessionManager,
        mockVisionClient,
        router
      );

      const input = makeInput({
        sessionId: 'degrade-adapter',
        mediaBase64: 'corrupted-data',
        mediaType: 'broken',
      });

      const result = await pipeline.execute(input);

      // 验证不调用视觉 API
      expect(mockVisionClient.analyze).not.toHaveBeenCalled();

      // 降级为 from_cache = true
      expect(result.fromCache).toBe(true);

      // 仍然返回有效的 augmentedPrompt
      expect(result.augmentedPrompt).toBeTruthy();

      // 使用缓存的物体
      expect(result.objectsCount).toBe(1);
    });
  });

  // ================================================================
  // 测试 7：降级 - 未知 media_type
  // ================================================================
  describe('降级：未知 media_type', () => {
    it('ModalityRouter 抛出时返回降级结果，不崩溃', async () => {
      const existingSession: Session = {
        session_id: 'degrade-unknown-type',
        media_type: 'image',
        created_at: Math.floor(Date.now() / 1000) - 100,
        last_accessed_at: Math.floor(Date.now() / 1000),
      };

      const mockSessionManager = {
        getSession: vi.fn().mockReturnValue({
          session: existingSession,
          objects: [makeSessionObject(1, '已有物体')],
          recentHistory: [
            {
              round: 1,
              role: 'user',
              content: '第一问',
              created_at: Date.now() / 1000 - 50,
            },
            {
              round: 1,
              role: 'assistant',
              content: '第一答',
              created_at: Date.now() / 1000 - 49,
            },
          ],
        } as SessionContext),
        createSession: vi.fn(),
        upsertObjects: vi.fn(),
        addConversationTurn: vi.fn(),
        getRecentHistory: vi.fn().mockReturnValue([
          {
            round: 1,
            role: 'user',
            content: '第一问',
            created_at: Date.now() / 1000 - 50,
          },
          {
            round: 1,
            role: 'assistant',
            content: '第一答',
            created_at: Date.now() / 1000 - 49,
          },
        ]),
      };

      const mockVisionClient = {
        analyze: vi.fn(),
      };

      // 创建不注册任何适配器的空路由器
      const router = new ModalityRouter.ModalityRouter() as {
        register: (type: string, adapter: MediaAdapter) => void;
        route: (type: string) => MediaAdapter;
      };

      const pipeline = new PipelineOrchestrator.PipelineOrchestrator(
        mockSessionManager,
        mockVisionClient,
        router
      );

      const input = makeInput({
        sessionId: 'degrade-unknown-type',
        mediaBase64: 'some-data',
        mediaType: 'application/x-unknown',
      });

      const result = await pipeline.execute(input);

      // 不崩溃
      expect(result.sessionId).toBe('degrade-unknown-type');
      expect(result.augmentedPrompt).toBeTruthy();
      // 降级为缓存模式
      expect(result.fromCache).toBe(true);

      // 验证不调用视觉 API
      expect(mockVisionClient.analyze).not.toHaveBeenCalled();
    });
  });

  // ================================================================
  // 测试 8：降级 - 整体异常（SessionManager 抛异常）
  // ================================================================
  describe('降级：整体异常', () => {
    it('SessionManager 抛异常时不崩溃，返回降级 PipelineOutput', async () => {
      const mockSessionManager = {
        getSession: vi.fn().mockImplementation(() => {
          throw new Error('数据库连接失败');
        }),
        createSession: vi.fn(),
        upsertObjects: vi.fn(),
        addConversationTurn: vi.fn(),
        getRecentHistory: vi.fn(),
      };

      const mockVisionClient = {
        analyze: vi.fn(),
      };

      const router = new ModalityRouter.ModalityRouter() as {
        register: (type: string, adapter: MediaAdapter) => void;
      };
      router.register('image', new MockImageAdapter());

      const pipeline = new PipelineOrchestrator.PipelineOrchestrator(
        mockSessionManager,
        mockVisionClient,
        router
      );

      const input = makeInput({
        mediaBase64: 'some-base64',
        mediaType: 'image',
      });

      const result = await pipeline.execute(input);

      // 不崩溃，返回降级结果
      expect(result.sessionId).toBe('test-session-001');
      expect(result.augmentedPrompt).toBeTruthy();
      expect(result.visualAnalysis).toBeNull();
      expect(result.objectsCount).toBe(0);
      expect(result.round).toBe(1);
    });
  });

  // ================================================================
  // 测试 9：多轮对话记录
  // ================================================================
  describe('多轮对话记录', () => {
    it('3 轮对话后 getRecentHistory 的调用参数正确', async () => {
      const existingSession: Session = {
        session_id: 'multi-turn',
        media_type: 'image',
        created_at: Math.floor(Date.now() / 1000) - 300,
        last_accessed_at: Math.floor(Date.now() / 1000),
      };

      const existingHistory: ConversationTurn[] = [
        {
          round: 1,
          role: 'user',
          content: 'Q1',
          created_at: Date.now() / 1000 - 200,
        },
        {
          round: 1,
          role: 'assistant',
          content: 'A1',
          created_at: Date.now() / 1000 - 199,
        },
        {
          round: 2,
          role: 'user',
          content: 'Q2',
          created_at: Date.now() / 1000 - 100,
        },
        {
          round: 2,
          role: 'assistant',
          content: 'A2',
          created_at: Date.now() / 1000 - 99,
        },
      ];

      const mockSessionManager = {
        getSession: vi.fn().mockReturnValue({
          session: existingSession,
          objects: [makeSessionObject(1, '物体', { created_round: 1 })],
          recentHistory: existingHistory,
        } as SessionContext),
        createSession: vi.fn(),
        upsertObjects: vi.fn(),
        addConversationTurn: vi.fn(),
        getRecentHistory: vi.fn().mockReturnValue(existingHistory),
      };

      const mockVisionClient = {
        analyze: vi.fn(),
      };

      const router = new ModalityRouter.ModalityRouter() as {
        register: (type: string, adapter: MediaAdapter) => void;
      };
      router.register('image', new MockImageAdapter());

      const pipeline = new PipelineOrchestrator.PipelineOrchestrator(
        mockSessionManager,
        mockVisionClient,
        router
      );

      // 第三轮：无新媒体，纯历史指代追问
      const input = makeInput({
        sessionId: 'multi-turn',
        question: '刚才说的物体右边还有什么？',
      });

      const result = await pipeline.execute(input);

      // 第 3 轮
      expect(result.round).toBe(3);

      // 记录了 2 条对话记录（user + assistant）
      expect(mockSessionManager.addConversationTurn).toHaveBeenCalledTimes(2);

      // 验证记录了正确的对话轮次
      const calls = mockSessionManager.addConversationTurn.mock.calls;
      expect(calls[0][1]).toBe(3); // round
      expect(calls[0][2]).toBe('user'); // role
      expect(calls[1][1]).toBe(3); // round
      expect(calls[1][2]).toBe('assistant'); // role
    });
  });

  // ================================================================
  // 测试 10：from_cache 字段正确
  // ================================================================
  describe('from_cache 字段正确性', () => {
    it('无新媒体时 from_cache=true', async () => {
      const mockSessionManager = {
        getSession: vi.fn().mockReturnValue({
          session: {
            session_id: 'cache-field',
            media_type: 'image',
            created_at: Date.now() / 1000 - 10,
            last_accessed_at: Date.now() / 1000,
          } as Session,
          objects: [makeSessionObject(1, '物体A')],
          recentHistory: [
            {
              round: 1,
              role: 'user',
              content: 'Q',
              created_at: Date.now() / 1000 - 5,
            },
            {
              round: 1,
              role: 'assistant',
              content: 'A',
              created_at: Date.now() / 1000 - 4,
            },
          ],
        } as SessionContext),
        createSession: vi.fn(),
        upsertObjects: vi.fn(),
        addConversationTurn: vi.fn(),
        getRecentHistory: vi.fn().mockReturnValue([
          {
            round: 1,
            role: 'user',
            content: 'Q',
            created_at: Date.now() / 1000 - 5,
          },
          {
            round: 1,
            role: 'assistant',
            content: 'A',
            created_at: Date.now() / 1000 - 4,
          },
        ]),
      };

      const mockVisionClient = { analyze: vi.fn() };

      const router = new ModalityRouter.ModalityRouter() as {
        register: (type: string, adapter: MediaAdapter) => void;
      };
      router.register('image', new MockImageAdapter());

      const pipeline = new PipelineOrchestrator.PipelineOrchestrator(
        mockSessionManager,
        mockVisionClient,
        router
      );

      // 无 mediaBase64 的输入
      const cacheInput = makeInput({
        sessionId: 'cache-field',
        mediaBase64: undefined,
        mediaType: undefined,
      });
      const cacheResult = await pipeline.execute(cacheInput);
      expect(cacheResult.fromCache).toBe(true);

      // 有 mediaBase64 + mediaType 的输入
      const mockSessionManager2 = {
        getSession: vi
          .fn()
          .mockReturnValueOnce(null)
          .mockReturnValue({
            session: {
              session_id: 'vision-field',
              media_type: 'image',
              created_at: Date.now() / 1000,
              last_accessed_at: Date.now() / 1000,
            } as Session,
            objects: [makeSessionObject(1, '新物体')],
            recentHistory: [],
          } as SessionContext),
        createSession: vi.fn().mockReturnValue({
          session_id: 'vision-field',
          media_type: 'image',
          created_at: Date.now() / 1000,
          last_accessed_at: Date.now() / 1000,
        } as Session),
        upsertObjects: vi.fn().mockReturnValue(1),
        addConversationTurn: vi.fn(),
        getRecentHistory: vi.fn().mockReturnValue([]),
      };

      const mockVisionClient2 = {
        analyze: vi.fn().mockResolvedValue(MOCK_VISION_SUCCESS),
      };

      const pipeline2 = new PipelineOrchestrator.PipelineOrchestrator(
        mockSessionManager2,
        mockVisionClient2,
        router
      );

      const visionInput = makeInput({
        sessionId: 'vision-field',
        mediaBase64: 'some-base64-str',
        mediaType: 'image',
      });
      const visionResult = await pipeline2.execute(visionInput);
      expect(visionResult.fromCache).toBe(false);
    });
  });

  // ================================================================
  // 补充测试：ModalityRouter 独立测试
  // ================================================================
  describe('ModalityRouter', () => {
    it('register 后 route 应返回对应适配器', () => {
      const router = new ModalityRouter.ModalityRouter() as {
        register: (type: string, adapter: MediaAdapter) => void;
        route: (type: string) => MediaAdapter;
        getSupportedTypes: () => string[];
      };

      const mockAdapter = new MockImageAdapter();
      router.register('image', mockAdapter);

      const result = router.route('image');
      expect(result).toBe(mockAdapter);
    });

    it('route 未知类型应抛出 ModalityRouterError 含支持类型列表', () => {
      const router = new ModalityRouter.ModalityRouter() as {
        register: (type: string, adapter: MediaAdapter) => void;
        route: (type: string) => MediaAdapter;
      };

      const mockAdapter = new MockImageAdapter();
      router.register('image', mockAdapter);

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

    it('getSupportedTypes 应返回所有已注册类型', () => {
      const router = new ModalityRouter.ModalityRouter() as {
        register: (type: string, adapter: MediaAdapter) => void;
        getSupportedTypes: () => string[];
      };

      router.register('image', new MockImageAdapter());
      router.register('video', new MockEmptyAdapter());

      const types = router.getSupportedTypes();
      expect(types).toContain('image');
      expect(types).toContain('video');
      expect(types.length).toBe(2);
    });
  });

  // ================================================================
  // 补充测试：降级 - Validator 校验失败
  // ================================================================
  describe('降级：Validator 校验失败', () => {
    it('validateObjects 抛出时返回降级提示词，不崩溃', async () => {
      const existingSession: Session = {
        session_id: 'degrade-validate',
        media_type: 'image',
        created_at: Math.floor(Date.now() / 1000),
        last_accessed_at: Math.floor(Date.now() / 1000),
      };

      const mockSessionManager = {
        getSession: vi
          .fn()
          .mockReturnValueOnce(null)
          .mockReturnValue({
            session: existingSession,
            objects: [],
            recentHistory: [],
          } as SessionContext),
        createSession: vi.fn().mockReturnValue(existingSession),
        upsertObjects: vi.fn(),
        addConversationTurn: vi.fn(),
        getRecentHistory: vi.fn().mockReturnValue([]),
      };

      const mockVisionClient = {
        analyze: vi.fn().mockResolvedValue(MOCK_VISION_SUCCESS),
      };

      // Mock validateObjects 抛出错误
      validateObjectsMock.mockImplementation(() => {
        throw new Error('ID 重复');
      });

      const router = new ModalityRouter.ModalityRouter() as {
        register: (type: string, adapter: MediaAdapter) => void;
      };
      router.register('image', new MockImageAdapter());

      const pipeline = new PipelineOrchestrator.PipelineOrchestrator(
        mockSessionManager,
        mockVisionClient,
        router
      );

      const input = makeInput({
        mediaBase64: 'some-base64',
        mediaType: 'image',
      });

      const result = await pipeline.execute(input);

      // 不崩溃
      expect(result.visualAnalysis).toBeNull();
      expect(result.augmentedPrompt).toBeTruthy();
    });
  });
});
