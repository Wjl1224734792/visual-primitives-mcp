/**
 * 会话管理器（Session Manager）
 *
 * 基于 node:sqlite 的会话持久化管理器，是 DDD 中 Session 聚合根的仓储实现。
 *
 * 聚合根：Session（会话元数据）
 * 实体：SessionObject（已标注物体）、ConversationTurn（对话轮次）
 * 值对象：BBox, Centroid, MergeStrategy（定义在 types.ts）
 * 领域服务：ObjectMergeService（augment/replace 合并策略，作为私有方法实现）
 * 领域事件：轻量函数调用，记录关键操作日志
 *
 * 映射需求：REQ-011, REQ-012, REQ-013, REQ-014, REQ-015, REQ-N06
 * 任务 ID：TASK-005
 */
import { DatabaseSync } from './sqlite-wrapper.js';
import type {
  Session,
  SessionObject,
  SessionContext,
  ConversationTurn,
  MergeStrategy,
} from '../types.js';
import type { IDatabaseSyncInstance } from './sqlite-wrapper.js';
import { logger } from '../utils/logger.js';

/** getSession 默认返回的最近对话轮次数 */
const DEFAULT_RECENT_ROUNDS = 5;

/** cleanupExpired 默认 TTL（秒） */
const DEFAULT_TTL_SECONDS = 3600;

/**
 * 安全的数字转换：将 unknown 转为 number，null/undefined 返回 fallback
 */
function toNum(v: unknown, fallback = 0): number {
  return v != null ? Number(v) : fallback;
}

/**
 * 安全的可选数字转换：null/undefined 返回 undefined
 */
function toOptNum(v: unknown): number | undefined {
  return v != null ? Number(v) : undefined;
}

/**
 * 安全的字符串转换：null/undefined 返回 fallback，非原始类型返回 fallback
 */
function toStr(v: unknown, fallback = ''): string {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  return fallback;
}

/**
 * 从数据库行构建 Session 对象
 */
function rowToSession(row: Record<string, unknown>): Session {
  return {
    session_id: toStr(row['session_id']),
    image_base64: (row['image_base64'] as string) || undefined,
    media_type: toStr(row['media_type']),
    created_at: toNum(row['created_at']),
    last_accessed_at: toNum(row['last_accessed_at']),
  };
}

/**
 * 从数据库行构建 SessionObject 对象
 */
function rowToSessionObject(row: Record<string, unknown>): SessionObject {
  return {
    id: toNum(row['id']),
    object_id: toNum(row['object_id']),
    label: toStr(row['label']),
    x1: toNum(row['x1']),
    y1: toNum(row['y1']),
    x2: toNum(row['x2']),
    y2: toNum(row['y2']),
    cx: toNum(row['cx']),
    cy: toNum(row['cy']),
    state: toStr(row['state']),
    relevance: toStr(row['relevance']),
    page: toOptNum(row['page']),
    timestamp_start: toOptNum(row['timestamp_start']),
    timestamp_end: toOptNum(row['timestamp_end']),
    media_type: toStr(row['media_type']),
    created_round: toNum(row['created_round']),
  };
}

/**
 * 从数据库行构建 ConversationTurn 对象
 */
function rowToTurn(row: Record<string, unknown>): ConversationTurn {
  return {
    round: row['round'] as number,
    role: row['role'] as 'user' | 'assistant',
    content: row['content'] as string,
    created_at: row['created_at'] as number,
  };
}

export class SessionManager {
  private db: IDatabaseSyncInstance;

  /**
   * 构造会话管理器，打开/创建 SQLite 数据库
   * @param dbPath 数据库文件路径，传入 ':memory:' 使用内存数据库
   */
  constructor(dbPath: string) {
    try {
      this.db = new DatabaseSync(dbPath);
      this.db.exec('PRAGMA journal_mode=WAL;');
      this.db.exec('PRAGMA foreign_keys = ON;');
      this.initTables();
      logger.info({ dbPath }, 'SessionManager 数据库已初始化');
    } catch (error) {
      logger.error({ error, dbPath }, 'SessionManager 数据库初始化失败');
      throw error;
    }
  }

