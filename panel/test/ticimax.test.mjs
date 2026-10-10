// Ticimax bağlantısı (SOAP web servisleri): ağa çıkmadan örnek SOAP yanıtlarıyla istek zarfı, alan sırası, normalleştirme, stok / fiyat / kargo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ticimax, ticimaxStatus, tmxDate, tmxParse, xmlTree, find, kids, txt } from '../src/channels/ticimax.js';

const ENV = { TICIMAX_URL: 'https://www.magaza.com/UyeGiris', TICIMAX_KEY: 'WSKOD123' };
const env = (inner, op) => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><${op}Response xmlns="http://tempuri.org/"><${op}Result xmlns:a="http://schemas.datacontract.org/2004/07/" xmlns:i="http://www.w3.org/2001/XMLSchema-instance">${inner}</${op}Result></${op}Response></s:Body></s:Envelope>`;

function mockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const c = { url: String(url), method: opts.method || 'GET', headers: opts.headers || {}, body: String(opts.body || '') };
    c.action = String(c.headers.SOAPAction || '').replace(/"/g, '');
    c.op = c.action.split('/').pop();
    calls.push(c);
    const r = await handler(c);
    const status = r && r.status ? r.status : 200, text = r && r.body != null ? r.body : String(r ?? '');
    return new Response(text, { status, headers: { 'Content-Type': 'text/xml; charset=utf-8' } });
  };
  return calls;
}
const urun = (id, durum = 'Onaylandı') => `<a:WebSiparisUrun><a:Adet>2</a:Adet><a:Barkod>8690001${id}</a:Barkod><a:DurumAd>${durum}</a:DurumAd><a:ID>${id}</a:ID><a:KdvTutari>20</a:KdvTutari><a:ResimYolu>https://static.magaza.com/u${id}.jpg</a:ResimYolu><a:StokKodu>TS-${id}</a:StokKodu><a:Tutar>100</a:Tutar><a:UrunAdi>Tişört M</a:UrunAdi><a:UrunID>5${id}</a:UrunID></a:WebSiparisUrun>`;
const siparis = (id, durum, extra = '', urunler = urun(1)) => `<a:WebSiparis><a:AdiSoyadi>Ali Veli</a:AdiSoyadi><a:Durum>${durum}</a:Durum><a:DuzenlemeTarihi>2026-10-02T10:00:00</a:DuzenlemeTarihi>
  <a:FaturaAdresi><a:Adres>Fatura adr</a:Adres><a:AliciTelefon>05320000000</a:AliciTelefon><a:Il>İstanbul</a:Il><a:Ilce>Kadıköy</a:Ilce></a:FaturaAdresi>
  <a:ID>${id}</a:ID><a:KargoFirmaTanim>Aras Kargo</a:KargoFirmaTanim><a:KargoTakipNo i:nil="true"/><a:KargoyaSonVerilmeTarihi>2026-10-03T18:00:00</a:KargoyaSonVerilmeTarihi><a:Mail>ali@x.com</a:Mail><a:ParaBirimi>TL</a:ParaBirimi>
  <a:SiparisNo>TM${id}</a:SiparisNo><a:SiparisTarihi>2026-10-01T12:30:00</a:SiparisTarihi><a:SiparisToplamTutari>269.9</a:SiparisToplamTutari>
  <a:TeslimatAdresi><a:Adres>Cumhuriyet Cd. No 5</a:Adres><a:AliciAdi>Ayşe Veli</a:AliciAdi><a:AliciTelefon>05321112233</a:AliciTelefon><a:Il>Bursa</a:Il><a:Ilce>Nilüfer</a:Ilce><a:Mahalle>Fethiye Mah.</a:Mahalle></a:TeslimatAdresi>
  <a:Urunler>${urunler}</a:Urunler><a:UyeID>7</a:UyeID>${extra}</a:WebSiparis>`;

