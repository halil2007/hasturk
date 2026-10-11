// Veri sağlık kontrolü: para hesaplarının dayandığı, canlı veriyle doğrulanamamış VARSAYIMLAR firmanın kendi saklanan verisiyle
// (ve kısa, salt okuma API örnekleriyle) sınanır. Her kontrol: ✓ tutarlı (ok) / ⚠ şüpheli (warn) / — veri yok (none), sayılar,
// kısa Türkçe açıklama ve ne yapılmalı. Sonuç 1 saat önbellekte tutulur ("Yeniden kontrol et" hemen yeniler).
// Kontroller (bkz. checks):
//   1) Hepsiburada hakediş "Commission" kaydı KDV dahil mi (sipariş satırı komisyonu × 1,20 ile oran ≈ 1)
//   2) Trendyol hakediş komisyonu (Satış + indirim kayıtları) ↔ sipariş satırı komisyonu (oran ≈ 1)
//   3) Hakediş satış tutarı (Satış + satıcı indirimi / kupon) ↔ panelin sipariş tutarı
//   4) Kargo faturasında iade kargosu ayrılıyor mu; kargo faturası siparişlerle eşleşiyor mu
//   5) Hakediş "ödendi" bilgisi güncelleniyor mu; tanınmayan hakediş kayıt türleri
//   6) Kanaldaki ilan durumları (remote_state; sütun yoksa atlanır)
//   7) İlan komisyonu resmî listeyle uyumlu mu (KDV kalıbı, liste üstü oranlar)
//   8) Döviz siparişleri, stok / fiyat gönderim hataları, son başarılı senkron
import { all, first, getRaw, setSetting } from './db.js';
import { getChannels } from './channels/index.js';
import { listRate, mpOf, ABOVE_LIST } from './commcheck.js';
import { costOf, costVat } from '../public/profit.js';
import { r2, withBudget } from './util.js';

const D = 864e5, H = 3600e3;
export const TTL = H;
export const OK = 'ok', WARN = 'warn', NONE = 'none';
export const MIN_ORDERS = 3;        // oran kontrolü için en az sipariş
const WINDOW = 90 * D;              // incelenen dönem (sipariş tarihi)
const LATE_PAY = 7 * D;              // vadesi bu kadar geçmiş ödenmemiş kayıt şüpheli
const STALE_SYNC = 2 * H;            // siparişleri bu süredir alınamayan kanal şüpheli
const DISC_TYPES = "('İndirim', 'İndirim iptali', 'Kupon', 'Kupon iptali', 'Kampanya indirimi')";

const fin = (v) => Number(v) || 0;
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const trn = (v, d = 2) => (Number.isFinite(Number(v)) ? Number(v).toLocaleString('tr-TR', { maximumFractionDigits: d }) : '—');
const tl = (v) => `${trn(r2(v))} ₺`;
export const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const worst = (list) => (list.includes(WARN) ? WARN : list.includes(OK) ? OK : NONE);

// ---------- oran değerlendirmesi ----------
// ratios: pazaryeri / panel. ≈1 tutarlı; ≈1,20 panel KDV'yi eksik sayıyor; ≈0,83 panel KDV'yi fazladan ekliyor ya da kayıt KDV hariç.
export function judgeRatio(ratios, { min = MIN_ORDERS } = {}) {
  const v = ratios.map(Number).filter((x) => Number.isFinite(x) && x > 0);
  if (v.length < min) return { status: NONE, n: v.length, kind: 'few' };
  const med = median(v), near = (x) => v.filter((r) => Math.abs(r / x - 1) <= 0.05).length;
  const kind = Math.abs(med - 1) <= 0.03 ? 'equal' : Math.abs(med - 1.2) <= 0.04 ? 'x1.2' : Math.abs(med - 1 / 1.2) <= 0.03 ? 'x0.83' : med > 1 ? 'higher' : 'lower';
  const share = pct(near(1), v.length);
  return { status: kind === 'equal' && share >= 80 ? OK : WARN, n: v.length, median: Math.round(med * 1000) / 1000, share, kind, x12: near(1.2), x083: near(1 / 1.2) };
}
// Oran sonucunun Türkçe yorumu (what: "komisyon", "satış tutarı" …)
export function ratioText(j, what = 'komisyon') {
  if (j.kind === 'few') return `Karşılaştırılabilir sipariş yok ya da çok az (${j.n}).`;
  if (j.kind === 'equal' && j.status === OK) return `Pazaryerinin kaydındaki ${what} ile panelin hesabı birbirini tutuyor (ortanca oran ${trn(j.median, 3)}, ±%5 içinde kalan sipariş: %${trn(j.share, 1)}).`;
  if (j.kind === 'equal') return `Ortanca oran 1'e yakın (${trn(j.median, 3)}) ama ±%5 içinde kalan sipariş yalnız %${trn(j.share, 1)}: bazı siparişlerde ${what} farklı (kampanya, kategori değişikliği ya da eşleşme hatası).`;
  if (j.kind === 'x1.2') return `Pazaryerinin kaydındaki ${what} panelin hesabından ~%20 YÜKSEK (ortanca oran ${trn(j.median, 3)}): panel KDV'yi eklemiyor olabilir — kâr olduğundan yüksek görünür.`;
  if (j.kind === 'x0.83') return `Pazaryerinin kaydındaki ${what} panelin hesabından ~%17 DÜŞÜK (ortanca oran ${trn(j.median, 3)}): kayıt KDV hariç ya da panel KDV'yi iki kez ekliyor — kâr olduğundan düşük görünür.`;
  return `Oranlar KDV kalıbına (1,20 / 0,83) uymuyor: ortanca ${trn(j.median, 3)}. Komisyon oranı / tutarı farklı hesaplanıyor olabilir.`;
}

