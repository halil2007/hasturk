// Avantajlı etiketler: Excel (Trendyol yıldız eşikleri / Hepsiburada flaş indirim) yükle → eşik başına kâr (KDV dahil model) → seçim →
// Excel'i pazaryerinin düzeninde geri yaz (sheetwrite) → isteğe bağlı kanala gönder. Yetki, demo örnek listeleri.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { d1 } from '../dev/d1.mjs';
import worker from '../src/index.js';
import { resetChannels } from '../src/channels/index.js';
import { init, first, all, run, setSetting, getSettings } from '../src/db.js';
import { importOffers, listOffers, chooseOffers, applyOffers, clearOffers, detectColumns, gridRows, offerFile, seedDemoOffers, demoSample, NEW_COL } from '../src/promos.js';
import { DEMO_PRODUCTS } from '../src/channels/demo.js';
import { profit, costOf } from '../public/profit.js';
import { readGrid, readSheet, unzip } from '../public/sheetread.js';
import { patchXlsx, buildXlsx, buildCsv, zip } from '../public/sheetwrite.js';
import { sectionOf, can } from '../public/perms.js';

async function setup() {
  const db = d1();
  await init(db);
  const t = Date.now();
  await run(db, "INSERT INTO products (sku, barcode, name, purchase_price, sale_price, stock, vat, created_at, updated_at) VALUES ('HG-1', '8690000000011', 'Saksı Toprağı', 40, 100, 5, 20, ?, ?)", t, t);
  await run(db, "INSERT INTO listings (channel, remote_id, sku, barcode, name, price, product_id, synced_at) VALUES ('trendyol', 'ty1', 'HG-1', '8690000000011', 'Saksı Toprağı', 100, 1, ?)", t);
  await run(db, "INSERT INTO listings (channel, remote_id, sku, barcode, name, price, product_id, synced_at) VALUES ('hepsiburada', 'HBV00001', 'HG-1', '8690000000011', 'Saksı Toprağı', 110, 1, ?)", t);
  return db;
}
// readGrid → istek ızgarası (tarayıcıdaki gibi)
const gridOf = (g) => g.rows.map((r) => [r.r, r.cells, r.types.map((x) => x || ' ').join('')]);
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.011, `${a} ≈ ${b}`);

test('Trendyol yıldızlı ürün dosyası sütunları: barkod, yıldız üst fiyatları, komisyon, güncel fiyat; hedef sütun yok → en sağa', () => {
  const head = ['ÜRÜN İSMİ', 'BARKOD', 'MODEL KODU', 'STOK KODU', 'MARKA', 'KATEGORİ', 'BAŞLANGIÇ TARİHİ', 'BİTİŞ TARİHİ', '1 YILDIZ ÜST FİYAT', '2 YILDIZ ÜST FİYAT', '3 YILDIZ ÜST FİYAT', 'Komisyon Oranı', 'STOK', 'GÜNCEL KOMİSYON', 'PİYASA SATIŞ FİYATI', 'GÜNCEL SATIŞ FİYATI'];
  const c = detectColumns(head, [{ '1 YILDIZ ÜST FİYAT': '95,90' }]);
  assert.equal(c.barcode, 'BARKOD');
  assert.equal(c.sku, 'STOK KODU');
  assert.equal(c.name, 'ÜRÜN İSMİ');
  assert.equal(c.current, 'GÜNCEL SATIŞ FİYATI');
  assert.equal(c.commission, 'Komisyon Oranı');
  assert.equal(c.curCommission, 'GÜNCEL KOMİSYON');
  assert.deepEqual(c.tiers, ['1 YILDIZ ÜST FİYAT', '2 YILDIZ ÜST FİYAT', '3 YILDIZ ÜST FİYAT']);
  assert.equal(c.target, null);
  // Eski / sade başlıklar
  const old = detectColumns(['Barkod', 'Ürün Adı', 'Trendyol Satış Fiyatı', '1 Yıldız Fiyatı', '2 Yıldız Fiyatı', 'Yeni Satış Fiyatı']);
  assert.deepEqual(old.tiers, ['1 Yıldız Fiyatı', '2 Yıldız Fiyatı']);
  assert.equal(old.current, 'Trendyol Satış Fiyatı');
  assert.equal(old.target, 'Yeni Satış Fiyatı');
});

