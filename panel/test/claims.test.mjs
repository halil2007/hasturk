// İade talepleri: Trendyol ve Hepsiburada listesi, onay / ret istekleri; panelde saklama ve karar
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trendyol } from '../src/channels/trendyol.js';
import { hepsiburada } from '../src/channels/hepsiburada.js';
import { d1 } from '../dev/d1.mjs';
import { init } from '../src/db.js';
import { resetChannels } from '../src/channels/index.js';
import { syncClaims, listClaims, approveClaim, rejectClaim } from '../src/claims.js';

function mock(routes) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method || 'GET', body: opts.body });
    const hit = routes.find(([re, m]) => re.test(String(url)) && (!m || m === (opts.method || 'GET')));
    const b = hit ? (typeof hit[2] === 'function' ? hit[2](String(url), opts) : hit[2]) : { message: 'yok' };
    return new Response(b === null ? null : JSON.stringify(b), { status: hit ? (b === null ? 204 : 200) : 404, headers: { 'Content-Type': 'application/json' } });
  };
  return calls;
}
const TY_CLAIM = { totalPages: 1, content: [{ id: 'c-1', orderNumber: '900', claimDate: 1790000000000, customerFirstName: 'Ayşe', customerLastName: 'K', cargoProviderName: 'Trendyol Express', cargoTrackingNumber: 7001,
  items: [{ orderLine: { id: 11, productName: 'Solucan Gübresi 5 Kg', barcode: '869', merchantSku: 'SOL5', price: 150 },
    claimItems: [1, 2].map((i) => ({ id: 'ci-' + i, customerClaimItemReason: { name: 'Beğenmedim' }, claimItemStatus: { name: 'WaitingInAction' }, customerNote: 'kokusu ağır' })) }] }] };

test('Trendyol: aynı satırın kalemleri birleşir, onay tüm kalem kimlikleriyle, ret multipart claim issue ile gider', async () => {
  const calls = mock([[/\/claims\?/, 'GET', TY_CLAIM], [/items\/approve$/, 'PUT', {}], [/\/issue\?/, 'POST', {}], [/claim-issue-reasons/, 'GET', [{ id: 1, name: 'Kullanılmış' }]]]);
  const ch = trendyol({ TRENDYOL_SELLER_ID: '42', TRENDYOL_API_KEY: 'k', TRENDYOL_API_SECRET: 's' }, { id: 'trendyol' });
  const r = await ch.claims({ since: 1, until: 2, page: 0, size: 50 });
  const c = r.items[0];
  assert.equal(c.status, 'waiting'); assert.equal(c.lines.length, 1); assert.equal(c.lines[0].qty, 2); assert.deepEqual(c.lines[0].ids, ['ci-1', 'ci-2']); assert.equal(c.amount, 300);
  await ch.approveClaim({ remote_id: 'c-1' }, c.lines);
  const ap = calls.find((x) => /approve/.test(x.url));
  assert.equal(ap.method, 'PUT'); assert.deepEqual(JSON.parse(ap.body), { claimLineItemIdList: ['ci-1', 'ci-2'], params: {} });
  await ch.rejectClaim({ remote_id: 'c-1' }, c.lines, { reasonId: '1', text: 'Kullanılmış geldi', file: new File([new Uint8Array([1, 2])], 'a.jpg', { type: 'image/jpeg' }) });
  // createClaimIssue: gerekçe, kalemler ve açıklama sorgu parametresi; dosya multipart "files"
  const rj = calls.find((x) => /\/issue\?/.test(x.url)), q = new URL(rj.url).searchParams;
  assert.ok(rj.body instanceof FormData);
  assert.equal(q.get('claimItemIdList'), 'ci-1,ci-2'); assert.equal(q.get('claimIssueReasonId'), '1'); assert.equal(q.get('description'), 'Kullanılmış geldi'); assert.ok(rj.body.get('files'));
  assert.deepEqual(await ch.claimReasons(), [{ id: '1', name: 'Kullanılmış' }]);
});