test('Ticimax: adres, eksik bilgiler, durum eşlemesi, tarih biçimi', () => {
  assert.deepEqual(ticimax({}, {}).missing, ['TICIMAX_URL', 'TICIMAX_KEY']);
  assert.deepEqual(ticimax({ TICIMAX_URL: 'http://magaza com' }, {}).missing, ['TICIMAX_URL', 'TICIMAX_KEY']);
  const ch = ticimax(ENV, { id: 'ticimax' });
  assert.equal(ch.enabled, true);
  assert.equal(ch.type, 'ticimax');
  assert.equal(ch.id, 'ticimax');
  assert.deepEqual([ch.caps.ship, ch.caps.accept, ch.caps.manualTracking, ch.caps.label, ch.caps.price, ch.caps.createProduct], ['remote', 'local', true, null, true, false]);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 18, 22, 99].map(ticimaxStatus),
    ['new', 'new', 'new', 'processing', 'processing', 'shipped', 'delivered', 'cancelled', 'returned', 'cancelled', 'delivered', 'returned', 'returned', 'cancelled', 'new', 'shipped', 'returned', 'new']);
  // Türkiye saati, saat dilimi bilgisiz
  assert.equal(tmxDate(Date.parse('2026-10-01T09:30:00Z')), '2026-10-01T12:30:00');
  assert.equal(tmxParse('2026-10-01T12:30:00'), Date.parse('2026-10-01T09:30:00Z'));
  assert.equal(tmxParse('2026-10-01T12:30:00.123+03:00'), Date.parse('2026-10-01T09:30:00.123Z'));
  assert.equal(tmxParse('0001-01-01T00:00:00'), 0);
  // XML okuyucu: önek, nil, CDATA, varlıklar
  const t = xmlTree('<?xml version="1.0"?><x:A><x:B i:nil="true"/><x:C><![CDATA[a<b]]></x:C><x:D>&amp;&lt;&#252;</x:D><x:E><x:F>1</x:F><x:F>2</x:F></x:E></x:A>');
  const a = find(t, 'A');
  assert.deepEqual([txt(a, 'B'), txt(a, 'C'), txt(a, 'D'), kids(find(a, 'E'), 'F').map((x) => x.t)], ['', 'a<b', '&<ü', ['1', '2']]);
});

