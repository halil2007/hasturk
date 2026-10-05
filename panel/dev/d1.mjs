// Yerel geliştirme/test için Cloudflare D1 benzeri sarmalayıcı (Node 22 yerleşik node:sqlite).
import { DatabaseSync } from 'node:sqlite';

const fix = (a) => a.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));

class Stmt {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new Stmt(this.db, this.sql, args); }
  st() { return this.db.prepare(this.sql); }
  async all() { return { results: this.st().all(...fix(this.args)), success: true }; }
  async first(col) { const r = this.st().get(...fix(this.args)); return r ? (col ? r[col] : { ...r }) : null; }
  async run() { const r = this.st().run(...fix(this.args)); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
  runSync() { return this.st().run(...fix(this.args)); }
}

export function d1(path = ':memory:') {
  const db = new DatabaseSync(path);
  return {
    prepare: (sql) => new Stmt(db, sql),
    async batch(stmts) {
      db.exec('BEGIN');
      try {
        const out = stmts.map((s) => (/^\s*(SELECT|WITH)/i.test(s.sql) || /RETURNING/i.test(s.sql) ? { results: s.st().all(...fix(s.args)) } : { success: true, meta: { changes: Number(s.runSync().changes) } }));
        db.exec('COMMIT');
        return out;
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    async exec(sql) { db.exec(sql); return {}; },
    raw: db,
  };
}
