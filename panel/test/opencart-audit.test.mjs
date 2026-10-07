// OpenCart denetimi: tek sipariş / kanalda var mı, sayfa sınırında imleç; bağlantı dosyası OpenCart 4.1 tablolarıyla (product_discount special = 1)
// gerçek MariaDB üzerinde (php + mariadbd kuruluysa; yoksa atlanır).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { opencart } from '../src/channels/opencart.js';

const realFetch = globalThis.fetch;
const KEY = 'k'.repeat(32), ENV = { OPENCART_URL: 'https://magaza.com', OPENCART_KEY: KEY };
function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const c = { url: String(url), body: opts.body ? JSON.parse(opts.body) : undefined, action: new URL(String(url)).searchParams.get('action') };
    calls.push(c);
    return new Response(JSON.stringify(await handler(c)), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  return calls;
}
const ocOrder = (id, extra = {}) => ({ order_id: id, order_status_id: 2, status: 'Processing', total: 10, currency_code: 'TRY', currency_value: 1, added: 1759312800, modified: 1759399200, products: [], ...extra });

test('OpenCart: tek sipariş (yenile) ve kanalda var mı (kimlik listesiyle)', async () => {
  const calls = mockFetch((c) => ({ ok: true, orders: c.body.ids[0] === 5 ? [ocOrder(5)] : [], more: false }));
  const ch = opencart(ENV, {});
  const o = await ch.fetchOne('5');
  assert.deepEqual(calls[0].body.ids, [5]);
  assert.equal(calls[0].action, 'orders');
  assert.deepEqual([o.remoteId, o.status], ['5', 'new']);
  await assert.rejects(ch.fetchOne('6'), /sipariş bulunamadı/);
  assert.deepEqual([await ch.orderExists('5'), await ch.orderExists('6')], [true, false]);
});

test('OpenCart: 50 sayfa sınırına gelinirse partialUntil son okunan değiştirilme zamanı', async () => {
  let n = 0;
  mockFetch((c) => { n++; return { ok: true, orders: Array.from({ length: 100 }, (_, i) => ocOrder(c.body.page * 1000 + i, { modified: 1759399200 + c.body.page * 100 + i })), more: true }; });
  const since = 1759390000 * 1000;
  const list = await opencart(ENV, {}).fetchOrders(since, since + 864e5);
  assert.equal(n, 50);
  assert.equal(list.length, 5000);
  assert.equal(list.partialUntil, (1759399200 + 50 * 100 + 99) * 1000);
  assert.match(list.warnings[0], /5000\+/);
  n = 0;
  assert.equal((await opencart(ENV, {}).fetchOrders(since, since + 864e5, { byOrdered: true })).partialUntil, undefined);
});

