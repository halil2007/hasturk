<?php
// Hastürk Panel ↔ OpenCart bağlantı dosyası. OpenCart'ın kurulu olduğu ana klasöre (config.php'nin yanına) yükleyin.
// OpenCart'ta kullanılabilir bir yönetim API'si olmadığından panel bu dosyaya HTTPS üzerinden JSON (POST) gönderir:
// siparişler ve ürünler okunur; stok, fiyat ve kargo bilgisi (sipariş geçmişi notu + durum) yazılır. Başka hiçbir şey yapmaz.
// Güvenlik: her istek X-Hasturk-Key başlığında aşağıdaki anahtarı taşımalı (panel dosyayı indirirken yazar; kimseyle paylaşmayın).
// Veritabanı bilgileri OpenCart'ın config.php dosyasından okunur; cevaplarda şifre, SQL ya da hata ayrıntısı bulunmaz.
// Gereken: PHP 7.0+ ve mysqli eklentisi (OpenCart zaten kullanır). Composer / ek kurulum yok. OpenCart 2.x, 3.x ve 4.x tabloları.
// Tutarlar OpenCart'taki gibi döner (varsayılan para biriminde, KDV hariç + satır vergisi); dönüşümü panel yapar.
define('HASTURK_KEY', '__HASTURK_KEY__');
define('HASTURK_MAX_BODY', 2097152); // istek gövdesi en çok 2 MB
define('HASTURK_SPECIAL_END', '9999-12-31'); // panelin yazdığı indirimli fiyat (product_special) bu bitiş tarihiyle tanınır: pratikte süresiz

ini_set('display_errors', '0');
error_reporting(0);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow');

function hb_out($data, $code = 200) {
  http_response_code($code);
  $flags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PARTIAL_OUTPUT_ON_ERROR | (defined('JSON_INVALID_UTF8_SUBSTITUTE') ? JSON_INVALID_UTF8_SUBSTITUTE : 0);
  echo json_encode($data, $flags);
  exit;
}
function hb_fail($msg, $code = 400) { hb_out(array('ok' => false, 'message' => $msg), $code); }

// ---------- istek ve anahtar ----------
if (!isset($_SERVER['REQUEST_METHOD']) || $_SERVER['REQUEST_METHOD'] !== 'POST') hb_fail('Yalnız POST kabul edilir', 405);
if (isset($_SERVER['CONTENT_LENGTH']) && (int)$_SERVER['CONTENT_LENGTH'] > HASTURK_MAX_BODY) hb_fail('İstek çok büyük', 413);
$raw = file_get_contents('php://input', false, null, 0, HASTURK_MAX_BODY + 1);
if ($raw === false || strlen($raw) > HASTURK_MAX_BODY) hb_fail('İstek çok büyük', 413);
$in = trim($raw) === '' ? array() : json_decode($raw, true);
if (!is_array($in)) hb_fail('Geçersiz JSON');
// Anahtar: X-Hasturk-Key başlığı (başlığı silen sunucular için gövdedeki "key" yedek). Yer tutucu kalmışsa dosya hiç çalışmaz.
if (HASTURK_KEY === '__HASTURK' . '_KEY__' || strlen(HASTURK_KEY) < 24) hb_fail('Bağlantı anahtarı tanımlı değil: dosyayı panelden (Entegrasyonlar → OpenCart) yeniden indirin', 503);
$given = isset($_SERVER['HTTP_X_HASTURK_KEY']) ? (string)$_SERVER['HTTP_X_HASTURK_KEY'] : (isset($in['key']) && is_string($in['key']) ? $in['key'] : '');
if ($given === '' || !hash_equals(HASTURK_KEY, $given)) { usleep(250000); hb_fail('Anahtar geçersiz', 401); }
$action = isset($_GET['action']) ? (string)$_GET['action'] : (isset($in['action']) ? (string)$in['action'] : '');
if (!in_array($action, array('ping', 'orders', 'products', 'stock', 'price', 'ship', 'statuses'), true)) hb_fail('Bilinmeyen işlem', 400);

