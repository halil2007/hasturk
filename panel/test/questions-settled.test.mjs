// Cevaplanmış soru "Cevap bekleyen"de kalmaz: kanalın durum alanı geride kalsa da (Hepsiburada cevabı onayda / durum güncellenmemiş)
// yazışmanın son mesajı satıcıdansa soru cevaplanmıştır; cevaptan sonra müşteri yeniden yazdıysa "Ek soru" olarak bekler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, run, first, all } from '../src/db.js';
import { save } from '../src/questions.js';
import { hepsiburada } from '../src/channels/hepsiburada.js';

const J = (b) => new Response(JSON.stringify(b), { status: 200, headers: { 'Content-Type': 'application/json' } });
const issue = (no, status, conv) => ({ issueNumber: no, status, createdAt: '2026-10-14T10:00:00', product: { name: 'Ürün', sku: 'HB1' }, conversations: conv });
const msg = (from, content, at) => ({ from, content, createdAt: at });

test('Hepsiburada: son mesaj satıcıdansa durum "bekliyor" gelse de cevaplandı; sonrasında müşteri yazdıysa ek soru bekler', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => /token|authenticate/i.test(String(url)) ? J({ token: 't' }) : J({ data: [
    // sıra karışık gelse de tarihe göre okunur
    issue('A1', 'WaitingForAnswer', [msg('Merchant', 'Evet, 5 kg.', '2026-10-14T12:00:00'), msg('Customer', 'Kaç kilo?', '2026-10-14T10:00:00')]),
    issue('A2', 'WaitingForAnswer', [msg('Customer', 'Renk?', '2026-10-14T10:00:00'), msg('Merchant', 'Yeşil.', '2026-10-14T11:00:00'), msg('Customer', 'Başka renk var mı?', '2026-10-14T13:00:00')]),
    issue('A3', 'WaitingForAnswer', [msg('Customer', 'Ne zaman kargo?', '2026-10-14T10:00:00')]),
    issue('A4', 'Rejected', [msg('Customer', 'x', '2026-10-14T10:00:00'), msg('Merchant', 'y', '2026-10-14T11:00:00')]),
  ], currentPage: 1, totalPageCount: 1, totalItemCount: 4 });
  try {
    const ch = hepsiburada({ HB_MERCHANT_ID: 'M1', HB_PASSWORD: 'x', HB_USER_AGENT: 'dev' }, { id: 'hepsiburada' });
    const { items } = await ch.questions({ since: Date.parse('2026-10-13'), page: 0 });
    const by = Object.fromEntries(items.map((q) => [q.remoteId, q]));
    assert.equal(by.A1.status, 'answered'); assert.equal(by.A1.text, 'Kaç kilo?'); assert.equal(by.A1.answer, 'Evet, 5 kg.');
    assert.equal(by.A2.status, 'waiting'); assert.equal(by.A2.text, 'Renk?\n\nEk soru: Başka renk var mı?'); assert.equal(by.A2.answer, 'Yeşil.');
    assert.equal(by.A3.status, 'waiting'); assert.equal(by.A3.answer, null);
    assert.equal(by.A4.status, 'rejected');
  } finally { globalThis.fetch = real; }
});

test('Kayıt: cevabı gelen soru kanal "bekliyor" dese de cevaplandı; panelden cevaplanıp kanalda görünmeyen 2 gün korunur', async () => {
  const db = d1(); await init(db);
  const t = Date.now();
  await save(db, 'trendyol', [{ remoteId: 'Q1', text: 'a', askedAt: t - 3600e3, status: 'waiting', answer: 'cevap', answeredAt: t - 60e3 },
    { remoteId: 'Q2', text: 'b', askedAt: t - 3600e3, status: 'waiting', answer: 'eski cevap', answeredAt: t - 1800e3, lastAskedAt: t - 600e3 },
    { remoteId: 'Q3', text: 'c', askedAt: t - 3600e3, status: 'waiting' }]);
  const st = async (id) => (await first(db, 'SELECT status FROM questions WHERE remote_id = ?', id)).status;
  assert.equal(await st('Q1'), 'answered');
  assert.equal(await st('Q2'), 'waiting', 'cevaptan sonra yeni müşteri mesajı');
  await run(db, "UPDATE questions SET status = 'answered', answer = 'panel', answered_at = ?, answered_by = 'panel' WHERE remote_id = 'Q3'", t);
  await save(db, 'trendyol', [{ remoteId: 'Q3', text: 'c', askedAt: t - 3600e3, status: 'waiting' }]);
  assert.equal(await st('Q3'), 'answered');
});

