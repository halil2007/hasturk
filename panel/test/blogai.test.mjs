// Otomatik blog: Claude'un yazdığı yazı taslak olarak kaydedilir; kuyruk, günde bir kez üretim, onay bekleyen taslak sınırı, ayar uçları
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, setSetting, getRaw, first } from '../src/db.js';
import { generatePost, blogAutoTick, runOnce, autoConfig, MAX_PENDING } from '../src/blogai.js';
import worker from '../src/index.js';

const POST = { title: 'Trendyol Komisyon Oranları ve Kâr Hesabı', seo_title: 'Trendyol Komisyon Oranları 2026 | Hastürk CRM', seo_desc: 'Trendyol komisyonu nasıl hesaplanır?', summary: 'Özet.', tags: ['Trendyol', 'Komisyon'], body: '## Giriş\n' + 'Paragraf metni. '.repeat(60) + '\n\n## Sık sorulan sorular\n### Soru?\nCevap.' };
// Sahte istemci: önce arama duraklaması (pause_turn), sonra save_post çağrısı
function fake(seq) {
  const calls = [];
  return { calls, beta: { messages: { stream: (params) => { calls.push(JSON.parse(JSON.stringify(params))); const m = seq[Math.min(calls.length - 1, seq.length - 1)]; return { finalMessage: async () => m }; } } } };
}
const pause = { model: 'claude-opus-5-5', stop_reason: 'pause_turn', content: [{ type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'trendyol komisyon' } }], usage: { input_tokens: 3000, output_tokens: 200, server_tool_use: { web_search_requests: 2 } } };
const done = { model: 'claude-opus-5-5', stop_reason: 'tool_use', content: [{ type: 'text', text: '' }, { type: 'tool_use', id: 't1', name: 'save_post', input: POST }], usage: { input_tokens: 6000, output_tokens: 7000 } };