test('Ticimax: siparişler SOAP zarfı (yetki kodu, alan sırası, -1 filtreleri), sayfalama ve normalleştirme', async () => {
  const calls = mockFetch((c) => {
    if (c.body.includes('<dc:BaslangicIndex>0</dc:BaslangicIndex>')) return env(siparis(1, 4, '', urun(1) + urun(2, 'İptal Edildi')) + Array.from({ length: 99 }, (_, i) => siparis(2000 + i, 2)).join(''), 'SelectSiparis');
    return env(siparis(3, 0) + siparis(4, 6, '<a:KargoTakipNo>AR123</a:KargoTakipNo>') + siparis(5, 3), 'SelectSiparis');
  });
  const since = Date.parse('2026-10-01T00:00:00Z'), until = Date.parse('2026-10-02T00:00:00Z');
  const list = await ticimax(ENV, {}).fetchOrders(since, until);
  assert.equal(calls.length, 2);
  const c = calls[0];
  assert.equal(c.url, 'https://www.magaza.com/Servis/SiparisServis.svc');
  assert.equal(c.method, 'POST');
  assert.equal(c.action, 'http://tempuri.org/ISiparisServis/SelectSiparis');
  assert.match(c.headers['Content-Type'], /text\/xml/);
  assert.match(c.body, /<tem:SelectSiparis><tem:UyeKodu>WSKOD123<\/tem:UyeKodu><tem:f xmlns:dc="http:\/\/schemas\.datacontract\.org\/2004\/07\/">/);
  // WCF alanları ada göre sırayla bekler: sıra korunmalı
  const f = /<tem:f [^>]*>(.*?)<\/tem:f>/.exec(c.body)[1];
  assert.deepEqual([...f.matchAll(/<dc:(\w+)>/g)].map((m) => m[1]),
    ['DuzenlemeTarihiBas', 'DuzenlemeTarihiSon', 'EntegrasyonAktarildi', 'IptalEdilmisUrunler', 'KampanyaGetir', 'KargoFirmaID', 'OdemeDurumu', 'OdemeTipi', 'SiparisDurumu', 'SiparisID', 'TedarikciID', 'UrunGetir', 'UyeID']);
  assert.match(f, /<dc:DuzenlemeTarihiBas>2026-10-01T03:00:00<\/dc:DuzenlemeTarihiBas><dc:DuzenlemeTarihiSon>2026-10-02T03:00:00<\/dc:DuzenlemeTarihiSon><dc:EntegrasyonAktarildi>-1<\/dc:EntegrasyonAktarildi>/);
  assert.match(f, /<dc:SiparisDurumu>-1<\/dc:SiparisDurumu><dc:SiparisID>-1<\/dc:SiparisID>/);
  assert.match(c.body, /<tem:s [^>]*><dc:BaslangicIndex>0<\/dc:BaslangicIndex><dc:KayitSayisi>100<\/dc:KayitSayisi><dc:SiralamaDegeri>ID<\/dc:SiralamaDegeri><dc:SiralamaYonu>ASC<\/dc:SiralamaYonu><\/tem:s>/);
  assert.match(calls[1].body, /<dc:BaslangicIndex>100<\/dc:BaslangicIndex>/);
  // ön sipariş (0) alınmaz
  assert.equal(list.length, 102);
  assert.ok(!list.some((o) => o.remoteId === '3'));
  const o = list[0];
  assert.deepEqual({ remoteId: o.remoteId, orderNumber: o.orderNumber, status: o.status, remoteStatus: o.remoteStatus, total: o.total, currency: o.currency, customer: o.customer, email: o.email, phone: o.phone, customerId: o.customerId, cargoCompany: o.cargoCompany, tracking: o.tracking, orderedAt: o.orderedAt, shipBy: o.shipBy, awaitingPayment: o.awaitingPayment },
    { remoteId: '1', orderNumber: 'TM1', status: 'processing', remoteStatus: 'Paketleniyor', total: 269.9, currency: 'TRY', customer: 'Ali Veli', email: 'ali@x.com', phone: '05321112233', customerId: '7', cargoCompany: 'Aras Kargo', tracking: '', orderedAt: Date.parse('2026-10-01T09:30:00Z'), shipBy: Date.parse('2026-10-03T15:00:00Z'), awaitingPayment: false });
  assert.deepEqual(o.address, { name: 'Ayşe Veli', line: 'Fethiye Mah. Cumhuriyet Cd. No 5', district: 'Nilüfer', city: 'Bursa', phone: '05321112233' });
  assert.deepEqual(o.items[0], { lineId: '1', sku: 'TS-1', barcode: '86900011', name: 'Tişört M', image: 'https://static.magaza.com/u1.jpg', quantity: 2, unitPrice: 120, total: 240, status: '', remoteKey: '51' });
  assert.equal(o.items[1].status, 'cancelled');
  assert.equal(o.packages, null);
  const k = list.find((x) => x.remoteId === '4');
  assert.deepEqual([k.status, k.tracking], ['shipped', 'AR123']);
  assert.deepEqual([list.find((x) => x.remoteId === '5').awaitingPayment, list.find((x) => x.remoteId === '5').status], [true, 'new']);
  // geçmiş aktarımı sipariş tarihine göre
  const calls2 = mockFetch(() => env('', 'SelectSiparis'));
  assert.deepEqual(await ticimax(ENV, {}).fetchOrders(since, until, { byOrdered: true }), []);
  assert.match(calls2[0].body, /<dc:SiparisID>-1<\/dc:SiparisID><dc:SiparisTarihiBas>2026-10-01T03:00:00<\/dc:SiparisTarihiBas><dc:SiparisTarihiSon>2026-10-02T03:00:00<\/dc:SiparisTarihiSon>/);
  assert.doesNotMatch(calls2[0].body, /DuzenlemeTarihi/);
});

