// Hazır blog yazıları (bkz. blogseed-posts.js): ana panelde zamanlanmış görevde bir kez yayımlanır. Aynı adresli yazı varsa
// dokunulmaz (elle düzenlenmiş / silinmiş yazı geri gelmez: yüklenenler "blog_seed" ayarında tutulur). Kapak görseli tanıtım
// sitesinden (SITE_URL/img/blog/…) alınıp blog görseli olarak kaydedilir; site henüz yayımlanmadıysa sonraki çalışmada tekrar denenir.
import { first, run } from './db.js';
import { insertPost, siteUrl, MAX_IMAGE } from './blog.js';
import { POSTS } from './blogseed-posts.js';

const KEY = 'blog_seed';
const TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const newId = () => [...crypto.getRandomValues(new Uint8Array(10))].map((x) => x.toString(16).padStart(2, '0')).join('');

async function coverImage(env, db, file, fetcher) {
  const type = TYPES[String(file).split('.').pop().toLowerCase()];
  if (!type) throw new Error(`Desteklenmeyen kapak türü: ${file}`);
  const r = await fetcher(`${siteUrl(env)}/img/blog/${file}`);
  if (!r.ok) throw new Error(`Kapak alınamadı (${r.status}): ${file}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  if (!buf.length || buf.length > MAX_IMAGE) throw new Error(`Kapak boyutu uygun değil (${buf.length}): ${file}`);
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  const id = newId();
  await run(db, 'INSERT INTO blog_images (id, post_id, name, type, size, w, h, data, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)', id, file, type, buf.length, 1600, 900, btoa(bin), Date.now());
  return id;
}

export async function blogSeed(env, db, { posts = POSTS, fetcher = fetch, now = Date.now() } = {}) {
  if (env.TENANT_SLUG || env.DEMO) return null;
  const row = await first(db, 'SELECT v FROM settings WHERE k = ?', KEY);
  const done = row ? JSON.parse(row.v) : [];
  const todo = posts.filter((p) => !done.includes(p.slug));
  if (!todo.length) return null;
  const out = { added: [], skipped: [], errors: [] };
  for (const [i, p] of todo.entries()) {
    try {
      if (await first(db, 'SELECT id FROM blog_posts WHERE slug = ?', p.slug)) { out.skipped.push(p.slug); done.push(p.slug); continue; }
      const cover_id = p.cover ? await coverImage(env, db, p.cover, fetcher) : null;
      // Yayın tarihleri birkaç gün arayla geriye dağıtılır (hepsi aynı dakikada görünmesin); sıra listedeki sıradır
      const published_at = now - (posts.length - 1 - posts.indexOf(p)) * 2 * 864e5 - i * 60e3;
      await insertPost(db, { ...p, cover_id, status: 'published', published_at, author: p.author || 'Hastürk CRM' }, { name: 'Hastürk CRM' });
      out.added.push(p.slug); done.push(p.slug);
    } catch (e) { out.errors.push(`${p.slug}: ${e.message}`); }
  }
  await run(db, "INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v", KEY, JSON.stringify(done));
  return out;
}