test('Hepsiburada davet sütunları: boş "Kampanya Fiyatı" satıcının dolduracağı sütun, "Katılım" katılım sütunu; başlık üstündeki açıklama satırları atlanır', () => {
  const grid = [
    { r: 1, cells: ['Flaş İndirim Daveti — 12.10.2026'], types: ['s'] },
    { r: 2, cells: [], types: [] },
    { r: 3, cells: ['Satıcı Stok Kodu', 'Hepsiburada Ürün Kodu', 'Ürün Adı', 'Güncel Fiyat', 'Önerilen Kampanya Fiyatı', 'Kampanya Fiyatı', 'Katılım', 'Bitiş Tarihi'], types: [] },
    { r: 4, cells: ['HG-1', 'HBV00001', 'Saksı Toprağı', '110', '99', '', '', '20.10.2026 23:59'], types: ['s', 's', 's', 'n', 'n'] },
    { r: 5, cells: ['HG-2', 'HBV00002', 'Başka', '1.250,50', '1.190,00', '', ''], types: ['s', 's', 's', 's', 's'] },
  ];
  const { head, headerRow, rows } = gridRows(grid);
  assert.equal(headerRow, 3);
  assert.equal(rows[0].__row, 4);
  const c = detectColumns(head, rows);
  assert.equal(c.remote, 'Hepsiburada Ürün Kodu');
  assert.equal(c.sku, 'Satıcı Stok Kodu');
  assert.equal(c.target, 'Kampanya Fiyatı');
  assert.equal(c.join, 'Katılım');
  assert.deepEqual(c.tiers, ['Önerilen Kampanya Fiyatı']);
  // Açık giriş sütunu adı: "Kampanyaya katılacağınız fiyat"
  assert.equal(detectColumns(['Barkod', 'Kampanya Üst Fiyatı', 'Kampanyaya Katılacağınız Fiyat']).target, 'Kampanyaya Katılacağınız Fiyat');
});