test('Ticimax: 5000+ siparişte uyarı ve kısmi imleç; tek sipariş; teslimat adresi yoksa fatura adresi', async () => {
  const full = Array.from({ length: 100 }, (_, i) => siparis(i + 1, 1)).join('');
  mockFetch(() => env(full, 'SelectSiparis'));
  const since = Date.parse('2026-10-01T00:00:00Z');
  const big = await ticimax(ENV, {}).fetchOrders(since, since + 864e5);
  assert.equal(big.length, 5000);
  assert.match(big.warnings[0], /5000\+ sipariş/);
  assert.equal(big.partialUntil, Date.parse('2026-10-02T07:00:00Z'));
  const noAddr = siparis(9, 7).replace(/<a:TeslimatAdresi>[\s\S]*?<\/a:TeslimatAdresi>/, '<a:TeslimatAdresi i:nil="true"/>');
  const calls = mockFetch(() => env(noAddr, 'SelectSiparis'));
  const one = await ticimax(ENV, {}).fetchOne('9');
  assert.match(calls[0].body, /<dc:SiparisID>9<\/dc:SiparisID>/);
  assert.match(calls[0].body, /<dc:KayitSayisi>1<\/dc:KayitSayisi>/);
  assert.deepEqual([one.status, one.address.city, one.address.district, one.address.name, one.phone], ['delivered', 'İstanbul', 'Kadıköy', 'Ali Veli', '05320000000']);
  mockFetch(() => env('', 'SelectSiparis'));
  await assert.rejects(ticimax(ENV, {}).fetchOne('10'), /Ticimax: sipariş bulunamadı/);
  assert.equal(await ticimax(ENV, {}).orderExists('10'), false);
  assert.equal(await ticimax(ENV, {}).orderExists('abc'), false);
});

const varyasyon = (id) => `<a:Varyasyon><a:Aktif>true</a:Aktif><a:Barkod>869${id}</a:Barkod><a:ID>${id}</a:ID><a:IndirimliFiyati>0</a:IndirimliFiyati><a:KdvDahil>true</a:KdvDahil><a:KdvOrani>20</a:KdvOrani>
  <a:Ozellikler><a:VaryasyonOzellik><a:Deger>M</a:Deger><a:Tanim>Beden</a:Tanim></a:VaryasyonOzellik><a:VaryasyonOzellik><a:Deger>Kırmızı</a:Deger><a:Tanim>Renk</a:Tanim></a:VaryasyonOzellik></a:Ozellikler>
  <a:Resimler xmlns:b="http://schemas.microsoft.com/2003/10/Serialization/Arrays"><b:string>https://static.magaza.com/v${id}.jpg</b:string></a:Resimler><a:SatisFiyati>200</a:SatisFiyati><a:StokAdedi>7</a:StokAdedi><a:StokKodu>SK-${id}</a:StokKodu></a:Varyasyon>`;
const kart = (id, vars) => `<a:UrunKarti><a:Aktif>true</a:Aktif><a:ID>${id}</a:ID><a:Resimler xmlns:b="http://schemas.microsoft.com/2003/10/Serialization/Arrays"><b:string>https://static.magaza.com/k${id}.jpg</b:string><b:string>http://eski.jpg</b:string></a:Resimler><a:UrunAdi>Tişört</a:UrunAdi><a:Varyasyonlar>${vars}</a:Varyasyonlar></a:UrunKarti>`;

