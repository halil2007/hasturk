// Dış istek bütçesi: Cloudflare'in çalıştırma başına alt istek sınırına yaklaşınca istekler kesilir, kalan işler ertelenir
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { http, withBudget, budgetLeft, budgetUsed } from '../src/util.js';

test('bütçe: sınır dolunca BudgetError; bağlamlar birbirini etkilemez; platform sınırı hatası tekrar denenmez', async () => {
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (u) => { calls++; if (String(u).includes('limit')) throw new Error('Too many subrequests.'); return new Response('{"ok":1}', { headers: { 'Content-Type': 'application/json' } }); };
  try {
    await withBudget(3, async () => {
      for (let i = 0; i < 3; i++) await http('https://x.test/a');
      assert.equal(budgetUsed(), 3); assert.equal(budgetLeft(), 0);
      await assert.rejects(() => http('https://x.test/a'), (e) => e.budget === true);
    });
    // Aynı anda çalışan ikinci bağlamın sayacı ayrı
    const [a, b] = await Promise.all([withBudget(10, async () => { await http('https://x.test/1'); return budgetUsed(); }), withBudget(10, async () => { await http('https://x.test/2'); await http('https://x.test/3'); return budgetUsed(); })]);
    assert.deepEqual([a, b], [1, 2]);
    // Bütçesiz (panel isteği) sınırsız
    assert.equal(budgetLeft(), Infinity);
    calls = 0;
    await withBudget(50, async () => {
      await assert.rejects(() => http('https://x.test/limit', { tries: 3 }), (e) => e.budget === true);
      assert.equal(calls, 1, 'platform sınırında tekrar denenmez');
      assert.equal(budgetLeft(), 0);
    });
  } finally { globalThis.fetch = real; }
});
