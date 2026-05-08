# TASK-005 会话管理器（Session Manager）后端实现文档

> 日期：2026-05-08 | 状态：已完成

---

## 1. 当前实现目标

实现基于 `node:sqlite` 的会话持久化管理器 `SessionManager`，作为 DDD 中 `Session` 聚合根的仓储，管理会话元数据、已标注物体和对话历史的完整生命周期。

## 2. 对应需求 ID / 任务 ID

| 维度     | 标识                                                 |
| -------- | ---------------------------------------------------- |
| 任务     | TASK-005                                             |
| 需求     | REQ-011, REQ-012, REQ-013, REQ-014, REQ-015, REQ-N06 |
| DDD 类型 | 聚合根 + 仓储 + 领域服务                             |
| 测试策略 | TDD（先写测试，再实现）                              |

## 3. 输入依据

- `docs/prds/需求文档.md` 3.4 节：SessionManager 数据模型与核心方法
- `docs/tasks/2026-05-08-visual-primitives-mcp-tasks.md` TASK-005 完整任务定义
- `src/types.ts`：Session, SessionObject, SessionContext, ConversationTurn, MergeStrategy 类型
- `src/config.ts`：config 单例（dbPath, sessionTtlSeconds）
- `src/utils/logger.ts`：pino 结构化日志

## 4. 变更文件 / 变更范围

| 文件                            | 操作           | 说明                                    |
| ------------------------------- | -------------- | --------------------------------------- |
| `src/core/session-manager.ts`   | 新建           | SessionManager 类，~320 行              |
| `src/core/sqlite-wrapper.ts`    | 新建           | node:sqlite 包装器，Vite 兼容层，~35 行 |
| `tests/session-manager.test.ts` | 新建           | 16 个测试用例，~280 行                  |
| `vitest.config.ts`              | 临时修改已还原 | 无最终变更                              |

**技术适配说明**：`sqlite-wrapper.ts` 是必要的技术适配层。Vite 5.x（vitest 2.x 的底层引擎）不认识 Node.js 22.5+ 新增的内置模块 `node:sqlite`，在测试时会抛出 `Failed to load url sqlite` 错误。包装器使用 `createRequire` 动态加载，绕过 Vite 的模块解析，同时保留 TypeScript 类型覆盖。

## 5. 实现说明

### 5.1 DDD 建模

```
聚合根: Session
  ├── 实体: SessionObject (object_id, label, bbox, centroid, ...)
  └── 实体: ConversationTurn (round, role, content, created_at)

仓储: SessionManager（自身充当 Repository，node:sqlite 直接操作）

领域服务（私有方法）:
  ├── augmentObjects(): 查询当前最大 object_id → 新物体从 max+1 分配
  └── replaceObjects(): DELETE 旧物体 → INSERT 新物体

领域事件（轻量日志调用）:
  ├── SessionCreated（createSession 成功时）
  ├── ObjectsMerged（upsertObjects 成功时）
  └── SessionExpired（cleanupExpired 清理时）
```

### 5.2 数据库结构

完全遵循 PRD 3.4 节 DDL，三张表：

- `sessions`：会话元数据（session_id PK, media_type, created_at, last_accessed_at）
- `session_objects`：已标注物体（CASCADE 关联 sessions）
- `conversation_history`：对话历史（CASCADE 关联 sessions）

启用 WAL 模式和 foreign_keys。

### 5.3 核心方法实现

| 方法                     | 关键逻辑                                                           |
| ------------------------ | ------------------------------------------------------------------ |
| `createSession`          | `INSERT OR IGNORE` + `UPDATE last_accessed_at` 实现幂等            |
| `getSession`             | JOIN 查询 sessions + objects + 最近 5 轮 history；不存在返回 null  |
| `upsertObjects(augment)` | `SELECT MAX(object_id)` → 从 max+1 开始重新映射 object_id → INSERT |
| `upsertObjects(replace)` | `DELETE` 旧物体 → `INSERT` 新物体（保留输入 object_id）            |
| `addConversationTurn`    | 简单 INSERT                                                        |
| `getRecentHistory`       | 先取 `MAX(round)`，计算 `startRound`，按 round ASC 返回            |
| `cleanupExpired`         | `DELETE WHERE last_accessed_at < cutoff`（CASCADE 自动清理）       |
| `deleteSession`          | `DELETE FROM sessions`（CASCADE 自动清理 objects + history）       |

### 5.4 错误处理策略

- 所有方法均使用 try-catch 包裹数据库操作
- 失败时通过 `logger.error()` 记录错误详情
- 返回安全降级值：`null`（getSession）、`0`（upsertObjects/cleanupExpired）、空数组（getRecentHistory）
- 降级值语义明确：调用方可通过返回值判断操作是否成功

## 6. 测试和验证结果

### 6.1 TDD 执行记录

