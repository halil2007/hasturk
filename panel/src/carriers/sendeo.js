// Sendeo web servisi (api.sendeo.com.tr, "Web Servis Teknik Dokümanı V.9"; REST / JSON, Swagger aynı adreste).
// Kimlik: müşteri adı / şifre → POST /api/Token/LoginAES { musteri, sifre } → Bearer token (20 saat geçerli; 19 saat saklanır).
// Gönderi "iş emri"dir (POST /api/Cargo/SETDELIVERY, DeliveryType 1 = lokasyonunuzdan müşterinize): bizim verdiğimiz tekil ReferenceNo
// barkoda basılır, Sendeo toplamada onu okutur. Yanıtta Sendeo takip numarası, takip adresi ve istenen biçimde etiket gelir
// (barcodeLabelType 2 → BarcodeZpl). İl kodu = plaka; ilçe kodu Sendeo'nun il-ilçe listesinden (dokümanın ekindeki Excel; aşağıda gömülü).
// İptal (CANCELDELIVERY) yalnız toplanmamış (101 "İş Emri Alındı") gönderide; takip (TRACKDELIVERY) 30 dakika önbellekli döner.
// Başarılı istek HTTP 200, hatalar HTTP 500 + { ExceptionMessage, StatusCode } (102 referans boş, 205 il kodu hatalı …), 401 token.
// carrier_ref = ReferenceNo (iptal / takip / etiket hep onunla); takip numarası = TrackingNumber.
import { http, str, sleep } from '../util.js';
import { phone10, nameKey, fullAddress, money } from './common.js';
import { plateOf, barcodeOf } from './kolaygelsin.js';