// ---------- sipariş ↔ hakediş satırları ----------
// Dönemdeki canlı siparişler (iptal / iade hariç) ve hakediş kayıtları sipariş başına toplanır. clean: kısmi iade ya da
// iade / düzeltme / provizyon kaydı yok (karşılaştırma bunlarla bozulmasın).
export async function orderRows(db, settings, chId, from) {
  const rows = await all(db, `SELECT o.id, o.order_number, it.n, it.total, it.comm, it.comm_n, it.est, it.maxq, it.ret,
      s.sale, s.sale_comm, s.disc, s.disc_comm, s.hb_comm, s.adj
    FROM orders o
    JOIN (SELECT i.order_id, COUNT(*) AS n, SUM(i.total) AS total, SUM(i.commission) AS comm, SUM(i.commission IS NOT NULL) AS comm_n,
        SUM(i.total * COALESCE(l.commission * ?, ?) / 100.0) AS est, MAX(i.quantity) AS maxq, SUM(COALESCE(i.returned_qty, 0)) AS ret
      FROM order_items i JOIN orders o2 ON o2.id = i.order_id LEFT JOIN listings l ON l.channel = o2.channel AND l.remote_id = i.remote_key
      WHERE o2.channel = ? AND o2.ordered_at >= ? AND COALESCE(i.status, '') NOT IN ('cancelled', 'returned') GROUP BY i.order_id) it ON it.order_id = o.id
    JOIN (SELECT order_number,
        SUM(CASE WHEN type = 'Satış' THEN amount + COALESCE(commission, 0) ELSE 0 END) AS sale,
        SUM(CASE WHEN type = 'Satış' THEN COALESCE(commission, 0) ELSE 0 END) AS sale_comm,
        SUM(CASE WHEN type IN ${DISC_TYPES} THEN amount + COALESCE(commission, 0) ELSE 0 END) AS disc,
        SUM(CASE WHEN type IN ${DISC_TYPES} THEN COALESCE(commission, 0) ELSE 0 END) AS disc_comm,
        SUM(CASE WHEN type = 'Komisyon' AND COALESCE(raw_type, '') IN ('', 'Commission') THEN COALESCE(commission, 0) ELSE 0 END) AS hb_comm,
        SUM(CASE WHEN type IN ('İade', 'Manuel iade') OR type LIKE 'Komisyon düzeltme%' OR type LIKE 'Hakediş düzeltme%' OR type LIKE 'Provizyon%'
          OR (type = 'Komisyon' AND COALESCE(raw_type, '') NOT IN ('', 'Commission')) THEN 1 ELSE 0 END) AS adj
      FROM settlements WHERE channel = ? AND COALESCE(order_number, '') != '' AND COALESCE(date, 0) >= ? GROUP BY order_number) s ON s.order_number = o.order_number
    WHERE o.channel = ? AND o.ordered_at >= ? AND o.status NOT IN ('cancelled', 'returned') ORDER BY o.ordered_at DESC LIMIT 3000`,
  costVat(settings), costOf(settings, 'commission', chId), chId, from, chId, from - 30 * D, chId, from);
  return rows.map((r) => ({ ...r, clean: !fin(r.ret) && !fin(r.adj), api: fin(r.n) > 0 && fin(r.comm_n) === fin(r.n) }));
}
const sample = (list, f, k = 5) => list.slice(0, k).map(f);

// 1) Hepsiburada: hakediş Commission kaydı ↔ sipariş satırı komisyonu (API tutarı × 1,20). probe: Hepsiburada kaydında amount / netAmount.
export function hbCommissionCheck(ch, rows, probe) {
  const base = rows.filter((r) => r.clean && fin(r.hb_comm) > 0);
  const api = base.filter((r) => r.api && fin(r.comm) > 0), est = base.filter((r) => !fin(r.comm_n) && fin(r.est) > 0);
  const useApi = api.length >= MIN_ORDERS || !est.length, use = useApi ? api : est;
  const j = judgeRatio(use.map((r) => fin(r.hb_comm) / fin(useApi ? r.comm : r.est)));
  const multi = useApi ? judgeRatio(api.filter((r) => fin(r.maxq) > 1).map((r) => fin(r.hb_comm) / fin(r.comm))) : null;
  const numbers = [['Karşılaştırılan sipariş', trn(j.n)], ['Panel komisyonu', useApi ? 'sipariş satırından (API × 1,20)' : 'tahmin (ilan / Ayarlar oranı)'], ['Ortanca oran (hakediş ÷ panel)', j.median != null ? trn(j.median, 3) : '—'],
    ['±%5 içinde', j.n ? `%${trn(j.share, 1)}` : '—'], ['≈1,20 / ≈0,83 kalıbı', j.n ? `${j.x12} / ${j.x083} sipariş` : '—']];
  if (multi && multi.n) numbers.push(['Çok adetli satırlarda ortanca oran', `${trn(multi.median, 3)} (${multi.n} sipariş)`]);
  let status = j.status, text = ratioText(j);
  if (!useApi && j.status !== NONE) text = `Sipariş satırında Hepsiburada komisyonu yok; karşılaştırma panelin tahminiyle (ilan / Ayarlar oranı) yapıldı. ${text}`;
  if (multi && multi.status === WARN && j.status === OK) { status = WARN; text += ` Ancak çok adetli satırlarda oran ${trn(multi.median, 3)}: adet başı / satır toplamı ayrımı hatalı olabilir.`; }
  // API örneği: amount / netAmount ≈ 1,20 → kayıttaki tutar KDV dahil (panelin varsayımı)
  const tech = { basis: useApi ? 'api' : 'estimate', judge: j, multi, sample: sample(use, (r) => ({ order: r.order_number, hakedis: r2(r.hb_comm), panel: r2(useApi ? r.comm : r.est), maxq: r.maxq })) };
  if (probe && !probe.error && probe.commission) {
    const g = median(probe.commission.grossToNet || []), t = median(probe.commission.taxToNet || []);
    tech.probe = { records: probe.commission.records, grossToNet: g && r2(g * 1000) / 1000, taxToNet: t && r2(t * 1000) / 1000 };
    if (g != null) {
      numbers.push(['API örneği: tutar ÷ KDV hariç tutar', `${trn(g, 3)} (${probe.commission.grossToNet.length} kayıt)`]);
      if (Math.abs(g - 1.2) <= 0.03) { text += ' Hepsiburada kaydının kendisi de tutarın KDV dahil olduğunu gösteriyor (amount ≈ netAmount × 1,20).'; if (status === NONE) status = OK; }
      else if (Math.abs(g - 1) <= 0.01 && t != null && Math.abs(t - 0.2) <= 0.02) { status = WARN; text += ' Hepsiburada kaydında tutar KDV HARİÇ görünüyor (amount = netAmount, KDV ayrı): hakediş komisyonu %20 eksik okunuyor olabilir.'; }
      else if (Math.abs(g - 1) > 0.01) { status = worst([status, WARN]); text += ` Hepsiburada kaydında tutar / KDV hariç tutar oranı beklenmedik (${trn(g, 3)}).`; }
    }
  } else if (probe && probe.error) tech.probeError = probe.error;
  return { id: 'hb_commission_vat', group: 'money', channel: ch.id, title: `${ch.name}: hakediş komisyonu KDV dahil mi?`, status, summary: text, numbers,
    explain: 'Panel, Hepsiburada sipariş satırındaki komisyonu (KDV hariç gelir) %20 KDV ekleyerek sayar ve hakediş "Komisyon" kaydını KDV dahil kabul eder. İkisi tutmalı.',
    action: status === WARN ? 'Destek\'e gönder ile bize iletin: oran kalıbına göre hesap formülü düzeltilir. Sipariş sipariş fark: Gelir & Gider → Hakediş → Mutabakat.' : status === OK ? 'Bir şey yapmanız gerekmez.' : 'Hepsiburada hakediş kayıtları geldikçe (teslimden birkaç gün sonra) kontrol anlamlı olur.', tech };
}