// ---------- OpenCart yapılandırması ve veritabanı ----------
if (!is_file(__DIR__ . '/config.php')) hb_fail('config.php bulunamadı: dosyayı OpenCart ana klasörüne (config.php\'nin yanına) yükleyin', 500);
require_once __DIR__ . '/config.php';
foreach (array('DB_HOSTNAME', 'DB_USERNAME', 'DB_PASSWORD', 'DB_DATABASE', 'DB_PREFIX') as $c) if (!defined($c)) hb_fail('config.php içinde veritabanı bilgisi yok (' . $c . ')', 500);
if (!preg_match('/^[A-Za-z0-9_]*$/', DB_PREFIX)) hb_fail('DB_PREFIX geçersiz', 500);

mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT); // hatalar istisna olur; ayrıntı yalnız sunucu günlüğüne yazılır
try {
  $GLOBALS['hb_db'] = mysqli_init();
  // FOUND_ROWS: UPDATE'te değişen değil eşleşen satır sayısı döner (aynı değeri yazmak "bulunamadı" sayılmasın)
  $GLOBALS['hb_db']->real_connect(DB_HOSTNAME, DB_USERNAME, DB_PASSWORD, DB_DATABASE, defined('DB_PORT') ? (int)DB_PORT : 3306, null, MYSQLI_CLIENT_FOUND_ROWS);
  try { $GLOBALS['hb_db']->set_charset('utf8mb4'); } catch (Exception $e) { $GLOBALS['hb_db']->set_charset('utf8'); }
  $GLOBALS['hb_db']->query("SET SESSION sql_mode = 'NO_ZERO_IN_DATE,NO_ENGINE_SUBSTITUTION'"); // OpenCart'ın kendi sürücüsüyle aynı
} catch (Throwable $e) {
  error_log('hasturk-baglanti: veritabanı bağlantısı: ' . $e->getMessage());
  hb_fail('Veritabanına bağlanılamadı (config.php bilgilerini kontrol edin)', 500);
}

function hb_t($name) { return '`' . DB_PREFIX . $name . '`'; } // tablo adı (ör. `order` ayrılmış kelime: hep ters tırnak)
function hb_esc($s) { return $GLOBALS['hb_db']->real_escape_string((string)$s); }
function hb_rows($sql) { $r = $GLOBALS['hb_db']->query($sql); $out = array(); if ($r instanceof mysqli_result) { while ($x = $r->fetch_assoc()) $out[] = $x; $r->free(); } return $out; }
// Hazır sorgu (yazma işlemleri): eşleşen satır sayısını döndürür
function hb_exec($sql, $types, $params) {
  $st = $GLOBALS['hb_db']->prepare($sql);
  if ($types !== '') $st->bind_param($types, ...$params);
  $st->execute(); $n = $st->affected_rows; $st->close(); return $n;
}
function hb_ids($list) { $ids = array(); foreach ($list as $x) { $i = (int)$x; if ($i > 0) $ids[$i] = $i; } return $ids ? implode(',', $ids) : '0'; } // IN (...) için yalnız tam sayılar
function hb_txt($s) { return $s === null ? '' : html_entity_decode((string)$s, ENT_QUOTES, 'UTF-8'); } // OpenCart metinleri HTML kaçışlı saklar
function hb_table($name) { static $c = array(); if (!isset($c[$name])) $c[$name] = (bool)hb_rows("SHOW TABLES LIKE '" . hb_esc(addcslashes(DB_PREFIX . $name, '_%')) . "'"); return $c[$name]; }
function hb_settings($keys) {
  $q = array(); foreach ($keys as $k) $q[] = "'" . hb_esc($k) . "'";
  $out = array(); foreach (hb_rows('SELECT `key`, `value` FROM ' . hb_t('setting') . ' WHERE store_id = 0 AND `key` IN (' . implode(',', $q) . ')') as $r) $out[$r['key']] = $r['value'];
  return $out;
}
function hb_in($in, $k, $d = null) { return isset($in[$k]) ? $in[$k] : $d; }

