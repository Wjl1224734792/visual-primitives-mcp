/**
 * 会话管理器测试（TDD）
 *
 * 测试 SessionManager 的 CRUD、合并策略、TTL 清理、级联删除等完整功能。
 * 所有测试使用 :memory: SQLite 数据库，确保测试隔离不污染开发数据库。
 *
 * 映射需求：REQ-011, REQ-012, REQ-013, REQ-014, REQ-015, REQ-N06
 * 任务 ID：TASK-005
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '../src/core/session-manager.js';
import type { SessionObject } from '../src/types.js';

/**
 * 创建测试用 SessionObject 的辅助函数
 */
function makeObject(
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

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager(':memory:');
  });

  describe('createSession', () => {
    it('创建会话后应返回完整元数据（session_id, media_type, timestamps）', () => {
      const beforeCreate = Math.floor(Date.now() / 1000);
      const session = manager.createSession('test-session-1', 'image');

      expect(session.session_id).toBe('test-session-1');
      expect(session.media_type).toBe('image');
      expect(session.image_base64).toBeUndefined();
      expect(session.created_at).toBeGreaterThanOrEqual(beforeCreate);
      expect(session.last_accessed_at).toBeGreaterThanOrEqual(beforeCreate);
      // 创建时间和最后访问时间应接近（同一操作）
      expect(
        Math.abs(session.last_accessed_at - session.created_at)
      ).toBeLessThanOrEqual(2);
    });

    it('创建会话时可传入 image_base64', () => {
      const session = manager.createSession(
        'test-session-2',
        'image',
        'base64data'
      );

      expect(session.image_base64).toBe('base64data');
      expect(session.media_type).toBe('image');
    });

    it('createSession 幂等：重复创建同 ID 应返回已有会话', () => {
      const first = manager.createSession('idempotent-test', 'video');
      const second = manager.createSession('idempotent-test', 'image');

      // 第二次调用应返回第一次创建的会话
      expect(second.session_id).toBe(first.session_id);
      expect(second.media_type).toBe('video'); // 保持原始 media_type
      expect(second.created_at).toBe(first.created_at);
      // last_accessed_at 应被更新
      expect(second.last_accessed_at).toBeGreaterThanOrEqual(
        first.last_accessed_at
      );
    });
  });

  describe('getSession', () => {
    it('getSession 完整上下文：含 objects + history', () => {
      const sessionId = 'full-context-test';
      manager.createSession(sessionId, 'image');

      // 添加物体
      const objects: SessionObject[] = [
        makeObject(1, '红色水杯'),
        makeObject(2, '蓝色笔记本'),
      ];
      manager.upsertObjects(sessionId, objects, 'replace');

      // 添加对话历史
      manager.addConversationTurn(sessionId, 1, 'user', '左下角有什么？');
      manager.addConversationTurn(
        sessionId,
        1,
        'assistant',
        '左下角有红色水杯(id:1)'
      );

      const ctx = manager.getSession(sessionId);

      expect(ctx).not.toBeNull();
      if (ctx) {
        expect(ctx.session.session_id).toBe(sessionId);
        expect(ctx.objects).toHaveLength(2);
        expect(ctx.objects[0]?.label).toBe('红色水杯');
        expect(ctx.objects[1]?.label).toBe('蓝色笔记本');
        expect(ctx.recentHistory).toHaveLength(2);
        expect(ctx.recentHistory[0]?.content).toBe('左下角有什么？');
        expect(ctx.recentHistory[1]?.content).toBe('左下角有红色水杯(id:1)');
      }
    });

    it('getSession 不存在时应返回 null', () => {
      const ctx = manager.getSession('nonexistent-session');
      expect(ctx).toBeNull();
    });

    it('getSession 应更新 last_accessed_at', () => {
      const sessionId = 'access-time-test';
      manager.createSession(sessionId, 'image');

      // 等待一小段时间以确保时间戳不同
      const beforeAccess = Math.floor(Date.now() / 1000);
      const ctx = manager.getSession(sessionId);

      expect(ctx).not.toBeNull();
      if (ctx) {
        expect(ctx.session.last_accessed_at).toBeGreaterThanOrEqual(
          beforeAccess
        );
      }
    });
  });

  describe('upsertObjects', () => {
    it('augment 首次（无已有对象）：应从 object_id=1 开始', () => {
      const sessionId = 'augment-first';
      manager.createSession(sessionId, 'image');

      const newObjects: SessionObject[] = [
        makeObject(99, '物体A'), // 输入 object_id 被忽略，实际从 1 开始分配
      ];
      const total = manager.upsertObjects(sessionId, newObjects, 'augment');

      expect(total).toBe(1);

      const ctx = manager.getSession(sessionId);
      expect(ctx?.objects).toHaveLength(1);
      expect(ctx?.objects[0]?.object_id).toBe(1); // 首次 augment 从 1 开始
      expect(ctx?.objects[0]?.label).toBe('物体A');
    });

    it('augment：新对象 ID 从已有最大 ID+1 开始', () => {
      const sessionId = 'augment-existing';
      manager.createSession(sessionId, 'image');

      // 先添加一批
      manager.upsertObjects(
        sessionId,
        [makeObject(1, 'A'), makeObject(2, 'B')],
        'augment'
      );

      // 再增补另一批（输入 ID 应被重新映射）
      const newObjects: SessionObject[] = [
        makeObject(10, 'C'),
        makeObject(20, 'D'),
      ];
      const total = manager.upsertObjects(sessionId, newObjects, 'augment');

      expect(total).toBe(4);

      const ctx = manager.getSession(sessionId);
      expect(ctx?.objects).toHaveLength(4);

      // 新对象 ID 应从 3 开始（max=2，+1=3）
      const labels = ctx?.objects.map(o => `${o.object_id}:${o.label}`).sort();
      expect(labels).toContain('1:A');
      expect(labels).toContain('2:B');
      expect(labels).toContain('3:C');
      expect(labels).toContain('4:D');
    });

    it('replace：清空旧对象，仅保留新对象', () => {
      const sessionId = 'replace-test';
      manager.createSession(sessionId, 'image');

      // 先添加一批
      manager.upsertObjects(
        sessionId,
        [makeObject(1, 'OldA'), makeObject(2, 'OldB')],
        'augment'
      );

      // 替换
      const newObjects: SessionObject[] = [
        makeObject(5, 'NewX'),
        makeObject(6, 'NewY'),
      ];
      const total = manager.upsertObjects(sessionId, newObjects, 'replace');

      expect(total).toBe(2);

      const ctx = manager.getSession(sessionId);
      expect(ctx?.objects).toHaveLength(2);
      // replace 模式保留输入 object_id
      expect(ctx?.objects[0]?.label).toBe('NewX');
      expect(ctx?.objects[1]?.label).toBe('NewY');
      expect(ctx?.objects[0]?.object_id).toBe(5);
      expect(ctx?.objects[1]?.object_id).toBe(6);
    });
  });

  describe('addConversationTurn + getRecentHistory', () => {
    it('应正确返回最近 N 轮对话', () => {
      const sessionId = 'history-test';
      manager.createSession(sessionId, 'image');

      // 添加 10 轮对话
      for (let i = 1; i <= 10; i++) {
        manager.addConversationTurn(sessionId, i, 'user', `问题 ${i}`);
        manager.addConversationTurn(sessionId, i, 'assistant', `回答 ${i}`);
      }

      // 获取最近 3 轮（6 条消息）
      const recent = manager.getRecentHistory(sessionId, 3);

      expect(recent).toHaveLength(6);
      // 应按时间升序排列（最早在前）
      expect(recent[0]?.content).toBe('问题 8');
      expect(recent[5]?.content).toBe('回答 10');
    });

    it('getRecentHistory 请求超过实际轮数时应返回全部', () => {
      const sessionId = 'history-overflow';
      manager.createSession(sessionId, 'image');

      manager.addConversationTurn(sessionId, 1, 'user', '唯一问题');

      const recent = manager.getRecentHistory(sessionId, 10);
      expect(recent).toHaveLength(1);
    });

    it('无对话时应返回空数组', () => {
      const sessionId = 'history-empty';
      manager.createSession(sessionId, 'image');

      const recent = manager.getRecentHistory(sessionId, 5);
      expect(recent).toEqual([]);
    });
  });

  describe('cleanupExpired', () => {
    it('过期会话应被删除，未过期保留', () => {
      const sessionA = 'session-a-expired';
      const sessionB = 'session-b-active';

      // 创建两个会话
      manager.createSession(sessionA, 'image');
      manager.createSession(sessionB, 'image');

      // 手动修改 sessionA 的 last_accessed_at 使其"过期"（设为 1 小时前）
      manager['db']
        .prepare(
          'UPDATE sessions SET last_accessed_at = ? WHERE session_id = ?'
        )
        .run(Math.floor(Date.now() / 1000) - 7200, sessionA);

      // TTL 设为 3600 秒（1 小时），sessionA 应该过期
      const deletedCount = manager.cleanupExpired(3600);

      expect(deletedCount).toBe(1);

      // sessionA 应被删除
      expect(manager.getSession(sessionA)).toBeNull();
      // sessionB 应保留
      expect(manager.getSession(sessionB)).not.toBeNull();
    });

    it('不传 ttlSeconds 时应使用 3600 默认值', () => {
      const sessionId = 'default-ttl-test';
      manager.createSession(sessionId, 'image');

      // 设为刚刚过期
      manager['db']
        .prepare(
          'UPDATE sessions SET last_accessed_at = ? WHERE session_id = ?'
        )
        .run(Math.floor(Date.now() / 1000) - 3700, sessionId);

      const deletedCount = manager.cleanupExpired();
      expect(deletedCount).toBe(1);
    });
  });

  describe('deleteSession', () => {
    it('级联删除：删除会话应同时删除关联的 objects 和 history', () => {
      const sessionId = 'cascade-delete-test';
      manager.createSession(sessionId, 'image');

      // 添加物体
      manager.upsertObjects(
        sessionId,
        [makeObject(1, '物体1'), makeObject(2, '物体2')],
        'augment'
      );

      // 添加对话
      manager.addConversationTurn(sessionId, 1, 'user', '测试问题');
      manager.addConversationTurn(sessionId, 1, 'assistant', '测试回答');

      // 删除会话
      manager.deleteSession(sessionId);

      // 验证会话已删除
      expect(manager.getSession(sessionId)).toBeNull();

      // 验证关联数据也已级联删除（通过直接查询数据库）
      const objCount = manager['db']
        .prepare(
          'SELECT COUNT(*) as cnt FROM session_objects WHERE session_id = ?'
        )
        .get(sessionId) as { cnt: number };
      expect(objCount.cnt).toBe(0);

      const historyCount = manager['db']
        .prepare(
          'SELECT COUNT(*) as cnt FROM conversation_history WHERE session_id = ?'
        )
        .get(sessionId) as { cnt: number };
      expect(historyCount.cnt).toBe(0);
    });
  });

  describe('跨轮 ID 一致性', () => {
    it('同 session 多次 augment，已有 object_id 应持续存在且不变', () => {
      const sessionId = 'cross-round-id';
      manager.createSession(sessionId, 'image');

      // 第 1 轮：augment 2 个物体
      const round1Objects: SessionObject[] = [
        { ...makeObject(1, '物体A'), created_round: 1 },
        { ...makeObject(2, '物体B'), created_round: 1 },
      ];
      manager.upsertObjects(sessionId, round1Objects, 'augment');

      // 第 2 轮：augment 3 个新物体
      const round2Objects: SessionObject[] = [
        { ...makeObject(10, '物体C'), created_round: 2 },
        { ...makeObject(20, '物体D'), created_round: 2 },
        { ...makeObject(30, '物体E'), created_round: 2 },
      ];
      manager.upsertObjects(sessionId, round2Objects, 'augment');

      const ctx = manager.getSession(sessionId);
      expect(ctx?.objects).toHaveLength(5);

      // 第 1 轮物体 ID 应保持不变
      const objA = ctx?.objects.find(o => o.label === '物体A');
      expect(objA?.object_id).toBe(1);
      expect(objA?.created_round).toBe(1);

      const objB = ctx?.objects.find(o => o.label === '物体B');
      expect(objB?.object_id).toBe(2);
      expect(objB?.created_round).toBe(1);

      // 第 2 轮物体应有递增 ID
      const objC = ctx?.objects.find(o => o.label === '物体C');
      expect(objC?.object_id).toBe(3);

      const objE = ctx?.objects.find(o => o.label === '物体E');
      expect(objE?.object_id).toBe(5);
      expect(objE?.created_round).toBe(2);
    });
  });
});