  /**
   * 初始化数据库表结构（遵循 PRD 3.4 节 DDL）
   */
  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
          session_id    TEXT PRIMARY KEY,
          image_base64  TEXT,
          media_type    TEXT NOT NULL,
          created_at    INTEGER NOT NULL,
          last_accessed_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS session_objects (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id    TEXT NOT NULL,
          object_id     INTEGER NOT NULL,
          label         TEXT NOT NULL,
          x1            REAL, y1 REAL, x2 REAL, y2 REAL,
          cx            REAL, cy REAL,
          state         TEXT,
          relevance     TEXT,
          page          INTEGER,
          timestamp_start REAL,
          timestamp_end   REAL,
          media_type    TEXT,
          created_round INTEGER NOT NULL DEFAULT 1,
          FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS conversation_history (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id    TEXT NOT NULL,
          round         INTEGER NOT NULL,
          role          TEXT NOT NULL,
          content       TEXT NOT NULL,
          created_at    INTEGER NOT NULL,
          FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
      );
    `);
  }

  // ---- 公共方法 ----

  /**
   * 创建新会话（幂等：若 sessionId 已存在则返回已有会话）
   * @param sessionId 会话唯一标识
   * @param mediaType 媒体类型
   * @param imageBase64 原始图像 Base64（可选）
   * @returns 会话元数据
   */
  createSession(
    sessionId: string,
    mediaType: string,
    imageBase64?: string
  ): Session {
    try {
      const now = Math.floor(Date.now() / 1000);

      this.db
        .prepare(
          `INSERT OR IGNORE INTO sessions (session_id, media_type, image_base64, created_at, last_accessed_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(sessionId, mediaType, imageBase64 ?? null, now, now);

      // 更新最后访问时间（无论新建还是已有）
      this.db
        .prepare(
          'UPDATE sessions SET last_accessed_at = ? WHERE session_id = ?'
        )
        .run(now, sessionId);

      const row = this.db
        .prepare('SELECT * FROM sessions WHERE session_id = ?')
        .get(sessionId);

      if (!row) {
        // 极端情况：INSERT 成功但 SELECT 失败
        logger.error(
          { sessionId },
          'createSession: 插入后查询失败，返回降级结果'
        );
        return {
          session_id: sessionId,
          media_type: mediaType,
          created_at: now,
          last_accessed_at: now,
        };
      }

      logger.info({ sessionId, mediaType }, '领域事件：SessionCreated');
      return rowToSession(row);
    } catch (error) {
      logger.error({ error, sessionId }, 'createSession 失败');
      return {
        session_id: sessionId,
        media_type: mediaType,
        created_at: Math.floor(Date.now() / 1000),
        last_accessed_at: Math.floor(Date.now() / 1000),
      };
    }
  }

  /**
   * 获取会话完整上下文（元数据 + 全部物体 + 最近 N 轮对话）
   * @param sessionId 会话 ID
   * @returns 会话上下文，不存在时返回 null
   */
  getSession(sessionId: string): SessionContext | null {
    try {
      // 查询会话元数据
      const sessionRow = this.db
        .prepare('SELECT * FROM sessions WHERE session_id = ?')
        .get(sessionId);

      if (!sessionRow) {
        return null;
      }

      // 更新最后访问时间
      const now = Math.floor(Date.now() / 1000);
      this.db
        .prepare(
          'UPDATE sessions SET last_accessed_at = ? WHERE session_id = ?'
        )
        .run(now, sessionId);

      // 查询全部物体
      const objectRows = this.db
        .prepare(
          'SELECT * FROM session_objects WHERE session_id = ? ORDER BY object_id ASC'
        )
        .all(sessionId);

      // 查询最近 N 轮对话
      const recentHistory = this.queryRecentHistory(
        sessionId,
        DEFAULT_RECENT_ROUNDS
      );

      return {
        session: rowToSession(sessionRow),
        objects: objectRows.map(rowToSessionObject),
        recentHistory,
      };
    } catch (error) {
      logger.error({ error, sessionId }, 'getSession 失败');
      return null;
    }
  }

  /**
   * 新增或替换物体（领域服务：ObjectMergeService）
   *
   * augment 策略：查询当前最大 object_id，新物体从 max+1 开始分配 ID（避免冲突），
   *              保留已有物体 + 插入新物体
   * replace 策略：删除所有旧物体，插入新物体（保留输入 object_id）
   *
   * @param sessionId 会话 ID
   * @param objects 要操作的物体列表
   * @param mergeStrategy 合并策略（augment 或 replace）
   * @returns 操作后的当前会话物体总数
   */
  upsertObjects(
    sessionId: string,
    objects: SessionObject[],
    mergeStrategy: MergeStrategy
  ): number {
    try {
      if (mergeStrategy === 'replace') {
        this.replaceObjects(sessionId, objects);
      } else {
        this.augmentObjects(sessionId, objects);
      }

      // 返回当前总会话物体数
      const countResult = this.db
        .prepare(
          'SELECT COUNT(*) as cnt FROM session_objects WHERE session_id = ?'
        )
        .get(sessionId);
      const totalCount = countResult ? toNum(countResult['cnt']) : 0;

      logger.info(
        {
          sessionId,
          mergeStrategy,
          objectsCount: objects.length,
          totalCount,
        },
        '领域事件：ObjectsMerged'
      );

      return totalCount;
    } catch (error) {
      logger.error({ error, sessionId, mergeStrategy }, 'upsertObjects 失败');
      return 0;
    }
  }

