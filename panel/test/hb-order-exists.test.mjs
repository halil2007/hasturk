// Hepsiburada: sipariş numarasıyla kesin kontrol (Hepsiburada panelinden paketlenmiş / kargolanmış sipariş "kanalda yok" sayılmaz);
// 404 ya da boş yanıt "yok", diğer hatalar yeniden denenmek üzere fırlatılır
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hepsiburada } from '../src/channels/hepsiburada.js';

test('Hepsiburada orderExists: ayrıntı varsa var, 404 / boş yanıtta yok, diğer hatada belirsiz', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async (u) => {
    const no = decodeURIComponent(String(u).split('/').pop());
    const j = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
    if (no === '900') return j({ orderNumber: '900', items: [{ id: 'L1', quantity: 1, status: 'Packaged' }] });
    if (no === '901') return j({ message: 'Order not found' }, 404);
    if (no === '902') return j({});
    return j({ message: 'hata' }, 500);
  };
  try {
    const ch = hepsiburada({ HB_MERCHANT_ID: 'M1', HB_PASSWORD: 'x', HB_USER_AGENT: 'hasturk_dev' }, { id: 'hepsiburada' });
    assert.equal(await ch.orderExists('900'), true);
    assert.equal(await ch.orderExists('901'), false);
    assert.equal(await ch.orderExists('902'), false);
    await assert.rejects(ch.orderExists('903'));
  } finally { globalThis.fetch = real; }
});