test('yükle (Türkçe sayı biçimleri) → eşik kârı (KDV dahil model) → seç → kanala gönder', async () => {
  const db = await setup();
  await setSetting(db, 'commission', { trendyol: 20, hepsiburada: 18 });
  const grid = [
    [1, ['Barkod', 'Ürün Adı', 'Trendyol Satış Fiyatı', '1 Yıldız Fiyatı', '2 Yıldız Fiyatı', '3 Yıldız Fiyatı'], 'ssssss'],
    [2, ['8690000000011', 'Saksı Toprağı', '100', '95,90', '89,90', ''], 'ssnsss'],
    [3, ['8690000009999', 'Panelde olmayan', '1.250,50', '1.199,90', '1.100', '1.050,00'], 'ssssss'],
  ];
  const r = await importOffers(db, { channel: 'trendyol', kind: 'advantage', name: 'yildiz.xlsx', type: 'xlsx', grid });
  assert.equal(r.imported, 2);
  assert.equal(r.matched, 1);
  assert.equal(r.target.append, true);
  assert.equal(r.target.header, NEW_COL);
  const { offers, groups, file } = await listOffers(db, { channel: 'trendyol', kind: 'advantage' });
  assert.equal(groups[0].n, 2);
  assert.equal(file.textPrices, true, 'fiyatlar dosyada metin');
  assert.equal(file.headerRow, 1);
  const o = offers.find((x) => x.remote_id === 'ty1');
  assert.equal(o.row, 2);
  assert.equal(o.tiers.length, 2, 'boş eşik atlanır');
  assert.equal(o.tiers[0].price, 95.9);
  const other = offers.find((x) => !x.remote_id);
  assert.deepEqual(other.tiers.map((t) => t.price), [1199.9, 1100, 1050]);
  near(other.file_price, 1250.5);
  // Kâr: KDV dahil satış, Trendyol komisyonu (ayar, KDV dahil saklanır), stopaj KDV hariç satış üzerinden, alış 40
  // Ayarlardaki oran: kurulum "KDV dahil" değilse %20 eklenir (costOf); Trendyol oranı ayrıca × 1,2 yapılmaz
  const st = await getSettings(db);
  const exp = profit({ sale: 95.9, purchase: 40, commissionRate: costOf(st, 'commission', 'trendyol'), withholdingRate: costOf(st, 'withholding', 'trendyol'), vatRate: 20 });
  near(o.tiers[0].profit, exp.unitProfit);
  near(o.tiers[0].margin, exp.margin);
  assert.ok(o.tiers[0].margin < o.now.margin, 'düşük fiyatta kâr oranı düşer');
  assert.equal(o.tiers[0].ok, false, '100 TL fiyat 95,90 eşiğini sağlamaz');
  // Seçim: eşik, özel fiyat, geçersiz, temizle
  const ch = await chooseOffers(db, { channel: 'trendyol', kind: 'advantage', items: [{ key: o.key, choice: 't1' }, { key: other.key, choice: 'custom', price: '1.234,5' }, { key: 'yok', choice: 't0' }] });
  assert.deepEqual([ch.set, ch.bad], [2, 1]);
  assert.deepEqual(ch.items.map((x) => x.price), [89.9, 1234.5]);
  let l2 = await listOffers(db, { channel: 'trendyol', kind: 'advantage' });
  assert.equal(l2.offers.find((x) => x.key === o.key).chosen_price, 89.9);
  assert.equal(l2.groups[0].chosen, 2);
  // Kâr sınırı: %50 altına düşecekse atlanır; eşleşmeyen ürün kanala gönderilemez
  const skip = await applyOffers(db, { channel: 'trendyol', kind: 'advantage', keys: [o.key], minMargin: 50 });
  assert.equal(skip.applied, 0);
  const ok = await applyOffers(db, { channel: 'trendyol', kind: 'advantage', keys: [o.key, other.key] });
  assert.equal(ok.applied, 1);
  assert.equal(ok.unmatched, 1);
  const l = await first(db, "SELECT price, price_dirty FROM listings WHERE remote_id = 'ty1'");
  assert.equal(l.price, 89.9);
  assert.equal(l.price_dirty, 1);
  l2 = await listOffers(db, { channel: 'trendyol', kind: 'advantage' });
  const after = l2.offers.find((x) => x.remote_id === 'ty1');
  assert.equal(after.tiers[1].ok, true, 'yeni fiyat 2. eşiği sağlıyor');
  assert.equal(after.applied_price, 89.9);
  // Zararına seçim kanala gönderilmez (allowLoss olmadan)
  await chooseOffers(db, { channel: 'trendyol', kind: 'advantage', items: [{ key: o.key, choice: 'custom', price: '30' }] });
  assert.equal((await applyOffers(db, { channel: 'trendyol', kind: 'advantage', keys: [o.key] })).loss, 1);
  assert.equal((await clearOffers(db, { channel: 'trendyol', kind: 'advantage' })).removed, 2);
  assert.equal((await offerFile(db, { channel: 'trendyol', kind: 'advantage' })).meta, null);
});

