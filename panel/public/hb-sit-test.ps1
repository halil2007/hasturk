# Hepsiburada test ortamı (SIT) canlıya geçiş testi — Hastürk CRM
# Bu araç Hepsiburada'nın istediği üç test adımını KENDİ BİLGİSAYARINIZIN internet bağlantısından yapar
# (panelin çalıştığı Cloudflare sunucularından Hepsiburada test servisleri 520 hatası veriyor).
#   1) Ürün gönderme (katalog)            → trackingId
#   2) Envanterdeki üründe stok + fiyat   → yükleme kimlikleri
#   3) Test siparişi → API ile listeleme → paketleme → paket numarası
# Sonuç özeti ekrana yazılır, panoya kopyalanır ve Masaüstü'ne "hepsiburada-test-sonuc.txt" olarak kaydedilir.
# Merchant ID, servis anahtarı ve entegratör adı yalnızca bu pencerede kullanılır; hiçbir yere kaydedilmez.
#
# Çalıştırma: dosyaya sağ tıklayın → "PowerShell ile çalıştır".
# Açılmazsa: Başlat → "PowerShell" → şunu yazın:  powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\hb-sit-test.ps1"

$ErrorActionPreference = 'Stop'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}

$OMS  = 'https://oms-external-sit.hepsiburada.com'
$LST  = 'https://listing-external-sit.hepsiburada.com'
$CAT  = 'https://mpop-sit.hepsiburada.com/product'
$STUB = 'https://oms-stub-external-sit.hepsiburada.com'

function Title($t) { Write-Host ''; Write-Host "=== $t ===" -ForegroundColor Cyan }
function Ok($t)    { Write-Host "  ✓ $t" -ForegroundColor Green }
function Bad($t)   { Write-Host "  ✗ $t" -ForegroundColor Red }
function Info($t)  { Write-Host "  $t" }

Write-Host 'Hepsiburada test ortamı (SIT) — canlıya geçiş test adımları' -ForegroundColor Yellow
Write-Host 'Bilgiler Hepsiburada''nın test ortamı e-postasındaki değerlerdir (Merchant Portal test hesabı).'
$m = (Read-Host 'Merchant ID').Trim()
$sec = Read-Host 'Servis anahtarı (Secret key)' -AsSecureString
$key = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)).Trim()
$ua = (Read-Host 'Entegratör adı (User-Agent, ör. hasturkgubre_dev)').Trim()
if (-not $m -or -not $key -or -not $ua) { Bad 'Üç bilgi de gerekli.'; Read-Host 'Kapatmak için Enter'; exit 1 }
$auth = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("${m}:${key}"))

function ErrText($e) {
  $code = ''
  try { if ($e.Exception.Response) { $code = 'HTTP ' + [int]$e.Exception.Response.StatusCode } } catch {}
  $body = ''
  if ($e.ErrorDetails -and $e.ErrorDetails.Message) { $body = $e.ErrorDetails.Message }
  else { try { $sr = New-Object IO.StreamReader($e.Exception.Response.GetResponseStream()); $body = $sr.ReadToEnd() } catch {} }
  if (-not $code -and -not $body) { return $e.Exception.Message }
  return ("$code $body").Trim().Substring(0, [Math]::Min(600, ("$code $body").Trim().Length))
}
function Call($method, $url, $body) {
  $p = @{ Method = $method; Uri = $url; Headers = @{ Authorization = $auth; Accept = 'application/json' }; UserAgent = $ua; TimeoutSec = 90 }
  if ($null -ne $body) {
    $p.Body = [Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -InputObject $body -Depth 20 -Compress))
    $p.ContentType = 'application/json; charset=utf-8'
  }
  Invoke-RestMethod @p
}
function Rows($r, [string[]]$keys) {
  if ($null -eq $r) { return @() }
  if ($r -is [array]) { return $r }
  foreach ($k in $keys) { if ($r.PSObject.Properties[$k] -and $r.$k) { if ($r.$k -is [array]) { return $r.$k } ; if ($r.$k.PSObject.Properties['items']) { return @($r.$k.items) } } }
  return @()
}
function Pick($o, [string[]]$keys) { foreach ($k in $keys) { if ($o -and $o.PSObject.Properties[$k] -and $null -ne $o.$k -and "$($o.$k)" -ne '') { return $o.$k } } ; return $null }

