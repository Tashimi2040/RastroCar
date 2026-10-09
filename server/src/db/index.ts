import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { config } from '../config.js';
import { migrations } from './migrations.js';

export type Row = Record<string, SQLInputValue | null>;

class Database {
  private db: DatabaseSync;

  constructor(filePath: string) {
    this.db = new DatabaseSync(filePath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA busy_timeout = 5000;');
    this.migrate();
  }

  private migrate() {
    this.db.exec(`CREATE TABLE IF NOT EXISTS _migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)`);
    const applied = new Set(
      (this.db.prepare('SELECT id FROM _migrations').all() as { id: number }[]).map((r) => r.id),
    );
    for (const m of migrations) {
      if (applied.has(m.id)) continue;
      this.db.exec('BEGIN');
      try {
        this.db.exec(m.sql);
        this.db.prepare('INSERT INTO _migrations (id, name, applied_at) VALUES (?, ?, ?)').run(m.id, m.name, Date.now());
        this.db.exec('COMMIT');
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
      }
    }
  }

  get<T = any>(sql: string, ...params: SQLInputValue[]): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  all<T = any>(sql: string, ...params: SQLInputValue[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  run(sql: string, ...params: SQLInputValue[]): { lastId: number; changes: number } {
    const r = this.db.prepare(sql).run(...params);
    return { lastId: Number(r.lastInsertRowid), changes: Number(r.changes) };
  }

  exec(sql: string) {
    this.db.exec(sql);
  }

  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  close() {
    this.db.close();
  }
}

let instance: Database | null = null;

export function getDb(): Database {
  if (!instance) instance = new Database(config.dbPath);
  return instance;
}

/** Cria uma instância isolada (usado em testes). */
export function createDb(filePath: string): Database {
  return new Database(filePath);
}

export type { Database };