const BASE = (test) => (test ? 'https://api-dev.sendeo.com.tr' : 'https://api.sendeo.com.tr'); // DOĞRULA: test ortamı adresi (dokümanda yalnız canlı adres var)
// Statü listesi (dokümandaki "Sendeo Statü Listesi")
const DELIVERED = [111, 120], RETURNED = [131, 135, 151], CANCELLED = [133, 139], CREATED = [101];
const stateOf = (n) => (DELIVERED.includes(n) ? 'delivered' : RETURNED.includes(n) ? 'returned' : CANCELLED.includes(n) ? 'cancelled' : CREATED.includes(n) ? 'created' : n ? 'transit' : null);
// "04/02/2022 10:00:27" (Türkiye saati) ya da ISO → ms
function when(v) {
  const s = str(v), m = /^(\d{2})[./](\d{2})[./](\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(s);
  if (m) return Date.parse(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6] || '00'}+03:00`);
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}
// Yanıt zarfı büyük / küçük harf fark etmeden okunur: { StatusCode, result | Result, exceptionMessage | ExceptionMessage }
const pick = (o, ...keys) => { if (!o || typeof o !== 'object') return undefined; for (const k of keys) { const f = Object.keys(o).find((x) => x.toLowerCase() === k.toLowerCase()); if (f && o[f] != null) return o[f]; } return undefined; };

// İlçe kodu: il plakası + ilçe adı → Sendeo ilçe numarası (bulunamazsa ilin MERKEZ kaydı)
export function districtId(city, district) {
  const plate = plateOf(city), list = String(DISTRICTS[plate] || '').split('|').filter(Boolean).map((x) => { const i = x.indexOf(' '); return [Number(x.slice(0, i)), x.slice(i + 1)]; });
  if (!list.length) return { cityId: plate, districtId: 0 };
  const want = nameKey(district), merkez = list.find(([, n]) => nameKey(n) === 'merkez');
  const hit = list.find(([, n]) => nameKey(n) === want) || (want.length > 3 && list.find(([, n]) => nameKey(n).startsWith(want) || want.startsWith(nameKey(n))))
    || ((!want || want === 'merkez' || want === nameKey(city)) && merkez);
  return { cityId: plate, districtId: hit ? hit[0] : 0 };
}

export function make(values) {
  const test = values.SENDEO_ENV === 'test', base = BASE(test), user = str(values.SENDEO_USER), pass = str(values.SENDEO_PASSWORD), key = `${test}:${user}:${pass.length}`;
  // Oturum belirteci yalnız bu bağlantı nesnesinde tutulur (modül düzeyinde paylaşılan önbellek firmalar arasında karışabilirdi)
  const tokens = new Map();
  async function call(method, path, body, jwt) {
    let text, status = 0;
    try {
      const res = await http(base + path, { method, raw: true, tries: method === 'GET' ? 2 : 1, timeout: 30000,
        headers: { Accept: 'application/json', ...(jwt ? { Authorization: 'Bearer ' + jwt } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
      text = await res.text();
    } catch (e) {
      const m = /HTTP (\d+) (.*)$/s.exec(e.message || ''); status = m ? Number(m[1]) : 0;
      let j = null; try { j = JSON.parse(m ? m[2] : ''); } catch { /* düz metin */ }
      const em = /"exceptionMessage"\s*:\s*"((?:[^"\\]|\\.)*)"/i.exec(m ? m[2] : '');
      const msg = str(pick(j, 'exceptionMessage', 'message', 'title')) || (em ? JSON.parse(`"${em[1]}"`) : m ? m[2] : e.message);
      const err = new Error(status === 401 ? 'Sendeo oturumu reddedildi (401)' : 'Sendeo: ' + msg);
      err.status = status; err.code = String(pick(j, 'statusCode') ?? '');
      throw err;
    }
    let j = null;
    try { j = JSON.parse(text); } catch { throw new Error('Sendeo: beklenmeyen yanıt (' + text.slice(0, 120) + ')'); }
    const sc = Number(pick(j, 'StatusCode'));
    // HTTP 200 içinde hata zarfı (StatusCode ≠ 200 + exceptionMessage)
    if (sc && sc !== 200) { const err = new Error('Sendeo: ' + (str(pick(j, 'exceptionMessage')) || `işlem reddedildi (${sc})`)); err.code = String(sc); err.status = sc; throw err; }
    const r = pick(j, 'result');
    return r === undefined ? j : r;
  }
  async function token(fresh) {
    const c = tokens.get(key);
    if (!fresh && c && c.until > Date.now()) return c.t;
    let r;
    try { r = await call('POST', '/api/Token/LoginAES', { musteri: user, sifre: pass }); } catch (e) {
      // DOĞRULA: eski hesaplar /api/Token/Login ile çalışıyor (topluluk örnekleri); LoginAES yoksa ona düşülür
      if (e.status === 404) r = await call('POST', '/api/Token/Login', { musteri: user, sifre: pass }).catch((e2) => { throw e2.status === 400 || e2.status === 401 ? new Error('Sendeo müşteri adı veya şifresi hatalı') : e2; });
      else throw e.status === 400 || e.status === 401 ? new Error('Sendeo müşteri adı veya şifresi hatalı' + (e.status === 400 && !/oturum/.test(e.message) ? ` (${e.message.replace(/^Sendeo: /, '')})` : '')) : e;
    }
    const t = str(pick(r, 'Token', 'token', 'accessToken'));
    if (!t) throw new Error('Sendeo oturum açılamadı');
    tokens.set(key, { t, until: Date.now() + 19 * 3600e3 });
    return t;
  }
  const req = async (method, path, body) => {
    try { return await call(method, path, body, await token()); } catch (e) {
      if (e.status !== 401) throw e;
      return call(method, path, body, await token(true)); // token süresi doldu
    }
  };
  const zplOf = (r) => { const z = pick(r, 'BarcodeZpl'), zs = pick(r, 'BarcodeZpls'); return str(z) || (Array.isArray(zs) ? zs.map(str).filter(Boolean).join('\n') : ''); };
  const label = (r) => { const z = zplOf(r); return /\^XA/.test(z) ? { format: 'zpl', data: z } : null; };
  const pubUrl = (tn) => (tn ? `https://www.sendeo.com.tr/gonderi-takip?code=${encodeURIComponent(tn)}` : ''); // DOĞRULA: herkese açık takip sayfası biçimi
  // DOĞRULA: GETBARCODE parametreleri gövdede mi sorguda mı (dokümanda POST; ikisi de gönderilir)
  async function getLabel(ref) {
    const x = (await req('POST', `/api/Cargo/GETBARCODE?barcodeLabelType=2&referenceNo=${encodeURIComponent(ref)}`, { barcodeLabelType: 2, referenceNo: ref })) || {};
    const lab = label(x), tn = str(pick(x, 'TrackingNumber'));
    return lab ? { ...lab, ...(tn ? { tracking: tn, trackingUrl: str(pick(x, 'TrackingUrl')) || pubUrl(tn) } : {}) } : null;
  }
  return {
    async test() {
      await token(true);
      return { ok: true, message: `Sendeo bağlantısı tamam${test ? ' (test ortamı)' : ''}` };
    },
    async create(s) {
      const r = s.receiver, snd = s.sender, gsm = phone10(r.phone), sgsm = phone10(snd.phone);
      if (gsm.length !== 10) throw new Error('Sendeo alıcı telefonunu istiyor (10 hane); siparişte geçerli telefon yok');
      const to = districtId(r.city, r.district);
      if (!to.cityId) throw new Error(`Sendeo: alıcı ili tanınmadı (“${r.city}”)`);
      if (!to.districtId) throw new Error(`Sendeo: alıcı ilçesi Sendeo listesinde bulunamadı (“${r.district}”, ${r.city})`);
      const from = str(values.SENDEO_SENDER_DISTRICT_ID) ? { cityId: plateOf(snd.city) || Number(str(values.SENDEO_SENDER_CITY_ID)), districtId: Number(str(values.SENDEO_SENDER_DISTRICT_ID)) } : districtId(snd.city, snd.district);
      if (!from.cityId || !from.districtId) throw new Error('Sendeo gönderen il ve ilçesini istiyor: Ayarlar → Kargo etiketi → “İlçe / il” alanına ör. “Selçuklu / Konya” yazın');
      if (sgsm.length !== 10) throw new Error('Sendeo gönderen telefonunu istiyor (10 hane): Ayarlar → Kargo etiketi → Gönderen');
      const ref = barcodeOf(s), mobile = (p) => (/^5/.test(p) ? p : '');
      const body = {
        DeliveryType: 1, ReferenceNo: ref, Description: s.orderNumber ? `Sipariş ${s.orderNumber}` : ref,
        Sender: str(values.SENDEO_SENDER_NAME) || snd.name, SenderAddress: fullAddress(snd).slice(0, 500), SenderCityId: from.cityId, SenderDistrictId: from.districtId,
        senderPhone: sgsm, SenderGSM: mobile(sgsm),
        Receiver: r.name, ReceiverAddress: fullAddress(r).slice(0, 500), ReceiverCityId: to.cityId, ReceiverDistrictId: to.districtId,
        receiverPhone: gsm, ReceiverGSM: mobile(gsm), ReceiverEmail: r.email || '',
        PaymentType: 1, CollectionType: 0, CollectionPrice: 0, ServiceType: 1, barcodeLabelType: 2, dispatchNoteNumber: '',
        products: [{ Count: 1, Deci: Math.max(1, Math.ceil(Number(s.desi) || 1)), ProductCode: '', Description: (s.items || []).map((x) => `${x.qty}x ${x.name}`).join(', ').slice(0, 200), Price: 0 }],
      };
      const x = (await req('POST', '/api/Cargo/SETDELIVERY', body)) || {};
      const tn = str(pick(x, 'TrackingNumber', 'TrackingNo'));
      let lab = label(x);
      // Etiket yanıtta gelmediyse referansla bir kez istenir
      if (!lab) { await sleep(500); lab = await getLabel(ref).catch(() => null); }
      return { ref, tracking: tn, barcode: str(pick(x, 'BarcodeNumbers')).split(/[,;\s]+/)[0] || ref, carrier: 'Sendeo', trackingUrl: str(pick(x, 'TrackingUrl')) || pubUrl(tn), cost: null, label: lab };
    },
    async cancel(ref) {
      try { await req('POST', `/api/Cargo/CANCELDELIVERY?referenceNo=${encodeURIComponent(ref)}`); } catch (e) {
        if (e.code === '702' || /No Delivery Found/i.test(e.message)) return; // kayıt yok: iptal edilmiş sayılır
        if (e.code === '703' || /Already Sent/i.test(e.message)) throw new Error('Sendeo gönderisi toplandığı için iptal edilemiyor; Sendeo şubesinden iade isteyin');
        throw e;
      }
    },
    async track(pkg) {
      const x = (await req('GET', `/api/Cargo/TRACKDELIVERY?referenceNo=${encodeURIComponent(pkg.carrier_ref)}`)) || {};
      const d = Array.isArray(x) ? x[0] || {} : x;
      const hist = pick(d, 'statusHistories');
      const lastH = Array.isArray(hist) && hist.length ? hist.slice().sort((a, b) => (when(pick(a, 'StatusDate')) || 0) - (when(pick(b, 'StatusDate')) || 0)).pop() : null;
      const st = Number(pick(d, 'State')) || (lastH ? Number(pick(lastH, 'StatusId')) : 0);
      const state = stateOf(st), tn = str(pick(d, 'TrackingNo', 'TrackingNumber'));
      return {
        state, text: str(pick(d, 'StateText')) || (lastH ? str(pick(lastH, 'Status')) : ''), tracking: tn, barcode: tn || pkg.carrier_ref,
        trackingUrl: str(pick(d, 'TrackingUrl')) || pubUrl(tn), cost: money(pick(d, 'CargoAmount')) ?? money(pick(d, 'TotalPrice')),
        deliveredAt: state === 'delivered' ? when(pick(d, 'UpdateDate')) || (lastH ? when(pick(lastH, 'StatusDate')) : null) : null,
      };
    },
    // Etiket sonradan: GETBARCODE (barkod tipi + referans)
    label: (pkg) => getLabel(str(pkg.carrier_ref)),
  };
}