$res = [ordered]@{ trackingId = '-'; stockUploadId = '-'; priceUploadId = '-'; listing = '-'; testOrder = '-'; packageNumber = '-' }

# ---------- 0) Bağlantı ----------
Title '0) Bağlantı kontrolü'
foreach ($t in @(@('Sipariş servisi (OMS)', "$OMS/orders/merchantId/${m}?offset=0&limit=1"), @('Listeleme servisi', "$LST/listings/merchantid/${m}?offset=0&limit=1"), @('Katalog servisi', "$CAT/api/categories/get-all-categories?leaf=true&status=ACTIVE&available=true&page=0&size=1&version=1"))) {
  try { $null = Call 'GET' $t[1] $null; Ok "$($t[0]): erişildi" } catch { Bad "$($t[0]): $(ErrText $_)" }
}

# ---------- 1) Ürün gönderme ----------
Title '1) Ürün entegrasyonu (katalog) → trackingId'
try {
  $term = (Read-Host 'Kategori arama kelimesi (Enter: gübre)').Trim(); if (-not $term) { $term = 'gübre' }
  $found = @()
  for ($pg = 0; $pg -lt 20 -and $found.Count -lt 15; $pg++) {
    $r = Call 'GET' "$CAT/api/categories/get-all-categories?leaf=true&status=ACTIVE&available=true&page=$pg&size=2000&version=1" $null
    $rows = Rows $r @('data', 'items', 'content')
    $found += @($rows | Where-Object { "$($_.name) $($_.paths -join ' ')" -like "*$term*" })
    if ($rows.Count -lt 2000) { break }
  }
  if (-not $found.Count) { throw "[$term] içeren kategori bulunamadı; başka bir kelimeyle tekrar çalıştırın." }
  $found = @($found | Select-Object -First 15)
  for ($i = 0; $i -lt $found.Count; $i++) { Info ("{0,2}) {1}  [{2}]  {3}" -f ($i + 1), $found[$i].name, $found[$i].categoryId, ($found[$i].paths -join ' › ')) }
  $sel = Read-Host 'Kategori numarası (Enter: 1)'; if (-not $sel) { $sel = 1 }
  $chosen = $found[[int]$sel - 1]; $cid = $chosen.categoryId
  Ok "Kategori: $($chosen.name) ($cid)"
  $ar = Call 'GET' "$CAT/api/categories/$cid/attributes" $null
  $d = if ($ar.data) { $ar.data } else { $ar }
  $all = @($d.baseAttributes) + @($d.attributes) + @($d.variantAttributes) | Where-Object { $_ }
  $ts = Get-Date -Format 'yyMMddHHmmss'
  $brand = (Read-Host 'Marka (Enter: Hastürk)').Trim(); if (-not $brand) { $brand = 'Hastürk' }
  $img = (Read-Host 'Ürün görseli adresi (Enter: panel logosu)').Trim(); if (-not $img) { $img = 'https://hasturk-panel.halilc2007.workers.dev/logo.webp' }
  $a = [ordered]@{
    merchantSku = "HASTURK-TEST-$ts"; VaryantGroupID = "HASTURK-TEST-$ts"; Barcode = ('869' + (Get-Random -Minimum 1000000000 -Maximum 9999999999)); UrunAdi = "Hastürk Test Ürünü $ts"
    UrunAciklamasi = 'Hastürk CRM entegrasyon testi için oluşturulmuş test ürünüdür.'; Marka = $brand; GarantiSuresi = '0'; kg = '1'; tax_vat_rate = '20'
    price = '100,00'; stock = '10'; Image1 = $img
  }
  foreach ($at in $all) {
    if (-not $at.mandatory -or $a.Contains([string]$at.id)) { continue }
    $val = 'Test'
    if ("$($at.type)" -match 'enum|list|select') {
      try { $vr = Call 'GET' "$CAT/api/categories/$cid/attribute/$($at.id)/values?page=0&size=50" $null; $v = @(Rows $vr @('data', 'items', 'content'))[0]; if ($v) { $val = Pick $v @('value', 'name') } } catch {}
    }
    $a[[string]$at.id] = "$val"; Info "Zorunlu özellik: $($at.name) = $val"
  }
  $prod = @(@{ categoryId = [long]$cid; merchant = $m; attributes = $a })
  $r = Call 'POST' "$CAT/api/products/import" $prod
  $tid = Pick $r.data @('trackingId'); if (-not $tid) { $tid = Pick $r @('trackingId', 'id') }
  if (-not $tid) { throw ('trackingId dönmedi: ' + (ConvertTo-Json $r -Depth 5 -Compress)) }
  $res.trackingId = "$tid"; Ok "Ürün gönderildi · trackingId: $tid"
  Start-Sleep -Seconds 5
  try { $st = Call 'GET' "$CAT/api/products/status/${tid}?page=0&size=50&version=1" $null; Info ('Durum: ' + (ConvertTo-Json $st -Depth 6 -Compress).Substring(0, [Math]::Min(500, (ConvertTo-Json $st -Depth 6 -Compress).Length))) } catch { Info "Durum sorgulanamadı: $(ErrText $_)" }
} catch { Bad (ErrText $_) }

