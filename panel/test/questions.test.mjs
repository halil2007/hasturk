// Müşteri soruları: N11 (SOAP), idefix ve Pazarama soru listesi ve cevap istekleri (ağa çıkmadan)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { n11 } from '../src/channels/n11.js';
import { idefix } from '../src/channels/idefix.js';
import { pazarama } from '../src/channels/pazarama.js';

function mock(routes) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body, headers: opts.headers });
    const hit = routes.find(([re]) => re.test(String(url)));
    const b = hit ? (typeof hit[1] === 'function' ? hit[1](url, opts) : hit[1]) : { message: 'yok' };
    const text = typeof b === 'string' ? b : JSON.stringify(b);
    return new Response(text, { status: hit ? 200 : 404, headers: { 'Content-Type': typeof b === 'string' ? 'text/xml' : 'application/json' } });
  };
  return calls;
}

test('N11: açık sorular SOAP ile alınır, cevap SaveProductAnswer ile gider', async () => {
  const xml = `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"><SOAP-ENV:Body><ns3:GetProductQuestionListResponse xmlns:ns3="http://www.n11.com/ws/schemas">
    <result><status>success</status></result><productQuestions><productQuestion><id>555</id><productId>77</productId><productTitle>Solucan Gübresi 5 Kg</productTitle><question>Kaç günde gelir?</question><questionSubject>Kargo</questionSubject><createdDate>03/10/2026 14:05</createdDate></productQuestion></productQuestions>
    <pagingData><currentPage>0</currentPage><pageSize>100</pageSize><totalCount>1</totalCount><pageCount>1</pageCount></pagingData></ns3:GetProductQuestionListResponse></SOAP-ENV:Body></SOAP-ENV:Envelope>`;
  const calls = mock([[/productService/, (u, o) => (/SaveProductAnswer/.test(o.body) ? '<x><result><status>success</status></result></x>' : xml)]]);
  const ch = n11({ N11_APP_KEY: 'k&1', N11_APP_SECRET: 's' }, { id: 'n11' });
  const r = await ch.questions({ since: Date.parse('2026-10-01T00:00:00Z'), until: Date.parse('2026-10-05T00:00:00Z'), page: 0 });
  assert.equal(r.items.length, 1);
  assert.deepEqual([r.items[0].remoteId, r.items[0].status, r.items[0].productName, r.items[0].text], ['555', 'waiting', 'Solucan Gübresi 5 Kg', 'Kargo — Kaç günde gelir?']);
  assert.equal(r.items[0].askedAt, Date.parse('2026-10-03T14:05:00+03:00'), 'soru tarihi (Türkiye saati) okunur');
  assert.match(calls[0].body, /<sch:GetProductQuestionListRequest><auth><appKey>k&amp;1<\/appKey>/);
  assert.match(calls[0].body, /<startDate>01\/10\/2026<\/startDate>/);
  assert.equal(calls[0].headers.SOAPAction, 'GetProductQuestionList');
  await ch.answer({ remote_id: '555' }, 'Aynı gün <kargo>');
  assert.match(calls[1].body, /<productQuestionId>555<\/productQuestionId><answer>Aynı gün &lt;kargo&gt;<\/answer>/);
  mock([[/productService/, '<x><result><status>failure</status><errorMessage>Soru zaten cevaplandı</errorMessage></result></x>']]);
  await assert.rejects(ch.answer({ remote_id: '555' }, 'x'), /zaten cevaplandı/);
});

test('idefix: sorular ve cevap uç noktası', async () => {
  const calls = mock([
    [/question\/filter/, { items: [{ id: 9, question: 'Organik mi?', product: { name: 'Leonardit' }, productQuestionAnswer: [], createdAt: '2026-10-04T10:00:00Z', customerName: 'A***', showMyName: true }], totalCount: 1, pageCount: 1, currentPage: 1 }],
    [/question\/9\/answer/, { id: 1 }],
  ]);
  const ch = idefix({ IDEFIX_API_KEY: 'k', IDEFIX_API_SECRET: 's', IDEFIX_VENDOR_ID: '16705' }, { id: 'idefix' });
  const r = await ch.questions({ since: 1, until: 2, page: 0, size: 50 });
  assert.deepEqual([r.items[0].remoteId, r.items[0].status, r.items[0].productName, r.items[0].customer, r.hasNext], ['9', 'waiting', 'Leonardit', 'A***', false]);
  assert.match(calls[0].url, /\/pim\/vendor\/16705\/question\/filter\?page=1&limit=50&startDate=1&endDate=2/);
  await ch.answer({ remote_id: '9' }, 'Evet');
  const last = calls[calls.length - 1];
  assert.equal(last.method, 'POST'); assert.deepEqual(JSON.parse(last.body), { answer_body: 'Evet' });
});

