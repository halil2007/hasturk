// Yerel geliştirme/test: Cloudflare Durable Object ad alanı benzeri (müşteri panelleri için).
// Her firma kodu için ayrı node:sqlite veritabanı; ctx.storage.sql.exec, kv (get/put/delete), alarm ve transactionSync taklit edilir.
import { DatabaseSync } from 'node:sqlite';

function storage(path) {
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE IF NOT EXISTS _kv (k TEXT PRIMARY KEY, v TEXT)');
  let alarm = null;
  const sql = {
    exec(q, ...args) {
      const st = db.prepare(q);
      let rows = [], written = 0;
      if (/^\s*(SELECT|WITH|PRAGMA)/i.test(q) || /RETURNING/i.test(q)) rows = st.all(...args);
      else written = Number(st.run(...args).changes);
      return { toArray: () => rows, rowsWritten: written, [Symbol.iterator]: () => rows[Symbol.iterator]() };
    },
  };
  return {
    sql,
    transactionSync(fn) { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } },
    async get(k) { const r = db.prepare('SELECT v FROM _kv WHERE k = ?').get(k); return r ? JSON.parse(r.v) : undefined; },
    async put(k, v) { db.prepare('INSERT INTO _kv (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v').run(k, JSON.stringify(v)); },
    async delete(k) { db.prepare('DELETE FROM _kv WHERE k = ?').run(k); },
    async getAlarm() { return alarm; },
    async setAlarm(t) { alarm = t; },
    async deleteAlarm() { alarm = null; },
    async deleteAll() {
      for (const r of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()) db.exec(`DROP TABLE IF EXISTS "${r.name}"`);
      db.exec('CREATE TABLE IF NOT EXISTS _kv (k TEXT PRIMARY KEY, v TEXT)'); alarm = null;
    },
  };
}

// dir verilirse her firma için <dir>/tenant-<kod>.db, yoksa bellekte
export function doNamespace(Cls, getEnv, dir = null) {
  const objs = new Map();
  return {
    idFromName: (name) => ({ name, toString: () => name }),
    get(id) {
      if (!objs.has(id.name)) {
        const st = storage(dir ? `${dir}/tenant-${id.name}.db` : ':memory:');
        objs.set(id.name, new Cls({ storage: st, waitUntil: () => {}, id }, getEnv()));
      }
      return objs.get(id.name);
    },
    objects: objs,
  };
}
