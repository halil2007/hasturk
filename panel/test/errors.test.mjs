// Hata kayıtları: müşteri panelinden tarayıcı / işlem / sunucu / senkron hataları ana panele firma adıyla düşer; gruplanır, tekrar edince açılır
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init } from '../src/db.js';
import { recordError, normalize, errorsApi } from '../src/errors.js';

const req = (method = 'GET') => ({ method });

test('aynı hata (farklı sipariş no) tek kayıtta toplanır; çözüldükten sonra tekrar ederse yeniden açılır ve bildirim gelir', async () => {
  const db = d1(); await init(db);
  assert.equal(normalize('Sipariş 123456 etiketi alınamadı: "ABC-9"'), 'Sipariş # etiketi alınamadı: "…"');
  const e = (no) => ({ slug: 'firma', firm: 'Firma A', source: 'api', message: `Sipariş ${no} etiketi alınamadı`, action: `POST orders/${no}/label`, user: 'Ali' });
  const id = await recordError(db, e(111));
  assert.equal(await recordError(db, e(222)), id);
  let row = await db.prepare('SELECT * FROM error_reports WHERE id = ?').bind(id).first();
  assert.equal(row.count, 2); assert.equal(row.status, 'open');
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM notices WHERE key = ?").bind('err:' + id).first()).n, 1);
  await errorsApi(req('POST'), db, `errors/${id}/status`, {}, { status: 'resolved' });
  assert.ok((await db.prepare('SELECT resolved_at FROM notices WHERE key = ?').bind('err:' + id).first()).resolved_at);
  await recordError(db, e(333));
  row = await db.prepare('SELECT * FROM error_reports WHERE id = ?').bind(id).first();
  assert.equal(row.status, 'open'); assert.equal(row.reopened, 1); assert.equal(row.count, 3);
  assert.equal((await db.prepare('SELECT resolved_at FROM notices WHERE key = ?').bind('err:' + id).first()).resolved_at, null);
  // Yok sayılan sessizce sayılır
  await errorsApi(req('POST'), db, `errors/${id}/status`, {}, { status: 'ignored' });
  await recordError(db, e(444));
  assert.equal((await db.prepare('SELECT status FROM error_reports WHERE id = ?').bind(id).first()).status, 'ignored');
  // Farklı firmada aynı hata ayrı kayıt; sıradan uyarılar kaydedilmez
  assert.notEqual(await recordError(db, { ...e(1), slug: 'diger', firm: 'Firma B' }), id);
  assert.equal(await recordError(db, { slug: 'firma', source: 'api', message: 'Kullanıcı adı veya şifre hatalı' }), null);
  const list = await errorsApi(req(), db, 'errors', { status: 'open' }, {});
  assert.equal(list.items.length, 1); assert.equal(list.items[0].firm, 'Firma B');
  assert.equal((await errorsApi(req(), db, 'errors/count', {}, {})).n, 1);
});

test('müşteri paneli: tarayıcı bildirimi ve iki adımlı girişle birlikte ana panelin hata kayıtlarına firma adıyla düşer', async () => {
  const { doNamespace } = await import('../dev/do.mjs');
  const { default: worker, TenantPanel } = await import('../src/index.js');
  const { resetChannels } = await import('../src/channels/index.js');
  const { hotp, step } = await import('../src/totp.js');
  resetChannels();
  const env = { PANEL_PASSWORD: 'x-123456', PANEL_SECRET: 's'.repeat(32), DB: d1() };
  env.TENANT = doNamespace(TenantPanel, () => env);
  const jar = {};
  const call = (who) => async (path, opts = {}) => {
    const r = await worker.fetch(new Request('https://panel.test' + path, { ...opts, headers: { 'Content-Type': 'application/json', Cookie: jar[who] || '' } }), env, { waitUntil() {} });
    const sc = r.headers.get('set-cookie'); if (sc) jar[who] = sc.split(';')[0];
    return r;
  };
  const J = (b, method = 'POST') => ({ method, body: JSON.stringify(b) });
  const O = call('owner'), T = call('tenant');
  await O('/api/login', J({ password: 'x-123456' }));
  assert.equal((await O('/api/tenants', J({ slug: 'yesil', name: 'Yeşil Bahçe', admin_username: 'ali', admin_password: 'gizli-sifre-1' }))).status, 200);
  assert.equal((await T('/api/login', J({ tenant: 'yesil', username: 'ali', password: 'gizli-sifre-1' }))).status, 200);
  assert.equal((await T('/api/errors/report', J({ source: 'api', message: 'Etiket alınamadı: kargo firması seçilmemiş', action: 'POST packages/5/label', page: 'kargo', status: 400 }))).status, 200);
  const list = await (await O('/api/errors?status=open')).json();
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].firm, 'Yeşil Bahçe'); assert.equal(list.items[0].slug, 'yesil'); assert.equal(list.items[0].user_name, 'ali');
  // Müşteri hata listesini göremez
  assert.equal((await T('/api/errors')).status, 404);
  // Müşteri panelinde 2 adımlı giriş (bilet firma koduyla iletilir)
  const st = await (await T('/api/me/2fa/setup', J({}))).json();
  const sk = st.secret.replace(/\s/g, '');
  assert.equal((await T('/api/me/2fa/enable', J({ code: await hotp(sk, step()) }))).status, 200);
  delete jar.tenant;
  const l = await (await T('/api/login', J({ tenant: 'yesil', username: 'ali', password: 'gizli-sifre-1' }))).json();
  assert.equal(l.twofa, true);
  assert.equal((await T('/api/login', J({ tenant: 'yesil', ticket: l.ticket, code: await hotp(sk, step() + 1) }))).status, 200);
  assert.equal((await T('/api/summary')).status, 200);
});