# ---------- 2) Stok + fiyat ----------
Title '2) Listeleme: envanterdeki üründe stok ve fiyat'
$listing = $null
try {
  $r = Call 'GET' "$LST/listings/merchantid/${m}?offset=0&limit=20" $null
  $ls = @(Rows $r @('listings', 'items', 'data'))
  if (-not $ls.Count) { throw 'Test hesabınızda envanter (ilan) yok. Hepsiburada''dan test envanteri yüklemesini isteyin.' }
  for ($i = 0; $i -lt [Math]::Min(10, $ls.Count); $i++) { Info ("{0,2}) {1} · HB SKU {2} · satıcı SKU {3} · fiyat {4} · stok {5}" -f ($i + 1), $ls[$i].productName, $ls[$i].hepsiburadaSku, $ls[$i].merchantSku, $ls[$i].price, $ls[$i].availableStock) }
  $sel = Read-Host 'Ürün numarası (Enter: 1)'; if (-not $sel) { $sel = 1 }
  $listing = $ls[[int]$sel - 1]
  $price = if ([double]$listing.price -gt 0) { [double]$listing.price } else { 100 }
  $res.listing = "$($listing.hepsiburadaSku) / $($listing.merchantSku)"
  $s = Call 'POST' "$LST/listings/merchantid/${m}/stock-uploads" @(@{ hepsiburadaSku = $listing.hepsiburadaSku; merchantSku = $listing.merchantSku; availableStock = 15 })
  $res.stockUploadId = "$(Pick $s @('id'))"; Ok "Stok gönderildi (15) · yükleme id: $($res.stockUploadId)"
  $p = Call 'POST' "$LST/listings/merchantid/${m}/price-uploads" @(@{ hepsiburadaSku = $listing.hepsiburadaSku; merchantSku = $listing.merchantSku; price = $price })
  $res.priceUploadId = "$(Pick $p @('id'))"; Ok "Fiyat gönderildi ($price) · yükleme id: $($res.priceUploadId)"
  Start-Sleep -Seconds 5
  foreach ($k in @(@('stock', $res.stockUploadId), @('price', $res.priceUploadId))) {
    try { $st = Call 'GET' "$LST/listings/merchantid/${m}/$($k[0])-uploads/id/$($k[1])" $null; Info ("$($k[0]) durumu: " + (ConvertTo-Json $st -Depth 5 -Compress).Substring(0, [Math]::Min(300, (ConvertTo-Json $st -Depth 5 -Compress).Length))) } catch { Info "$($k[0]) durumu sorgulanamadı: $(ErrText $_)" }
  }
} catch { Bad (ErrText $_) }

