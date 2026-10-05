<?php
// Hastürk CRM — panelinizi kendi alt alan adınızdan açmak için (ör. https://crm.hasturkgubre.com.tr)
// Alan adınızın DNS'ini Cloudflare'e taşımadan çalışır: hostinginizdeki alt alan adı, gelen her isteği panele iletir.
//
// KURULUM (cPanel)
//  1) cPanel → Alan Adları (Domains / Subdomains) → "crm" alt alan adını oluşturun. Belge kökü (Document Root) ör. public_html/crm
//  2) Alan adı DNS panelinde: Tür A, İsim crm, Değer = hostinginizin IP adresi (cPanel ana sayfasında "Paylaşılan IP" yazar).
//     DNS'iniz zaten hostingdeyse bu kayıt kendiliğinden oluşur.
//  3) Bu dosyayı o klasöre "index.php" adıyla yükleyin. (.htaccess dosyasını ilk açılışta kendisi oluşturur.)
//  4) cPanel → SSL/TLS Status → crm alt alan adı için "Run AutoSSL" (ücretsiz sertifika). Sonra https://crm.alanadiniz.com.tr açın.
//
// Panelde Ayarlar → Panel adresi bu alt alan adına kendiliğinden geçer (yönetici ilk girişte).

$PANEL = 'https://hasturk-panel.HESABINIZ.workers.dev';   // Panelin Cloudflare adresi (sonunda / olmadan)

@set_time_limit(150);
header('X-Robots-Tag: noindex, nofollow');
if (strpos($PANEL, 'HESABINIZ') !== false || !preg_match('#^https://[a-z0-9.-]+$#i', $PANEL)) { http_response_code(500); exit('panel-proxy: $PANEL adresini panelin workers.dev adresiyle değiştirin.'); }
if (!function_exists('curl_init')) { http_response_code(500); exit('panel-proxy: hostingde PHP curl eklentisi kapali.'); }

// Tüm adresleri bu dosyaya yönlendiren .htaccess (yoksa oluştur)
$ht = __DIR__ . '/.htaccess';
if (!file_exists($ht)) @file_put_contents($ht, "# Hastürk CRM: tüm istekler index.php'ye\nDirectoryIndex index.php\nRewriteEngine On\nRewriteCond %{REQUEST_URI} !^/index\\.php\$\nRewriteRule ^ index.php [L]\n");

$host = isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '';
$uri = isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '/';
if ($uri === '/index.php' || strpos($uri, '/index.php?') === 0) $uri = '/' . substr($uri, 10);
$method = $_SERVER['REQUEST_METHOD'];

// Panel oturumu yalnız https'te çalışır
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && stripos($_SERVER['HTTP_X_FORWARDED_PROTO'], 'https') !== false) || (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443);
if (!$https && $method === 'GET') { header('Location: https://' . $host . $uri, true, 301); exit; }

// Başka sitelerden gelen yazma isteklerini reddet (panel de aynı kontrolü yapar; Origin panele iletilmez)
if ($method !== 'GET' && $method !== 'HEAD' && !empty($_SERVER['HTTP_ORIGIN'])) {
  if (strcasecmp((string) parse_url($_SERVER['HTTP_ORIGIN'], PHP_URL_HOST), preg_replace('/:\d+$/', '', $host)) !== 0) { http_response_code(403); header('Content-Type: application/json'); exit('{"error":"İzin verilmeyen kaynak"}'); }
}

$fwd = array('X-Forwarded-Host: ' . $host, 'X-Forwarded-Proto: https');
$map = array('HTTP_COOKIE' => 'Cookie', 'CONTENT_TYPE' => 'Content-Type', 'HTTP_ACCEPT' => 'Accept', 'HTTP_ACCEPT_LANGUAGE' => 'Accept-Language',
  'HTTP_IF_NONE_MATCH' => 'If-None-Match', 'HTTP_IF_MODIFIED_SINCE' => 'If-Modified-Since', 'HTTP_USER_AGENT' => 'User-Agent');
foreach ($map as $k => $h) if (isset($_SERVER[$k]) && $_SERVER[$k] !== '') $fwd[] = $h . ': ' . $_SERVER[$k];
if (!empty($_SERVER['REMOTE_ADDR'])) $fwd[] = 'X-Forwarded-For: ' . $_SERVER['REMOTE_ADDR'];

$out = array();
$skip = '/^(connection|keep-alive|transfer-encoding|content-encoding|content-length|server|alt-svc|nel|report-to|cf-[a-z-]+|x-forwarded-[a-z-]+):/i';
$ch = curl_init($PANEL . $uri);
curl_setopt_array($ch, array(
  CURLOPT_CUSTOMREQUEST => $method,
  CURLOPT_HTTPHEADER => $fwd,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_FOLLOWLOCATION => false,
  CURLOPT_ENCODING => '',
  CURLOPT_CONNECTTIMEOUT => 15,
  CURLOPT_TIMEOUT => 140,
  CURLOPT_HEADERFUNCTION => function ($c, $line) use (&$out, $skip) {
    $t = trim($line);
    if (preg_match('#^HTTP/\S+\s+\d+#', $t)) $out = array();   // ara yanıtlar (100 Continue) atlanır
    elseif ($t !== '' && strpos($t, ':') !== false && !preg_match($skip, $t)) $out[] = $t;
    return strlen($line);
  },
));
if ($method !== 'GET' && $method !== 'HEAD') {
  $body = file_get_contents('php://input');
  curl_setopt($ch, CURLOPT_POSTFIELDS, $body === false ? '' : $body);
}
$resp = curl_exec($ch);
if ($resp === false) { http_response_code(502); header('Content-Type: text/plain; charset=utf-8'); exit('Panele ulaşılamadı: ' . curl_error($ch)); }
$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

http_response_code($code);
$base = parse_url($PANEL, PHP_URL_HOST);
foreach ($out as $h) {
  if (stripos($h, 'location:') === 0) $h = str_ireplace('://' . $base, '://' . $host, $h);
  header($h, false);
}
if ($method !== 'HEAD') echo $resp;
