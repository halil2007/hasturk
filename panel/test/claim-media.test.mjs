// İade talebi görselleri: kanal verisindeki müşteri görselleri / ekleri toplanır; ürün görseli ve fatura bağlantısı alınmaz
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mediaUrls } from '../src/util.js';

test('iade görselleri: görsel / ek alanları ve görsel uzantılı bağlantılar', () => {
  const claim = {
    claimId: 'C1', items: [{ orderLine: { productName: 'Gübre', productImageUrl: 'https://cdn.ty/urun.jpg' },
      claimItems: [{ id: 1, customerNote: 'hasarlı', claimItemImages: [{ url: 'https://cdn.ty/iade/1.jpg' }, { url: 'https://cdn.ty/iade/2' }], attachments: ['https://cdn.ty/tutanak.pdf'] }] }],
    invoiceLink: 'https://fatura.example/f.pdf', cargoTrackingLink: 'https://kargo.example/t?no=1', note: 'http://duz.example/a.jpg', photo: 'yok',
  };
  assert.deepEqual(mediaUrls(claim), ['https://cdn.ty/iade/1.jpg', 'https://cdn.ty/iade/2', 'https://cdn.ty/tutanak.pdf']);
  assert.deepEqual(mediaUrls({ x: 'https://a.example/b.png' }), ['https://a.example/b.png'], 'alan adı ne olursa olsun görsel uzantılı bağlantı');
  assert.deepEqual(mediaUrls({ a: { b: { c: { d: { e: { f: { g: { h: { i: { j: { k: 'https://a.example/z.png' } } } } } } } } } } }), [], 'çok derin veri taranmaz');
});
