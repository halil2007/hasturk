// Müşteri soruları: pazaryerlerindeki (Trendyol, Hepsiburada …) ürün sorularını çeker, panelde listeler ve
// panelden cevaplanmasını sağlar. Kanalın kendi panelinden verilen cevaplar da senkronla algılanır (answered_by = kanal).
import { all, first, run, log, notify, resolve, getRaw, setSetting } from './db.js';
import { getChannels } from './channels/index.js';
import { chunk } from './util.js';

const STATUS = ['waiting', 'answered', 'rejected', 'other'];

export async function syncQuestions(env, db, { only } = {}) {
  const out = {};
  for (const ch of await getChannels(env, db)) {
    if (!ch.enabled || !ch.questions || (only && !only.includes(ch.id))) continue;
    try {
      const last = (await first(db, 'SELECT MAX(synced_at) AS t FROM questions WHERE channel = ?', ch.id)).t;
      // İlk senkronda son 14 gün, sonra son 3 gün (cevaplanan / reddedilen durum değişikliklerini yakalamak için)
      // Tek senkronda en fazla 30 sayfa (1500 soru: alt istek sınırı); daha fazlası varsa aynı zaman aralığında kalan sayfalar
      // sonraki senkronlarda okunur (önceden her senkron ilk 30 sayfayı yeniden okuyor, sonrakiler hiç alınmıyordu)
      const key = 'questions_page:' + ch.id, cont = await getRaw(db, key), t = Date.now();
      const w = cont && t - cont.until < 864e5 ? cont : { page: 0, since: t - (last ? 3 : 14) * 864e5, until: t }, items = [];
      let page = w.page, more = false;
      for (const end = page + 30; page < end; page++) {
        let r;
        // Sayfa okunamazsa o ana kadar okunanlar kaydedilir ve kalınan sayfadan devam edilir (hepsi kaybolmasın, hep aynı yerde takılmasın)
        try { r = await ch.questions({ since: w.since, until: w.until, page, size: 50 }); }
        catch (e) { if (items.length) { await save(db, ch.id, items); await setSetting(db, key, { ...w, page }); } throw e; }
        items.push(...r.items);
        more = !!(r.hasNext && r.items.length);
        if (!more) break;
      }
      await save(db, ch.id, items);
      if (more || cont) await setSetting(db, key, more ? { ...w, page: page } : null);
      if (!more) items.push(...await recheckOld(db, ch, w.since, t).catch((e) => { if (e.budget) throw e; return []; }));
      out[ch.id] = items.length;
      await resolve(db, `questions:${ch.id}`);
    } catch (e) {
      out[ch.id] = 'hata: ' + e.message;
      await log(db, ch.id, 'error', 'Müşteri soruları alınamadı: ' + e.message);
      await notify(db, `questions:${ch.id}`, { level: 'warn', channel: ch.id, title: `${ch.name}: müşteri soruları alınamadı`, msg: e.message });
    }
  }
  return out;
}

// Bekleyen eski sorular: Hepsiburada dışındaki kanallar soruları soruluş tarihine göre süzer. Son 3 günden önce sorulup sonradan
// kanalın kendi panelinden cevaplanan soru normal pencerede bir daha gelmez ve panelde "bekliyor" kalırdı. Bekleyen en eski sorunun
// tarihinden pencerenin başına kadar (en fazla 30 gün geriye) ayrıca okunur; kanalın tarih aralığı sınırı için 13 günlük parçalarla.
const BY_MODIFIED = new Set(['hepsiburada']); // değişiklik tarihine göre süzer: cevaplanan soru normal pencerede zaten gelir
const OLD_MAX = 30 * 864e5, SPAN = 13 * 864e5, OLD_PAGES = 10, OLD_EVERY = 3 * 3600e3;
// Soru listesi dakikada bir çağrılabilen kanal: eski sorular tek istekle (parçasız, tek sayfa) okunur
const ONE_CALL = new Set(['n11']);
async function recheckOld(db, ch, before, t) {
  if (BY_MODIFIED.has(ch.type)) return [];
  // En sık 3 saatte bir (her senkronda aynı aralık baştan okunmasın, istek bütçesi ve kanal sınırı korunsun)
  const key = `qold:${ch.id}`, last = await getRaw(db, key).catch(() => null);
  if (last && t - last.at < OLD_EVERY) return [];
  const old = await first(db, "SELECT MIN(asked_at) AS t FROM questions WHERE channel = ? AND status = 'waiting' AND asked_at < ? AND asked_at > ?", ch.id, before, t - OLD_MAX);
  if (!old || !old.t) return [];
  await setSetting(db, key, { at: t });
  const from = Math.max(old.t - 3600e3, t - OLD_MAX), items = [], one = ONE_CALL.has(ch.type);
  for (let end = before; end > from; end -= one ? Infinity : SPAN) {
    const start = one ? from : Math.max(from, end - SPAN);
    for (let page = 0; page < (one ? 1 : OLD_PAGES); page++) {
      const r = await ch.questions({ since: start, until: end, page, size: 50 });
      items.push(...r.items);
      if (!(r.hasNext && r.items.length)) break;
    }
  }
  await save(db, ch.id, items);
  return items;
}