// 2) Trendyol: hakediş komisyonu (Satış + indirim / kupon kayıtları) ↔ sipariş satırı komisyonu (satır oranı KDV dahil, × tutar)
export function tyCommissionCheck(ch, rows, probe) {
  const base = rows.filter((r) => r.clean && fin(r.sale_comm) > 0);
  const api = base.filter((r) => r.api && fin(r.comm) > 0), est = base.filter((r) => !fin(r.comm_n) && fin(r.est) > 0);
  const useApi = api.length >= MIN_ORDERS || !est.length, use = useApi ? api : est;
  const mp = (r) => fin(r.sale_comm) + fin(r.disc_comm);
  const j = judgeRatio(use.map((r) => mp(r) / fin(useApi ? r.comm : r.est)));
  const numbers = [['Karşılaştırılan sipariş', trn(j.n)], ['Panel komisyonu', useApi ? 'sipariş satırındaki oran × tutar' : 'tahmin (ilan / Ayarlar oranı)'], ['Ortanca oran (hakediş ÷ panel)', j.median != null ? trn(j.median, 3) : '—'],
    ['±%5 içinde', j.n ? `%${trn(j.share, 1)}` : '—'], ['≈1,20 / ≈0,83 kalıbı', j.n ? `${j.x12} / ${j.x083} sipariş` : '—']];
  let status = j.status, text = ratioText(j);
  if (!useApi && j.status !== NONE) text = `Sipariş satırında komisyon oranı yok; karşılaştırma panelin tahminiyle yapıldı. ${text}`;
  const tech = { basis: useApi ? 'api' : 'estimate', judge: j, sample: sample(use, (r) => ({ order: r.order_number, hakedis: r2(mp(r)), panel: r2(useApi ? r.comm : r.est) })) };
  // API örneği: Satış kaydında commissionAmount ≈ alacak × commissionRate / 100 → oran doğrudan tutara uygulanıyor (KDV ayrıca eklenmiyor)
  if (probe && !probe.error && probe.sale) {
    const pj = judgeRatio(probe.sale.ratios || []);
    tech.probe = { records: probe.sale.records, judge: pj };
    if (pj.n) {
      numbers.push(['API örneği: komisyon ÷ (satış × oran)', `${trn(pj.median, 3)} (${pj.n} kayıt)`]);
      if (pj.kind === 'x1.2') { status = WARN; text += ' Trendyol kaydında komisyon tutarı satır oranının 1,20 katı: oran KDV hariç olabilir (panel oranı KDV dahil sayıyor).'; }
      else if (pj.status === OK && status === NONE) { status = OK; text += ' Trendyol kaydında komisyon tutarı satış × komisyon oranına eşit (oran olduğu gibi uygulanıyor).'; }
      else if (pj.status === WARN) { status = WARN; text += ` Trendyol kaydında komisyon ÷ (satış × oran) beklenmedik: ${trn(pj.median, 3)}.`; }
    }
  } else if (probe && probe.error) tech.probeError = probe.error;
  return { id: 'ty_commission', group: 'money', channel: ch.id, title: `${ch.name}: komisyon (sipariş satırı ↔ hakediş)`, status, summary: text, numbers,
    explain: 'Panel, Trendyol sipariş satırındaki komisyon oranını KDV dahil kabul eder (resmî tablo KDV dahil) ve satır tutarıyla çarpar. Hakediş kaydındaki komisyon (indirimle düşen kısım dahil) bununla tutmalı.',
    action: status === WARN ? 'Destek\'e gönder ile bize iletin. Sipariş sipariş fark: Gelir & Gider → Hakediş → Mutabakat.' : status === OK ? 'Bir şey yapmanız gerekmez.' : 'Hakediş kayıtları geldikçe kontrol anlamlı olur.', tech };
}

