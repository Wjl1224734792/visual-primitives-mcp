/** 坐标归一化精度：0-100 或 0-1000 */
export type CoordinatePrecision = '0-100' | '0-1000';

/** MCP 传输模式 */
export type TransportMode = 'stdio' | 'sse' | 'http-stream';

/** 日志级别 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** 视觉任务类型 */
export type VisualTask = 'describe' | 'locate' | 'ocr' | 'video_analyze';

/** 视觉模型返回的单个物体 */
export interface VisualObject {
  id: number;
  label: string;
  bbox: [number, number, number, number];
  centroid: [number, number];
  state?: string;
  relevance?: string;
  timestamp_range?: [number, number] | null;
}

/** 视觉模型原始分析结果 */
export interface VisualAnalysisResult {
  reasoning?: string;
  objects: VisualObject[];
  spatial_relationships?: string[];
}

/** 适配器统一输出的 Base64 数据 */
export interface Base64Image {
  base64: string;
  mime_type: string;
}

/** 媒体适配器接口 */
export interface MediaAdapter {
  readonly mediaType: string;
  adapt(input: string): Promise<Base64Image[]>;
}

/** 会话物体（持久化到 SQLite 的扁平结构） */
export interface SessionObject {
  id?: number;
  object_id: number;
  label: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cx: number;
  cy: number;
  state: string;
  relevance: string;
  timestamp_start?: number;
  timestamp_end?: number;
  media_type: string;
  created_round: number;
}

/** 会话元数据 */
export interface Session {
  session_id: string;
  image_base64?: string;
  media_type: string;
  created_at: number;
  last_accessed_at: number;
}

/** 对话轮次记录 */
export interface ConversationTurn {
  round: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: number;
}

/** 会话完整上下文 */
export interface SessionContext {
  session: Session;
  objects: SessionObject[];
  recentHistory: ConversationTurn[];
}

// ---- 模型配置 ----

/** 单工具模型配置（全部 OpenAI 兼容） */
export interface ModelConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

// ---- 应用配置 ----

/** 应用完整配置 */
export interface AppConfig {
  /** 默认视觉模型配置 */
  vision: ModelConfig;
  /** visual_describe 专用配置 */
  describe: ModelConfig;
  /** visual_locate 专用配置 */
  locate: ModelConfig;
  /** visual_ocr 专用配置 */
  ocr: ModelConfig;
  /** visual_video_analyze 专用配置 */
  video: ModelConfig;
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
  /** HTTP 服务端口 */
  port: number;
}

// ---- 管道输入/输出 ----

/** describe 管道输入 */
export interface DescribeInput {
  sessionId: string;
  imageBase64: string;
  mediaType: string;
  prompt?: string;
}

/** describe 管道输出 */
export interface DescribeOutput {
  sessionId: string;
  description: string;
  round: number;
}

/** locate 管道输入 */
export interface LocateInput {
  sessionId: string;
  imageBase64?: string;
  mediaType?: string;
  question: string;
  coordinatePrecision: CoordinatePrecision;
}

/** locate 管道输出 */
export interface LocateOutput {
  sessionId: string;
  visualAnalysis: VisualAnalysisResult | null;
  augmentedPrompt: string;
  objectsCount: number;
  fromCache: boolean;
  round: number;
}

/** OCR 管道输入 */
export interface OcrInput {
  imageBase64: string;
  mediaType: string;
  prompt?: string;
}

/** video_analyze 管道输入 */
export interface VideoAnalyzeInput {
  sessionId: string;
  videoBase64: string;
  mediaType: string;
  prompt?: string;
}

/** video_analyze 管道输出 */
export interface VideoAnalyzeOutput {
  sessionId: string;
  description: string;
  round: number;
}