test('Hepsiburada: talepler listelenir, talep numarasıyla onay / ret', async () => {
  const calls = mock([[/\/claims\/merchantId\//, 'GET', [{ id: 'g1', number: 'HB-77', status: 'AwaitingAction', orderNumber: '555', claimDate: '2026-10-01T10:00:00', customerName: 'Ali', sku: 'HBV1', quantity: 1, priceAmount: 99, claimType: 'Hasarlı ürün', explanation: 'kırık' }]],
    [/HB-77\/accept$/, 'POST', null], [/HB-77\/reject$/, 'POST', null]]);
  const ch = hepsiburada({ HB_MERCHANT_ID: 'M', HB_PASSWORD: 'p', HB_USER_AGENT: 'u' }, { id: 'hepsiburada' });
  const r = await ch.claims({ since: Date.parse('2026-09-01'), until: Date.parse('2026-10-05'), page: 0 });
  assert.equal(r.items[0].remoteId, 'HB-77'); assert.equal(r.items[0].status, 'waiting'); assert.equal(r.items[0].lines[0].reason, 'Hasarlı ürün');
  assert.match(calls[0].url, /beginDate=2026-09-01%2003%3A00&endDate=.*&offset=0&limit=100/);
  await ch.rejectClaim({ remote_id: 'HB-77' }, r.items[0].lines, { reasonId: 'NoSuchAccessory', text: 'kullanılmış' });
  assert.deepEqual(JSON.parse(calls.find((x) => /reject/.test(x.url)).body).ClaimRejectionReason, 'NoSuchAccessory');
});

test('panel: senkron, liste, onay sonrası karar kaydı; karar verilmişse tekrar onaylanamaz', async () => {
  const db = d1(); await init(db); resetChannels();
  mock([[/\/claims\?/, 'GET', TY_CLAIM], [/items\/approve$/, 'PUT', {}]]);
  const env = { DB: db, TRENDYOL_SELLER_ID: '42', TRENDYOL_API_KEY: 'k', TRENDYOL_API_SECRET: 's' };
  assert.equal((await syncClaims(env, db)).trendyol, 1);
  let L = await listClaims(db, { status: 'waiting' });
  assert.equal(L.total, 1); assert.equal(L.rows[0].lines[0].qty, 2);
  await assert.rejects(rejectClaim(env, db, 'trendyol', 'c-1', { reasonId: '', text: 'x' }, { name: 'A' }), /gerekçe/);
  await approveClaim(env, db, 'trendyol', 'c-1', null, { name: 'Ali' });
  L = await listClaims(db, {});
  assert.equal(L.rows[0].status, 'accepted'); assert.equal(L.rows[0].decided_by, 'Ali');
  await assert.rejects(approveClaim(env, db, 'trendyol', 'c-1', null, { name: 'Ali' }), /karar verilmiş/);
  // Kanal hâlâ "bekliyor" dese de panelde verilen karar korunur
  await syncClaims(env, db);
  assert.equal((await listClaims(db, {})).rows[0].status, 'accepted');
  resetChannels();
});

test('Hepsiburada kampanyaları: liste, yüzde indirim oluşturma ve iptal istekleri', async () => {
  const calls = mock([[/discounts\?/, 'GET', { success: true, data: { totalCount: 1, items: [{ campaignId: 5, name: 'K1' }] } }],
    [/percent-discount$/, 'POST', { success: true, data: { campaignId: 6 } }], [/cancel-discount$/, 'POST', { success: true }], [/tl-discount$/, 'POST', { success: false, errors: ['Bütçe yetersiz'] }]]);
  const ch = hepsiburada({ HB_MERCHANT_ID: 'M', HB_PASSWORD: 'p', HB_USER_AGENT: 'u' }, { id: 'hepsiburada' });
  assert.equal((await ch.campaigns.list(1, 50)).items[0].name, 'K1');
  assert.match(calls[0].url, /diskonto-external\.hepsiburada\.com\/self-campaign\/M\/discounts\?page=1&pagesize=50/);
  assert.deepEqual(await ch.campaigns.create('percent', { name: 'X', discountPercentage: 10 }), { campaignId: 6 });
  await ch.campaigns.cancel('6');
  assert.deepEqual(JSON.parse(calls[calls.length - 1].body), { campaignId: 6 });
  await assert.rejects(ch.campaigns.create('tl', {}), /Bütçe yetersiz/);
});
