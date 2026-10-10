// Ticimax (kendi web siteniz, Ticimax altyapısı): komisyon yok, etiketi panel basar, takip no satıcı girer.
// Web servisleri SOAP 1.1 (WCF): her mağaza kendi alan adında sunar → https://{alanadi}/Servis/SiparisServis.svc ve /Servis/UrunServis.svc.
// Kimlik: "WS Yetki Kodu" (Ticimax paneli → Ayarlar → WS Yetki Kodu Yönetimi; yetki tablosunda kullanılacak metotlar işaretlenir).
// Kod her isteğin gövdesinde UyeKodu alanıyla gider. DİKKAT: geçersiz / yetkisiz kod HTTP 200 + boş liste döner (hata yok) → tanılama bunu ayrıca söyler.
// SOAPAction "http://tempuri.org/I{Servis}/{Metot}"; işlem parametreleri tempuri isim alanında, veri sözleşmeleri (WebSiparisFiltre, Varyasyon …)
// http://schemas.datacontract.org/2004/07/ isim alanında. WCF üyeleri ADA GÖRE SIRALI bekler: sırası bozuk ya da yanlış isim alanındaki alan
// hata vermeden yok sayılır → XML her zaman WSDL sırasıyla yazılır. Filtrede sayısal alanlar -1 = "filtre yok" (0 gönderilirse 0'a göre süzer).
// Tarihler saat dilimi bilgisiz Türkiye saatidir (2026-10-10T14:30:00).
// Siparişler: SelectSiparis (senkronda düzenlenme tarihine, geçmiş aktarımında sipariş tarihine göre; UrunGetir ile kalemler aynı yanıtta),
// sayfalama BaslangicIndex 0'dan başlayan kayıt sırası. Durum: Durum alanı (WebSiparisDurumlari sırası 0…22).
// İlanlar: SelectUrun (ürün kartı + Varyasyonlar); her varyasyon ayrı ilan (remoteId = varyasyon ID, siparişteki UrunID ile aynı).
// Stok: StokAdediGuncelle (varyasyon ID + StokAdedi, toplu). Fiyat: VaryasyonGuncelle (SatisFiyati / IndirimliFiyati, "…Guncelle" bayraklarıyla tek tek).
// Kargoya verme: SetSiparisDurum (KargoyaVerildi + takip no + takip bağlantısı, müşteriye e-posta). Kargo firması Ticimax'ta sayısal firma
// numarasıyla seçildiğinden (SetSiparisKargoFirmaId) panelden değiştirilmez; firma adı takip bağlantısına yansır.
// Yok: ürün oluşturma, iade talepleri, soru-cevap.
import { http, num, str, r2, chunk, imageList, diagStep, pool } from '../util.js';
import { soap, esc, trackUrl } from '../carriers/common.js';

const TEM = 'http://tempuri.org/', DC = 'http://schemas.datacontract.org/2004/07/';
// WebSiparisDurumlari (WSDL sırası = sayısal değer)
export const TICIMAX_STATES = ['OnSiparis', 'OnayBekliyor', 'Onaylandi', 'OdemeBekliyor', 'Paketleniyor', 'TedarikEdiliyor', 'KargoyaVerildi', 'TeslimEdildi', 'Iptal', 'Iade', 'Silinmis',
  'IadeTalepAlindi', 'IadeUlastiOdemeYapilacak', 'IadeOdemeYapildi', 'TeslimOncesiIptal', 'IptalTalebi', 'KismiIadeTalebi', 'KismiIadeYapildi', 'TeslimEdilemedi',
  'MagazayaGonderildi', 'MagazayaUlasti', 'MagazadaTeslimBekliyor', 'CuzdanaIade'];
// Panel durumu: iade talebi / kısmi iade siparişi teslim edilmiş sayar (kalem durumları ayrıca okunur); iptal talebi henüz iptal değildir
const MAP = { OnayBekliyor: 'new', Onaylandi: 'new', OdemeBekliyor: 'new', Paketleniyor: 'processing', TedarikEdiliyor: 'processing', KargoyaVerildi: 'shipped',
  TeslimEdildi: 'delivered', Iptal: 'cancelled', Iade: 'returned', Silinmis: 'cancelled', IadeTalepAlindi: 'delivered', IadeUlastiOdemeYapilacak: 'returned', IadeOdemeYapildi: 'returned',
  TeslimOncesiIptal: 'cancelled', IptalTalebi: 'new', KismiIadeTalebi: 'delivered', KismiIadeYapildi: 'delivered', TeslimEdilemedi: 'shipped', MagazayaGonderildi: 'shipped',
  MagazayaUlasti: 'shipped', MagazadaTeslimBekliyor: 'shipped', CuzdanaIade: 'returned' };