test('Pazarama: sorular ve cevap', async () => {
  const calls = mock([
    [/connect\/token/, { data: { accessToken: 't', expiresIn: 3600 } }],
    [/getApprovalAnswersByMerchantSearch/, { success: true, data: { approvalAnswersByMerchantSearchs: [{ questionId: 'q1', question: 'Stok var mı?', questionStatus: 0, productName: 'Torf', barcode: '869', maskedUserName: 'M**' }] } }],
    [/sellerAnswer/, { success: true }],
  ]);
  const ch = pazarama({ PAZARAMA_CLIENT_ID: 'c', PAZARAMA_CLIENT_SECRET: 's' }, { id: 'pazarama' });
  const r = await ch.questions({ since: 1, until: 2, page: 0, size: 50 });
  assert.deepEqual([r.items[0].remoteId, r.items[0].status, r.items[0].barcode], ['q1', 'waiting', '869']);
  await ch.answer({ remote_id: 'q1' }, 'Var');
  const last = calls[calls.length - 1];
  assert.equal(last.method, 'PUT'); assert.deepEqual(JSON.parse(last.body), { questionId: 'q1', text: 'Var' });
});

test('Senkron: kanal panelinden cevaplanan eski soru (normal pencerenin dışında) "bekliyor"da kalmaz', async () => {
  const { d1 } = await import('../dev/d1.mjs');
  const { init, run, first } = await import('../src/db.js');
  const { getChannels, resetChannels } = await import('../src/channels/index.js');
  const { syncQuestions } = await import('../src/questions.js');
  const db = d1(); await init(db); resetChannels();
  const env = { DEMO: '1' }, D = 864e5, now = Date.now();
  const list = await getChannels(env, db);
  for (const c of list) c.enabled = c.id === 'trendyol';
  const ch = list.find((c) => c.id === 'trendyol');
  // 6 gün önce sorulmuş, panelde bekleyen soru; kanalda sonradan cevaplandı. Kanal soruları soruluş tarihine göre süzer.
  await run(db, "INSERT INTO questions (channel, remote_id, text, asked_at, status, remote_status, synced_at) VALUES ('trendyol', 'Q1', 'Kaç günde gelir?', ?, 'waiting', 'WAITING_FOR_ANSWER', ?)", now - 6 * D, now - D);
  const windows = [];
  ch.questions = async ({ since, until }) => {
    windows.push([since, until]);
    const askedAt = now - 6 * D;
    return { items: askedAt >= since && askedAt <= until ? [{ remoteId: 'Q1', text: 'Kaç günde gelir?', askedAt, status: 'answered', remoteStatus: 'ANSWERED', answer: 'Yarın kargoda', answeredAt: now - D }] : [], hasNext: false };
  };
  await syncQuestions(env, db, {});
  const q = await first(db, "SELECT status, answer, answered_by FROM questions WHERE remote_id = 'Q1'");
  assert.deepEqual([q.status, q.answer, q.answered_by], ['answered', 'Yarın kargoda', 'kanal']);
  assert.ok(windows.every(([s, u]) => u - s <= 14 * D), 'tarih aralığı kanal sınırını aşmaz');
  // Bekleyen eski soru kalmadıysa ek okuma yapılmaz
  windows.length = 0;
  await syncQuestions(env, db, {});
  assert.equal(windows.length, 1);
  // Eski soru kontrolü en sık 3 saatte bir: yeni bekleyen eski soru olsa da hemen ardından yeniden okunmaz
  await run(db, "INSERT INTO questions (channel, remote_id, text, asked_at, status, remote_status, synced_at) VALUES ('trendyol', 'Q2', 'Rengi?', ?, 'waiting', 'WAITING_FOR_ANSWER', ?)", now - 8 * D, now - D);
  windows.length = 0;
  await syncQuestions(env, db, {});
  assert.equal(windows.length, 1);
  resetChannels();
});

test('N11: tüm durumlar sorgulanamıyorsa açık ve kapanan sorular ayrı okunur (N11 panelinden cevaplanan soru kapanır)', async () => {
  const env = (body) => `<x><result><status>success</status></result><productQuestions>${body}</productQuestions><pagingData><totalCount>1</totalCount></pagingData></x>`;
  mock([[/productService/, (u, o) => {
    if (/<status><\/status>/.test(o.body)) return '<x><result><status>failure</status><errorMessage>status zorunlu</errorMessage></result></x>';
    if (/<status>OPEN<\/status>/.test(o.body)) return env('<productQuestion><id>1</id><question>Açık?</question></productQuestion>');
    return env('<productQuestion><id>2</id><question>Kapalı?</question><answer>Evet</answer></productQuestion>');
  }]]);
  const ch = n11({ N11_APP_KEY: 'k', N11_APP_SECRET: 's' }, { id: 'n11' });
  const r = await ch.questions({ since: Date.parse('2026-10-01T00:00:00Z'), until: Date.parse('2026-10-05T00:00:00Z'), page: 0 });
  assert.deepEqual(r.items.map((x) => [x.remoteId, x.status, x.answer]), [['1', 'waiting', null], ['2', 'answered', 'Evet']]);
});