test('komisyon KDV kuralı: dosyadaki Trendyol oranı olduğu gibi, Hepsiburada oranı × 1,20; ilan oranı ve resmî liste oranı', async () => {
  const db = await setup();
  const head = ['Barkod', 'Kampanya Fiyatı', 'Komisyon Oranı'];
  await importOffers(db, { channel: 'trendyol', kind: 'advantage', grid: [[1, head], [2, ['8690000000011', '90', '15']]] });
  await importOffers(db, { channel: 'hepsiburada', kind: 'flash', grid: [[1, head], [2, ['8690000000011', '90', '15']]] });
  const [ty] = (await listOffers(db, { channel: 'trendyol', kind: 'advantage' })).offers;
  const [hb] = (await listOffers(db, { channel: 'hepsiburada', kind: 'flash' })).offers;
  assert.equal(ty.calc.tierRate, 15, 'Trendyol oranı KDV dahil: × 1,2 yapılmaz');
  assert.equal(hb.calc.tierRate, 18, 'Hepsiburada oranı KDV hariç: × 1,2');
  near(ty.tiers[0].profit, profit({ sale: 90, purchase: 40, commissionRate: 15, withholdingRate: 1 }).unitProfit);
  near(hb.tiers[0].profit, profit({ sale: 90, purchase: 40, commissionRate: 18, withholdingRate: 1 }).unitProfit);
  // Dosyada oran yoksa: ilan oranı (KDV dahil saklanır), o da yoksa resmî liste (Trendyol KDV dahil, HB × 1,2), o da yoksa ayar
  const noComm = [[1, ['Barkod', 'Kampanya Fiyatı']], [2, ['8690000000011', '90']]];
  await run(db, "UPDATE listings SET commission = 12.5, commission_src = 'api' WHERE remote_id = 'ty1'");
  await importOffers(db, { channel: 'trendyol', kind: 'advantage', grid: noComm });
  assert.equal((await listOffers(db, { channel: 'trendyol', kind: 'advantage' })).offers[0].calc.tierRate, 12.5);
  await run(db, "UPDATE listings SET commission = NULL, mp_category = 'Bere' WHERE remote_id IN ('ty1', 'HBV00001')");
  await importOffers(db, { channel: 'hepsiburada', kind: 'flash', grid: noComm });
  assert.equal((await listOffers(db, { channel: 'trendyol', kind: 'advantage' })).offers[0].calc.tierRate, 21.5, 'Trendyol resmî listesi KDV dahil');
  assert.equal((await listOffers(db, { channel: 'hepsiburada', kind: 'flash' })).offers[0].calc.tierRate, 21.6, 'Hepsiburada resmî listesi %18 → × 1,2');
});