// 3) Hakediş satış tutarı (Satış + satıcı indirimi / kupon / kampanya) ↔ panelin sipariş tutarı
export function salesCheck(ch, rows) {
  const use = rows.filter((r) => r.clean && Math.abs(fin(r.sale)) > 0.01 && fin(r.total) > 0);
  const tol = (r) => Math.max(1, 0.005 * fin(r.total));
  const ok = (r) => Math.abs(fin(r.sale) + fin(r.disc) - fin(r.total)) < tol(r);
  const matched = use.filter(ok), bad = use.filter((r) => !ok(r)), withDisc = use.filter((r) => Math.abs(fin(r.disc)) >= 0.01);
  // Panel tutarı satıcı indiriminden önceki (brüt) tutara eşit: indirim panelde düşülmemiş
  const gross = bad.filter((r) => Math.abs(fin(r.disc)) >= 0.01 && Math.abs(fin(r.sale) - fin(r.total)) < tol(r));
  const low = bad.filter((r) => fin(r.sale) + fin(r.disc) > fin(r.total)), high = bad.filter((r) => fin(r.sale) + fin(r.disc) < fin(r.total));
  const share = pct(matched.length, use.length);
  // İndirimli siparişler ayrıca: genel oran yüksek olsa da indirim / kupon kaydı olanların çoğu tutmuyorsa indirim varsayımı şüphelidir
  const discOk = withDisc.filter(ok).length, discBad = withDisc.length >= MIN_ORDERS && discOk / withDisc.length < 0.5;
  let status = use.length < MIN_ORDERS ? NONE : share >= 90 && !discBad ? OK : WARN, text;
  const discNote = withDisc.length ? ` İndirim / kupon kaydı olan ${withDisc.length} siparişten ${discOk} tanesi tutuyor.` : '';
  if (status === NONE) text = `Karşılaştırılabilir sipariş yok ya da çok az (${use.length}).`;
  else if (status === OK) text = `Hakediş satış tutarı (indirim / kupon düşülerek) panelin sipariş tutarıyla aynı olan sipariş oranı: %${trn(share, 1)}.${discNote}`;
  else if (share >= 90 && discBad) text = `Siparişlerin çoğu tutuyor (%${trn(share, 1)}) ama indirim / kupon kaydı olan ${withDisc.length} siparişten yalnız ${discOk} tanesi tutuyor: `
    + (gross.length >= (withDisc.length - discOk) / 2 ? 'panel tutarı satıcı indiriminden ÖNCEKİ tutar, indirim / kupon panelde düşülmüyor (ciro ve kâr yüksek görünür).' : 'satıcı indirimi / kuponu panelde farklı hesaplanıyor.');
  else if (gross.length >= bad.length / 2) text = `${bad.length} siparişte fark var; bunlardan ${gross.length} tanesinde panel tutarı satıcı indiriminden ÖNCEKİ tutar: satıcı indirimi / kuponu panelde düşülmüyor (ciro ve kâr yüksek görünür).`;
  else if (high.length > low.length) text = `${bad.length} siparişte (%${trn(100 - share, 1)}) panelin sipariş tutarı hakediş satışından YÜKSEK (en çok ${tl(Math.max(...high.map((r) => fin(r.total) - fin(r.sale) - fin(r.disc))))}): panelde görünmeyen indirim / kupon olabilir.`;
  else text = `${bad.length} siparişte (%${trn(100 - share, 1)}) panelin sipariş tutarı hakediş satışından DÜŞÜK: indirim iki kez düşülmüş ya da pazaryeri ek tutar (kargo payı, hizmet) eklemiş olabilir.`;
  return { id: 'sales_vs_settlement', group: 'money', channel: ch.id, title: `${ch.name}: hakediş satış tutarı ↔ sipariş tutarı`, status, summary: text,
    numbers: [['Karşılaştırılan sipariş', trn(use.length)], ['Tutan', `${trn(matched.length)} (%${trn(share, 1)})`], ['İndirim / kupon kaydı olan', `${trn(withDisc.length)} (tutan ${discOk})`], ['Panel yüksek / düşük', `${high.length} / ${low.length}`]],
    explain: 'Panelin sipariş tutarı satıcının karşıladığı indirim düşülmüş tutardır. Hakedişte "Satış" kaydı ile satıcı indirimi / kupon kayıtlarının toplamı buna eşit olmalı (pazaryerinin karşıladığı indirim hariç).',
    action: status === WARN ? 'Destek\'e gönder ile bize iletin; örnek siparişler raporda. Tek tek bakmak için Gelir & Gider → Hakediş → Mutabakat.' : status === OK ? 'Bir şey yapmanız gerekmez.' : 'Hakediş kayıtları geldikçe kontrol anlamlı olur.',
    tech: { matched: matched.length, n: use.length, gross: gross.length, high: high.length, low: low.length, sample: sample(bad, (r) => ({ order: r.order_number, panel: r2(r.total), satis: r2(r.sale), indirim: r2(r.disc) })) } };
}

// 4) İade kargosu ayrımı ve kargo faturası eşleşmesi
export async function cargoChecks(db, ch, now, probe) {
  const from = now - WINDOW, until = now - 10 * D, state = await getRaw(db, 'costs:' + ch.id);
  const r = await first(db, `SELECT COUNT(*) AS ret, SUM(o.shipping_src = 'api') AS out_api, SUM(o.return_ship_src = 'api') AS ret_api, SUM(o.return_ship_src = 'lumped') AS lumped
    FROM orders o WHERE o.channel = ? AND o.ordered_at >= ? AND o.ordered_at < ?
      AND (o.status = 'returned' OR EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND (i.status = 'returned' OR COALESCE(i.returned_qty, 0) > 0)))`, ch.id, from, until);
  const anyRet = await first(db, "SELECT COUNT(*) AS n FROM orders WHERE channel = ? AND return_ship_src = 'api' AND ordered_at >= ?", ch.id, from);
  const ret = fin(r && r.ret), outApi = fin(r && r.out_api), retApi = fin(r && r.ret_api), lumped = fin(r && r.lumped);
  const numbers = [['İade edilen sipariş (90 gün, son 10 gün hariç)', trn(ret)], ['Gönderim kargosu faturadan gelen', trn(outApi)], ['İade kargosu faturada bulunan', trn(retApi)], ['Dönemde iade kargosu yazılan tüm siparişler', trn(anyRet && anyRet.n)]];
  if (lumped) numbers.push(['Eski kayıt (iade kargosu gönderimle birlikte)', trn(lumped)]);
  const tech = { state, ret, outApi, retApi, lumped, anyRet: anyRet && anyRet.n };
  let status, text;
  if (state && state.error) { status = WARN; text = `Kargo faturaları okunamıyor: ${state.error}`; }
  else if (!state) { status = NONE; text = 'Kargo faturaları henüz okunmadı (6 saatte bir okunur).'; }
  else if (!ret) { status = NONE; text = 'Dönemde iade edilen sipariş yok.'; }
  else if (retApi) { status = OK; text = `İade edilen ${ret} siparişten ${retApi} tanesinde iade kargosu faturada ayrı bulundu (%${trn(pct(retApi, ret), 1)}).`; }
  else if (ret >= MIN_ORDERS && outApi) { status = WARN; text = `İade kargosu faturada ayırt edilemiyor: iade edilen ${ret} siparişten ${outApi} tanesinde gönderim kargosu faturadan geldi ama hiçbirinde iade kargosu kalemi bulunamadı. İade maliyeti Ayarlar'daki tahmini "İade kargo bedeli" ile hesaplanıyor.`; }
  else { status = NONE; text = `İade edilen ${ret} sipariş var ama faturayla eşleşen yok ya da veri az; karar verilemedi.`; }
  // API örneği: son kargo faturasının kalem türleri (Trendyol) / son 28 günün kayıt türleri (Hepsiburada)
  if (probe && !probe.error) {
    if (probe.cargo && probe.cargo.items) {
      const types = Object.entries(probe.cargo.types || {}).map(([k, n]) => `${k}: ${n}`).join(', ');
      numbers.push(['API örneği: son kargo faturası kalem türleri', types || '—']);
      tech.probe = probe.cargo;
      if (!probe.cargo.returnItems && status === WARN) text += ' Son kargo faturasında da iade diyen kalem türü yok.';
      if (probe.cargo.returnItems && status === WARN) text += ` Son kargo faturasında ${probe.cargo.returnItems} iade kalemi var: kalemler siparişle eşleşmiyor olabilir.`;
    } else if (probe.types) {
      const t = Object.keys(probe.types.types || {}), rt = t.filter((x) => /return/i.test(x) && /ship|cargo|transport|deliver/i.test(x));
      numbers.push(['API örneği: iade kargosu kayıt türleri (28 gün)', rt.length ? rt.map((x) => `${x}: ${probe.types.types[x]}`).join(', ') : 'yok']);
      tech.probe = probe.types;
    }
  } else if (probe && probe.error) tech.probeError = probe.error;
  const out = [{ id: 'return_cargo', group: 'money', channel: ch.id, title: `${ch.name}: iade kargosu faturada ayrılıyor mu?`, status, summary: text, numbers,
    explain: 'İade maliyeti için iade gönderisinin kargo bedeli, kargo faturasındaki kalem türünden (Trendyol "İade Kargo Bedeli", Hepsiburada ReturnShipmentCostSharingExpense) ayrılır. Ayrılamazsa Ayarlar → Giderler "İade kargo bedeli" tahmini kullanılır.',
    action: status === WARN ? 'Destek\'e gönder ile bize iletin. O zamana kadar Ayarlar → Giderler\'de "İade kargo bedeli" girin.' : status === OK ? 'Bir şey yapmanız gerekmez.' : 'İade olan siparişlerin faturası kesildikçe kontrol anlamlı olur.', tech }];
  // Kargo faturası ↔ sipariş eşleşmesi (fatura gönderimden günler sonra kesilir: son 15 gün hariç)
  const m = await first(db, `SELECT COUNT(*) AS n, SUM(shipping_src = 'api') AS api FROM orders WHERE channel = ? AND status IN ('shipped', 'delivered') AND ordered_at >= ? AND ordered_at < ?
    AND COALESCE(shipping_src, '') != 'manual'`, ch.id, now - 60 * D, now - 15 * D);
  const n = fin(m && m.n), api = fin(m && m.api), share = pct(api, n);
  const ms = !state || state.error ? NONE : n < MIN_ORDERS ? NONE : share >= 70 ? OK : WARN;
  out.push({ id: 'cargo_match', group: 'money', channel: ch.id, title: `${ch.name}: kargo faturası siparişlerle eşleşiyor mu?`, status: ms,
    summary: ms === NONE ? (n < MIN_ORDERS ? 'Dönemde yeterli kargolanmış sipariş yok.' : 'Kargo faturaları henüz okunmadı.') : ms === OK ? `Kargo gideri faturadan gelen sipariş oranı: %${trn(share, 1)}.`
      : `Kargolanan ${n} siparişten yalnız ${api} tanesinde (%${trn(share, 1)}) kargo gideri faturadan geldi. Kendi kargo anlaşmanızla gönderiyorsanız bu normaldir; yoksa sipariş numarası eşleşmiyor olabilir.`,
    numbers: [['Kargolanan sipariş (15–60 gün önce)', trn(n)], ['Faturadan kargo gideri gelen', `${trn(api)} (%${trn(share, 1)})`]],
    explain: 'Gerçek kargo gideri pazaryerinin kargo faturasından sipariş numarasıyla eşleştirilir; eşleşmeyen sipariş için ürün / Ayarlar kargo tutarı (tahmin) kullanılır.',
    action: ms === WARN ? 'Kargo pazaryeri anlaşmasıyla gidiyorsa Destek\'e gönderin.' : 'Bir şey yapmanız gerekmez.', tech: { n, api } });
  return out;
}

