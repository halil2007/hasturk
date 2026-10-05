<?php
// Hastürk CRM — Hepsiburada aracı sunucusu
// Hepsiburada bazı servislerde (sipariş, listeleme) panelin çalıştığı Cloudflare sunucularından gelen istekleri 520 hatasıyla kapatıyor.
// Bu dosyayı kendi hostinginize (cPanel → Dosya Yöneticisi → public_html) yükleyin; panel Hepsiburada isteklerini buradan geçirir.
//
// KURULUM
//  1) Aşağıdaki $KEY değerini uzun, rastgele bir metinle değiştirin (en az 24 karakter; harf + rakam).
//  2) Dosyayı public_html klasörüne "hb-proxy.php" adıyla yükleyin. Adresi: https://alanadiniz.com/hb-proxy.php
//  3) Panel → Entegrasyonlar → Hepsiburada → Gelişmiş ayarlar:
//       "Aracı sunucu adresi"   = https://alanadiniz.com/hb-proxy.php
//       "Aracı sunucu anahtarı" = $KEY ile birebir aynı metin
//     Kaydet → Bağlantıyı test et.
//
// GÜVENLİK: Yalnız https://*.hepsiburada.com adreslerine iletir; doğru anahtar olmadan çalışmaz. Hiçbir şeyi kaydetmez.

$KEY = 'BURAYA-UZUN-RASTGELE-BIR-ANAHTAR-YAZIN';

header('Cache-Control: no-store');
if ($KEY === 'BURAYA-UZUN-RASTGELE-BIR-ANAHTAR-YAZIN' || strlen($KEY) < 24) { http_response_code(500); exit('hb-proxy.php: $KEY degerini degistirin (en az 24 karakter).'); }
$given = isset($_SERVER['HTTP_X_PROXY_KEY']) ? $_SERVER['HTTP_X_PROXY_KEY'] : '';
if (!hash_equals($KEY, $given)) { http_response_code(403); exit('yetkisiz'); }
if (!function_exists('curl_init')) { http_response_code(500); exit('hb-proxy.php: hostingde PHP curl eklentisi kapali.'); }

$u = isset($_GET['u']) ? $_GET['u'] : '';
$host = parse_url($u, PHP_URL_HOST);
if (parse_url($u, PHP_URL_SCHEME) !== 'https' || !$host || !preg_match('/(^|\.)hepsiburada\.com$/i', $host)) { http_response_code(400); exit('izin verilmeyen adres'); }

// İletilecek başlıklar: kimlik, entegratör adı (User-Agent), içerik türü
$fwd = array();
$ua = '';
foreach ($_SERVER as $k => $v) {
  if ($k === 'HTTP_AUTHORIZATION') $fwd[] = 'Authorization: ' . $v;
  elseif ($k === 'HTTP_ACCEPT') $fwd[] = 'Accept: ' . $v;
  elseif ($k === 'HTTP_USER_AGENT') $ua = $v;
}
if (!isset($_SERVER['HTTP_AUTHORIZATION']) && function_exists('getallheaders')) {
  foreach (getallheaders() as $k => $v) if (strtolower($k) === 'authorization') $fwd[] = 'Authorization: ' . $v;
}
$ct = isset($_SERVER['HTTP_X_CONTENT_TYPE']) ? $_SERVER['HTTP_X_CONTENT_TYPE'] : (isset($_SERVER['CONTENT_TYPE']) ? $_SERVER['CONTENT_TYPE'] : '');
if ($ct !== '') $fwd[] = 'Content-Type: ' . $ct;

$method = $_SERVER['REQUEST_METHOD'];
$body = file_get_contents('php://input');

$ch = curl_init($u);
curl_setopt_array($ch, array(
  CURLOPT_CUSTOMREQUEST => $method,
  CURLOPT_HTTPHEADER => $fwd,
  CURLOPT_USERAGENT => $ua,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HEADER => true,
  CURLOPT_CONNECTTIMEOUT => 15,
  CURLOPT_TIMEOUT => 90,
));
if ($method !== 'GET' && $body !== '' && $body !== false) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
$resp = curl_exec($ch);
if ($resp === false) { http_response_code(502); exit('hb-proxy: Hepsiburada baglanti hatasi: ' . curl_error($ch)); }
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$hs = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$rct = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
curl_close($ch);
http_response_code($code);
if ($rct) header('Content-Type: ' . $rct);
echo substr($resp, $hs);