// Pazaryeri dosyası gibi: paylaşılan metinler, stil, satır "spans", formül + calcChain, ikinci sayfa
async function marketXlsx() {
  const NS = 'http://schemas.openxmlformats.org';
  const ss = ['Satıcı Stok Kodu', 'Barkod', 'Ürün Adı', 'Güncel Fiyat', 'Önerilen Kampanya Fiyatı', 'Kampanya Fiyatı', 'Katılım', 'HG-1', '8690000000011', 'Saksı Toprağı & Gübre', 'HG-2', '8690000000028', 'Başka ürün', 'Not'];
  const s = (i) => `<c r="REF" t="s"><v>${i}</v></c>`;
  const row = (r, cells) => `<row r="${r}" spans="1:7">${cells.map((c, i) => c.replace('REF', String.fromCharCode(65 + i) + r)).join('')}</row>`;
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS}/spreadsheetml/2006/main"><dimension ref="A1:G3"/><sheetData>`
    + row(1, [0, 1, 2, 3, 4, 5, 6].map(s))
    + `<row r="2" spans="1:7"><c r="A2" t="s"><v>7</v></c><c r="B2" t="s"><v>8</v></c><c r="C2" t="s"><v>9</v></c><c r="D2" s="1"><v>110</v></c><c r="E2" s="1"><v>99</v></c><c r="F2" s="1"/></row>`
    + `<row r="3" spans="1:7"><c r="A3" t="s"><v>10</v></c><c r="B3" t="s"><v>11</v></c><c r="C3" t="s"><v>12</v></c><c r="D3" s="1"><v>250</v></c><c r="E3" s="1"><f>D3*0.9</f><v>225</v></c><c r="F3" s="1"/></row>`
    + `</sheetData></worksheet>`;
  const sst = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="${NS}/spreadsheetml/2006/main" count="${ss.length}" uniqueCount="${ss.length}">${ss.map((x) => `<si><t>${x.replace('&', '&amp;')}</t></si>`).join('')}</sst>`;
  return zip([
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="${NS}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/><Override PartName="/xl/calcChain.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml"/></Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${NS}/package/2006/relationships"><Relationship Id="rId1" Type="${NS}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    // İlk sayfa sheet2.xml (rId5): ilk sayfanın gerçek dosyası ilişkiden bulunur
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${NS}/spreadsheetml/2006/main" xmlns:r="${NS}/officeDocument/2006/relationships"><sheets><sheet name="Davet" sheetId="1" r:id="rId5"/><sheet name="Açıklama" sheetId="2" r:id="rId1"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${NS}/package/2006/relationships"><Relationship Id="rId1" Type="${NS}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId5" Type="${NS}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="${NS}/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/><Relationship Id="rId4" Type="${NS}/officeDocument/2006/relationships/calcChain" Target="calcChain.xml"/></Relationships>` },
    { name: 'xl/sharedStrings.xml', data: sst },
    { name: 'xl/worksheets/sheet2.xml', data: sheet },
    { name: 'xl/worksheets/sheet1.xml', data: `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${NS}/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>13</v></c></row></sheetData></worksheet>` },
    { name: 'xl/calcChain.xml', data: `<?xml version="1.0" encoding="UTF-8"?><calcChain xmlns="${NS}/spreadsheetml/2006/main"><c r="E3" i="1"/></calcChain>` },
  ]);
}

test('Excel geri yazma: aynı sayfa / sütun / satır sırası; yalnız seçilen satırın hedef ve katılım hücresi değişir', async () => {
  const db = await setup();
  const src = await marketXlsx();
  const g = await readGrid(src);
  assert.deepEqual(g.rows[1].cells.slice(0, 5), ['HG-1', '8690000000011', 'Saksı Toprağı & Gübre', '110', '99']);
  assert.equal(g.rows[1].types[3], 'n');
  const r = await importOffers(db, { channel: 'hepsiburada', kind: 'flash', name: 'davet.xlsx', type: 'xlsx', grid: gridOf(g) });
  assert.equal(r.target.header, 'Kampanya Fiyatı', 'boş fiyat sütunu satıcının dolduracağı sütun');
  assert.deepEqual(r.tiers, ['Önerilen Kampanya Fiyatı']);
  const { offers, file } = await listOffers(db, { channel: 'hepsiburada', kind: 'flash' });
  assert.equal(file.textPrices, false);
  const o = offers.find((x) => x.sku === 'HG-1');
  await chooseOffers(db, { channel: 'hepsiburada', kind: 'flash', items: [{ key: o.key, choice: 't0' }] });
  const chosen = (await listOffers(db, { channel: 'hepsiburada', kind: 'flash' })).offers.filter((x) => x.chosen_price);
  assert.equal(chosen.length, 1);
  // Tarayıcıdaki gibi: hedef + katılım hücreleri
  const t = file.target, j = file.join;
  const cells = chosen.flatMap((x) => [{ r: x.row, c: t.index, v: x.chosen_price }, ...(j ? [{ r: x.row, c: j.index, v: 'Evet' }] : [])]);
  const out = await patchXlsx(src, cells, { headerRow: file.headerRow });
  const back = await readGrid(out);
  assert.deepEqual(back.rows.map((x) => x.r), g.rows.map((x) => x.r), 'satır sırası aynı');
  assert.deepEqual(back.rows[0].cells, g.rows[0].cells, 'başlık aynı');
  assert.equal(back.rows[1].cells[t.index], '99');
  assert.equal(back.rows[1].cells[6], 'Evet');
  assert.deepEqual(back.rows[1].cells.slice(0, 5), g.rows[1].cells.slice(0, 5), 'diğer hücreler aynı');
  assert.deepEqual(back.rows[2].cells, g.rows[2].cells, 'seçilmeyen satır aynı');
  // Arşiv: diğer sayfa ve paylaşılan metinler bayt bayt aynı; stil korunur, spans kalkar
  const a = await unzip(src), b = await unzip(out);
  assert.deepEqual(Object.keys(b.files).sort(), Object.keys(a.files).sort());
  assert.equal(await b.read('xl/sharedStrings.xml'), await a.read('xl/sharedStrings.xml'));
  assert.equal(await b.read('xl/worksheets/sheet1.xml'), await a.read('xl/worksheets/sheet1.xml'));
  const xml = await b.read('xl/worksheets/sheet2.xml');
  assert.match(xml, /<c r="F2" s="1"><v>99<\/v><\/c>/);
  assert.match(xml, /<row r="2">/);
  // Formül hücresinin üzerine yazılınca calcChain kaldırılır (Excel "onarım" uyarısı vermesin)
  const out2 = await patchXlsx(src, [{ r: 3, c: 4, v: 200 }], { headerRow: 1 });
  const c2 = await unzip(out2);
  assert.ok(!c2.files['xl/calcChain.xml']);
  assert.doesNotMatch(await c2.read('[Content_Types].xml'), /calcChain/);
  assert.doesNotMatch(await c2.read('xl/_rels/workbook.xml.rels'), /calcChain/);
  assert.equal((await readGrid(out2)).rows[2].cells[4], '200');
});

