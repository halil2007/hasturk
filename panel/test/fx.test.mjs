// Döviz bazlı fiyat: TCMB kur listesi okuma, ürün ve kanal fiyatlarının kurla güncellenmesi, güncelleme sıklığı
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import { init, run, all, first, setSetting, getSettings } from '../src/db.js';
import { parseTcmb, applyFx, syncFx } from '../src/fx.js';

const XML = `<?xml version="1.0" encoding="UTF-8"?><Tarih_Date Tarih="05.10.2026" Date="10/05/2026">
<Currency CrossOrder="0" Kod="USD" CurrencyCode="USD"><Unit>1</Unit><Isim>ABD DOLARI</Isim><ForexBuying>41.5000</ForexBuying><ForexSelling>41.6000</ForexSelling><BanknoteBuying>41.4700</BanknoteBuying><BanknoteSelling>41.6600</BanknoteSelling></Currency>
<Currency CrossOrder="9" Kod="EUR" CurrencyCode="EUR"><Unit>1</Unit><ForexBuying>48.0000</ForexBuying><ForexSelling>48.1000</ForexSelling><BanknoteBuying>47.9</BanknoteBuying><BanknoteSelling>48.2</BanknoteSelling></Currency>
<Currency CrossOrder="10" Kod="GBP" CurrencyCode="GBP"><Unit>1</Unit><ForexBuying>55.0</ForexBuying><ForexSelling>55.2</ForexSelling><BanknoteBuying></BanknoteBuying><BanknoteSelling></BanknoteSelling></Currency></Tarih_Date>`;

test('TCMB kur listesi: döviz alış / satış ve efektif kurlar, tarih', () => {
  const r = parseTcmb(XML);
  assert.equal(r.date, '2026-10-05');
  assert.deepEqual(r.rates.USD, { buy: 41.5, sell: 41.6, bbuy: 41.47, bsell: 41.66 });
  assert.equal(r.rates.GBP.sell, 55.2); assert.equal(r.rates.GBP.bsell, null);
});

test('dolar fiyatlı ürün: TL fiyatı kurla hesaplanır, kanal fiyatı farkı korunur ve gönderilmek üzere işaretlenir', async () => {
  const db = d1(); await init(db);
  const t = Date.now();
  await run(db, "INSERT INTO products (id, name, sale_price, currency, fx_price, created_at, updated_at) VALUES (1, 'Pompa', 400, 'USD', 10, ?, ?)", t, t);
  await run(db, "INSERT INTO products (id, name, sale_price, created_at, updated_at) VALUES (2, 'TL ürün', 100, ?, ?)", t, t);
  await run(db, "INSERT INTO listings (channel, remote_id, product_id, price) VALUES ('ikas1', 'a', 1, 400), ('trendyol', 'b', 1, 440), ('trendyol', 'c', 2, 100)");
  const settings = { fx: { kind: 'sell', rounding: '90', margin: 0 } };
  const rates = { source: 'tcmb', date: '2026-10-05', rates: parseTcmb(XML).rates };
  const r = await applyFx(db, settings, rates);
  assert.equal(r.changed, 1);
  // 10 $ × 41,60 = 416 → ,90 yuvarlama: 415,90 ; Trendyol %10 farkı korunur: 440 × 415,9 / 400 = 457,49
  assert.equal((await first(db, 'SELECT sale_price FROM products WHERE id = 1')).sale_price, 415.9);
  const L = Object.fromEntries((await all(db, 'SELECT remote_id, price, price_dirty FROM listings')).map((x) => [x.remote_id, [x.price, x.price_dirty]]));
  assert.deepEqual(L.a, [415.9, 1]); assert.deepEqual(L.b, [457.49, 1]); assert.deepEqual(L.c, [100, 0], 'TL ürün etkilenmez');
  // Aynı kurla ikinci kez: değişiklik yok
  assert.equal((await applyFx(db, settings, rates)).changed, 0);
});

test('güncelleme sıklığı: elle modunda senkron fiyat değiştirmez; müşteri panelinde yalnız Kurumsal pakette çalışır', async () => {
  const db = d1(); await init(db);
  const t = Date.now();
  await run(db, "INSERT INTO products (id, name, sale_price, currency, fx_price, created_at, updated_at) VALUES (1, 'P', 1, 'EUR', 2, ?, ?)", t, t);
  await setSetting(db, 'fx', { source: 'tcmb', mode: 'manual' });
  await setSetting(db, 'fx_rates', { source: 'tcmb', at: Date.now(), date: '2026-10-05', rates: parseTcmb(XML).rates });
  const r = await syncFx({}, db, await getSettings(db));
  assert.equal(r.skipped, true);
  assert.equal((await first(db, 'SELECT sale_price FROM products WHERE id = 1')).sale_price, 1);
  assert.equal(await syncFx({ TENANT_SLUG: 'x', TENANT_PLAN: 'profesyonel' }, db, await getSettings(db)), null, 'Profesyonel pakette yok');
  assert.equal((await syncFx({ TENANT_SLUG: 'x', TENANT_PLAN: 'kurumsal' }, db, await getSettings(db))).skipped, true, 'Kurumsal pakette çalışır');
});