// Panelden cevaplanan soru, kanal cevabı henüz yansıtmadan gelen senkronla "bekliyor"a dönmez (2 gün; sonra kanalın durumu geçerli):
// yoksa soru yeniden cevaplanabilir ve müşteri iki cevap görür
export async function save(db, channel, items) {
  const t = Date.now();
  for (const part of chunk(items, 40)) {
    await db.batch(part.map((q) => db.prepare(`INSERT INTO questions (channel, remote_id, text, asked_at, status, remote_status, product_name, product_image, product_url, barcode, sku, customer, answer, answered_at, answered_by, due_at, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (channel, remote_id) DO UPDATE SET text = excluded.text, asked_at = MIN(COALESCE(questions.asked_at, excluded.asked_at), excluded.asked_at),
        status = CASE WHEN questions.status = 'answered' AND questions.answered_by = 'panel' AND excluded.status = 'waiting' AND questions.answered_at > ${t - 2 * 864e5} THEN 'answered' ELSE excluded.status END, remote_status = excluded.remote_status,
        product_name = COALESCE(NULLIF(excluded.product_name, ''), questions.product_name), product_image = COALESCE(NULLIF(excluded.product_image, ''), questions.product_image),
        product_url = COALESCE(NULLIF(excluded.product_url, ''), questions.product_url), answer = COALESCE(excluded.answer, questions.answer),
        answered_at = COALESCE(excluded.answered_at, questions.answered_at),
        answered_by = CASE WHEN questions.answered_by = 'panel' THEN 'panel' WHEN excluded.answer IS NOT NULL THEN 'kanal' ELSE questions.answered_by END,
        due_at = COALESCE(excluded.due_at, questions.due_at), synced_at = excluded.synced_at`)
      .bind(channel, String(q.remoteId), q.text || '', q.askedAt || t, STATUS.includes(q.status) ? q.status : 'other', q.remoteStatus || '', q.productName || '', q.productImage || '', q.productUrl || '',
        q.barcode || '', q.sku || '', q.customer || '', q.answer || null, q.answeredAt || null, q.answer ? 'kanal' : null, q.dueAt || null, t)));
  }
}

export async function listQuestions(db, q) {
  const where = [], args = [];
  if (q.channel) { where.push('q.channel = ?'); args.push(q.channel); }
  if (STATUS.includes(q.status)) { where.push('q.status = ?'); args.push(q.status); }
  if (q.q) { const s = '%' + q.q + '%'; where.push('(q.text LIKE ? OR q.product_name LIKE ? OR q.answer LIKE ? OR q.customer LIKE ?)'); args.push(s, s, s, s); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const limit = Math.min(Number(q.limit) || 30, 100), page = Math.max(1, Number(q.page) || 1);
  // Ürün görseli kanaldan gelmediyse eşleşmiş panel ürününden
  const rows = await all(db, `SELECT q.*, COALESCE(NULLIF(q.product_image, ''), (SELECT COALESCE(NULLIF(l.image, ''), p.image) FROM listings l LEFT JOIN products p ON p.id = l.product_id WHERE l.channel = q.channel AND q.barcode != '' AND (l.barcode = q.barcode OR l.remote_id = q.barcode) LIMIT 1)) AS image
    FROM questions q ${w} ORDER BY CASE q.status WHEN 'waiting' THEN 0 ELSE 1 END, q.asked_at ${q.status === 'waiting' ? 'ASC' : 'DESC'} LIMIT ? OFFSET ?`, ...args, limit, (page - 1) * limit);
  const total = (await first(db, `SELECT COUNT(*) AS n FROM questions q ${w}`, ...args)).n;
  const counts = Object.fromEntries((await all(db, `SELECT status, COUNT(*) AS n FROM questions ${q.channel ? 'WHERE channel = ?' : ''} GROUP BY status`, ...(q.channel ? [q.channel] : []))).map((r) => [r.status, r.n]));
  // Analiz (son 30 gün, kanal bazında): soru sayısı, bekleyen, cevaplanma oranı, ortalama cevap süresi, panelden cevaplanan
  const stats = await all(db, `SELECT channel, COUNT(*) AS total, SUM(status = 'waiting') AS waiting, SUM(status = 'answered') AS answered, SUM(answered_by = 'panel') AS by_panel,
      AVG(CASE WHEN status = 'answered' AND answered_at > asked_at THEN answered_at - asked_at END) AS avg_ms
    FROM questions WHERE asked_at >= ? GROUP BY channel ORDER BY total DESC`, Date.now() - 30 * 864e5);
  return { rows, total, counts, stats };
}

export async function answerQuestion(env, db, channel, id, text, user) {
  const ch = (await getChannels(env, db)).find((c) => c.id === channel);
  if (!ch || !ch.enabled || !ch.answer) throw new Error('Bu kanal panelden cevaplamayı desteklemiyor');
  const q = await first(db, 'SELECT * FROM questions WHERE channel = ? AND remote_id = ?', channel, String(id));
  if (!q) throw new Error('Soru bulunamadı');
  if (q.status === 'answered') throw new Error('Bu soru zaten cevaplanmış');
  const lim = (ch.caps && ch.caps.answer) || { min: 1, max: 2000 };
  const t = String(text || '').trim();
  if (t.length < lim.min) throw new Error(`Cevap en az ${lim.min} karakter olmalı`);
  if (t.length > lim.max) throw new Error(`Cevap en fazla ${lim.max} karakter olabilir`);
  try {
    await ch.answer(q, t);
  } catch (e) {
    await run(db, 'UPDATE questions SET error = ? WHERE channel = ? AND remote_id = ?', e.message.slice(0, 400), channel, String(id));
    throw e;
  }
  await run(db, "UPDATE questions SET status = 'answered', answer = ?, answered_at = ?, answered_by = 'panel', user = ?, error = NULL WHERE channel = ? AND remote_id = ?", t, Date.now(), user ? user.name : null, channel, String(id));
  await log(db, channel, 'info', `${user ? user.name : 'Panel'}: müşteri sorusu cevaplandı (${id})`);
  return { ok: true };
}