test('Excel geri yazma: hedef sütun yoksa en sağa yeni sütun; metin fiyatlar "89,90" biçiminde; olmayan satır sıraya eklenir', async () => {
  const head = ['ÜRÜN İSMİ', 'BARKOD', '1 YILDIZ ÜST FİYAT', '2 YILDIZ ÜST FİYAT'];
  const src = await buildXlsx([head, ['Saksı Toprağı', '8690000000011', '95,90', '89,90'], ['Başka', '8690000000028', '45,00', '40,00']]);
  const db = await setup();
  const g = await readGrid(src);
  const r = await importOffers(db, { channel: 'trendyol', kind: 'advantage', name: 'YildizliUrunEtiketleri.xlsx', type: 'xlsx', grid: gridOf(g) });
  assert.deepEqual(r.target, { index: 4, header: NEW_COL, append: true });
  const { file } = await listOffers(db, { channel: 'trendyol', kind: 'advantage' });
  assert.equal(file.textPrices, true);
  const out = await patchXlsx(src, [{ r: 1, c: 4, v: NEW_COL }, { r: 2, c: 4, v: '89,90' }, { r: 5, c: 1, v: 'yeni' }], { headerRow: 1 });
  const back = await readSheet(new Blob([out]));
  assert.deepEqual(Object.keys(back[0]), [...head, NEW_COL]);
  assert.equal(back[0][NEW_COL], '89,90');
  assert.equal(back[1][NEW_COL], '', 'seçilmeyen satır boş');
  assert.equal(back[1]['1 YILDIZ ÜST FİYAT'], '45,00');
  const g2 = await readGrid(out);
  assert.deepEqual(g2.rows.map((x) => x.r), [1, 2, 3, 5]);
  assert.match(await (await unzip(out)).read('xl/worksheets/sheet1.xml'), /<dimension ref="A1:E5"\/>/);
});

