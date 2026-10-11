// İlanın kanaldaki satış sayfası: kanal adresi → ürün kodundan adres → kanalda arama
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listingUrl } from '../public/listingurl.js';

test('ilan adresi: Trendyol productUrl, Hepsiburada HB kodu, Amazon ASIN, diğerleri arama', () => {
  assert.equal(listingUrl('trendyol', { url: 'https://www.trendyol.com/a/b-p-1', name: 'x' }), 'https://www.trendyol.com/a/b-p-1');
  assert.match(listingUrl('trendyol', { name: 'Çelik Termos' }), /^https:\/\/www\.trendyol\.com\/sr\?q=%C3%87elik%20Termos$/);
  assert.equal(listingUrl('hepsiburada', { remote_id: 'HBCV00001ABCD', name: 'x' }), 'https://www.hepsiburada.com/-p-HBCV00001ABCD');
  assert.equal(listingUrl('amazon', { remote_product_id: 'B0ABCDEFGH', name: 'x' }), 'https://www.amazon.com.tr/dp/B0ABCDEFGH');
  assert.match(listingUrl('pttavm', { name: 'Termos' }), /google\.com\/search\?q=site%3Apttavm\.com%20Termos/);
  assert.equal(listingUrl('ikas', { name: 'x' }), '', 'adresi bilinmeyen kanal: bağlantı yok');
  assert.equal(listingUrl('trendyol', { url: 'javascript:alert(1)', name: 'a' }), 'https://www.trendyol.com/sr?q=a', 'yalnız https adres kabul edilir');
});