// Sendeo il (plaka) → "ilçe no ilçe adı|…" (Web Servis Teknik Dokümanı V.9 eki "il-ilçe listesi")
const DISTRICTS = {
  1: '1067105 Aladağ|1068659 Ceyhan|1068829 Çukurova|1036454 Feke|1067371 İmamoğlu|1059611 Karaisalı|1068355 Karataş|1068005 Kozan|343898 MERKEZ|1065054 Pozantı|1063300 Saimbeyli|1067673 Sarıçam|1069214 Seyhan|1041173 Tufanbeyli|1058453 Yumurtalık|1069035 Yüreğir',
  2: '1067585 Besni|1061432 Çelikhan|1042102 Gerger|1065543 Gölbaşı|1069083 Kahta|1069247 Merkez|901815 Samsat|1012432 Sincik|1059337 Tut',
  3: '1062212 Başmakçı|1023056 Bayat|1065457 Bolvadin|1067840 Çay|1064642 Çobanlar|1062833 Dazkırı|1067808 Dinar|1068955 Emirdağ|1052635 Evciler|1063458 Hocalar|1067867 İhsaniye|1061343 İscehisar|1056569 Kızılören|1069141 Merkez|1067775 Sandıklı|1060827 Sinanpaşa|1063839 Sultandağı|1059078 Şuhut',
  4: '1046824 Diyadin|1067759 Doğubayazıt|1042512 Eleşkirt|995804 Hamur|1067700 Merkez|1060887 Patnos|1045753 Taşlıçay|989092 Tutak',
  5: '1032100 Göynücek|1068055 Gümüşhacıköy|1016749 Hamamözü|1069062 Merkez|1068878 Merzifon|1066299 Suluova|1056323 Taşova',
  6: '1069024 Akyurt|1069262 Altındağ|1047486 Ayaş|1046504 Bala|1066570 Beypazarı|992782 Çamlıdere|1069268 Çankaya|1067881 Çubuk|1067893 Elmadağ|1069205 Etimesgut|1046314 Evren|1069201 Gölbaşı|1068819 Güdül|1053202 Haymana|1066600 Kahramankazan|1063363 Kalecik|177489 KAZAN|1069259 Keçiören|1063393 Kızılcahamam|1069202 Mamak|1067972 Nallıhan|1067976 Polatlı|1069104 Pursaklar|1069176 Sincan|1067518 Şereflikoçhisar|1069069 Yenimahalle',
  7: '1064710 Akseki|1068528 Aksu|1068201 Alanya|1066776 Demre|1069125 Döşemealtı|1065982 Elmalı|1068287 Finike|1066438 Gazipaşa|1031591 Gündoğmuş|973173 İbradı|1068377 Kaş|1066461 Kemer|1069223 Kepez|1069226 Konyaaltı|1069169 Korkuteli|1065046 Kumluca|1069087 Manavgat|1069168 Muratpaşa|1069144 Serik',
  8: '1060107 Ardanuç|1066379 Arhavi|1065065 Borçka|1067846 Hopa|1052324 Kemalpaşa|1067815 Merkez|1068029 Murgul|1052181 Şavşat|1001388 Yusufeli',
  9: '1068216 Bozdoğan|1069207 Buharkent|1064250 Çine|1069177 Didim|1069072 Efeler|1067113 Germencik|1068454 İncirliova|1063354 Karacasu|1063030 Karpuzlu|1063186 Koçarlı|1067697 Köşk|1069049 Kuşadası|1068778 Kuyucak|343917 MERKEZ|1069145 Nazilli|1068289 Söke|1062989 Sultanhisar|1048651 Yenipazar',
  10: '1069132 Altıeylül|1069114 Ayvalık|1068089 Balya|1068923 Bandırma|1065448 Bigadiç|1068459 Burhaniye|1067447 Dursunbey|1069103 Edremit|1067956 Erdek|1068645 Gömeç|1069179 Gönen|1068058 Havran|1065002 İvrindi|1068826 Karesi|1068681 Kepsut|1067590 Manyas|1066176 Marmara|343918 MERKEZ|1063225 Savaştepe|1064005 Sındırgı|1067214 Susurluk',
  11: '1067895 Bozüyük|1067908 Gölpazarı|1022796 İnhisar|1068448 Merkez|1060770 Osmaneli|1063435 Pazaryeri|1058138 Söğüt|1041277 Yenipazar',
  12: '1035259 Adaklı|1039109 Genç|1033762 Karlıova|1001592 Kiğı|1065935 Merkez|1041776 Solhan|267690 Yayladere|615130 Yedisu',
  13: '1069127 Adilcevaz|1068483 Ahlat|1066877 Güroymak|1056374 Hizan|1061732 Merkez|989877 Mutki|1068797 Tatvan',
  14: '1059982 Dörtdivan|1067981 Gerede|1050435 Göynük|1060098 Kıbrıscık|1048858 Mengen|1069048 Merkez|1067726 Mudurnu|982970 Seben|1050463 Yeniçağa',
  15: '1049795 Ağlasun|1060329 Altınyayla|1067971 Bucak|1043401 Çavdır|1043192 Çeltikçi|1067380 Gölhisar|1042748 Karamanlı|864215 Kemer|1068633 Merkez|1047263 Tefenni|1061693 Yeşilova',
  16: '1059268 Büyükorhan|1069257 Gemlik|1069051 Gürsu|1054773 Harmancık|1068868 İnegöl|1068304 İznik|1069240 Karacabey|1042678 Keles|1069131 Kestel|343924 MERKEZ|1069170 Mudanya|1068152 Mustafakemalpaşa|1069203 Nilüfer|1058679 Orhaneli|1068751 Orhangazi|1069101 Osmangazi|1067386 Yenişehir|1069077 Yıldırım',
  17: '1067612 Ayvacık|1068074 Bayramiç|1068996 Biga|1068931 Bozcaada|1068671 Çan|1067633 Eceabat|1068366 Ezine|1068792 Gelibolu|1052457 Gökçeada|1068617 Lapseki|1069224 Merkez|1064898 Yenice',
  18: '1045375 Atkaracalar|897633 Bayramören|1065861 Çerkeş|1064635 Eldivan|1054821 Ilgaz|1018316 Kızılırmak|1054787 Korgun|1055714 Kurşunlu|1068907 Merkez|1042024 Orta|1063256 Şabanözü|914582 Yapraklı',
  19: '1063958 Alaca|1038205 Bayat|1004789 Boğazkale|1066283 Dodurga|1068627 İskilip|1067921 Kargı|773018 Laçin|1020358 Mecitözü|1069157 Merkez|1033783 Oğuzlar|1015214 Ortaköy|1067824 Osmancık|1068840 Sungurlu|1047460 Uğurludağ',
  20: '1068908 Acıpayam|1045730 Babadağ|1069117 Baklan|1051108 Bekilli|1064347 Beyağaç|1067540 Bozkurt|1067922 Buldan|1064057 Çal|1048766 Çameli|1067121 Çardak|1064082 Çivril|1063035 Güney|1068587 Honaz|1061452 Kale|343928 MERKEZ|1069227 Merkezefendi|1069139 Pamukkale|1059817 Sarayköy|1067937 Serinhisar|1065632 Tavas',
  21: '1068929 Bağlar|1067334 Bismil|1062895 Çermik|1065847 Çınar|1032881 Çüngüş|1042275 Dicle|984575 Eğil|1069252 Ergani|1060683 Hani|1060290 Hazro|1069251 Kayapınar|1056756 Kocaköy|1025945 Kulp|1069183 Lice|343929 MERKEZ|1068983 Silvan|1065732 Sur|1068621 Yenişehir',
  22: '1053150 Enez|1066721 Havsa|1067827 İpsala|1067490 Keşan|1005353 Lalapaşa|1059770 Meriç|1069086 Merkez|1040829 Süloğlu|1069084 Uzunköprü',
  23: '1003961 Ağın|1039357 Alacakaya|1018374 Arıcak|1062462 Baskil|1058958 Karakoçan|1058724 Keban|1068298 Kovancılar|1063418 Maden|1069171 Merkez|1061289 Palu|1046311 Sivrice',
  24: '1055309 Çayırlı|1068717 İliç|1029802 Kemah|1054194 Kemaliye|1069130 Merkez|773046 Otlukbeli|1062513 Refahiye|1067032 Tercan|1048487 Üzümlü',
  25: '1063597 Aşkale|1065765 Aziziye|1042931 Çat|1061235 Hınıs|1066527 Horasan|1056564 İspir|1032741 Karaçoban|1059022 Karayazı|1058136 Köprüköy|343933 MERKEZ|1049662 Narman|1068592 Oltu|1036201 Olur|1069082 Palandöken|1019362 Pasinler|983548 Pazaryolu|1042923 Şenkaya|1033410 Tekman|1065300 Tortum|987301 Uzundere|1067745 Yakutiye',
  26: '1056516 Alpu|1053712 Beylikova|1059221 Çifteler|993293 Günyüzü|966133 Han|1028823 İnönü|1048603 Mahmudiye|343934 MERKEZ|1033819 Mihalgazi|1055635 Mihalıççık|1069124 Odunpazarı|979001 Sarıcakaya|1059613 Seyitgazi|1069153 Sivrihisar|1069123 Tepebaşı',
  27: '1068200 Araban|1067243 İslahiye|1064820 Karkamış|343935 MERKEZ|1067625 Nizip|1059248 Nurdağı|1063248 Oğuzeli|1069110 Şahinbey|1069216 Şehitkamil|1035396 Yavuzeli',
  28: '961436 Alucra|1068370 Bulancak|1008675 Çamoluk|1029478 Çanakçı|1012974 Dereli|1032435 Doğankent|1066596 Espiye|1066531 Eynesil|1062684 Görele|967925 Güce|1061245 Keşap|1069161 Merkez|1047117 Piraziz|1062885 Şebinkarahisar|1061335 Tirebolu|1043769 Yağlıdere',
  29: '1068624 Kelkit|1005222 Köse|1063290 Kürtün|1067428 Merkez|1009368 Şiran|1059338 Torul',
  30: '1037099 Çukurca|1015506 Derecik|1069023 Merkez|1060541 Şemdinli|1068420 Yüksekova',
  31: '1061667 Altınözü|1069267 Antakya|1068872 Arsuz|1065352 Belen|1067950 Defne|1069118 Dörtyol|1060313 Erzin|1065500 Hassa|1069225 İskenderun|1068600 Kırıkhan|1066441 Kumlu|343939 MERKEZ|1068303 Payas|1068901 Reyhanlı|1067317 Samandağ|1054347 Yayladağı',
  32: '1008220 Aksu|1053943 Atabey|1065365 Eğirdir|1056579 Gelendost|1059304 Gönen|1065544 Keçiborlu|1068994 Merkez|1065015 Senirkent|1066034 Sütçüler|1062917 Şarkikaraağaç|1066085 Uluborlu|1067813 Yalvaç|988267 Yenişarbademli',
  33: '1068261 Akdeniz|1068340 Anamur|1058714 Aydıncık|1064919 Bozyazı|1022058 Çamlıyayla|1067791 Erdemli|1063345 Gülnar|285025 İçel|343941 MERKEZ|1069044 Mezitli|1066817 Mut|1068400 Silifke|1069235 Tarsus|1068935 Toroslar|1069068 Yenişehir',
  34: '1067369 Adalar|1068867 Arnavutköy|1069245 Ataşehir|1069239 Avcılar|1069256 Bağcılar|1069122 Bahçelievler|1069140 Bakırköy|1069269 Başakşehir|1069180 Bayrampaşa|1069154 Beşiktaş|1068882 Beykoz|1069054 Beylikdüzü|1069146 Beyoğlu|1069215 Büyükçekmece|1069199 Çatalca|1069242 Çekmeköy|94785 DARICA|33818 EMİNÖNÜ|1069017 Esenler|1069249 Esenyurt|177837 EYÜP|1069009 Eyüpsultan|1069112 Fatih|1069064 Gaziosmanpaşa|1069173 Güngören|1069210 Kadıköy|1069234 Kağıthane|1069003 Kartal|1069250 Küçükçekmece|1069233 Maltepe|46786 MARMARA EREĞLİSİ|1069244 Pendik|1069041 Sancaktepe|1069135 Sarıyer|1068712 Silivri|1068779 Sultanbeyli|1068906 Sultangazi|1068453 Şile|1068865 Şişli|34964 TOPKAPI|1069033 Tuzla|1069248 Ümraniye|1069231 Üsküdar|35175 YENİKAPI|1069155 Zeytinburnu',
  35: '1068322 Aliağa|1069160 Balçova|1057563 Bayındır|1069043 Bayraklı|1069079 Bergama|1053768 Beydağ|1069208 Bornova|1069266 Buca|1069188 Çeşme|1068803 Çiğli|1069195 Dikili|1069197 Foça|1068675 Gaziemir|1068610 Güzelbahçe|1069264 Karabağlar|1066294 Karaburun|356190 Karacabey|1068980 Karşıyaka|1068668 Kemalpaşa|1059446 Kınık|1061294 Kiraz|1069196 Konak|1068808 Menderes|1068894 Menemen|1067931 Narlıdere|1068677 Ödemiş|1068851 Seferihisar|1068691 Selçuk|1068781 Tire|1068760 Torbalı|1069100 Urla',
  36: '1023855 Akyaka|1066972 Arpaçay|1053809 Digor|1067253 Kağızman|1067351 Merkez|1061073 Sarıkamış|1041881 Selim|1033248 Susuz',
  37: '1036091 Abana|1021638 Ağlı|1065688 Araç|1039919 Azdavay|1047974 Bozkurt|1057496 Cide|1050056 Çatalzeytin|1058982 Daday|1038948 Devrekani|1047106 Doğanyurt|1013697 Hanönü|1069220 İhsangazi|1068623 İnebolu|1041070 Küre|1068993 Merkez|1021116 Pınarbaşı|1027766 Seydiler|1044314 Şenpazar|1060012 Taşköprü|1068006 Tosya',
  38: '1054865 Akkışla|1063117 Bünyan|1069008 Develi|1012119 Felahiye|1067933 Hacılar|1069088 İncesu|1069172 Kocasinan|1069071 Melikgazi|343945 MERKEZ|1063514 Özvatan|1063526 Pınarbaşı|1068371 Sarıoğlan|1005566 Sarız|1069134 Talas|1046564 Tomarza|1065755 Yahyalı|1051745 Yeşilhisar',
  39: '1068723 Babaeski|1067224 Demirköy|750436 Kofçaz|1069111 Lüleburgaz|1068789 Merkez|1050097 Pehlivanköy|1067909 Pınarhisar|1062665 Vize',
  40: '895748 Akçakent|1044010 Akpınar|855432 Boztepe|1050488 Çiçekdağı|1063751 Kaman|1068940 Merkez|1050943 Mucur',
  41: '1068492 Başiskele|1068830 Çayırova|1069219 Darıca|1069040 Derince|1068985 Dilovası|1069237 Gebze|1068874 Gölcük|1069066 İzmit|1066553 Kandıra|1065629 Karamürsel|1068435 Kartepe|1068970 Körfez|343948 MERKEZ',
  42: '920766 Ahırlı|921766 Akören|1068078 Akşehir|1049964 Altınekin|1068570 Beyşehir|1064257 Bozkır|1068390 Cihanbeyli|1041504 Çeltik|1063359 Çumra|1058866 Derbent|980237 Derebucak|1043790 Doğanhisar|962068 Emirgazi|1069030 Ereğli|1057445 Güneysınır|1049216 Hadim|1044211 Halkapınar|1054988 Hüyük|1065556 Ilgın|1055140 Kadınhanı|1066211 Karapınar|1069228 Karatay|1063254 Kulu|1069243 Meram|343949 MERKEZ|1068846 Sarayönü|1069032 Selçuklu|1069011 Seydişehir|1012415 Taşkent|731192 Tuzlukçu|955890 Yalıhüyük|1060477 Yunak',
  43: '1066190 Altıntaş|1052839 Aslanapa|1052094 Çavdarhisar|1062968 Domaniç|887822 Dumlupınar|1066936 Emet|1067898 Gediz|1053536 Hisarcık|1068563 Merkez|1004171 Pazarlar|1068966 Simav|1053655 Şaphane|1065883 Tavşanlı',
  44: '1064711 Akçadağ|995793 Arapgir|993598 Arguvan|1069159 Battalgazi|1067906 Darende|1065123 Doğanşehir|902491 Doğanyol|1055447 Hekimhan|947370 Kale|1059459 Kuluncak|343951 MERKEZ|1047668 Pütürge|1018772 Yazıhan|1068896 Yeşilyurt',
  45: '1068512 Ahmetli|1067866 Akhisar|1066694 Alaşehir|1068220 Demirci|1060895 Gölmarmara|1061376 Gördes|1069182 Kırkağaç|1064244 Köprübaşı|1066684 Kula|343952 MERKEZ|1069150 Salihli|1067015 Sarıgöl|1062983 Saruhanlı|1067011 Selendi|1069265 Soma|1068565 Şehzadeler|1068949 Turgutlu|1068552 Yunusemre',
  46: '1067992 Afşin|1068651 Andırın|1050842 Çağlayancerit|1069091 Dulkadiroğlu|981660 Ekinözü|1068415 Elbistan|1069036 Göksun|343953 MERKEZ|1059385 Nurhak|1067859 Onikişubat|1068479 Pazarcık|1067417 Türkoğlu',
  47: '1068769 Artuklu|1063960 Dargeçit|1067828 Derik|1069246 Kızıltepe|1068350 Mazıdağı|343954 MERKEZ|1068382 Midyat|1067706 Nusaybin|1053337 Ömerli|1047437 Savur|1064481 Yeşilli',
  48: '1069186 Bodrum|1068714 Dalaman|1069015 Datça|1069221 Fethiye|1048886 Kavaklıdere|1068568 Köyceğiz|1068425 Marmaris|1067653 Menteşe|343955 MERKEZ|1069060 Milas|1068206 Ortaca|1066261 Seydikemer|1064769 Ula|1068124 Yatağan',
  49: '1064688 Bulanık|1007946 Hasköy|1037001 Korkut|1043801 Malazgirt|1067738 Merkez|1045550 Varto',
  50: '1059674 Acıgöl|1068478 Avanos|1068850 Derinkuyu|1064624 Gülşehir|1064446 Hacıbektaş|1054177 Kozaklı|1069241 Merkez|1068920 Ürgüp',
  51: '1067556 Altunhisar|1069260 Bor|1066520 Çamardı|949853 Çiftlik|1068524 Merkez|1061034 Ulukışla',
  52: '1008266 Akkuş|1069253 Altınordu|1044141 Aybastı|1019076 Çamaş|1046319 Çatalpınar|1037959 Çaybaşı|1068398 Fatsa|1068033 Gölköy|1002977 Gülyalı|990138 Gürgentepe|1052823 İkizce|815449 Kabadüz|1056216 Kabataş|1059736 Korgan|1067787 Kumru|343959 MERKEZ|1055990 Mesudiye|1064530 Perşembe|930157 Ulubey|1068973 Ünye',
  53: '1067659 Ardeşen|982743 Çamlıhemşin|1068218 Çayeli|1008740 Derepazarı|1066393 Fındıklı|1055781 Güneysu|1049650 Hemşin|1055700 İkizdere|1020461 İyidere|1058962 Kalkandere|1068531 Merkez|1066679 Pazar',
  54: '1068870 Adapazarı|1068451 Akyazı|1068883 Arifiye|1064964 Erenler|1063538 Ferizli|1064355 Geyve|1067644 Hendek|1057641 Karapürçek|1068518 Karasu|1065432 Kaynarca|1067927 Kocaali|1063898 Pamukova|1069181 Sapanca|1068184 Serdivan|1067929 Söğütlü|1044042 Taraklı',
  55: '1069113 19 Mayıs|1065293 Alaçam|1028801 Asarcık|1069270 Atakum|1059620 Ayvacık|1069189 Bafra|1068113 Canik|1069255 Çarşamba|1068542 Havza|1068816 İlkadım|1062049 Kavak|1063129 Ladik|285032 Merkez|178156 ONDOKUZ MAYIS|1033260 Salıpazarı|1068443 Tekkeköy|1068616 Terme|1066424 Vezirköprü|1068335 Yakakent',
  56: '1065807 Baykan|1032823 Eruh|1068397 Kurtalan|1069129 Merkez|1045993 Pervari|985050 Şirvan|1058978 Tillo',
  57: '1061784 Ayancık|1063037 Boyabat|1036245 Dikmen|1063748 Durağan|1063455 Erfelek|1067472 Gerze|1068652 Merkez|1064230 Saraydüzü|1067466 Türkeli',
  58: '948828 Akıncılar|1052617 Altınyayla|1063592 Divriği|970612 Doğanşar|1064238 Gemerek|1058887 Gölova|1068911 Gürün|1064282 Hafik|1053319 İmranlı|1063180 Kangal|1041048 Koyulhisar|1068639 Merkez|1067118 Suşehri|1065124 Şarkışla|1056504 Ulaş|1068541 Yıldızeli|1063615 Zara',
  59: '1068982 Çerkezköy|1068796 Çorlu|1067741 Ergene|1059445 Hayrabolu|1069057 Kapaklı|1067600 Malkara|1068917 Marmaraereğlisi|343966 MERKEZ|1065086 Muratlı|1068085 Saray|1069222 Süleymanpaşa|1068408 Şarköy',
  60: '1066388 Almus|1047987 Artova|869291 Başçiftlik|1068328 Erbaa|1069090 Merkez|1063337 Niksar|1018602 Pazar|1068365 Reşadiye|1035301 Sulusaray|1069042 Turhal|1049256 Yeşilyurt|1069029 Zile',
  61: '1068916 Akçaabat|1063683 Araklı|1069200 Arsin|1068426 Beşikdüzü|1062471 Çarşıbaşı|1061997 Çaykara|1053136 Dernekpazarı|1031739 Düzköy|1068427 Hayrat|960077 Köprübaşı|1061347 Maçka|343968 MERKEZ|1068473 Of|1068810 Ortahisar|1069261 Sürmene|978942 Şalpazarı|1055170 Tonya|1064829 Vakfıkebir|1064211 Yomra',
  62: '1019068 Çemişgezek|1061064 Hozat|1065239 Mazgirt|1068336 Merkez|759917 Nazımiye|1037330 Ovacık|1042208 Pertek|1060775 Pülümür',
  63: '1058560 Akçakale|1062605 Birecik|1064751 Bozova|1062532 Ceylanpınar|1069018 Eyyübiye|1062979 Halfeti|1068981 Haliliye|1037787 Harran|1066120 Hilvan|1068557 Karaköprü|343970 MERKEZ|1068475 Siverek|1067945 Suruç|1068827 Viranşehir',
  64: '1068672 Banaz|1067220 Eşme|1030030 Karahallı|1069218 Merkez|1065034 Sivaslı|1068097 Ulubey',
  65: '792984 Bahçesaray|1008375 Başkale|1060410 Çaldıran|1022992 Çatak|1069152 Edremit|1069102 Erciş|1069020 Gevaş|1002642 Gürpınar|1068594 İpekyolu|343972 MERKEZ|1058552 Muradiye|1053135 Özalp|942379 Saray|1068585 Tuşba',
  66: '1068320 Akdağmadeni|1028122 Aydıncık|1061941 Boğazlıyan|991888 Çandır|1054845 Çayıralan|1044895 Çekerek|1064102 Kadışehri|1068607 Merkez|1060453 Saraykent|1065652 Sarıkaya|1069230 Sorgun|1056770 Şefaatli|1040954 Yenifakılı|1069254 Yerköy',
  67: '1068706 Alaplı|1067693 Çaycuma|1068219 Devrek|1069162 Ereğli|1067482 Gökçebey|1068070 Kilimli|1067664 Kozlu|1069061 Merkez',
  68: '1063017 Ağaçören|1066286 Eskil|1068641 Gülağaç|1041820 Güzelyurt|1069098 Merkez|1067149 Ortaköy|826237 Sarıyahşi|1053755 Sultanhanı',
  69: '1042852 Aydıntepe|1067798 Demirözü|1068099 Merkez',
  70: '1049335 Ayrancı|987247 Başyayla|1044207 Ermenek|1027549 Kazımkarabekir|1068744 Merkez|1032456 Sarıveliler',
  71: '1048777 Bahşılı|1054107 Balışeyh|921907 Çelebi|1048635 Delice|979537 Karakeçili|1064934 Keskin|1069209 Merkez|1050999 Sulakyurt|1066781 Yahşihan',
  72: '1059015 Beşiri|1054462 Gercüş|1044045 Hasankeyf|1064669 Kozluk|1069026 Merkez|1063736 Sason',
  73: '1066276 Beytüşşebap|1068683 Cizre|1061630 Güçlükonak|1065422 İdil|1067645 Merkez|1066542 Silopi|1066579 Uludere',
  74: '1060578 Amasra|1046317 Kurucaşile|1069109 Merkez|1063432 Ulus',
  75: '1055590 Çıldır|1052925 Damal|1044933 Göle|1068546 Hanak|1068690 Merkez|1051433 Posof',
  76: '1030432 Aralık|968559 Karakoyunlu|1067305 Merkez|1066319 Tuzluca',
  77: '1067677 Altınova|1065468 Armutlu|1068999 Çınarcık|1068285 Çiftlikköy|1068863 Merkez|1068179 Termal',
  78: '1032857 Eflani|1068302 Eskipazar|1069212 Merkez|890977 Ovacık|1066256 Safranbolu|1062633 Yenice',
  79: '1058769 Elbeyli|178364 KİLİS MERKEZ|1068747 Merkez|952878 Musabeyli|946319 Polateli',
  80: '1062852 Bahçe|1068394 Düziçi|1056309 Hasanbeyli|1068873 Kadirli|1068202 Merkez|1052821 Sumbas|1055270 Toprakkale',
  81: '1067444 Akçakoca|1066273 Cumayeri|1069037 Çilimli|1068278 Gölyaka|1063737 Gümüşova|1066771 Kaynaşlı|1069175 Merkez|1051591 Yığılca',
};
