/**
 * node:sqlite 包装器
 *
 * node:sqlite 是 Node.js 22.5+ 的内置模块，但 Vite 5.x 不认识它。
 * 使用 createRequire 动态加载，绕过 Vite 的模块解析。
 */
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);

/**
 * DatabaseSync 的构造签名（精简版，来自 @types/node sqlite.d.ts）
 */
export interface IDatabaseSync {
  new (path: string, options?: Record<string, unknown>): IDatabaseSyncInstance;
}

export interface IDatabaseSyncInstance {
  exec(sql: string): void;
  prepare(sql: string): IStatementSync;
  close(): void;
}

export interface IStatementSync {
  all(...params: unknown[]): Record<string, unknown>[];
  get(...params: unknown[]): Record<string, unknown> | undefined;
  run(...params: unknown[]): { changes: number | bigint };
}

// createRequire 返回值为 any 类型，此处刻意绕过 Vite 对 node:sqlite 的解析

const sqliteModule = nodeRequire('node:sqlite');

export const DatabaseSync: IDatabaseSync = sqliteModule.DatabaseSync;
