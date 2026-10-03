// Müşteri soruları: pazaryerlerindeki (Trendyol, Hepsiburada …) ürün sorularını çeker, panelde listeler ve
// panelden cevaplanmasını sağlar. Kanalın kendi panelinden verilen cevaplar da senkronla algılanır (answered_by = kanal).
import { all, first, run, log, notify, resolve } from './db.js';
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
      const since = Date.now() - (last ? 3 : 14) * 864e5;
      const items = [];
      for (let page = 0; page < 30; page++) {
        const r = await ch.questions({ since, until: Date.now(), page, size: 50 });
        items.push(...r.items);
        if (!r.hasNext || !r.items.length) break;
      }
      await save(db, ch.id, items);
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

export async function save(db, channel, items) {
  const t = Date.now();
  for (const part of chunk(items, 40)) {
    await db.batch(part.map((q) => db.prepare(`INSERT INTO questions (channel, remote_id, text, asked_at, status, remote_status, product_name, product_image, product_url, barcode, sku, customer, answer, answered_at, answered_by, due_at, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (channel, remote_id) DO UPDATE SET text = excluded.text, status = excluded.status, remote_status = excluded.remote_status,
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
  return { rows, total, counts };
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
