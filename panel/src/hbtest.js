// Hepsiburada canlıya geçiş testi (SIT): Hepsiburada'nın istediği üç adım panelden yapılır ve sonuçları saklanır:
//  1) Ürün gönderme (katalog) → trackingId   2) Envanterdeki üründe stok + fiyat gönderimi → yükleme kimlikleri
//  3) Test siparişi oluşturma → siparişin API ile listelenmesi ve paketlenmesi (panelin normal sipariş akışıyla)
// Sonuçlar "hb_test" ayarında tutulur; Hepsiburada'ya açılacak talep için özet metni üretilir.
import { all, run, getRaw, setSetting, log } from './db.js';
import { channel } from './channels/index.js';
import { importListings, syncAll } from './sync.js';
import { fail, str, num } from './util.js';

async function hb(env, db) {
  const c = await channel(env, db, 'hepsiburada');
  if (!c || c.demo || !c.enabled || !c.sit) fail(400, 'Hepsiburada API bilgileri girilmemiş: Entegrasyonlar → Hepsiburada (Merchant ID, servis anahtarı, entegratör adı; test için Gelişmiş → Test ortamı = 1)');
  return c;
}
const save = async (db, patch) => { const cur = (await getRaw(db, 'hb_test')) || {}; const next = { ...cur, ...patch, at: Date.now() }; await setSetting(db, 'hb_test', next); return next; };