test('Göç: cevabı kayıtlı olduğu halde bekleyen eski sorular cevaplandı olur', async () => {
  const { MIGRATIONS } = await import('../src/db.js').then((m) => ({ MIGRATIONS: m.MIGRATIONS }));
  const db = d1(); await init(db);
  await run(db, "INSERT INTO questions (channel, remote_id, text, asked_at, status, answer, synced_at) VALUES ('hepsiburada', 'O1', 'x', 1, 'waiting', 'cevap', 1), ('hepsiburada', 'O2', 'y', 1, 'waiting', NULL, 1)");
  const sql = "UPDATE questions SET status = 'answered' WHERE status = 'waiting' AND answer IS NOT NULL AND answer != ''";
  if (MIGRATIONS) assert.ok(MIGRATIONS.includes(sql));
  await run(db, sql);
  assert.equal((await first(db, "SELECT status FROM questions WHERE remote_id = 'O1'")).status, 'answered');
  assert.equal((await first(db, "SELECT status FROM questions WHERE remote_id = 'O2'")).status, 'waiting');
});

test('Hepsiburada: panelde bekleyen eski soru (liste yalnız bekleyenleri döndürse bile) cevaplanan / tek soru sorgusuyla güncellenir; süresi dolan kapanır', async () => {
  const { getChannels, resetChannels } = await import('../src/channels/index.js');
  const { syncQuestions } = await import('../src/questions.js');
  const db = d1(); await init(db); resetChannels();
  const t = Date.now(), H = 3600e3, iso = (ms) => new Date(ms).toISOString().slice(0, 19);
  const env = { HB_MERCHANT_ID: 'M1', HB_PASSWORD: 'x', HB_USER_AGENT: 'dev' };
  for (const [id, asked, due] of [['B1', t - 5 * 864e5, t + 864e5], ['B2', t - 2 * 864e5, t + 864e5], ['B3', t - 10 * 864e5, t - 2 * 864e5], ['B4', t - 3 * H, t + 864e5]]) {
    await run(db, "INSERT INTO questions (channel, remote_id, text, asked_at, status, due_at, synced_at) VALUES ('hepsiburada', ?, 'soru', ?, 'waiting', ?, ?)", id, asked, due, t - H);
  }
  const urls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url); urls.push(u);
    if (/token|authenticate/i.test(u)) return J({ token: 't' });
    if (/\/issues\/B2$/.test(u)) return J({ data: issue('B2', 'Answered', [msg('Customer', 'soru', iso(t - 2 * 864e5)), msg('Merchant', 'HB panelinden cevap', iso(t - 864e5))]) });
    if (/\/issues\/B3$/.test(u)) return J({ data: issue('B3', 'WaitingForAnswer', [msg('Customer', 'soru', iso(t - 10 * 864e5))]) });
    if (/\/issues\?/.test(u) && /status=Answered/.test(u)) return J({ data: [issue('B1', 'Answered', [msg('Customer', 'soru', iso(t - 5 * 864e5)), msg('Merchant', 'cevap', iso(t - 4 * 864e5))])], currentPage: 1, totalPageCount: 1 });
    if (/\/issues\?/.test(u)) return J({ data: [], currentPage: 1, totalPageCount: 1 }); // varsayılan liste: hiçbiri
    return J({});
  };
  try {
    const chs = await getChannels(env, db);
    const hb = chs.find((c) => c.id === 'hepsiburada');
    assert.ok(hb && hb.questions && hb.question, 'Hepsiburada kanalı soru sorgularıyla');
    hb.enabled = true;
    await syncQuestions(env, db, { only: ['hepsiburada'] });
    const st = Object.fromEntries((await all(db, "SELECT remote_id, status FROM questions WHERE channel = 'hepsiburada'")).map((r) => [r.remote_id, r.status]));
    assert.deepEqual(st, { B1: 'answered', B2: 'answered', B3: 'other', B4: 'waiting' });
    assert.ok(urls.some((u) => /status=AutoClosed/.test(u)), 'kapanan sorular da istenir');
    assert.ok(!urls.some((u) => /\/issues\/B4$/.test(u)), '6 saatten yeni bekleyen soru tek tek sorulmaz');
  } finally { globalThis.fetch = real; resetChannels(); }
});