test('Ticimax: ilanlar ürün kartı + varyasyonlar; KDV hariç fiyat, indirim, stok, aktiflik; sayfalama', async () => {
  // 1. sayfa 100 kart (99'u varyasyonsuz) → 2. sayfa istenir
  const page1 = kart(1, varyasyon(11) + varyasyon(12)) + Array.from({ length: 99 }, (_, i) => kart(200 + i, '')).join('');
  const v21 = varyasyon(21).replace('<a:IndirimliFiyati>0<', '<a:IndirimliFiyati>150<').replace('<a:KdvDahil>true<', '<a:KdvDahil>false<').replace('<a:StokAdedi>7<', '<a:StokAdedi>-3<');
  const page2 = kart(2, v21) + kart(3, varyasyon(31).replace('<a:Aktif>true<', '<a:Aktif>false<'));
  const calls = mockFetch((c) => env(c.body.includes('<dc:BaslangicIndex>0<') ? page1 : page2, 'SelectUrun'));
  const out = await ticimax(ENV, {}).fetchListings();
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://www.magaza.com/Servis/UrunServis.svc');
  assert.equal(calls[0].action, 'http://tempuri.org/IUrunServis/SelectUrun');
  const f = /<tem:f [^>]*>(.*?)<\/tem:f>/.exec(calls[0].body)[1];
  assert.deepEqual([...f.matchAll(/<dc:(\w+)>([^<]*)</g)].map((m) => `${m[1]}=${m[2]}`), ['Aktif=-1', 'Firsat=-1', 'Indirimli=-1', 'KasaOnuFirsatlari=-1', 'KategoriID=0', 'MarkaID=0', 'TedarikciID=0', 'UrunKartiID=0', 'Vitrin=-1']);
  assert.equal(out.length, 4);
  assert.deepEqual(out[0], { remoteId: '11', remoteProductId: '1', sku: 'SK-11', barcode: '86911', name: 'Tişört - M / Kırmızı', groupName: 'Tişört', variantName: 'M / Kırmızı',
    image: 'https://static.magaza.com/v11.jpg', images: ['https://static.magaza.com/v11.jpg', 'https://static.magaza.com/k1.jpg', 'http://eski.jpg'], price: 200, listPrice: 200, stock: 7, active: true });
  // KDV hariç girilmiş fiyat KDV eklenerek; indirimli fiyat satış fiyatı; eksi stok 0
  const l21 = out.find((x) => x.remoteId === '21');
  assert.deepEqual([l21.price, l21.listPrice, l21.stock], [180, 240, 0]);
  assert.equal(out.find((x) => x.remoteId === '31').active, false);
});

test('Ticimax: stok toplu (ID + StokAdedi), fiyat varyasyon başına bayraklarla; hatalar toplanır', async () => {
  const calls = mockFetch((c) => env('', c.op).replace(/<(\w+)Result[^>]*><\/\1Result>/, c.op === 'StokAdediGuncelle' ? '<StokAdediGuncelleResult>1</StokAdediGuncelleResult>' : '<VaryasyonGuncelleResult>1</VaryasyonGuncelleResult>'));
  const ch = ticimax(ENV, {});
  const many = Array.from({ length: 150 }, (_, i) => ({ remoteId: String(i + 1), stock: i === 0 ? -5 : 2.6 }));
  await ch.pushStock([...many, { remoteId: 'x', stock: 1 }]);
  assert.deepEqual(calls.map((c) => c.op), ['StokAdediGuncelle', 'StokAdediGuncelle']);
  assert.match(calls[0].body, /<tem:urunler xmlns:dc="[^"]+"><dc:Varyasyon><dc:ID>1<\/dc:ID><dc:StokAdedi>0<\/dc:StokAdedi><\/dc:Varyasyon><dc:Varyasyon><dc:ID>2<\/dc:ID><dc:StokAdedi>3<\/dc:StokAdedi><\/dc:Varyasyon>/);
  assert.equal((calls[0].body.match(/<dc:Varyasyon>/g) || []).length, 100);
  assert.equal((calls[1].body.match(/<dc:Varyasyon>/g) || []).length, 50);
  calls.length = 0;
  await ch.pushPrice([{ remoteId: '11', price: 180, listPrice: 240 }, { remoteId: '12', price: 99.9, listPrice: 0 }]);
  assert.deepEqual(calls.map((c) => c.op), ['VaryasyonGuncelle', 'VaryasyonGuncelle']);
  const b = calls.find((c) => c.body.includes('<dc:ID>11<')).body;
  assert.match(b, /<tem:urun [^>]*><dc:ID>11<\/dc:ID><dc:IndirimliFiyati>180<\/dc:IndirimliFiyati><dc:KdvDahil>true<\/dc:KdvDahil><dc:SatisFiyati>240<\/dc:SatisFiyati><\/tem:urun>/);
  assert.match(b, /<tem:ayar [^>]*><dc:IndirimliFiyatiGuncelle>true<\/dc:IndirimliFiyatiGuncelle><dc:KdvDahilGuncelle>true<\/dc:KdvDahilGuncelle><dc:SatisFiyatiGuncelle>true<\/dc:SatisFiyatiGuncelle><\/tem:ayar>/);
  assert.match(calls.find((c) => c.body.includes('<dc:ID>12<')).body, /<dc:IndirimliFiyati>0<\/dc:IndirimliFiyati><dc:KdvDahil>true<\/dc:KdvDahil><dc:SatisFiyati>99.9</);
  // SOAP hatası (HTTP 500 + faultstring) kalem bazında toplanır
  mockFetch((c) => (c.body.includes('<dc:ID>12<') ? { status: 500, body: '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode>s:Client</faultcode><faultstring>Yetkisiz işlem</faultstring></s:Fault></s:Body></s:Envelope>' } : env('', 'VaryasyonGuncelle')));
  await assert.rejects(ch.pushPrice([{ remoteId: '11', price: 1, listPrice: 1 }, { remoteId: '12', price: 1, listPrice: 1 }]), /Ticimax: 1 fiyat güncellenemedi \(12: Yetkisiz işlem\)/);
});