- **RED 阶段**：先写 16 个测试，因 SessionManager 不存在而全部失败（确认测试有效）
- **GREEN 阶段**：实现完整的 SessionManager 类，所有测试通过
- **REFACTOR 阶段**：提取 `toNum`/`toOptNum`/`toStr` 辅助函数，修复 ESLint 类型问题

### 6.2 测试覆盖清单

| 测试组                                 | 测试数 | 覆盖要点                                                                                |
| -------------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| createSession                          | 3      | 元数据完整性、image_base64 传入、幂等性                                                 |
| getSession                             | 3      | 完整上下文（objects+history）、不存在返回 null、更新 last_accessed_at                   |
| upsertObjects                          | 4      | augment 首次（ID 从 1 开始）、augment 已有（ID 从 max+1）、replace 清空重建、count 返回 |
| addConversationTurn + getRecentHistory | 3      | 最近 N 轮、超量请求、空历史返回空数组                                                   |
| cleanupExpired                         | 2      | 过期删除+未过期保留、默认 TTL 3600                                                      |
| deleteSession                          | 2      | 级联删除（含直接 DB 查询验证）                                                          |
| 跨轮 ID 一致性                         | 1      | 多次 augment 后已有 object_id 保持不变                                                  |

### 6.3 自动化验证结果

```
TYPECHECK: PASS (tsc --noEmit)
LINT (source): PASS (src/core/session-manager.ts, src/core/sqlite-wrapper.ts)
TESTS: 16/16 PASSED
FULL SUITE: 115/115 PASSED (7 test files, 0 regressions)
BUILD: PASS (tsc)
```

### 6.4 已知项

- ESLint parser 对 test 文件的 `parserOptions.project` 错误是**项目级预存问题**（所有 test 文件均受影响），非本次引入

## 7. 数据与接口边界

### 7.1 输入边界

| 参数            | 约束                                  |
| --------------- | ------------------------------------- |
| `sessionId`     | 任意非空字符串（TEXT PRIMARY KEY）    |
| `mediaType`     | 任意字符串（not null，无枚举校验）    |
| `imageBase64`   | 可选字符串，可为空                    |
| `objects`       | SessionObject 数组，可为空（count=0） |
| `mergeStrategy` | 仅接受 'augment' 或 'replace'         |
| `ttlSeconds`    | 可选正整数，默认 3600                 |
| `maxRounds`     | 可选正整数                            |

### 7.2 输出边界

| 方法                  | 正常返回                               | 异常返回                     |
| --------------------- | -------------------------------------- | ---------------------------- |
| `createSession`       | Session 对象                           | 降级 Session（仅含输入参数） |
| `getSession`          | SessionContext（含 objects + history） | null                         |
| `upsertObjects`       | number（当前物体总数）                 | 0                            |
| `addConversationTurn` | void                                   | void（静默失败）             |
| `getRecentHistory`    | ConversationTurn[]                     | []                           |
| `cleanupExpired`      | number（删除数量）                     | 0                            |
| `deleteSession`       | void                                   | void（静默失败）             |

### 7.3 对外接口契约

此类仅被 TASK-006（PipelineOrchestrator）调用。导出契约：

```typescript
export class SessionManager {
  constructor(dbPath: string);
  createSession(
    sessionId: string,
    mediaType: string,
    imageBase64?: string
  ): Session;
  getSession(sessionId: string): SessionContext | null;
  upsertObjects(
    sessionId: string,
    objects: SessionObject[],
    mergeStrategy: MergeStrategy
  ): number;
  addConversationTurn(
    sessionId: string,
    round: number,
    role: 'user' | 'assistant',
    content: string
  ): void;
  getRecentHistory(sessionId: string, maxRounds: number): ConversationTurn[];
  cleanupExpired(ttlSeconds?: number): number;
  deleteSession(sessionId: string): void;
  close(): void;
}
```

## 8. 风险 / 未解决项

| 项目                | 风险级别 | 说明                                                                         |
| ------------------- | -------- | ---------------------------------------------------------------------------- |
| sqlite-wrapper.ts   | 低       | Vite 兼容适配层，若未来 vitest/Vite 升级支持 node:sqlite 可移除              |
| WAL 模式 + :memory: | 无       | SQLite 允许在内存数据库设置 WAL，无实际影响且不报错                          |
| 并发写入            | 中       | 当前未测试多进程并发场景。WAL 模式下单进程并发写入安全，多进程共享需额外验证 |
| bigint changes      | 低       | cleanupExpired 的 changes 可能为 bigint（超大删除量），已做 Number 转换      |

## 9. 需要前端配合的点

无前端影响。SessionManager 是纯后端持久化模块。

## 10. 推荐的下一步

1. **TASK-006（管道编排器）**：SessionManager 作为关键依赖已就绪，可开始 Pipeline Orchestrator 实现
2. **后续清理**：当 vitest/Vite 升级支持 `node:sqlite` 后，可移除 `sqlite-wrapper.ts` 并直接使用 `import { DatabaseSync } from 'node:sqlite'`
