/** 坐标归一化精度：0-100 或 0-1000 */
export type CoordinatePrecision = '0-100' | '0-1000';

/** 物体合并策略：替换已有物体 或 增补到已有列表 */
export type MergeStrategy = 'replace' | 'augment';

/** 支持的媒体类型 */
export type MediaType =
  | 'image'
  | 'video'
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  | 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  | 'text/plain'
  | 'text/markdown';

/** MCP 传输模式 */
export type TransportMode = 'stdio' | 'sse' | 'http-stream';

/** 日志级别 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * 边界框，原点在左上角 (x 右, y 下)
 * 坐标归一化到 0-1000 或 0-100
 */
export interface BBox {
  /** 左边界 x */
  x1: number;
  /** 上边界 y */
  y1: number;
  /** 右边界 x */
  x2: number;
  /** 下边界 y */
  y2: number;
}

/** 物体中心点 */
export interface Centroid {
  cx: number;
  cy: number;
}

/** 视觉模型返回的单个物体 */
export interface VisualObject {
  /** 视觉模型分配的唯一数字 ID */
  id: number;
  /** 物体标签（简洁描述） */
  label: string;
  /** 边界框 [x1, y1, x2, y2] */
  bbox: [number, number, number, number];
  /** 中心点 [cx, cy] */
  centroid: [number, number];
  /** 物体状态（如"被遮挡""正在移动"） */
  state?: string;
  /** 与用户问题的相关度（高/中/低） */
  relevance?: string;
  /** 文档页码（仅文档模态） */
  page?: number | null;
  /** 视频时间范围 [start, end]，单位秒（仅视频模态） */
  timestamp_range?: [number, number] | null;
  /** 来源媒体类型 */
  media_type?: MediaType;
}

/** 视觉模型原始分析结果 */
export interface VisualAnalysisResult {
  /** 模型的推理思考过程（可选） */
  reasoning?: string;
  /** 识别到的物体列表 */
  objects: VisualObject[];
  /** 物体之间的空间/时间/结构关系 */
  spatial_relationships?: string[];
}

/** 适配器统一输出的 Base64 图像 */
export interface Base64Image {
  /** Base64 编码的图像数据 */
  base64: string;
  /** MIME 类型（如 image/jpeg） */
  mime_type: string;
  /** 视频帧的时间戳，单位秒（仅视频模态） */
  timestamp_sec?: number;
  /** 文档页码（仅文档模态） */
  page_number?: number;
}

/**
 * 媒体适配器接口
 * 所有模态适配器必须实现，负责将不同模态输入统一转化为 Base64 图像数组
 */
export interface MediaAdapter {
  /** 适配器支持的媒体类型 */
  readonly mediaType: string;
  /** 将输入适配为 Base64 图像数组 */
  adapt(input: string): Promise<Base64Image[]>;
}

/** 适配器注册表条目 */
export interface AdapterEntry {
  mediaType: MediaType;
  adapter: MediaAdapter;
}

/** 会话物体（持久化到 SQLite 的扁平结构） */
export interface SessionObject {
  /** 自增主键（数据库层管理） */
  id?: number;
  /** 视觉模型分配的唯一物体 ID */
  object_id: number;
  /** 物体标签 */
  label: string;
  /** 边界框左上角 x */
  x1: number;
  /** 边界框左上角 y */
  y1: number;
  /** 边界框右下角 x */
  x2: number;
  /** 边界框右下角 y */
  y2: number;
  /** 中心点 x */
  cx: number;
  /** 中心点 y */
  cy: number;
  /** 物体状态 */
  state: string;
  /** 相关度 */
  relevance: string;
  /** 文档页码（仅文档模态） */
  page?: number;
  /** 视频时间戳起始（仅视频模态） */
  timestamp_start?: number;
  /** 视频时间戳结束（仅视频模态） */
  timestamp_end?: number;
  /** 来源媒体类型 */
  media_type: string;
  /** 创建时的会话轮次 */
  created_round: number;
}

/** 会话元数据 */
export interface Session {
  /** 会话唯一标识 */
  session_id: string;
  /** 原始图像 Base64（可选，用于缓存引用） */
  image_base64?: string;
  /** 媒体类型 */
  media_type: string;
  /** 创建时间（Unix 时间戳） */
  created_at: number;
  /** 最后访问时间（Unix 时间戳） */
  last_accessed_at: number;
}

/** 对话轮次记录 */
export interface ConversationTurn {
  /** 会话内轮次编号 */
  round: number;
  /** 发言角色：user 或 assistant */
  role: 'user' | 'assistant';
  /** 对话内容 */
  content: string;
  /** 创建时间（Unix 时间戳） */
  created_at: number;
}

/** 会话完整上下文（元数据 + 全部物体 + 最近对话） */
export interface SessionContext {
  session: Session;
  objects: SessionObject[];
  recentHistory: ConversationTurn[];
}

/** MCP 工具输入参数 */
export interface MultimodalGroundingInput {
  /** 会话 ID（不传则自动生成） */
  session_id?: string;
  /** 媒体 Base64 编码 */
  media_base64?: string;
  /** 媒体类型 */
  media_type?: MediaType;
  /** 用户问题 */
  question: string;
  /** 物体合并策略 */
  merge_strategy?: MergeStrategy;
  /** 坐标精度 */
  coordinate_precision?: CoordinatePrecision;
}

/** MCP 工具返回值 */
export interface MultimodalGroundingOutput {
  /** 会话 ID */
  session_id: string;
  /** 视觉模型原始分析结果（fromCache 时可能为 null） */
  raw_visual_analysis: VisualAnalysisResult | null;
  /** 增强后的提示词 */
  augmented_prompt: string;
  /** 当前会话累积物体总数 */
  objects_count: number;
  /** 是否命中缓存 */
  from_cache: boolean;
  /** 当前会话轮次 */
  round: number;
}

/** 管道执行输入（内部使用，字段已规范化） */
export interface PipelineInput {
  sessionId: string;
  mediaBase64?: string;
  mediaType?: MediaType;
  question: string;
  mergeStrategy: MergeStrategy;
  coordinatePrecision: CoordinatePrecision;
}

/** 管道执行输出（内部使用） */
export interface PipelineOutput {
  sessionId: string;
  visualAnalysis: VisualAnalysisResult | null;
  augmentedPrompt: string;
  objectsCount: number;
  fromCache: boolean;
  round: number;
}

/** 应用完整配置（从环境变量解析后的结构） */
export interface AppConfig {
  /** 视觉模型 API 基础 URL */
  visionApiBaseUrl: string;
  /** 视觉模型 API 密钥 */
  visionApiKey: string;
  /** 视觉模型名称 */
  visionModelName: string;
  /** 坐标归一化精度 */
  coordinatePrecision: CoordinatePrecision;
  /** MCP 传输协议 */
  mcpTransport: TransportMode;
  /** 日志级别 */
  logLevel: LogLevel;
  /** API 调用超时时间（毫秒） */
  timeoutMs: number;
  /** 会话过期时间（秒） */
  sessionTtlSeconds: number;
  /** SQLite 数据库文件路径 */
  dbPath: string;
  /** 视频抽帧最大数量 */
  maxVideoFrames: number;
  /** 文档渲染最大页数 */
  maxDocPages: number;
  /** HTTP 服务端口（SSE / HTTP Stream 模式） */
  port: number;
}