try {
  $cfg = hb_settings(array('config_language', 'config_language_catalog', 'config_language_id', 'config_customer_group_id', 'config_timezone'));
  // Saat dilimi: OpenCart 4 ayarı; yoksa sunucunun (OpenCart 3 da böyle yapar). Veritabanı oturumu da aynı farka ayarlanır.
  $tz = isset($cfg['config_timezone']) ? $cfg['config_timezone'] : '';
  if ($tz !== '' && in_array($tz, timezone_identifiers_list(), true)) date_default_timezone_set($tz); elseif (!ini_get('date.timezone')) date_default_timezone_set('UTC');
  $GLOBALS['hb_db']->query("SET time_zone = '" . hb_esc(date('P')) . "'");
  // Varsayılan dil: ayardaki dil kodu → language tablosu; bulunamazsa ilk etkin dil
  $LANG = isset($cfg['config_language_id']) ? (int)$cfg['config_language_id'] : 0;
  if (!$LANG) {
    $code = !empty($cfg['config_language_catalog']) ? $cfg['config_language_catalog'] : (isset($cfg['config_language']) ? $cfg['config_language'] : '');
    $r = $code !== '' ? hb_rows('SELECT language_id FROM ' . hb_t('language') . " WHERE code = '" . hb_esc($code) . "' LIMIT 1") : array();
    if (!$r) $r = hb_rows('SELECT language_id FROM ' . hb_t('language') . ' ORDER BY status DESC, sort_order, language_id LIMIT 1');
    $LANG = $r ? (int)$r[0]['language_id'] : 1;
  }
  $CG = !empty($cfg['config_customer_group_id']) ? (int)$cfg['config_customer_group_id'] : 1;
  $TS = function ($d) { $t = $d ? strtotime($d) : false; return $t ? $t : 0; };
  // Sipariş durumları (varsayılan dilde; o dilde adı olmayan durum için başka dildeki ad)
  $statuses = function () use ($LANG) {
    $out = array();
    foreach (hb_rows('SELECT order_status_id, language_id, name FROM ' . hb_t('order_status') . " ORDER BY language_id = $LANG DESC, language_id, order_status_id") as $r) {
      $id = (int)$r['order_status_id']; if (!isset($out[$id])) $out[$id] = array('order_status_id' => $id, 'name' => hb_txt($r['name']));
    }
    ksort($out); return array_values($out);
  };
  // "Kargoya verildi" durumu: adı Shipped / Kargo… olan ilk durum
  $shipStatus = function () use ($statuses) {
    foreach ($statuses() as $s) if (preg_match('/kargo|shipped|ship|gönderildi/iu', $s['name']) && !preg_match('/teslim|deliver/iu', $s['name'])) return $s;
    return null;
  };
  // Görsel adresi: config.php'deki site adresi (yoksa isteğin geldiği adres) + image/
  $imgBase = defined('HTTPS_SERVER') && HTTPS_SERVER ? HTTPS_SERVER : (defined('HTTP_SERVER') ? HTTP_SERVER : '');
  if ($imgBase === '' && !empty($_SERVER['HTTP_HOST']) && preg_match('/^[A-Za-z0-9.\-]+(:\d+)?$/', $_SERVER['HTTP_HOST'])) $imgBase = 'https://' . $_SERVER['HTTP_HOST'] . rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'])), '/') . '/';
  $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https');
  if ($https) $imgBase = preg_replace('#^http://#i', 'https://', $imgBase); // istek HTTPS ise site de HTTPS açıyor demektir
  $imgBase = rtrim($imgBase, '/') . '/image/';
  $img = function ($p) use ($imgBase) { $p = trim((string)$p); return $p === '' ? '' : $imgBase . implode('/', array_map('rawurlencode', explode('/', ltrim($p, '/')))); };
  $page = max(1, (int)hb_in($in, 'page', 1));

  switch ($action) {
    // ---------- bağlantı testi ----------
    case 'ping':
      $ver = '';
      $idx = @file_get_contents(__DIR__ . '/index.php', false, null, 0, 4096); // OpenCart sürümü index.php'de tanımlı
      if ($idx && preg_match("/define\\(\\s*'VERSION'\\s*,\\s*'([0-9A-Za-z._-]+)'/", $idx, $m)) $ver = $m[1];
      $p = hb_rows('SELECT COUNT(*) AS n FROM ' . hb_t('product'));
      $o = hb_rows('SELECT COUNT(*) AS n FROM ' . hb_t('order') . ' WHERE order_status_id > 0');
      hb_out(array('ok' => true, 'version' => $ver, 'php' => PHP_VERSION, 'prefix' => DB_PREFIX, 'language_id' => $LANG, 'customer_group_id' => $CG,
        'timezone' => date_default_timezone_get(), 'special' => hb_table('product_special'), 'ship_status' => $shipStatus(),
        'counts' => array('products' => $p ? (int)$p[0]['n'] : 0, 'orders' => $o ? (int)$o[0]['n'] : 0)));

    case 'statuses':
      hb_out(array('ok' => true, 'statuses' => $statuses(), 'ship_status' => $shipStatus()));

    // ---------- siparişler: tarih aralığı (değiştirilme ya da sipariş tarihi) veya kimlik listesi ----------
    // order_status_id = 0: ödeme sayfasında yarım kalmış ("eksik") sipariş, alınmaz
    case 'orders':
      $limit = max(1, min(100, (int)hb_in($in, 'limit', 100)));
      $col = hb_in($in, 'by') === 'added' ? 'date_added' : 'date_modified';
      $since = (int)hb_in($in, 'since', 0); $until = (int)hb_in($in, 'until', time());
      $ids = is_array(hb_in($in, 'ids')) ? array_slice($in['ids'], 0, 100) : null;
      $where = $ids !== null ? 'o.order_id IN (' . hb_ids($ids) . ')'
        : "o.$col >= '" . hb_esc(date('Y-m-d H:i:s', $since)) . "' AND o.$col < '" . hb_esc(date('Y-m-d H:i:s', $until)) . "'";
      $list = hb_rows('SELECT o.*, (SELECT os.name FROM ' . hb_t('order_status') . " os WHERE os.order_status_id = o.order_status_id ORDER BY os.language_id = $LANG DESC, os.language_id LIMIT 1) AS hb_status
        FROM " . hb_t('order') . " o WHERE o.order_status_id > 0 AND $where ORDER BY o.$col, o.order_id LIMIT " . (($page - 1) * $limit) . ", $limit");
      $oids = array(); foreach ($list as $o) $oids[] = $o['order_id'];
      $in_ = hb_ids($oids);
      $lines = array(); $opts = array(); $totals = array();
      if ($oids) {
        foreach (hb_rows('SELECT order_option_id, order_product_id, product_option_value_id, name, value FROM ' . hb_t('order_option') . " WHERE order_id IN ($in_) ORDER BY order_option_id") as $r)
          $opts[$r['order_product_id']][] = array('product_option_value_id' => (int)$r['product_option_value_id'], 'name' => hb_txt($r['name']), 'value' => hb_txt($r['value']));
        foreach (hb_rows('SELECT op.order_product_id, op.order_id, op.product_id, op.name, op.model, op.quantity, op.price, op.total, op.tax, p.sku, p.ean, p.upc, p.image FROM ' . hb_t('order_product') . ' op
          LEFT JOIN ' . hb_t('product') . " p ON p.product_id = op.product_id WHERE op.order_id IN ($in_) ORDER BY op.order_product_id") as $r)
          $lines[$r['order_id']][] = array('order_product_id' => (int)$r['order_product_id'], 'product_id' => (int)$r['product_id'], 'name' => hb_txt($r['name']), 'model' => hb_txt($r['model']),
            'sku' => hb_txt($r['sku']), 'ean' => hb_txt($r['ean']), 'upc' => hb_txt($r['upc']), 'image' => $img($r['image']), 'quantity' => (int)$r['quantity'],
            'price' => (float)$r['price'], 'tax' => (float)$r['tax'], 'total' => (float)$r['total'], 'options' => isset($opts[$r['order_product_id']]) ? $opts[$r['order_product_id']] : array());
        foreach (hb_rows('SELECT order_id, code, title, value FROM ' . hb_t('order_total') . " WHERE order_id IN ($in_) ORDER BY sort_order") as $r)
          $totals[$r['order_id']][] = array('code' => $r['code'], 'title' => hb_txt($r['title']), 'value' => (float)$r['value']);
      }
      // Yalnız gereken alanlar (IP, tarayıcı, ödeme ayrıntısı gibi bilgiler gönderilmez); sürüme göre olmayan sütun boş kalır
      $keep = array('invoice_no', 'invoice_prefix', 'store_name', 'firstname', 'lastname', 'email', 'telephone', 'comment', 'currency_code', 'date_added', 'date_modified');
      foreach (array('firstname', 'lastname', 'company', 'address_1', 'address_2', 'city', 'postcode', 'zone', 'country') as $f) { $keep[] = 'payment_' . $f; $keep[] = 'shipping_' . $f; }
      $out = array();
      foreach ($list as $o) {
        $x = array('order_id' => (int)$o['order_id'], 'customer_id' => (int)hb_in($o, 'customer_id', 0), 'order_status_id' => (int)$o['order_status_id'], 'status' => hb_txt($o['hb_status']),
          'total' => (float)$o['total'], 'currency_value' => (float)hb_in($o, 'currency_value', 1), 'added' => $TS($o['date_added']), 'modified' => $TS(hb_in($o, 'date_modified')));
        foreach ($keep as $k) $x[$k] = hb_txt(hb_in($o, $k, ''));
        $sm = (string)hb_in($o, 'shipping_method', ''); $j = json_decode($sm, true); // OpenCart 4.0.2+: JSON {name, code}
        $x['shipping_method'] = hb_txt(is_array($j) ? (isset($j['name']) ? $j['name'] : '') : $sm);
        $x['products'] = isset($lines[$o['order_id']]) ? $lines[$o['order_id']] : array();
        $x['totals'] = isset($totals[$o['order_id']]) ? $totals[$o['order_id']] : array();
        $out[] = $x;
      }
      hb_out(array('ok' => true, 'orders' => $out, 'more' => count($list) === $limit && $ids === null));

    // ---------- ürünler: seçenek değerleri (product_option_value) ayrı varyant olarak ----------
    // Fiyat: ana fiyat + bugün geçerli indirimli fiyat (varsayılan müşteri grubu). Seçenek fiyatı ana fiyata eklenen / düşülen farktır.
    case 'products':
      $limit = max(1, min(500, (int)hb_in($in, 'limit', 500)));
      $special = hb_table('product_special') ? '(SELECT ps.price FROM ' . hb_t('product_special') . " ps WHERE ps.product_id = p.product_id AND ps.customer_group_id = $CG
        AND (ps.date_start = '0000-00-00' OR ps.date_start <= CURDATE()) AND (ps.date_end = '0000-00-00' OR ps.date_end > CURDATE()) ORDER BY ps.priority, ps.price LIMIT 1)" : 'NULL';
      $list = hb_rows("SELECT p.product_id, p.model, p.sku, p.ean, p.upc, p.mpn, p.quantity, p.subtract, p.price, p.status, p.image, $special AS special,
        (SELECT pd.name FROM " . hb_t('product_description') . " pd WHERE pd.product_id = p.product_id ORDER BY pd.language_id = $LANG DESC, pd.language_id LIMIT 1) AS name
        FROM " . hb_t('product') . ' p ORDER BY p.product_id LIMIT ' . (($page - 1) * $limit) . ", $limit");
      $pids = array(); foreach ($list as $p) $pids[] = $p['product_id'];
      $in_ = hb_ids($pids); $ov = array(); $imgs = array();
      if ($pids) {
        foreach (hb_rows('SELECT pov.product_option_value_id, pov.product_id, pov.quantity, pov.subtract, pov.price, pov.price_prefix, ovd.name, od.name AS option_name
          FROM ' . hb_t('product_option_value') . ' pov JOIN ' . hb_t('product_option') . ' po ON po.product_option_id = pov.product_option_id
          LEFT JOIN ' . hb_t('option_value_description') . " ovd ON ovd.option_value_id = pov.option_value_id AND ovd.language_id = $LANG
          LEFT JOIN " . hb_t('option_description') . " od ON od.option_id = pov.option_id AND od.language_id = $LANG
          WHERE pov.product_id IN ($in_) ORDER BY pov.product_id, pov.product_option_id, pov.product_option_value_id") as $r)
          $ov[$r['product_id']][] = array('product_option_value_id' => (int)$r['product_option_value_id'], 'option_name' => hb_txt($r['option_name']), 'name' => hb_txt($r['name']),
            'quantity' => (int)$r['quantity'], 'subtract' => (int)$r['subtract'], 'price' => (float)$r['price'], 'price_prefix' => $r['price_prefix'] === '-' ? '-' : '+');
        foreach (hb_rows('SELECT product_id, image FROM ' . hb_t('product_image') . " WHERE product_id IN ($in_) ORDER BY product_id, sort_order") as $r)
          if (!isset($imgs[$r['product_id']]) || count($imgs[$r['product_id']]) < 10) $imgs[$r['product_id']][] = $img($r['image']);
      }
      $out = array();
      foreach ($list as $p) {
        $out[] = array('product_id' => (int)$p['product_id'], 'model' => hb_txt($p['model']), 'sku' => hb_txt($p['sku']), 'ean' => hb_txt($p['ean']), 'upc' => hb_txt($p['upc']), 'mpn' => hb_txt($p['mpn']),
          'name' => hb_txt($p['name']), 'quantity' => (int)$p['quantity'], 'subtract' => (int)$p['subtract'], 'price' => (float)$p['price'], 'special' => $p['special'] === null ? null : (float)$p['special'],
          'status' => (int)$p['status'], 'image' => $img($p['image']), 'images' => isset($imgs[$p['product_id']]) ? $imgs[$p['product_id']] : array(),
          'options' => isset($ov[$p['product_id']]) ? $ov[$p['product_id']] : array());
      }
      hb_out(array('ok' => true, 'products' => $out, 'more' => count($list) === $limit));

    // ---------- stok: ürün ya da seçenek değeri adedi ----------
    // Seçenek adedi değişen ürünün ana adedi de güncellenir (seçenek başına toplamların en büyüğü): OpenCart sepette ana adedi de denetler
    case 'stock':
      $items = is_array(hb_in($in, 'items')) ? array_slice($in['items'], 0, 1000) : array();
      $updated = 0; $errors = array(); $touched = array();
      foreach ($items as $it) {
        $pid = (int)hb_in($it, 'product_id', 0); $ovid = (int)hb_in($it, 'option_value_id', 0); $qty = max(0, min(2000000000, (int)hb_in($it, 'quantity', 0)));
        if ($pid <= 0) { $errors[] = array('product_id' => $pid, 'message' => 'ürün numarası yok'); continue; }
        $n = $ovid > 0 ? hb_exec('UPDATE ' . hb_t('product_option_value') . ' SET quantity = ? WHERE product_option_value_id = ? AND product_id = ?', 'iii', array($qty, $ovid, $pid))
          : hb_exec('UPDATE ' . hb_t('product') . ' SET quantity = ?, date_modified = NOW() WHERE product_id = ?', 'ii', array($qty, $pid));
        if ($n < 1) { $errors[] = array('product_id' => $pid, 'option_value_id' => $ovid, 'message' => $ovid ? 'seçenek bulunamadı' : 'ürün bulunamadı'); continue; }
        $updated++; if ($ovid > 0) $touched[$pid] = $pid;
      }
      foreach ($touched as $pid) {
        $r = hb_rows('SELECT MAX(s) AS q FROM (SELECT SUM(quantity) AS s FROM ' . hb_t('product_option_value') . ' WHERE product_id = ' . (int)$pid . ' GROUP BY product_option_id) x');
        if ($r && $r[0]['q'] !== null) hb_exec('UPDATE ' . hb_t('product') . ' SET quantity = ?, date_modified = NOW() WHERE product_id = ?', 'ii', array(max(0, (int)$r[0]['q']), $pid));
      }
      hb_out(array('ok' => true, 'updated' => $updated, 'errors' => $errors));

    // ---------- fiyat: ana fiyat + (varsa) indirimli fiyat ----------
    // Seçenek fiyatı OpenCart'ta ana fiyata eklenen farktır: seçenek kalemlerinden ana fiyat geri hesaplanır (fiyat − fark);
    // aynı ürünün seçenekleri farklı ana fiyat gerektiriyorsa (farklar panelle uyuşmuyor) o ürün güncellenmez, hata döner.
    // İndirimli fiyat varsayılan müşteri grubunda, öncelik 1, bitişi 9999-12-31 olan kendi satırımızla tutulur; diğer satırlara dokunulmaz.
    case 'price':
      $items = is_array(hb_in($in, 'items')) ? array_slice($in['items'], 0, 1000) : array();
      $updated = 0; $errors = array(); $want = array();
      foreach ($items as $it) {
        $pid = (int)hb_in($it, 'product_id', 0); $ovid = (int)hb_in($it, 'option_value_id', 0);
        $price = round((float)hb_in($it, 'price', 0), 4); $sp = round((float)hb_in($it, 'special', 0), 4);
        if ($pid <= 0 || $price <= 0) { $errors[] = array('product_id' => $pid, 'option_value_id' => $ovid, 'message' => 'ürün numarası ya da fiyat geçersiz'); continue; }
        if ($ovid > 0) {
          $r = hb_rows('SELECT price, price_prefix FROM ' . hb_t('product_option_value') . " WHERE product_option_value_id = $ovid AND product_id = $pid");
          if (!$r) { $errors[] = array('product_id' => $pid, 'option_value_id' => $ovid, 'message' => 'seçenek bulunamadı'); continue; }
          $d = ($r[0]['price_prefix'] === '-' ? -1 : 1) * (float)$r[0]['price'];
          $price = round($price - $d, 4); $sp = $sp > 0 ? round($sp - $d, 4) : 0;
          if ($price <= 0) { $errors[] = array('product_id' => $pid, 'option_value_id' => $ovid, 'message' => 'seçenek farkı fiyattan büyük'); continue; }
        }
        $want[$pid][] = array($price, $sp > 0 && $sp < $price ? $sp : 0, $ovid);
      }
      $hasSpecial = hb_table('product_special');
      foreach ($want as $pid => $list) {
        list($price, $sp) = $list[0];
        foreach ($list as $w) if (abs($w[0] - $price) > 0.005 || abs($w[1] - $sp) > 0.005) { $errors[] = array('product_id' => $pid, 'message' => 'seçenek fiyatları ana fiyatla uyuşmuyor (OpenCart\'ta seçenek fiyatı fark olarak tutulur; farkları OpenCart\'ta düzenleyin)'); continue 2; }
        if (!$hasSpecial && $sp > 0) { $price = $sp; $sp = 0; } // indirimli fiyat tablosu yok: satış fiyatı ana fiyat olur
        if (hb_exec('UPDATE ' . hb_t('product') . ' SET price = ?, date_modified = NOW() WHERE product_id = ?', 'di', array($price, $pid)) < 1) { $errors[] = array('product_id' => $pid, 'message' => 'ürün bulunamadı'); continue; }
        if ($hasSpecial) {
          $mine = hb_rows('SELECT product_special_id FROM ' . hb_t('product_special') . " WHERE product_id = $pid AND customer_group_id = $CG AND date_end = '" . HASTURK_SPECIAL_END . "' ORDER BY product_special_id");
          if ($sp > 0) {
            if ($mine) hb_exec('UPDATE ' . hb_t('product_special') . " SET price = ?, priority = 1, date_start = '2000-01-01' WHERE product_special_id = ?", 'di', array($sp, (int)$mine[0]['product_special_id']));
            else hb_exec('INSERT INTO ' . hb_t('product_special') . " (product_id, customer_group_id, priority, price, date_start, date_end) VALUES (?, ?, 1, ?, '2000-01-01', '" . HASTURK_SPECIAL_END . "')", 'iid', array($pid, $CG, $sp));
            array_shift($mine);
          }
          if ($mine) { $del = array(); foreach ($mine as $m) $del[] = $m['product_special_id']; $GLOBALS['hb_db']->query('DELETE FROM ' . hb_t('product_special') . ' WHERE product_special_id IN (' . hb_ids($del) . ')'); }
        }
        $updated++;
      }
      hb_out(array('ok' => true, 'updated' => $updated, 'errors' => $errors, 'special' => $hasSpecial));

    // ---------- kargoya verme: sipariş geçmişine not + durum ----------
    // notify = 1: not müşterinin "Sipariş geçmişi" sayfasında görünür. OpenCart olayları çalışmadığından e-posta gönderilmez.
    // keep_status: siparişin başka açık paketi varsa yalnız not eklenir, durum değişmez.
    case 'ship':
      $oid = (int)hb_in($in, 'order_id', 0);
      if ($oid <= 0) hb_fail('Sipariş numarası yok');
      $o = hb_rows('SELECT order_id, order_status_id FROM ' . hb_t('order') . " WHERE order_id = $oid");
      if (!$o) hb_fail('Sipariş bulunamadı', 404);
      $sid = (int)hb_in($in, 'order_status_id', 0);
      if (hb_in($in, 'keep_status')) $sid = (int)$o[0]['order_status_id'];
      elseif ($sid > 0) { if (!hb_rows('SELECT order_status_id FROM ' . hb_t('order_status') . " WHERE order_status_id = $sid LIMIT 1")) hb_fail('Sipariş durumu bulunamadı: ' . $sid); }
      else { $s = $shipStatus(); if (!$s) hb_fail('"Kargoya verildi" sipariş durumu bulunamadı: paneldeki gelişmiş ayarlardan durum numarasını girin'); $sid = $s['order_status_id']; }
      $comment = trim((string)hb_in($in, 'comment', '')); $comment = function_exists('mb_substr') ? mb_substr($comment, 0, 1000, 'UTF-8') : substr($comment, 0, 1000);
      $comment = htmlspecialchars($comment, ENT_COMPAT, 'UTF-8'); // OpenCart notları kaçışlı saklar
      $notify = hb_in($in, 'notify') ? 1 : 0;
      hb_exec('INSERT INTO ' . hb_t('order_history') . ' (order_id, order_status_id, notify, comment, date_added) VALUES (?, ?, ?, ?, NOW())', 'iiis', array($oid, $sid, $notify, $comment));
      hb_exec('UPDATE ' . hb_t('order') . ' SET order_status_id = ?, date_modified = NOW() WHERE order_id = ?', 'ii', array($sid, $oid));
      hb_out(array('ok' => true, 'order_status_id' => $sid));
  }
} catch (Throwable $e) {
  error_log('hasturk-baglanti: ' . $action . ': ' . $e->getMessage());
  hb_fail('OpenCart veritabanı işlemi başarısız (ayrıntı sunucu hata günlüğünde)', 500);
}
