// Sistem hızı: işlem türü gruplaması, günlük toplama, yavaş işlemin hata kaydına düşmesi ve günlük bakım
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init } from '../src/db.js';
import { PerfBuffer, routeOf, perfReport, maintain } from '../src/perf.js';

test('istek süreleri işlem türüne göre toplanır; ortalaması 3 sn üstü işlem hata kaydına düşer', async () => {
  const db = d1(); await init(db);
  assert.equal(routeOf('GET', 'orders/trendyol:123456'), 'GET orders/:id');
  assert.equal(routeOf('POST', 'me/2fa/enable'), 'POST me/2fa/enable');
  const b = new PerfBuffer();
  for (const t of [120, 80, 1500]) b.add('GET', 'products', t);
  for (const t of [3500, 4200, 3900]) b.add('POST', 'packages/77/label', t);
  b.add('POST', 'errors/report', 9999); // sayılmaz
  await b.flush(db, { slug: 'firma', firm: 'Firma' });
  const r = await perfReport(db, { days: 7 });
  const p = r.routes.find((x) => x.route === 'GET products');
  assert.equal(p.n, 3); assert.equal(p.slow_n, 1); assert.equal(p.max_ms, 1500);
  assert.equal(r.routes[0].route, 'POST packages/:id/label');
  assert.ok(!r.routes.some((x) => /errors\/report/.test(x.route)));
  const e = await db.prepare("SELECT * FROM error_reports WHERE source = 'perf'").first();
  assert.equal(e.slug, 'firma'); assert.match(e.message, /Yavaş işlem/); assert.equal(e.action, 'POST packages/:id/label');
  // İkinci yazım aynı güne eklenir
  b.add('GET', 'products', 100); await b.flush(db, { slug: 'firma' });
  assert.equal((await perfReport(db, {})).routes.find((x) => x.route === 'GET products').n, 4);
});

test('günlük bakım eski kayıtları temizler', async () => {
  const db = d1(); await init(db);
  const old = Date.now() - 200 * 864e5;
  await db.prepare("INSERT INTO logs (at, level, msg) VALUES (?, 'info', 'eski'), (?, 'info', 'yeni')").bind(old, Date.now()).run();
  await db.prepare("INSERT INTO buybox_history (channel, remote_id, at) VALUES ('trendyol', 'x', ?)").bind(old).run();
  const r = await maintain(db);
  assert.equal(r.logs, 1); assert.equal(r.buybox_history, 1);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM logs').first()).n, 1);
});