export async function hbTest(env, db, path, m, q, b, user) {
  if (path === 'hbtest/state' && m === 'GET') {
    const c = await channel(env, db, 'hepsiburada');
    const ready = !!(c && c.enabled && !c.demo && c.sit);
    const listings = await all(db, "SELECT remote_id, sku, name, price, remote_stock FROM listings WHERE channel = 'hepsiburada' ORDER BY name LIMIT 200");
    const orders = await all(db, `SELECT o.id, o.order_number, o.status, o.ordered_at, o.total,
      (SELECT GROUP_CONCAT(remote_id) FROM packages WHERE order_id = o.id AND remote_id IS NOT NULL) AS packages
      FROM orders o WHERE o.channel = 'hepsiburada' ORDER BY o.ordered_at DESC LIMIT 20`);
    return { ready, test: !!(c && c.sit && c.sit.test), merchantId: c && c.sit ? c.sit.merchantId : '', missing: c ? c.missing || [] : [], results: (await getRaw(db, 'hb_test')) || {}, listings, orders };
  }
  const c = await hb(env, db);
  const S = c.sit;
  if (path === 'hbtest/categories' && m === 'GET') return S.categories(q.q || '');
  if (path === 'hbtest/attributes' && m === 'GET') return { attributes: await S.attributes(str(q.category)) };
  if (path === 'hbtest/values' && m === 'GET') return { values: await S.attributeValues(str(q.category), str(q.attribute)) };
  if (path === 'hbtest/import' && m === 'POST') {
    const products = Array.isArray(b.products) ? b.products : [];
    if (!products.length) fail(400, 'Gönderilecek ürün yok');
    const r = await S.importProducts(products);
    await log(db, 'hepsiburada', 'info', `${user.name}: Hepsiburada'ya ${products.length} ürün gönderildi · trackingId ${r.trackingId}`);
    return { ...r, results: await save(db, { trackingId: r.trackingId, importedSku: str(products[0] && products[0].attributes && products[0].attributes.merchantSku) }) };
  }
  if (path === 'hbtest/product-status' && m === 'GET') return { status: await S.productStatus(str(q.trackingId)) };
  if (path === 'hbtest/inventory' && m === 'POST') {
    const r = await importListings(env, db, { only: ['hepsiburada'] });
    return { count: r.channels.hepsiburada };
  }
  if (path === 'hbtest/listing' && m === 'POST') {
    const hbSku = str(b.hbSku), merchantSku = str(b.merchantSku);
    if (!hbSku && !merchantSku) fail(400, 'Envanterden bir ürün seçin');
    const stock = Math.max(0, Math.round(num(b.stock))), price = num(b.price);
    if (!(price > 0)) fail(400, 'Fiyat girin');
    const st = await S.uploadOne('stock', [{ hepsiburadaSku: hbSku || undefined, merchantSku: merchantSku || undefined, availableStock: stock }]);
    const pr = await S.uploadOne('price', [{ hepsiburadaSku: hbSku || undefined, merchantSku: merchantSku || undefined, price }]);
    await log(db, 'hepsiburada', 'info', `${user.name}: test stok/fiyat gönderildi ${hbSku || merchantSku} · stok ${stock} · fiyat ${price}`);
    return { stockUploadId: st.id, priceUploadId: pr.id, results: await save(db, { stockUploadId: st.id, priceUploadId: pr.id, listingSku: hbSku || merchantSku, stock, price }) };
  }
  if (path === 'hbtest/upload-status' && m === 'GET') {
    if (!['stock', 'price'].includes(q.kind)) fail(400, 'Geçersiz tür');
    return { status: await S.uploadStatus(q.kind, str(q.id)) };
  }
  if (path === 'hbtest/order' && m === 'POST') {
    if (!b.body || typeof b.body !== 'object') fail(400, 'Sipariş gövdesi (JSON) gerekli');
    const r = await S.createTestOrder(b.body);
    const no = str((r && (r.orderNumber || r.OrderNumber || (r.data && (r.data.orderNumber || r.data.OrderNumber)))) || b.body.OrderNumber || b.body.orderNumber);
    await log(db, 'hepsiburada', 'info', `${user.name}: Hepsiburada test siparişi oluşturuldu ${no}`);
    return { response: r, orderNumber: no, results: await save(db, { testOrder: no }) };
  }
  if (path === 'hbtest/sync' && m === 'POST') {
    const r = await syncAll(env, db, { only: ['hepsiburada'], force: true });
    const pk = await all(db, "SELECT p.remote_id, o.order_number FROM packages p JOIN orders o ON o.id = p.order_id WHERE o.channel = 'hepsiburada' AND p.remote_id IS NOT NULL ORDER BY p.id DESC LIMIT 5");
    const results = pk.length ? await save(db, { packageNumber: pk[0].remote_id, packagedOrder: pk[0].order_number }) : (await getRaw(db, 'hb_test')) || {};
    return { orders: r.channels.hepsiburada, results };
  }
  // Test verilerini temizle (canlıya geçmeden önce): Hepsiburada siparişleri, paketleri ve ilanları panelden silinir
  if (path === 'hbtest/cleanup' && m === 'POST') {
    const ids = (await all(db, "SELECT id FROM orders WHERE channel = 'hepsiburada'")).map((r) => r.id);
    for (let i = 0; i < ids.length; i += 50) {
      const part = ids.slice(i, i + 50), ph = part.map(() => '?').join(',');
      await db.batch([
        db.prepare(`DELETE FROM order_items WHERE order_id IN (${ph})`).bind(...part),
        db.prepare(`DELETE FROM packages WHERE order_id IN (${ph})`).bind(...part),
        db.prepare(`DELETE FROM order_stock WHERE order_id IN (${ph})`).bind(...part),
        db.prepare(`DELETE FROM order_events WHERE order_id IN (${ph})`).bind(...part),
        db.prepare(`DELETE FROM orders WHERE id IN (${ph})`).bind(...part),
      ]);
    }
    await run(db, "DELETE FROM listings WHERE channel = 'hepsiburada'");
    await run(db, "DELETE FROM settings WHERE k IN ('cursor:hepsiburada', 'last:hepsiburada')");
    await log(db, 'hepsiburada', 'info', `${user.name}: Hepsiburada test verileri temizlendi (${ids.length} sipariş)`);
    return { orders: ids.length };
  }
  fail(404, 'Bilinmeyen işlem');
}