test('yazı üretimi: arama duraklaması sürdürülür, yazı taslak olarak kaydedilir, istek ayarları doğru', async () => {
  const db = d1(); await init(db);
  const c = fake([pause, done]);
  const r = await generatePost({}, db, { topic: 'Trendyol komisyon oranları', client: c });
  assert.equal(c.calls.length, 2);
  const p0 = c.calls[0];
  assert.equal(p0.model, 'claude-opus-5-5');
  assert.equal(p0.fallbacks, 'default');
  assert.deepEqual(p0.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(p0.tool_choice.type, 'auto');
  assert.ok(p0.tools.some((t) => t.type === 'web_search_20260209'));
  assert.ok(p0.tools.some((t) => t.name === 'save_post' && t.strict === true));
  assert.match(p0.messages[0].content, /Konu: Trendyol komisyon oranları/);
  assert.equal(c.calls[1].messages.at(-1).role, 'assistant', 'duraklamada aynı geçmişle devam (ek kullanıcı mesajı yok)');
  const row = await first(db, 'SELECT * FROM blog_posts WHERE id = ?', r.id);
  assert.equal(row.status, 'draft');
  assert.equal(row.ai, 1);
  assert.equal(row.slug, 'trendyol-komisyon-oranlari-ve-kar-hesabi');
  assert.equal(row.seo_title, POST.seo_title);
  assert.equal(r.cost, 0.2, '9000 giriş × $4 + 7200 çıkış × $20 (MTok) + 2 arama × $0,01');
});

test('model teslim etmezse bir kez hatırlatılır; yine olmazsa açıklamalı hata', async () => {
  const db = d1(); await init(db);
  const talk = { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Yazı...' }], usage: {} };
  const c = fake([talk, done]);
  await generatePost({}, db, { client: c });
  assert.match(c.calls[1].messages.at(-1).content, /save_post/);
  await assert.rejects(generatePost({}, db, { client: fake([talk]) }), /teslim etmedi/);
  await assert.rejects(generatePost({}, db, { client: fake([{ stop_reason: 'refusal', content: [], usage: {} }]) }), /reddetti/);
});

test('günlük tetik: saat gelince günde bir kez, kuyruktaki sıradaki konu; taslak birikince durur', async () => {
  const db = d1(); await init(db);
  const env = {}, day = Date.parse('2026-10-11T07:30:00Z'); // TR 10:30
  await setSetting(db, 'blog_auto', { enabled: true, hour: 9, topics: ['Konu A', 'Konu B'] });
  assert.equal(await blogAutoTick(env, db, { now: Date.parse('2026-10-11T05:00:00Z'), client: fake([done]) }), null, 'saat 08:00 (TR) henüz değil');
  const c = fake([done]);
  const r = await blogAutoTick(env, db, { now: day, client: c });
  assert.ok(r.id);
  assert.match(c.calls[0].messages[0].content, /Konu: Konu A/);
  assert.deepEqual((await autoConfig(db)).topics, ['Konu B'], 'kullanılan konu kuyruktan çıktı');
  assert.equal(await blogAutoTick(env, db, { now: day + 3600e3, client: fake([done]) }), null, 'aynı gün ikinci yazı yok');
  assert.equal((await getRaw(db, 'blog_auto_state')).last.id, r.id);
  // Okunmamış taslak sınırı
  for (let i = 0; i < MAX_PENDING; i++) await db.prepare("INSERT INTO blog_posts (slug, title, status, ai, created_at, updated_at) VALUES (?, 'x', 'draft', 1, 0, 0)").bind('t' + i).run();
  assert.deepEqual(await blogAutoTick(env, db, { now: day + 86400e3, client: fake([done]) }), { skipped: 'pending' });
  // Kapalıyken çalışmaz
  await setSetting(db, 'blog_auto', { enabled: false });
  assert.equal(await blogAutoTick(env, db, { now: day + 2 * 86400e3, client: fake([done]) }), null);
});

test('hata durumunda kayıt ve bildirim; kuyruk korunur', async () => {
  const db = d1(); await init(db);
  const cfg = { ...(await autoConfig(db)), topics: ['Konu X'] };
  await assert.rejects(runOnce({}, db, cfg, { client: fake([{ stop_reason: 'refusal', content: [], usage: {} }]) }));
  assert.match((await getRaw(db, 'blog_auto_state')).error.msg, /reddetti/);
  assert.ok(await first(db, "SELECT 1 AS x FROM notices WHERE key = 'blog-ai-error'"));
});

test('ayar uçları: API anahtarı şifreli ve maskeli, konu kuyruğu satırlardan; müşteri panelinde yok', async () => {
  const env = { PANEL_PASSWORD: 'pw-123456', PANEL_SECRET: 's', DB: d1() };
  await init(env.DB);
  let cookie = '';
  const call = async (path, opts = {}) => {
    const r = await worker.fetch(new Request('https://panel.test' + path, { ...opts, headers: { 'Content-Type': 'application/json', Cookie: cookie } }), env, { waitUntil() {} });
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    return { status: r.status, body: await r.json() };
  };
  await call('/api/login', { method: 'POST', body: JSON.stringify({ password: 'pw-123456' }) });
  let r = await call('/api/blog/auto');
  assert.equal(r.status, 200);
  assert.equal(r.body.key.set, false);
  r = await call('/api/blog/auto', { method: 'PUT', body: JSON.stringify({ enabled: true, hour: 8, topics: 'Konu 1\n\n Konu 2 ', key: 'sk-ant-gizli-anahtar-1234' }) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.topics, ['Konu 1', 'Konu 2']);
  assert.equal(r.body.hour, 8);
  assert.equal(r.body.key.set, true);
  assert.equal(r.body.key.masked, '••••••1234');
  const row = await env.DB.prepare("SELECT data FROM channel_config WHERE id = 'ai'").first();
  assert.ok(!row.data.includes('gizli'), 'anahtar şifreli saklanır');
  assert.ok(!JSON.stringify(r.body).includes('gizli'));
});