// ---------- bağlantı dosyası + gerçek veritabanı (OpenCart 4.1.0.3 tablo tanımlarından, yalnız kullanılan sütunlar) ----------
const has = (cmd, args) => { try { execFileSync(cmd, args, { stdio: 'ignore' }); return true; } catch { return false; } };
const canRun = has('php', ['-v']) && /mysqli/.test(execFileSync('php', ['-m'], { encoding: 'utf8' })) && has('mariadbd', ['--version']) && has('which', ['mariadb-install-db']);
const OC41 = `
CREATE TABLE oc_setting (setting_id int AUTO_INCREMENT PRIMARY KEY, store_id int NOT NULL DEFAULT 0, code varchar(128), \`key\` varchar(128), value text, serialized tinyint(1) DEFAULT 0);
CREATE TABLE oc_language (language_id int AUTO_INCREMENT PRIMARY KEY, name varchar(32), code varchar(5), status tinyint(1) DEFAULT 1, sort_order int DEFAULT 0);
CREATE TABLE oc_order_status (order_status_id int, language_id int, name varchar(32), PRIMARY KEY (order_status_id, language_id));
CREATE TABLE oc_order (order_id int AUTO_INCREMENT PRIMARY KEY, order_status_id int DEFAULT 0, total decimal(15,4) DEFAULT 0, date_added datetime, date_modified datetime);
CREATE TABLE oc_product (product_id int AUTO_INCREMENT PRIMARY KEY, master_id int DEFAULT 0, model varchar(64), sku varchar(64), upc varchar(12), ean varchar(14), mpn varchar(64), quantity int(4) DEFAULT 0, image varchar(255),
  price decimal(15,4) DEFAULT 0, subtract tinyint(1) DEFAULT 1, status tinyint(1) DEFAULT 0, date_modified datetime);
CREATE TABLE oc_product_description (product_id int, language_id int, name varchar(255), PRIMARY KEY (product_id, language_id));
CREATE TABLE oc_product_image (product_image_id int AUTO_INCREMENT PRIMARY KEY, product_id int, image varchar(255), sort_order int DEFAULT 0);
CREATE TABLE oc_product_option (product_option_id int AUTO_INCREMENT PRIMARY KEY, product_id int, option_id int, value text, required tinyint(1));
CREATE TABLE oc_product_option_value (product_option_value_id int AUTO_INCREMENT PRIMARY KEY, product_option_id int, product_id int, option_id int, option_value_id int, quantity int(3), subtract tinyint(1),
  price decimal(15,4), price_prefix varchar(1), points int(8) DEFAULT 0, points_prefix varchar(1) DEFAULT '+', weight decimal(15,8) DEFAULT 0, weight_prefix varchar(1) DEFAULT '+');
CREATE TABLE oc_option_description (option_id int, language_id int, name varchar(128), PRIMARY KEY (option_id, language_id));
CREATE TABLE oc_option_value_description (option_value_id int, language_id int, option_id int, name varchar(128), PRIMARY KEY (option_value_id, language_id));
CREATE TABLE oc_product_discount (product_discount_id int AUTO_INCREMENT PRIMARY KEY, product_id int, customer_group_id int, quantity int(4) DEFAULT 0, priority int(5) DEFAULT 1, price decimal(15,4) DEFAULT 0,
  type char(1) DEFAULT 'P', special tinyint(1) DEFAULT 0, date_start date, date_end date);
INSERT INTO oc_language VALUES (1, 'Türkçe', 'tr-tr', 1, 1);
INSERT INTO oc_setting (store_id, code, \`key\`, value) VALUES (0, 'config', 'config_language_catalog', 'tr-tr'), (0, 'config', 'config_customer_group_id', '1');
INSERT INTO oc_order_status VALUES (3, 1, 'Kargoya Verildi');
INSERT INTO oc_product VALUES (50, 0, 'TS-01', 'TS', '', '8690001', '', 10, 'catalog/t.jpg', 100, 1, 1, NOW()), (51, 0, 'K-01', 'K', '', '', '', 5, '', 40, 1, 1, NOW());
INSERT INTO oc_product_description VALUES (50, 1, 'Tişört'), (51, 1, 'Kalem');
INSERT INTO oc_product_option VALUES (60, 50, 90, '', 1);
INSERT INTO oc_product_option_value VALUES (77, 60, 50, 90, 900, 4, 1, 10, '+', 0, '+', 0, '+');
INSERT INTO oc_option_value_description VALUES (900, 1, 90, 'M');
INSERT INTO oc_option_description VALUES (90, 1, 'Beden');
-- satıcının kendi indirimi (yüzde 20, öncelik 2) ve adet indirimi (special = 0: indirimli fiyat sayılmaz)
INSERT INTO oc_product_discount (product_id, customer_group_id, quantity, priority, price, type, special, date_start, date_end) VALUES (50, 1, 1, 2, 20, 'P', 1, '2020-01-01', '0000-00-00'), (50, 1, 5, 1, 50, 'F', 0, '2020-01-01', '0000-00-00'),
  (51, 1, 1, 1, 30, 'F', 1, '2020-01-01', '0000-00-00');
`;