export const ticimaxStatus = (d) => MAP[TICIMAX_STATES[num(d, -1)]] || 'new';
// Ön sipariş (tamamlanmamış sepet / ödeme) panele alınmaz
const SKIP = new Set([0]);

// Türkiye saati (UTC+3, yaz saati yok) ↔ UTC ms
const TR = 3 * 3600e3;
export const tmxDate = (ms) => new Date(ms + TR).toISOString().slice(0, 19);
export const tmxParse = (s) => { const t = str(s); if (!t || /^0001-/.test(t)) return 0; return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : t + '+03:00') || 0; };

// ---------- küçük XML okuyucu (yanıt ağacı: isim alanı öneki atılır, i:nil="true" boş sayılır) ----------
const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(n)).replace(/&amp;/g, '&');
export function xmlTree(xml) {
  const root = { n: '#', c: [], t: '' }, st = [root];
  const re = /<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)(?:[\w.-]+:)?([\w.-]+)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(String(xml || '')))) {
    const top = st[st.length - 1];
    if (m[1] != null) top.t += m[1];
    else if (m[3]) {
      if (m[2]) { if (st.length > 1) st.pop(); continue; }
      const node = { n: m[3], c: [], t: '', nil: /\bnil\s*=\s*["']true["']/.test(m[4] || '') };
      top.c.push(node);
      if (!m[5]) st.push(node);
    } else if (m[6] != null) top.t += unesc(m[6]);
  }
  return root;
}
export const kid = (node, name) => (node && node.c.find((x) => x.n === name)) || null;
export const kids = (node, name) => (node ? node.c.filter((x) => x.n === name) : []);
export const txt = (node, name) => { const k = kid(node, name); return k && !k.nil ? k.t.trim() : ''; };
// Derin arama: ilk eşleşen düğüm (yanıt sarmalayıcılarından bağımsız)
export function find(node, name) {
  if (!node) return null;
  for (const x of node.c) { if (x.n === name) return x; const y = find(x, name); if (y) return y; }
  return null;
}

// XML yazımı: alanlar verilen sırada (WSDL sırası), undefined olanlar atlanır
const el = (p, k, v) => (v === undefined || v === null ? '' : `<${p}:${k}>${typeof v === 'boolean' ? String(v) : typeof v === 'number' ? String(v) : esc(v)}</${p}:${k}>`);
const dc = (pairs) => pairs.map(([k, v]) => el('dc', k, v)).join('');

export function ticimax(env, meta = {}) {
  const host = str(env.TICIMAX_URL).replace(/^https?:\/\//i, '').replace(/[/?#].*$/, '').toLowerCase();
  const site = /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? `https://${host}` : ''; // yetki kodu düz HTTP'den gönderilmez
  const key = str(env.TICIMAX_KEY);

  async function call(service, op, inner) {
    const body = `<tem:${op}>${el('tem', 'UyeKodu', key)}${inner}</tem:${op}>`;
    const xml = await soap(`${site}/Servis/${service}.svc`, { ns: TEM, prefix: 'tem', action: `${TEM}I${service}/${op}`, body, timeout: 40000 });
    return xmlTree(xml);
  }
  // Veri sözleşmesi parametresi: dc isim alanı öğenin üzerinde tanımlanır
  const param = (name, inner) => `<tem:${name} xmlns:dc="${DC}">${inner}</tem:${name}>`;

  // WebSiparisFiltre (WSDL sırası). Sayısal alanlarda -1 = filtre yok.
  const filtre = ({ duzBas, duzSon, sipBas, sipSon, id = -1 } = {}) => param('f', dc([
    ['DuzenlemeTarihiBas', duzBas], ['DuzenlemeTarihiSon', duzSon], ['EntegrasyonAktarildi', -1], ['IptalEdilmisUrunler', true], ['KampanyaGetir', false],
    ['KargoFirmaID', -1], ['OdemeDurumu', -1], ['OdemeTipi', -1], ['SiparisDurumu', -1], ['SiparisID', id],
    ['SiparisTarihiBas', sipBas], ['SiparisTarihiSon', sipSon], ['TedarikciID', -1], ['UrunGetir', true], ['UyeID', -1],
  ]));
  const sayfa = (start, size) => param('s', dc([['BaslangicIndex', start], ['KayitSayisi', size], ['SiralamaDegeri', 'ID'], ['SiralamaYonu', 'ASC']]));

  function norm(o) {
    const a = kid(o, 'TeslimatAdresi'), f = kid(o, 'FaturaAdresi'), adr = a && !a.nil ? a : f;
    const items = kids(kid(o, 'Urunler'), 'WebSiparisUrun').map((u) => {
      const qty = num(txt(u, 'Adet'), 1) || 1;
      // DOĞRULA: Tutar birim fiyat (KDV hariç), KdvTutari birim KDV kabul edildi (SaveSiparis örneklerindeki kullanım); toplam = (Tutar + KdvTutari) × Adet
      const unit = r2(num(txt(u, 'Tutar')) + num(txt(u, 'KdvTutari')));
      const durum = txt(u, 'DurumAd').toLocaleLowerCase('tr'); // "İptal" küçük harfe Türkçe kuralla (İ → i)
      const imgs = imageList([txt(u, 'ResimYolu')]);
      return { lineId: txt(u, 'ID'), sku: txt(u, 'StokKodu'), barcode: txt(u, 'Barkod'), name: txt(u, 'UrunAdi'), image: imgs[0] || '', quantity: qty,
        unitPrice: unit, total: r2(unit * qty), status: /iptal/.test(durum) ? 'cancelled' : /iade/.test(durum) && !/talep/.test(durum) ? 'returned' : '', remoteKey: txt(u, 'UrunID') };
    });
    const d = num(txt(o, 'Durum'), 1), name = txt(adr, 'AliciAdi');
    const customer = txt(o, 'AdiSoyadi') || [txt(o, 'UyeAdi'), txt(o, 'UyeSoyadi')].filter(Boolean).join(' ') || name;
    return {
      remoteId: txt(o, 'ID'), orderNumber: txt(o, 'SiparisNo') || txt(o, 'ID'), orderedAt: tmxParse(txt(o, 'SiparisTarihi')) || Date.now(),
      remoteStatus: TICIMAX_STATES[d] || String(d), status: ticimaxStatus(d), awaitingPayment: d === 3,
      // Kapıda ödeme: ödeme satırının tip adı (DOĞRULA: WebSiparis.Odemeler / WebSiparisOdeme.OdemeTipi(Tanim) alan adları ve "Kapıda Ödeme" metni)
      cod: kids(kid(o, 'Odemeler'), 'WebSiparisOdeme').some((p) => /kap[ıi]da/i.test(txt(p, 'OdemeTipiTanim') || txt(p, 'OdemeTipAdi') || txt(p, 'OdemeTipi'))) || /kap[ıi]da/i.test(txt(o, 'OdemeTipi')) || undefined,
      customer, phone: txt(adr, 'AliciTelefon'), email: txt(o, 'Mail'), customerId: num(txt(o, 'UyeID')) > 0 ? txt(o, 'UyeID') : '',
      address: { name: name || customer, line: [txt(adr, 'Mahalle'), txt(adr, 'Adres')].filter(Boolean).join(' '), district: txt(adr, 'Ilce'), city: txt(adr, 'Il'), phone: txt(adr, 'AliciTelefon') },
      // DOĞRULA: SiparisToplamTutari ödenecek genel toplam (kargo ve indirimler dahil) kabul edildi
      total: num(txt(o, 'SiparisToplamTutari')) || num(txt(o, 'ToplamTutar')), currency: (txt(o, 'ParaBirimi') || 'TRY').replace(/^TL$/i, 'TRY'),
      cargoCompany: txt(o, 'KargoFirmaTanim'), tracking: txt(o, 'KargoTakipNo'), shipBy: tmxParse(txt(o, 'KargoyaSonVerilmeTarihi')) || null,
      items, packages: null,
    };
  }

  // Siparişler 100'er; 50 sayfa (5000 sipariş) sınırına gelinirse kalanlar sonraki senkronda. Sıra sipariş numarasına (ID) göredir, düzenlenme
  // zamanına göre değil: okunmayan siparişlerin düzenlenme zamanı aralığın herhangi bir yerinde olabilir → imleç aralığın başında kalır
  // (önceden son okunan satırın düzenlenme zamanından devam ediliyor, arada kalan siparişler atlanabiliyordu)
  const PAGE = 100, MAXP = 50;
  async function fetchOrders(since, until, { byOrdered = false } = {}) {
    const out = [], range = byOrdered ? { sipBas: tmxDate(since), sipSon: tmxDate(until) } : { duzBas: tmxDate(since), duzSon: tmxDate(until) };
    for (let page = 0; page < MAXP; page++) {
      const tree = await call('SiparisServis', 'SelectSiparis', filtre(range) + sayfa(page * PAGE, PAGE));
      const list = kids(find(tree, 'SelectSiparisResult'), 'WebSiparis');
      for (const o of list) if (!SKIP.has(num(txt(o, 'Durum'), 1))) out.push(norm(o));
      if (list.length < PAGE) return out;
    }
    out.warnings = [`Ticimax: bu aralıkta ${MAXP * PAGE}+ sipariş var; kalanlar bir sonraki senkronda alınacak`];
    if (!byOrdered) out.partialUntil = since;
    return out;
  }
  async function getOrder(id) {
    if (!(num(id) > 0)) return null;
    const tree = await call('SiparisServis', 'SelectSiparis', filtre({ id: num(id) }) + sayfa(0, 1));
    return kids(find(tree, 'SelectSiparisResult'), 'WebSiparis')[0] || null;
  }
  async function fetchOne(id) {
    const o = await getOrder(id);
    if (!o) throw new Error('Ticimax: sipariş bulunamadı');
    return norm(o);
  }
  const orderExists = async (id) => !!(await getOrder(id));

  // ---------- ilanlar ----------
  const kdvli = (v, x) => (txt(x, 'KdvDahil') === 'false' ? v * (1 + num(txt(x, 'KdvOrani')) / 100) : v);
  function listing(card, v) {
    const cname = txt(card, 'UrunAdi');
    const props = kids(kid(v, 'Ozellikler'), 'VaryasyonOzellik').map((p) => txt(p, 'Deger')).filter(Boolean);
    const vname = props.join(' / ');
    const cardImgs = kids(kid(card, 'Resimler'), 'string').map((s) => s.t.trim()), vImgs = kids(kid(v, 'Resimler'), 'string').map((s) => s.t.trim());
    const images = imageList([...vImgs, ...cardImgs]);
    const list = r2(kdvli(num(txt(v, 'SatisFiyati')), v)), disc = r2(kdvli(num(txt(v, 'IndirimliFiyati')), v));
    const price = disc > 0 && disc < list ? disc : list;
    return { remoteId: txt(v, 'ID'), remoteProductId: txt(card, 'ID'), sku: txt(v, 'StokKodu'), barcode: txt(v, 'Barkod'),
      name: vname ? `${cname} - ${vname}` : cname, groupName: cname, variantName: vname, image: images[0] || '', images,
      price, listPrice: Math.max(list, price), stock: Math.max(0, Math.floor(num(txt(v, 'StokAdedi')))),
      active: txt(card, 'Aktif') !== 'false' && txt(v, 'Aktif') !== 'false' };
  }
  // UrunFiltre: Aktif / Firsat / Indirimli / Vitrin / KasaOnuFirsatlari -1 = hepsi; KategoriID / MarkaID / TedarikciID / UrunKartiID 0 = hepsi
  const urunFiltre = (extra = []) => param('f', dc([['Aktif', -1], ['Firsat', -1], ['Indirimli', -1], ['KasaOnuFirsatlari', -1], ['KategoriID', 0], ['MarkaID', 0], ['TedarikciID', 0], ...extra, ['UrunKartiID', 0], ['Vitrin', -1]]));
  async function fetchListings() {
    const out = [];
    for (let page = 0; page < 500; page++) {
      const tree = await call('UrunServis', 'SelectUrun', urunFiltre() + param('s', dc([['BaslangicIndex', page * PAGE], ['KayitSayisi', PAGE], ['SiralamaDegeri', 'ID'], ['SiralamaYonu', 'ASC']])));
      const cards = kids(find(tree, 'SelectUrunResult'), 'UrunKarti');
      for (const c of cards) for (const v of kids(kid(c, 'Varyasyonlar'), 'Varyasyon')) out.push(listing(c, v));
      if (cards.length < PAGE) break;
    }
    return out;
  }

  // Yanıttaki hata: IsError / ErrorMessage (ya da hata metni). Satır satır sonuç (ID + IsError) varsa ilana, yoksa tüm parçaya yazılır.
  // Dönüş: { all: mesaj } | Map(ID → mesaj) | null
  function resultErrors(res) {
    if (!res || res.nil) return null;
    const rowErr = (n) => (txt(n, 'IsError') === 'true' ? txt(n, 'ErrorMessage') || txt(n, 'Message') || `hata kodu ${txt(n, 'ErrorCode') || '?'}` : '');
    const rows = new Map();
    const walk = (n) => { for (const x of n.c) { const id = txt(x, 'VaryasyonID') || txt(x, 'ID'), e = rowErr(x); if (id && e) rows.set(id, e); walk(x); } };
    walk(res);
    if (rows.size) return rows;
    const top = rowErr(res);
    if (top) return { all: top };
    const t = res.c.length ? '' : res.t.trim();
    return /hata|error|başarısız|basarisiz|yetki/i.test(t) ? { all: t } : null;
  }
  // Ağ / yetki hatası (SOAP hata metni değil): hiçbir ilan gönderilemediyse atılır
  const netErr = (e) => e.budget || /bağlantı hatası|HTTP (40[13]|404|5\d\d)\b/.test(e.message || '');
  const bad = (out, part) => out.errors.push(...part.filter((x) => !(num(x.remoteId) > 0)).map((x) => ({ remoteId: x.remoteId, error: 'Ticimax: geçersiz varyasyon numarası' })));
  // Stok: StokAdediGuncelle (varyasyon ID + StokAdedi yeterli), 100'erli. Sonuç ilan ilan: { done, errors } (yanıt da denetlenir)
  async function pushStock(items) {
    const out = { done: [], errors: [] };
    bad(out, items);
    for (const part of chunk(items.filter((x) => num(x.remoteId) > 0), 100)) {
      const list = part.map((x) => `<dc:Varyasyon>${dc([['ID', num(x.remoteId)], ['StokAdedi', Math.max(0, Math.round(num(x.stock)))]])}</dc:Varyasyon>`).join('');
      let errs;
      try { errs = resultErrors(find(await call('UrunServis', 'StokAdediGuncelle', param('urunler', list)), 'StokAdediGuncelleResult')); } catch (e) {
        if (e.budget || (netErr(e) && !out.done.length)) throw e;
        errs = { all: e.message };
      }
      for (const x of part) {
        const m = errs && (errs.all || (errs instanceof Map && errs.get(String(num(x.remoteId)))));
        if (m) out.errors.push({ remoteId: x.remoteId, error: 'Ticimax: ' + String(m).replace(/^Ticimax: /, '') }); else out.done.push(x.remoteId);
      }
    }
    return out;
  }
  // Fiyat: liste fiyatı SatisFiyati, satış fiyatı düşükse IndirimliFiyati (değilse 0 → indirim kalkar); fiyatlar KDV dahil yazılır.
  // VaryasyonAyar'da yalnız işaretlenen alanlar yazılır (işaretsiz = false = dokunulmaz).
  // Sonuç ilan ilan: { done, errors }; hiçbiri gönderilemeden ağ / yetki hatası olduysa atılır
  async function pushPrice(items) {
    const out = { done: [], errors: [] };
    let global = null;
    bad(out, items);
    await pool(items.filter((x) => num(x.remoteId) > 0), 4, async (x) => {
      const price = r2(num(x.price)), list = r2(Math.max(num(x.listPrice), price));
      try {
        const tree = await call('UrunServis', 'VaryasyonGuncelle',
          param('urun', dc([['ID', num(x.remoteId)], ['IndirimliFiyati', price < list ? price : 0], ['KdvDahil', true], ['SatisFiyati', list]]))
          + param('ayar', dc([['IndirimliFiyatiGuncelle', true], ['KdvDahilGuncelle', true], ['SatisFiyatiGuncelle', true]])));
        const errs = resultErrors(find(tree, 'VaryasyonGuncelleResult'));
        const m = errs && (errs.all || [...errs.values()][0]);
        if (m) out.errors.push({ remoteId: x.remoteId, error: 'Ticimax: ' + m }); else out.done.push(x.remoteId);
      } catch (e) {
        if (e.budget) throw e;
        if (netErr(e)) global = global || e;
        out.errors.push({ remoteId: x.remoteId, error: 'Ticimax: ' + String(e.message).replace(/^Ticimax: /, '') });
      }
    });
    if (global && !out.done.length) throw global;
    return out;
  }

  // Kargoya ver: siparişin son açık paketiyse durum KargoyaVerildi + takip no / bağlantısı (müşteriye e-posta)
  async function ship(order, pkg, { cargoCompany, tracking } = {}) {
    const others = (order.packages || []).filter((p) => p.status === 'open' && (!pkg || p.id !== pkg.id));
    if (others.length) return {};
    const tree = await call('SiparisServis', 'SetSiparisDurum', param('request', dc([
      ['Durum', 'KargoyaVerildi'], ['KargoTakipLink', tracking ? trackUrl(cargoCompany, tracking) || undefined : undefined], ['KargoTakipNo', tracking || undefined],
      ['MailBilgilendir', true], ['PreventStockOperation', false], ['SiparisID', num(order.remote_id)],
    ])));
    const r = find(tree, 'SetSiparisDurumResult');
    if (r && txt(r, 'IsError') === 'true') throw new Error(`Ticimax: sipariş kargoya verildi yapılamadı (${txt(r, 'ErrorMessage') || txt(r, 'ErrorCode')})`);
    return {};
  }

  async function diagnose({ orderId } = {}) {
    const out = [], now = Date.now();
    const ok = await diagStep(out, 'Ticimax ürün servisi', async () => {
      const tree = await call('UrunServis', 'SelectUrun', urunFiltre() + param('s', dc([['BaslangicIndex', 0], ['KayitSayisi', 1], ['SiralamaDegeri', 'ID'], ['SiralamaYonu', 'ASC']])));
      const n = kids(find(tree, 'SelectUrunResult'), 'UrunKarti').length;
      return { ok: n ? true : null, detail: `${site} · ${n ? 'ürün örneği alındı' : 'ürün dönmedi: mağazada ürün yoksa normal; varsa WS yetki kodu yanlış ya da SelectUrun yetkisi kapalı (Ticimax yetkisiz kodda hata değil boş liste döner)'}` };
    });
    if (!ok) { out.push({ name: 'İpucu', ok: null, detail: '404: alan adı Ticimax mağazası değil ya da /Servis/ yolu kapalı · 500 / hata metni: SOAP isteği reddedildi' }); return out; }
    await diagStep(out, 'Siparişler (son 7 gün)', async () => {
      const o = await fetchOrders(now - 7 * 864e5, now);
      return { ok: o.length ? true : null, detail: `${o.length} sipariş${o[0] ? ` · örnek #${o[0].orderNumber}: ${o[0].remoteStatus} → ${o[0].status}` : ' (sipariş varsa SelectSiparis yetkisini kontrol edin)'}` };
    });
    if (orderId) await diagStep(out, `Sipariş ${orderId}`, async () => { const o = await fetchOne(orderId); return { detail: `#${o.orderNumber}: ${o.remoteStatus} → ${o.status} · ${o.items.length} kalem` }; });
    out.push({ name: 'Yazma yetkileri', ok: null, detail: 'Stok / fiyat / kargo için WS yetki kodunda StokAdediGuncelle, VaryasyonGuncelle, SetSiparisDurum işaretli olmalı (ilk gönderimde denenir)' });
    return out;
  }

  const missing = [!site && 'TICIMAX_URL', !key && 'TICIMAX_KEY'].filter(Boolean);
  return {
    ...meta, type: 'ticimax', enabled: !missing.length, missing,
    caps: { accept: 'local', split: 'local', ship: 'remote', label: null, createProduct: false, price: true, manualTracking: true },
    fetchOrders, fetchOne, orderExists, fetchListings, pushStock, pushPrice, ship, diagnose,
  };
}