// 5) Hakediş "ödendi" güncellemesi ve tanınmayan kayıt türleri
export async function settlementChecks(db, ch, now) {
  const st = await getRaw(db, 'stlsync:' + ch.id);
  const r = await first(db, `SELECT COUNT(*) AS n, SUM(paid = 1) AS paid,
      SUM(paid = 0 AND amount != 0 AND due_date < ?) AS late, ROUND(COALESCE(SUM(CASE WHEN paid = 0 AND amount != 0 AND due_date < ? THEN amount END), 0), 2) AS late_amt,
      MIN(CASE WHEN paid = 0 AND amount != 0 AND due_date < ? THEN due_date END) AS oldest, SUM(paid = 0 AND amount != 0 AND date < ?) AS stale
    FROM settlements WHERE channel = ?`, now - LATE_PAY, now - LATE_PAY, now - LATE_PAY, now - 90 * D, ch.id);
  const n = fin(r && r.n), late = fin(r && r.late), stale = fin(r && r.stale), paid = fin(r && r.paid);
  let status = !n ? NONE : late || stale || (st && st.error) ? WARN : OK, text;
  if (!n) text = st && st.error ? `Hakediş kayıtları okunamıyor: ${st.error}` : 'Hakediş kaydı yok.';
  else if (late && !paid) text = `Hiçbir kayıt "ödendi" olarak işaretlenmemiş; vadesi 7 günden fazla geçmiş ${late} kayıt (${tl(r.late_amt)}) var: ödeme bilgisi okunmuyor olabilir.`;
  else if (late) text = `Vadesi 7 günden fazla geçtiği hâlde "ödenmedi" görünen ${late} kayıt (${tl(r.late_amt)}; en eskisinin vadesi ${new Date(r.oldest + 3 * H).toISOString().slice(0, 10)}). Gerçekten ödenmediyse pazaryerine sorun; ödendiyse bilgi güncellenmiyor.`;
  else if (stale) text = `90 günden eski ${stale} kayıt hâlâ "ödenmedi": bu kayıtlar artık yeniden okunmuyor, durumları güncellenmez.`;
  else text = `Hakediş kaydı ${trn(n)}, ödenen ${trn(paid)}; vadesi geçip ödenmemiş görünen kayıt yok.`;
  if (n && st && st.error) text += ` Son okuma hatası: ${st.error}`;
  const out = [{ id: 'settlement_paid', group: 'money', channel: ch.id, title: `${ch.name}: hakediş "ödendi" bilgisi güncelleniyor mu?`, status, summary: text,
    numbers: [['Hakediş kaydı', trn(n)], ['Ödendi', trn(paid)], ['Vadesi 7+ gün geçmiş, ödenmemiş', late ? `${trn(late)} (${tl(r.late_amt)})` : '0'], ['90 günden eski, ödenmemiş', trn(stale)], ['Son okuma', st && st.at ? new Date(st.at).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—']],
    explain: 'Ödenmemiş kayıtlar her okumada yeniden istenir (en çok 90 gün geriye); pazaryeri ödeme bilgisini işleyince "ödendi" olur (Trendyol paymentOrderId, Hepsiburada WillBePaid → Paid).',
    action: status === WARN ? 'Pazaryeri panelinde ödemeyi kontrol edin; ödendiyse Destek\'e gönderin.' : 'Bir şey yapmanız gerekmez.', tech: { ...r, state: st } }];
  const unk = await all(db, "SELECT raw_type, COUNT(*) AS n, ROUND(SUM(amount), 2) AS amount FROM settlements WHERE channel = ? AND type = 'Diğer' AND COALESCE(date, 0) >= ? GROUP BY raw_type ORDER BY n DESC LIMIT 20", ch.id, now - WINDOW);
  const un = unk.reduce((a, x) => a + fin(x.n), 0);
  out.push({ id: 'settlement_types', group: 'money', channel: ch.id, title: `${ch.name}: tanınmayan hakediş kayıt türleri`, status: !n ? NONE : un ? WARN : OK,
    summary: !n ? 'Hakediş kaydı yok.' : un ? `${un} kayıt tanınmayan türde ("Diğer"): ${unk.slice(0, 5).map((x) => `${x.raw_type || '?'} (${x.n})`).join(', ')}. Bu kayıtlar mutabakata girmez.` : 'Son 90 günün tüm hakediş kayıt türleri tanınıyor.',
    numbers: unk.slice(0, 8).map((x) => [x.raw_type || '(boş)', `${x.n} kayıt · ${tl(x.amount)}`]),
    explain: 'Pazaryerinin gönderdiği kayıt türü panelin listesinde yoksa "Diğer" yazılır; satış / komisyon mutabakatına katılmaz.',
    action: un ? 'Destek\'e gönder ile bize iletin; tür panele eklenir.' : 'Bir şey yapmanız gerekmez.', tech: { unknown: unk } });
  return out;
}

// 6) Kanaldaki ilan durumları (remote_state sütunu yoksa atlanır)
export async function listingStateCheck(db, names) {
  const cols = await all(db, 'PRAGMA table_info(listings)').catch(() => []);
  if (!cols.some((c) => c.name === 'remote_state')) return [];
  const rows = await all(db, `SELECT channel, COUNT(*) AS n, SUM(remote_state = 'pending') AS pending, SUM(remote_state = 'rejected') AS rejected, SUM(remote_state = 'passive') AS passive,
    SUM(remote_state IS NOT NULL) AS reported FROM listings WHERE COALESCE(match, '') != 'gone' GROUP BY channel ORDER BY channel`);
  if (!rows.length) return [{ id: 'listing_state', group: 'sync', title: 'Kanaldaki ilan durumları', status: NONE, summary: 'İlan yok.', numbers: [], explain: '', action: '', tech: {} }];
  const det = rows.map((r) => {
    const held = fin(r.pending) + fin(r.rejected), all_ = fin(r.n) >= 5 && held / fin(r.n) >= 0.9;
    return { channel: r.channel, name: names(r.channel), n: fin(r.n), pending: fin(r.pending), rejected: fin(r.rejected), passive: fin(r.passive), reported: fin(r.reported), status: all_ || fin(r.rejected) ? WARN : OK, all: all_ };
  });
  const allHeld = det.filter((d) => d.all), rej = det.filter((d) => d.rejected);
  const status = worst(det.map((d) => d.status));
  return [{ id: 'listing_state', group: 'sync', title: 'Kanaldaki ilan durumları (onay bekleyen / reddedilen)', status,
    summary: allHeld.length ? `${allHeld.map((d) => d.name).join(', ')}: ilanların neredeyse tamamı "onay bekliyor / reddedildi" görünüyor — kanalın durum alanı yanlış okunuyor olabilir (bu ilanlara stok gönderilmiyor).`
      : rej.length ? `Kanalın onaylamadığı ilan var: ${rej.map((d) => `${d.name} ${d.rejected}`).join(', ')}. Bu ilanlara stok / fiyat gönderilmez.` : 'Reddedilen ilan yok.',
    numbers: det.map((d) => [d.name, `${d.n} ilan · ${d.pending} onay bekliyor · ${d.rejected} reddedildi · ${d.passive} pasif`]),
    explain: 'İlan yenilemede kanalın bildirdiği yayın durumu okunur; onay bekleyen / reddedilen ilana stok ve fiyat gönderilmez.',
    action: status === WARN ? (allHeld.length ? 'Kanal panelinde ilanlar yayındaysa Destek\'e gönderin.' : 'Reddedilen ilanların nedenini Ürünler → Kanal hataları\'ndan görün, kanal panelinde düzeltin.') : 'Bir şey yapmanız gerekmez.', tech: { channels: det } }];
}

// 7) İlan komisyonu ↔ resmî liste (KDV kalıbı ve liste üstü oranlar)
export async function commissionListCheck(db, names) {
  const ls = await all(db, `SELECT channel, remote_id, name, commission, mp_category FROM listings WHERE commission_src = 'api' AND commission IS NOT NULL AND COALESCE(mp_category, '') != ''
    AND COALESCE(match, '') != 'gone' AND (channel LIKE 'trendyol%' OR channel LIKE 'hepsiburada%')`);
  const by = new Map();
  for (const l of ls) {
    if (!mpOf(l.channel)) continue;
    const x = listRate(l.channel, l.mp_category);
    if (!x || !(x.rate > 0)) continue;
    const e = by.get(l.channel) || by.set(l.channel, { ratios: [], above: [] }).get(l.channel);
    e.ratios.push(l.commission / x.rate);
    if (l.commission - x.rate > ABOVE_LIST) e.above.push({ name: l.name, rate: r2(l.commission), list: x.rate, gap: r2(l.commission - x.rate) });
  }
  if (!by.size) return [{ id: 'commission_list', group: 'money', title: 'İlan komisyonu ↔ resmî komisyon listesi', status: NONE, summary: 'Resmî listeyle eşleşen (kanal oranı bilinen) ilan yok.', numbers: [], explain: '', action: '', tech: {} }];
  const det = [...by].map(([c, e]) => {
    const j = judgeRatio(e.ratios), k = j.kind;
    const vat = j.n >= MIN_ORDERS && (k === 'x1.2' || k === 'x0.83');
    return { channel: c, name: names(c), n: e.ratios.length, median: j.median, kind: k, above: e.above.sort((a, b) => b.gap - a.gap), status: vat || e.above.length ? WARN : j.n ? OK : NONE, vat };
  });
  const status = worst(det.map((d) => d.status)), vat = det.filter((d) => d.vat), ab = det.filter((d) => d.above.length);
  return [{ id: 'commission_list', group: 'money', title: 'İlan komisyonu ↔ resmî komisyon listesi', status,
    summary: vat.length ? `${vat.map((d) => `${d.name}: ilan oranı listenin ${trn(d.median, 3)} katı`).join('; ')} — KDV kalıbı: oran KDV'siyle iki kez ya da hiç sayılmıyor olabilir.`
      : ab.length ? `${ab.map((d) => `${d.name} ${d.above.length} ilan`).join(', ')}: kanalın bildirdiği oran resmî listeden ${trn(ABOVE_LIST, 1)} puandan fazla yüksek. En yüksek: ${ab[0].above[0].name} %${trn(ab[0].above[0].rate)} (liste %${trn(ab[0].above[0].list)}).`
      : 'Kanalın bildirdiği ilan oranları resmî listeyle uyumlu.',
    numbers: det.map((d) => [d.name, `${d.n} ilan · ortanca oran ${d.median != null ? trn(d.median, 3) : '—'} · listeden yüksek ${d.above.length}`]),
    explain: 'Resmî listeler KDV dahil karşılaştırılır (Trendyol oranı olduğu gibi, Hepsiburada × 1,20). Ortanca ≈1 olmalı; ≈1,20 / ≈0,83 KDV hatasıdır.',
    action: status === WARN ? 'Liste üstü oranlar: Gelir & Gider → Komisyon kontrolü. KDV kalıbı görünüyorsa Destek\'e gönderin.' : 'Bir şey yapmanız gerekmez.',
    tech: { channels: det.map((d) => ({ ...d, above: d.above.slice(0, 5) })) } }];
}

// 8a) Döviz siparişleri: TL'ye çevrilemeyenler
export async function fxCheck(db, now, names) {
  const rows = await all(db, `SELECT channel, SUM(UPPER(COALESCE(currency, 'TRY')) NOT IN ('TRY', 'TL', '')) AS unconv, SUM(extra LIKE '%"fx":{%') AS conv FROM orders WHERE ordered_at >= ?
    GROUP BY channel HAVING unconv > 0 OR conv > 0`, now - WINDOW);
  const un = rows.filter((r) => fin(r.unconv));
  return [{ id: 'fx_orders', group: 'sync', title: 'Döviz siparişleri TL\'ye çevrildi mi?', status: !rows.length ? NONE : un.length ? WARN : OK,
    summary: !rows.length ? 'Son 90 günde döviz siparişi yok.' : un.length ? `${un.map((r) => `${names(r.channel)} ${r.unconv}`).join(', ')} sipariş TL'ye çevrilemedi (kur alınamadı): ciro ve kâr toplamlarına girmiyor.` : `${rows.reduce((a, r) => a + fin(r.conv), 0)} döviz siparişi TCMB kuruyla TL'ye çevrildi.`,
    numbers: rows.map((r) => [names(r.channel), `${fin(r.conv)} çevrildi · ${fin(r.unconv)} çevrilemedi`]),
    explain: 'Yurt dışı kanal siparişleri kaydedilirken TCMB kuruyla TL\'ye çevrilir; kur alınamazsa sipariş asıl para biriminde kalır ve sonraki senkronda yeniden denenir.',
    action: un.length ? 'Bir sonraki senkronda düzelmezse Destek\'e gönderin.' : 'Bir şey yapmanız gerekmez.', tech: { rows } }];
}

// 8b) Stok / fiyat gönderim hataları (son 7 gün) ve ilan hataları
export async function pushCheck(db, now, names) {
  const [pc, le] = await Promise.all([
    all(db, `SELECT channel, COUNT(*) AS batches, SUM(n) AS n, SUM(failed) AS failed, SUM(status = 'pending' AND at < ?) AS stuck FROM push_checks WHERE at >= ? GROUP BY channel`, now - H, now - 7 * D),
    all(db, `SELECT channel, COUNT(*) AS n, SUM(error IS NOT NULL AND COALESCE(error_side, '') != 'channel') AS err FROM listings WHERE COALESCE(match, '') != 'gone' AND COALESCE(ignored, 0) = 0 GROUP BY channel`),
  ]);
  const ids = [...new Set([...pc.map((r) => r.channel), ...le.map((r) => r.channel)])];
  if (!ids.length) return [{ id: 'push_errors', group: 'sync', title: 'Stok / fiyat gönderim hataları', status: NONE, summary: 'Gönderim kaydı ve ilan yok.', numbers: [], explain: '', action: '', tech: {} }];
  const det = ids.map((c) => {
    const p = pc.find((r) => r.channel === c) || {}, l = le.find((r) => r.channel === c) || {};
    const n = fin(p.n), f = fin(p.failed), ln = fin(l.n), le_ = fin(l.err);
    const bad = (n >= 20 && f / n > 0.05) || fin(p.stuck) > 0 || (le_ >= 3 && ln && le_ / ln > 0.05);
    return { channel: c, name: names(c), sent: n, failed: f, stuck: fin(p.stuck), listings: ln, errors: le_, status: bad ? WARN : n || ln ? OK : NONE };
  });
  const bad = det.filter((d) => d.status === WARN);
  return [{ id: 'push_errors', group: 'sync', title: 'Stok / fiyat gönderim hataları', status: worst(det.map((d) => d.status)),
    summary: bad.length ? `Hata oranı yüksek: ${bad.map((d) => `${d.name} (${d.sent ? `reddedilen gönderim %${trn(pct(d.failed, d.sent), 1)}` : ''}${d.stuck ? `${d.sent ? ', ' : ''}${d.stuck} sonuç bekleniyor` : ''}${d.errors ? `${d.sent || d.stuck ? ', ' : ''}${d.errors} ilanda hata` : ''})`).join('; ')}.` : 'Son 7 günde gönderim hataları düşük.',
    numbers: det.map((d) => [d.name, `${d.sent} gönderim · ${d.failed} red · ${d.errors}/${d.listings} ilanda hata${d.stuck ? ` · ${d.stuck} takılı` : ''}`]),
    explain: 'Kanala gönderilen stok / fiyatın kanal tarafındaki sonucu okunur; reddedilen satırlar ilana hata olarak yazılır ve sonraki senkronda yeniden gönderilir. Kanal kaynaklı hatalar (ürün kanalda onaylanmamış) sayılmaz.',
    action: bad.length ? 'Ürünler → Kanal hataları\'ndan nedenlere bakın; anlaşılmayan hata için Destek\'e gönderin.' : 'Bir şey yapmanız gerekmez.', tech: { channels: det } }];
}

// 8c) Son başarılı senkron (sipariş) ve finans okumaları
export async function syncCheck(db, chans, now) {
  if (!chans.length) return [{ id: 'sync_fresh', group: 'sync', title: 'Son başarılı senkron', status: NONE, summary: 'Bağlı kanal yok.', numbers: [], explain: '', action: '', tech: {} }];
  const det = [];
  for (const c of chans) {
    const [st, stl, inv, cost] = await Promise.all(['last:', 'stlsync:', 'invsync:', 'costs:'].map((k) => getRaw(db, k + c.id)));
    const s = st || {}, age = s.ordersAt ? now - s.ordersAt : null, finErr = [['hakediş', stl], ['faturalar', inv], ['kargo gideri', cost]].filter(([, x]) => x && x.error).map(([k, x]) => `${k}: ${x.error}`);
    const bad = s.ok === false || age == null || age > STALE_SYNC || finErr.length;
    det.push({ channel: c.id, name: c.name, ordersAt: s.ordersAt || null, ok: s.ok !== false, fails: s.fails || 0, error: s.error || null, listingsError: s.listingsError || null, finance: finErr, status: bad ? WARN : OK });
  }
  const bad = det.filter((d) => d.status === WARN);
  const ago = (t) => (t ? (now - t < H ? `${Math.max(1, Math.round((now - t) / 60e3))} dk önce` : now - t < D ? `${Math.round((now - t) / H)} sa önce` : `${Math.round((now - t) / D)} gün önce`) : 'hiç');
  return [{ id: 'sync_fresh', group: 'sync', title: 'Son başarılı senkron', status: worst(det.map((d) => d.status)),
    summary: bad.length ? bad.map((d) => `${d.name}: ${!d.ok ? `siparişler alınamıyor (${d.fails} kez art arda${d.error ? `: ${d.error}` : ''})` : d.ordersAt ? `siparişler en son ${ago(d.ordersAt)} alındı` : 'sipariş hiç alınmadı'}${d.finance.length ? `; ${d.finance.join('; ')}` : ''}`).join(' · ') : 'Tüm bağlı kanalların siparişleri son 2 saat içinde alındı; finans okumalarında hata yok.',
    numbers: det.map((d) => [d.name, `siparişler ${ago(d.ordersAt)}${!d.ok ? ' · HATA' : ''}${d.finance.length ? ' · finans okuma hatası' : ''}`]),
    explain: 'Siparişler 15 dakikada bir, hakediş / faturalar / kargo gideri 6 saatte bir okunur.',
    action: bad.length ? 'Entegrasyonlar\'da kanalın Tanılama düğmesiyle nedeni görün; API bilgilerini kontrol edin.' : 'Bir şey yapmanız gerekmez.', tech: { channels: det } }];
}

// ---------- tüm kontroller ----------
// chans: getChannels sonucu (testte elle verilebilir); probes: Map(kanal → financeProbe sonucu / { error })
export async function runChecks(db, settings, { chans, now = Date.now(), probes = new Map() } = {}) {
  const live = chans.filter((c) => c.enabled || c.demo), names = (id) => (chans.find((c) => c.id === id) || {}).name || id;
  const checks = [];
  for (const c of live) {
    const t = c.type || String(c.id).replace(/_\d+$/, '');
    if (c.settlements && (t === 'hepsiburada' || t === 'trendyol')) {
      const rows = await orderRows(db, settings, c.id, now - WINDOW);
      checks.push(t === 'hepsiburada' ? hbCommissionCheck(c, rows, probes.get(c.id)) : tyCommissionCheck(c, rows, probes.get(c.id)), salesCheck(c, rows));
    }
    if (c.cargoCosts) checks.push(...await cargoChecks(db, c, now, probes.get(c.id)));
    if (c.settlements) checks.push(...await settlementChecks(db, c, now));
  }
  checks.push(...await commissionListCheck(db, names), ...await listingStateCheck(db, names), ...await fxCheck(db, now, names), ...await pushCheck(db, now, names), ...await syncCheck(db, live, now));
  return checks;
}

// Destek talebi için teknik özet (en çok ~5800 karakter: talep gövdesi sınırı 6000)
export function ticketText(rep) {
  const mark = { ok: '✓', warn: '⚠', none: '—' }, s = rep.summary;
  const head = [`Veri sağlık kontrolü · ${new Date(rep.at).toISOString().slice(0, 16).replace('T', ' ')} UTC`, `Sonuç: ${s.ok} tutarlı, ${s.warn} şüpheli, ${s.none} veri yok`, ''];
  const body = [], order = [...rep.checks].sort((a, b) => ({ warn: 0, ok: 1, none: 2 })[a.status] - ({ warn: 0, ok: 1, none: 2 })[b.status]);
  for (const c of order) {
    const lines = [`[${mark[c.status]}] ${c.title}`, `  ${c.summary}`];
    if (c.status === WARN) {
      if (c.numbers && c.numbers.length) lines.push('  ' + c.numbers.map(([k, v]) => `${k}: ${v}`).join(' | '));
      if (c.tech) lines.push('  tech: ' + JSON.stringify(c.tech).slice(0, 600));
    }
    body.push(lines.join('\n'));
  }
  let text = head.join('\n') + body.join('\n\n');
  if (text.length > 5800) text = text.slice(0, 5780) + '\n… (kısaltıldı)';
  return { subject: `Veri sağlık kontrolü: ${s.warn ? `${s.warn} şüpheli bulgu` : 'sorun bulunmadı'}`, body: text };
}

// Kanal örnekleri (salt okuma, kısa): her kanal en çok 15 sn, toplam en çok 12 istek
async function runProbes(chans) {
  const out = new Map();
  await withBudget(12, async () => {
    for (const c of chans) {
      if (!c.enabled || c.demo || typeof c.financeProbe !== 'function') continue;
      try {
        out.set(c.id, await Promise.race([c.financeProbe(), new Promise((_, no) => setTimeout(() => no(new Error('zaman aşımı (15 sn)')), 15000))]));
      } catch (e) { out.set(c.id, { error: String(e.message || e).slice(0, 300) }); }
    }
  });
  return out;
}

// Rapor (1 saat önbellek). force: hemen yeniden (en çok dakikada bir)
export async function healthReport(env, db, settings, { force = false, now = Date.now(), chans = null } = {}) {
  const cached = await getRaw(db, 'health:data').catch(() => null);
  if (cached && cached.at && (now - cached.at < TTL && !force || (force && now - cached.at < 60e3))) return { ...cached, cached: true };
  const t0 = Date.now();
  const list = chans || await getChannels(env, db);
  const probes = await runProbes(list.filter((c) => c.enabled || c.demo));
  const checks = await runChecks(db, settings, { chans: list, now, probes });
  const summary = { ok: checks.filter((c) => c.status === OK).length, warn: checks.filter((c) => c.status === WARN).length, none: checks.filter((c) => c.status === NONE).length };
  const rep = { at: now, ms: Date.now() - t0, summary, checks, probes: Object.fromEntries([...probes].map(([k, v]) => [k, v.error ? { error: v.error } : { ok: true }])) };
  rep.ticket = ticketText(rep);
  await setSetting(db, 'health:data', rep).catch(() => {});
  return { ...rep, cached: false };
}
