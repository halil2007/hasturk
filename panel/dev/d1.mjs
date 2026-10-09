// Yerel geliştirme/test için Cloudflare D1 benzeri sarmalayıcı (Node 22 yerleşik node:sqlite).
import { DatabaseSync } from 'node:sqlite';

// DEV_LATENCY=ms: her sorguya ağ gecikmesi ekler (D1 gidiş-dönüşünü taklit; hız ölçümü için). d1Stats: sorgu sayacı
const LAT = Number(process.env.DEV_LATENCY) || 0;
export const d1Stats = { q: 0 };
const wait = async () => { d1Stats.q++; if (LAT) await new Promise((r) => setTimeout(r, LAT)); };
// DEV_SLOW=ms: bu süreyi aşan sorgu ekrana yazılır (yavaş sorguyu bulmak için)
const SLOW = Number(process.env.DEV_SLOW) || 0;
const timed = (sql, fn, st) => {
  if (!SLOW) return fn();
  const t = performance.now(), r = fn(), ms = performance.now() - t;
  if (ms >= SLOW) {
    console.log(`[${Math.round(ms)} ms] ${sql.replace(/\s+/g, ' ').slice(0, 300)}`);
    // DEV_PLAN=1: sorgu planı da yazılır
    if (process.env.DEV_PLAN && st) console.log(st.db.prepare('EXPLAIN QUERY PLAN ' + sql).all(...fix(st.args)).map((x) => `   ${x.detail}`).join('\n'));
  }
  return r;
};
// Gerçek D1 gibi: bir sorguya en fazla 100 değer bağlanabilir (aşınca D1 "too many SQL variables" verir; testler de yakalasın)
const fix = (a) => {
  if (a.length > 100) throw new Error(`D1_ERROR: too many SQL variables (${a.length} > 100): SQLITE_ERROR`);
  return a.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));
};

class Stmt {
  constructor(db, sql, args = []) { this.db = db; this.sql = sql; this.args = args; }
  bind(...args) { return new Stmt(this.db, this.sql, args); }
  st() { return this.db.prepare(this.sql); }
  async all() { await wait(); const r = timed(this.sql, () => this.st().all(...fix(this.args)), this); return { results: r, success: true }; }
  async first(col) { await wait(); const r = timed(this.sql, () => this.st().get(...fix(this.args))); return r ? (col ? r[col] : { ...r }) : null; }
  async run() { await wait(); const r = this.st().run(...fix(this.args)); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
  runSync() { return this.st().run(...fix(this.args)); }
}

export function d1(path = ':memory:') {
  const db = new DatabaseSync(path);
  return {
    prepare: (sql) => new Stmt(db, sql),
    async batch(stmts) {
      await wait();
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
