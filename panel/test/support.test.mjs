// Destek talepleri: firma talep açar (görselle), yalnız kendi talebini görür; ana panel tümünü görür, yanıtlar, kapatır
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init } from '../src/db.js';
import { supportApi } from '../src/support.js';

const PNG = 'data:image/png;base64,' + Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');
const req = (method, path, body) => new Request('https://x/api/' + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
const call = (db, method, path, body, c) => supportApi(req(method, path, body), db, path.split('?')[0], c);

test('firma talebi → ana panel yanıtı → firma okur', async () => {
  const db = d1(); await init(db);
  const A = { slug: 'a-firma', firm: 'A Firma', user: { id: 1, name: 'Ayşe' }, staff: false };
  const B = { slug: 'b-firma', firm: 'B Firma', user: { id: 1, name: 'Bora' }, staff: false };
  const S = { slug: '', user: { id: 0, name: 'Destek' }, staff: true };
  await assert.rejects(() => call(db, 'POST', 'support', { subject: 'x', body: 'kısa' }, A), /konu/);
  await assert.rejects(() => call(db, 'POST', 'support', { subject: 'Etiket', body: 'Etiket basılmıyor', files: [{ name: 'a.exe', data: 'data:application/x-msdownload;base64,AAAA' }] }, A), /görsel/);
  const r = await call(db, 'POST', 'support', { subject: 'Etiket basılmıyor', category: 'bug', body: 'Hepsiburada etiketi gelmiyor', page: 'kargo', context: { url: '#/kargo' }, files: [{ name: 'ekran.png', data: PNG }] }, A);
  assert.ok(r.id);
  await call(db, 'POST', 'support', { subject: 'Başka firma', body: 'B firmasının sorusu' }, B);
  assert.equal((await call(db, 'GET', 'support', null, A)).tickets.length, 1, 'firma yalnız kendi talebini görür');
  assert.equal((await call(db, 'GET', 'support', null, S)).tickets.length, 2, 'ana panel tümünü görür');
  assert.equal((await call(db, 'GET', 'support/count', null, S)).n, 2);
  await assert.rejects(() => call(db, 'GET', `support/${r.id}`, null, B), /bulunamadı/);
  const d = await call(db, 'GET', `support/${r.id}`, null, S);
  assert.equal(d.messages[0].files.length, 1);
  assert.equal(d.ticket.context.url, '#/kargo');
  const fileRes = await call(db, 'GET', `support/file/${d.messages[0].files[0].id}`, null, A);
  assert.equal(fileRes.headers.get('Content-Type'), 'image/png');
  await assert.rejects(() => call(db, 'GET', `support/file/${d.messages[0].files[0].id}`, null, B), /bulunamadı/);
  await call(db, 'POST', `support/${r.id}/reply`, { body: 'Kargo firmasını HepsiJet yapın' }, S);
  assert.equal((await call(db, 'GET', 'support/count', null, A)).n, 1, 'firmaya okunmamış yanıt');
  const t = await call(db, 'GET', `support/${r.id}`, null, A);
  assert.equal(t.ticket.status, 'answered');
  assert.equal(t.ticket.context, undefined, 'teknik bağlam firmaya gönderilmez');
  assert.equal((await call(db, 'GET', 'support/count', null, A)).n, 0);
  await call(db, 'POST', `support/${r.id}/status`, { status: 'closed' }, A);
  assert.equal((await call(db, 'GET', 'support?status=closed', null, S)).tickets.length, 1);
});