test('Ticimax: kargoya verme SetSiparisDurum (takip no + bağlantı, e-posta); başka açık paket varsa beklenir; hata yanıtı', async () => {
  const ok = '<a:ErrorCode>0</a:ErrorCode><a:ErrorMessage i:nil="true"/><a:IsError>false</a:IsError>';
  const calls = mockFetch(() => env(ok, 'SetSiparisDurum'));
  const ch = ticimax(ENV, {});
  await ch.ship({ remote_id: '77', packages: [{ id: 1, status: 'open' }] }, { id: 1 }, { cargoCompany: 'Aras Kargo', tracking: 'AR5' });
  assert.equal(calls[0].action, 'http://tempuri.org/ISiparisServis/SetSiparisDurum');
  const r = /<tem:request [^>]*>(.*?)<\/tem:request>/.exec(calls[0].body)[1];
  assert.equal(r, '<dc:Durum>KargoyaVerildi</dc:Durum><dc:KargoTakipLink>https://kargotakip.araskargo.com.tr/mainpage.aspx?code=AR5</dc:KargoTakipLink><dc:KargoTakipNo>AR5</dc:KargoTakipNo><dc:MailBilgilendir>true</dc:MailBilgilendir><dc:PreventStockOperation>false</dc:PreventStockOperation><dc:SiparisID>77</dc:SiparisID>');
  // takip no yoksa yalnız durum
  await ch.ship({ remote_id: '78', packages: [] }, null, {});
  assert.doesNotMatch(calls[1].body, /KargoTakip/);
  await ch.ship({ remote_id: '79', packages: [{ id: 1, status: 'open' }, { id: 2, status: 'open' }] }, { id: 1 }, { tracking: 'X' });
  assert.equal(calls.length, 2, 'başka açık paket varken sipariş kargoya verildi yapılmaz');
  mockFetch(() => env('<a:ErrorCode>3</a:ErrorCode><a:ErrorMessage>Sipariş bulunamadı</a:ErrorMessage><a:IsError>true</a:IsError>', 'SetSiparisDurum'));
  await assert.rejects(ch.ship({ remote_id: '80', packages: [] }, null, { tracking: 'X' }), /Ticimax: sipariş kargoya verildi yapılamadı \(Sipariş bulunamadı\)/);
});

test('Ticimax: tanılama; boş yanıtta yetki uyarısı, bağlantı hatası anlaşılır', async () => {
  mockFetch((c) => env(c.op === 'SelectUrun' ? '' : siparis(1, 2), c.op));
  const steps = await ticimax(ENV, {}).diagnose({ orderId: '1' });
  assert.equal(steps[0].ok, null);
  assert.match(steps[0].detail, /WS yetki kodu yanlış/);
  assert.match(steps[1].detail, /1 sipariş · örnek #TM1: Onaylandi → new/);
  assert.match(steps[2].detail, /#TM1: Onaylandi → new · 1 kalem/);
  mockFetch(() => ({ status: 404, body: '<html><head><title>Bulunamadı</title></head></html>' }));
  const s2 = await ticimax(ENV, {}).diagnose({});
  assert.equal(s2[0].ok, false);
  assert.match(s2[0].detail, /HTTP 404/);
  assert.match(s2[1].detail, /alan adı Ticimax mağazası değil/);
});