  /**
   * 追加一轮对话记录
   * @param sessionId 会话 ID
   * @param round 轮次编号
   * @param role 发言角色
   * @param content 对话内容
   */
  addConversationTurn(
    sessionId: string,
    round: number,
    role: 'user' | 'assistant',
    content: string
  ): void {
    try {
      const now = Math.floor(Date.now() / 1000);
      this.db
        .prepare(
          `INSERT INTO conversation_history (session_id, round, role, content, created_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(sessionId, round, role, content, now);
    } catch (error) {
      logger.error(
        { error, sessionId, round, role },
        'addConversationTurn 失败'
      );
    }
  }

  /**
   * 获取最近 N 轮对话记录
   * @param sessionId 会话 ID
   * @param maxRounds 最大轮次数
   * @returns 对话记录列表（按时间升序）
   */
  getRecentHistory(sessionId: string, maxRounds: number): ConversationTurn[] {
    try {
      return this.queryRecentHistory(sessionId, maxRounds);
    } catch (error) {
      logger.error({ error, sessionId, maxRounds }, 'getRecentHistory 失败');
      return [];
    }
  }

  /**
   * 清理过期会话（级联删除关联 objects 和 history）
   * @param ttlSeconds 过期时间（秒），默认 3600
   * @returns 删除的会话数量
   */
  cleanupExpired(ttlSeconds?: number): number {
    try {
      const ttl = ttlSeconds ?? DEFAULT_TTL_SECONDS;
      const cutoff = Math.floor(Date.now() / 1000) - ttl;

      const result = this.db
        .prepare('DELETE FROM sessions WHERE last_accessed_at < ?')
        .run(cutoff);

      const deletedCount =
        typeof result.changes === 'bigint'
          ? Number(result.changes)
          : result.changes;

      if (deletedCount > 0) {
        logger.info(
          { deletedCount, ttlSeconds: ttl },
          '领域事件：SessionExpired'
        );
      }

      return deletedCount;
    } catch (error) {
      logger.error({ error, ttlSeconds }, 'cleanupExpired 失败');
      return 0;
    }
  }

  /**
   * 完全删除会话及所有关联数据（CASCADE）
   * @param sessionId 会话 ID
   */
  deleteSession(sessionId: string): void {
    try {
      this.db
        .prepare('DELETE FROM sessions WHERE session_id = ?')
        .run(sessionId);
    } catch (error) {
      logger.error({ error, sessionId }, 'deleteSession 失败');
    }
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    try {
      this.db.close();
      logger.info('SessionManager 数据库连接已关闭');
    } catch (error) {
      logger.error({ error }, '关闭数据库连接失败');
    }
  }

  // ---- 私有方法：领域服务 ----

  /**
   * replace 策略：删除所有旧物体后插入新物体
   */
  private replaceObjects(sessionId: string, objects: SessionObject[]): void {
    this.db
      .prepare('DELETE FROM session_objects WHERE session_id = ?')
      .run(sessionId);

    this.insertObjects(sessionId, objects);
  }

  /**
   * augment 策略：为新物体分配不冲突的 object_id 后插入
   *
   * 查询当前最大 object_id，新物体从 max+1 开始依次分配 ID，
   * 避免与已有物体 ID 冲突，同时保持跨轮 ID 一致性。
   */
  private augmentObjects(sessionId: string, objects: SessionObject[]): void {
    // 查询当前最大 object_id，无已有物体时从 0 开始
    const maxResult = this.db
      .prepare(
        'SELECT COALESCE(MAX(object_id), 0) as max_id FROM session_objects WHERE session_id = ?'
      )
      .get(sessionId) as { max_id: number };

    const startId = maxResult.max_id + 1;

    // 重新映射 object_id
    const remappedObjects = objects.map((obj, index) => ({
      ...obj,
      object_id: startId + index,
    }));

    this.insertObjects(sessionId, remappedObjects);
  }

  /**
   * 批量插入物体
   */
  private insertObjects(sessionId: string, objects: SessionObject[]): void {
    const stmt = this.db.prepare(
      `INSERT INTO session_objects
       (session_id, object_id, label, x1, y1, x2, y2, cx, cy, state, relevance, page, timestamp_start, timestamp_end, media_type, created_round)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const obj of objects) {
      stmt.run(
        sessionId,
        obj.object_id,
        obj.label,
        obj.x1,
        obj.y1,
        obj.x2,
        obj.y2,
        obj.cx,
        obj.cy,
        obj.state,
        obj.relevance,
        obj.page ?? null,
        obj.timestamp_start ?? null,
        obj.timestamp_end ?? null,
        obj.media_type,
        obj.created_round
      );
    }
  }

  /**
   * 查询最近 N 轮对话记录
   *
   * 策略：先获取最大 round 编号，计算起始 round，查询 >= 起始 round 的所有记录，
   * 按 round ASC、id ASC 排序返回。
   *
   * @param sessionId 会话 ID
   * @param maxRounds 最大轮次数
   * @returns 对话记录列表（按时间升序）
   */
  private queryRecentHistory(
    sessionId: string,
    maxRounds: number
  ): ConversationTurn[] {
    const maxRoundResult = this.db
      .prepare(
        'SELECT COALESCE(MAX(round), 0) as max_round FROM conversation_history WHERE session_id = ?'
      )
      .get(sessionId) as { max_round: number };

    if (maxRoundResult.max_round === 0) {
      return [];
    }

    const startRound = Math.max(maxRoundResult.max_round - maxRounds + 1, 1);

    const rows = this.db
      .prepare(
        `SELECT * FROM conversation_history
         WHERE session_id = ? AND round >= ?
         ORDER BY round ASC, id ASC`
      )
      .all(sessionId, startRound);

    return rows.map(rowToTurn);
  }
}