test('CSV geri yazma: aynı ayırıcı, UTF-8 BOM, tırnaklı hücreler korunur', async () => {
  const csv = 'Barkod;Ürün Adı;Kampanya Fiyatı;Önerilen Kampanya Fiyatı\r\n8690000000011;"Gübre; 5 Kg";;95,90\r\n8690000000028;Başka;;40\r\n';
  const g = await readGrid(new TextEncoder().encode(csv));
  assert.equal(g.type, 'csv'); assert.equal(g.sep, ';');
  const db = await setup();
  const r = await importOffers(db, { channel: 'trendyol', kind: 'advantage', type: 'csv', sep: g.sep, grid: gridOf(g) });
  assert.equal(r.target.header, 'Kampanya Fiyatı');
  const rows = g.rows.map((x) => [...x.cells]);
  rows[1][r.target.index] = '95,90';
  const out = buildCsv(rows, g.sep);
  assert.ok(out.startsWith('﻿'));
  assert.equal(out, '﻿Barkod;Ürün Adı;Kampanya Fiyatı;Önerilen Kampanya Fiyatı\r\n8690000000011;"Gübre; 5 Kg";95,90;95,90\r\n8690000000028;Başka;;40\r\n');
});

test('yetki: avantajlı etiketler Ürünler bölümünde; yalnız görüntüleme yetkisiyle seçim / yükleme yapılamaz', async () => {
  assert.equal(sectionOf('promos'), 'products');
  assert.equal(sectionOf('promos/choose'), 'products');
  const viewer = { role: 'staff', perms: ['products:view'] };
  assert.ok(can(viewer, 'products'));
  assert.ok(!can(viewer, 'products', true));
  resetChannels();
  const env = { PANEL_PASSWORD: 'x-123456', PANEL_SECRET: 's'.repeat(32), DB: d1() };
  const jars = {};
  const as = (who) => async (path, opts = {}) => {
    const r = await worker.fetch(new Request('https://panel.test' + path, { ...opts, headers: { 'Content-Type': 'application/json', Origin: 'https://panel.test', Cookie: jars[who] || '' } }), env, { waitUntil() {} });
    const sc = r.headers.get('set-cookie'); if (sc) jars[who] = sc.split(';')[0];
    return r;
  };
  const admin = as('admin');
  assert.equal((await admin('/api/login', { method: 'POST', body: JSON.stringify({ password: 'x-123456' }) })).status, 200);
  for (const [u, perms] of [['izleyici', ['products:view']], ['depo', ['orders']], ['katalog', ['products']]]) {
    const r = await admin('/api/users', { method: 'POST', body: JSON.stringify({ username: u, name: u, password: 'personel-sifre-1', role: 'staff', perms }) });
    assert.equal(r.status, 200, await r.text());
    assert.equal((await as(u)('/api/login', { method: 'POST', body: JSON.stringify({ username: u, password: 'personel-sifre-1' }) })).status, 200);
  }
  const grid = [[1, ['Barkod', 'Kampanya Fiyatı']], [2, ['8690000000011', '90']]];
  const imp = (who) => as(who)('/api/promos/import', { method: 'POST', body: JSON.stringify({ channel: 'trendyol', kind: 'advantage', grid }) });
  assert.equal((await imp('izleyici')).status, 403);
  assert.equal((await imp('depo')).status, 403);
  assert.equal((await as('depo')('/api/promos?channel=trendyol&kind=advantage')).status, 403);
  assert.equal((await imp('katalog')).status, 200);
  assert.equal((await as('izleyici')('/api/promos?channel=trendyol&kind=advantage')).status, 200);
  assert.equal((await as('izleyici')('/api/promos/choose', { method: 'POST', body: JSON.stringify({ channel: 'trendyol', kind: 'advantage', items: [{ key: '8690000000011', choice: 't0' }] }) })).status, 403);
  assert.equal((await as('katalog')('/api/promos/choose', { method: 'POST', body: JSON.stringify({ channel: 'trendyol', kind: 'advantage', items: [{ key: '8690000000011', choice: 't0' }] }) })).status, 200);
  // Örnek dosya yalnız demo panelinde
  assert.equal((await admin('/api/promos/sample?channel=trendyol')).status, 404);
  resetChannels();
});