# ---------- 3) Test siparişi → listeleme → paketleme ----------
Title '3) Sipariş entegrasyonu: test siparişi → listeleme → paketleme'
try {
  if (-not $listing) { throw '2. adımda envanterden ürün seçilemediği için test siparişi oluşturulamadı.' }
  $no = '9' + (Get-Date -Format 'yyMMddHHmm')
  $price = if ([double]$listing.price -gt 0) { [double]$listing.price } else { 100 }
  $body = [ordered]@{
    OrderNumber = $no; OrderDate = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
    Customer = @{ CustomerId = [guid]::NewGuid().ToString(); Name = 'Test Müşteri' }
    DeliveryAddress = @{ AddressId = [guid]::NewGuid().ToString(); Name = 'Test Müşteri'; AddressDetail = 'Test Mahallesi Deneme Sokak No:1'; Email = 'test@example.com'; CountryCode = 'TR'; PhoneNumber = '05555555555'; AlternatePhoneNumber = ''; Town = 'Kadıköy'; District = 'Caferağa'; City = 'İstanbul' }
    LineItems = @(@{ Sku = $listing.hepsiburadaSku; MerchantId = $m; Quantity = 1; Price = @{ Amount = $price; Currency = 'TRY' }; Vat = 0; TotalPrice = @{ Amount = $price; Currency = 'TRY' }; CargoCompanyId = 89100; DeliveryOptionId = 1 })
  }
  $null = Call 'POST' "$STUB/orders/merchantId/$m" $body
  $res.testOrder = $no; Ok "Test siparişi oluşturuldu · $no"
  $lines = @()
  for ($t = 0; $t -lt 9 -and -not $lines.Count; $t++) {
    Start-Sleep -Seconds 10
    $r = Call 'GET' "$OMS/orders/merchantId/${m}?offset=0&limit=100" $null
    $lines = @(Rows $r @('items', 'data') | Where-Object { "$(Pick $_ @('orderNumber', 'OrderNumber'))" -eq $no })
    Info "Sipariş API'de aranıyor… ($($t + 1)/9)"
  }
  if (-not $lines.Count) { throw "Sipariş $no açık satırlarda görünmedi (Hepsiburada test servisi geç işliyor olabilir; birkaç dakika sonra aracı tekrar çalıştırın)." }
  Ok "Sipariş API ile listelendi · $($lines.Count) satır"
  $req = @($lines | ForEach-Object { @{ id = (Pick $_ @('id', 'lineItemId')); quantity = [int](Pick $_ @('quantity')) } })
  $pk = Call 'POST' "$OMS/packages/merchantId/$m" @{ lineItemRequests = $req; parcelQuantity = 1; deci = 1 }
  $x = if ($pk -is [array]) { $pk[0] } else { $pk }
  $res.packageNumber = "$(Pick $x @('packageNumber', 'PackageNumber', 'id'))"
  Ok "Paketlendi · paket no: $($res.packageNumber)"
} catch { Bad (ErrText $_) }

# ---------- Özet ----------
$sum = @"
Merchant ID: $m
1) Ürün entegrasyonu – trackingId: $($res.trackingId)
2) Listeleme – ürün $($res.listing) · stok yükleme id: $($res.stockUploadId) · fiyat yükleme id: $($res.priceUploadId)
3) Sipariş – test siparişi: $($res.testOrder) · API ile listelendi ve paketlendi, paket no: $($res.packageNumber)
"@
Title 'Hepsiburada''ya iletilecek özet'
Write-Host $sum
try { Set-Clipboard -Value $sum; Ok 'Özet panoya kopyalandı' } catch {}
try { $f = Join-Path ([Environment]::GetFolderPath('Desktop')) 'hepsiburada-test-sonuc.txt'; Set-Content -Path $f -Value $sum -Encoding UTF8; Ok "Masaüstüne kaydedildi: $f" } catch {}
Write-Host ''
Read-Host 'Kapatmak için Enter'
