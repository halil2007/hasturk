// Durable Object SQLite deposunu (ctx.storage.sql) D1 arayüzüyle kullanma: prepare().bind().all/first/run ve batch.
// Müşteri panelleri (tenants) kendi Durable Object'lerinin veritabanında, ana paneldeki kodun aynısıyla çalışır.
const fix = (a) => a.map((v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v));

export function doD1(storage) {
  const sql = storage.sql;
  const exec = (q, args) => sql.exec(q, ...fix(args));
  class Stmt {
    constructor(q, args = []) { this.sql = q; this.args = args; }
    bind(...args) { return new Stmt(this.sql, args); }
    async all() { return { results: exec(this.sql, this.args).toArray(), success: true }; }
    async first(col) { const r = exec(this.sql, this.args).toArray()[0]; return r ? (col ? r[col] : r) : null; }
    async run() { const c = exec(this.sql, this.args); c.toArray(); return { success: true, meta: { changes: c.rowsWritten || 0 } }; }
    raw() { return exec(this.sql, this.args).toArray(); }
  }
  return {
    prepare: (q) => new Stmt(q),
    // D1 batch'i gibi: hepsi tek işlemde (hata olursa hiçbiri yazılmaz)
    async batch(stmts) {
      return storage.transactionSync(() => stmts.map((s) => { const c = exec(s.sql, s.args); return { results: c.toArray(), success: true, meta: { changes: c.rowsWritten || 0 } }; }));
    },
    async exec(q) { sql.exec(q); return {}; },
  };
}