test('OpenCart bağlantı dosyası: OpenCart 4.1 (product_special yok) indirimli fiyat okunur / yazılır, satıcının indirimi çakışırsa bildirilir', { skip: !canRun && 'php (mysqli) / mariadbd yok', timeout: 60000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'oc41-')), port = 21000 + Math.floor(Math.random() * 9000), dbPort = port + 10000;
  const procs = [];
  try {
    execFileSync('mariadb-install-db', ['--no-defaults', `--datadir=${dir}/data`, '--auth-root-authentication-method=normal', '--skip-test-db'], { stdio: 'ignore' });
    procs.push(spawn('mariadbd', ['--no-defaults', `--datadir=${dir}/data`, `--socket=${dir}/sock`, `--port=${dbPort}`, '--bind-address=127.0.0.1', '--user=root', `--pid-file=${dir}/pid`, '--skip-grant-tables'], { stdio: 'ignore' }));
    const sql = (q, db = '') => execFileSync('mariadb', ['--no-defaults', '-S', `${dir}/sock`, '-uroot', '--default-character-set=utf8mb4', ...(db ? [db] : [])], { input: q });
    for (let i = 0; ; i++) { try { sql('SELECT 1'); break; } catch (e) { if (i > 100) throw e; await new Promise((r) => setTimeout(r, 100)); } }
    sql('CREATE DATABASE oc CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci');
    sql(OC41, 'oc');
    const site = join(dir, 'site');
    execFileSync('mkdir', ['-p', site]);
    writeFileSync(join(site, 'config.php'), `<?php\ndefine('HTTPS_SERVER', 'https://magaza.com/');\ndefine('DB_HOSTNAME', '127.0.0.1');\ndefine('DB_USERNAME', 'root');\ndefine('DB_PASSWORD', '');\ndefine('DB_DATABASE', 'oc');\ndefine('DB_PORT', '${dbPort}');\ndefine('DB_PREFIX', 'oc_');\n`);
    writeFileSync(join(site, 'index.php'), "<?php\ndefine('VERSION', '4.1.0.3');\n");
    writeFileSync(join(site, 'hasturk-baglanti.php'), readFileSync(new URL('../public/opencart-bridge.php', import.meta.url), 'utf8').replace('__HASTURK_KEY__', KEY));
    procs.push(spawn('php', ['-S', `127.0.0.1:${port}`, '-t', site], { stdio: 'ignore' }));
    globalThis.fetch = (u, o) => realFetch(String(u).replace('https://magaza.com', `http://127.0.0.1:${port}`), o);
    for (let i = 0; ; i++) { try { await realFetch(`http://127.0.0.1:${port}/index.php`); break; } catch (e) { if (i > 100) throw e; await new Promise((r) => setTimeout(r, 100)); } }
    const ch = opencart(ENV, {});
    const diag = await ch.diagnose({});
    assert.equal(diag[0].ok, true, diag[0].detail);
    assert.match(diag[0].detail, /OpenCart 4\.1\.0\.3/);
    const byId = async () => Object.fromEntries((await ch.fetchListings()).map((x) => [x.remoteId, [x.price, x.listPrice, x.stock]]));
    // %20 indirim ana fiyattan (100 → 80), seçenek farkı (+10) eklenir; adet indirimi (special = 0) sayılmaz
    assert.deepEqual(await byId(), { '50:77': [90, 110, 4], 51: [30, 40, 5] });
    // panel indirimi (öncelik 1, sabit) satıcının %20 indiriminin önüne geçer
    await ch.pushPrice([{ remoteId: '50:77', remoteProductId: '50', price: 95, listPrice: 110 }]);
    await ch.pushStock([{ remoteId: '50:77', remoteProductId: '50', stock: 3 }]);
    assert.deepEqual((await byId())['50:77'], [95, 110, 3]);
    const row = sql("SELECT quantity, priority, price, type, special, date_end FROM oc_product_discount WHERE date_end = '9999-12-31'", 'oc').toString().trim().split('\n').pop();
    assert.equal(row, '1\t1\t85.0000\tF\t1\t9999-12-31');
    // satıcının öncelik 1 ve daha düşük indirimli fiyatı panelin fiyatını geçersiz kılıyor: hata olarak bildirilir
    await assert.rejects(ch.pushPrice([{ remoteId: '51', remoteProductId: '51', price: 35, listPrice: 40 }]), /panel dışı indirimli fiyat geçerli \(30; panelin fiyatı 35\)/);
    // indirimin kaldırılması: panelin satırı silinir, satıcının %20 indirimi yeniden geçerli → bildirilir
    await assert.rejects(ch.pushPrice([{ remoteId: '50:77', remoteProductId: '50', price: 110, listPrice: 110 }]), /panel dışı indirimli fiyat geçerli \(80; panelin fiyatı 100\)/);
    assert.equal(sql("SELECT COUNT(*) FROM oc_product_discount WHERE product_id = 50 AND date_end = '9999-12-31'", 'oc').toString().trim().split('\n').pop(), '0');
  } finally {
    globalThis.fetch = realFetch;
    // süreçler kapanınca (veritabanı dosyalarını bırakınca) geçici klasör silinir
    await Promise.all(procs.map((p) => (p.exitCode != null ? null : new Promise((r) => { p.once('exit', r); p.kill(); }))));
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