test('demo: Trendyol avantajlı ürün ve Hepsiburada flaş indirim örnek listeleri demo ilanlarıyla hazır gelir; örnek Excel aynı düzende', async () => {
  const db = d1();
  await init(db);
  const t = Date.now();
  for (const [i, p] of DEMO_PRODUCTS.entries()) {
    await run(db, 'INSERT INTO products (sku, barcode, name, purchase_price, sale_price, stock, vat, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 50, 20, ?, ?)', p[0], p[1], p[2], p[4], p[3], t, t);
    await run(db, 'INSERT INTO listings (channel, remote_id, sku, barcode, name, price, product_id, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 'trendyol', p[1], p[0], p[1], p[2], Math.round(p[3] * 1.06), i + 1, t);
    await run(db, 'INSERT INTO listings (channel, remote_id, sku, barcode, name, price, product_id, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 'hepsiburada', `hepsiburada-${p[0]}`, p[0], p[1], p[2], Math.round(p[3] * 1.05), i + 1, t);
  }
  const n = await seedDemoOffers(db);
  assert.equal(n, DEMO_PRODUCTS.length * 2);
  assert.equal(await seedDemoOffers(db), 0, 'bir kez');
  const ty = await listOffers(db, { channel: 'trendyol', kind: 'advantage' });
  assert.equal(ty.offers.length, DEMO_PRODUCTS.length);
  assert.ok(ty.offers.every((o) => o.remote_id && o.tiers.length === 3 && o.now));
  assert.ok(ty.offers.some((o) => o.tiers.some((x) => x.loss)), 'bazı ürünlerde son eşik zararına');
  assert.ok(ty.offers.some((o) => o.tiers.every((x) => !x.loss)));
  assert.equal(ty.offers[0].calc.tierRate, 18, 'dosyadaki Trendyol komisyonu (KDV dahil)');
  assert.equal(ty.file.target.append, true);
  const hb = await listOffers(db, { channel: 'hepsiburada', kind: 'flash' });
  assert.equal(hb.offers.length, DEMO_PRODUCTS.length);
  assert.ok(hb.offers.every((o) => o.remote_id), 'barkodla eşleşir');
  assert.equal(hb.file.target.header, 'Kampanya Fiyatı');
  assert.equal(hb.file.join.header, 'Katılım');
  // Saklanan dosya yok: indirirken başlık + satırlardan kurulur
  const f = await offerFile(db, { channel: 'hepsiburada', kind: 'flash' });
  assert.equal(f.data, null);
  assert.equal(f.rows.length, DEMO_PRODUCTS.length);
  // Örnek Excel: indir → yükle → aynı liste
  const s = await demoSample(db, 'trendyol');
  const g = await readGrid(await buildXlsx([s.head, ...s.rows]));
  const r = await importOffers(db, { channel: 'trendyol', kind: 'advantage', name: s.name, type: 'xlsx', grid: gridOf(g) });
  assert.equal(r.matched, DEMO_PRODUCTS.length);
  // API: demo panelinde liste ve örnek dosya
  resetChannels();
  const env = { DEMO: '1', PANEL_SECRET: 's'.repeat(32), DB: d1() };
  const lg = await worker.fetch(new Request('https://panel.test/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://panel.test' }, body: JSON.stringify({ password: 'demo' }) }), env, { waitUntil() {} });
  assert.equal(lg.status, 200);
  const cookie = lg.headers.get('set-cookie').split(';')[0];
  const sample = await worker.fetch(new Request('https://panel.test/api/promos/sample?channel=hepsiburada', { headers: { Cookie: cookie } }), env, { waitUntil() {} });
  assert.equal(sample.status, 200);
  assert.equal((await sample.json()).kind, 'flash');
  resetChannels();
});
