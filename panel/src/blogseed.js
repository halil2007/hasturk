// Hazır blog yazıları: ana panelde zamanlanmış görevde yayın sırasına göre kademeli eklenir. Aynı adresli yazı varsa dokunulmaz
// (elle düzenlenmiş / silinmiş yazı geri gelmez: eklenenler "blog_seed" ayarında tutulur). Kapak görseli tanıtım sitesinden
// (SITE_URL/img/blog/…) alınıp blog görseli olarak kaydedilir; site henüz yayımlanmadıysa sonraki çalışmada tekrar denenir.
//
// Kaynak: public/_seed/ (Worker paketine girmez; paket küçük kalır, panel hızlı açılır). manifest.json: [{ slug, at, batch? }]
// yayın sırası ve saati; posts/<slug>.json: yazının kendisi. Dışarıdan /_seed/ adresi açılmaz (index.js), yalnız Worker okur.
// Yazı, yayın saatine 3 gün kala panele "ileri tarihli" olarak girer (Blog → zamanlanmış); sitede saati gelince görünür.
// Bir çalışmada en fazla 15 yazı (kapak indirme isteği sınırı); gecikenler sonraki çalışmalarda tamamlanır.
import { first, run } from './db.js';
import { insertPost, siteUrl, MAX_IMAGE } from './blog.js';

export const AHEAD = 3 * 864e5, PER_RUN = 15;
const REDATE = 'once:blog_redate_1';
// Yayımlanmış hazır yazıların düzeltmeleri: veritabanındaki gövde hâlâ ilk yüklenen gövdeyse (SHA-256'sı from listesinde) bir kez
// kaynaktaki güncel yazıyla değiştirilir; sahibi yazıyı elle düzenlediyse dokunulmaz. fields: gövdeyle birlikte güncellenecek diğer
// alanlar. cover: kapaktaki rakamlar da değişti; yeni kapak siteden alınıp yeni kimlikle kaydedilir (görseller kimlikle 1 yıl
// önbelleklenir); site henüz eski görseli veriyorsa sonraki çalışmalarda (en fazla 14 gün) yeniden denenir.
// 1: Trendyol resmî komisyon oranları KDV dahildir (üzerine %20 KDV eklenmez); örnek hesaplar buna göre düzeltildi.
export const REVISIONS = {
  'trendyol-komisyon-orani-net-kar-hesaplama': { cover: true, from: [
    'cba80f5491dcd00d3f60b44064ee37da8754b54fe78541cc6864fc7cff6073b6', // #191 (ilk yükleme)
    '28e1de0887eed0f6c6c91336406bafa9019c659d4112021aa0bf9050f2b1f856', // #194 (komisyon oranları bağlantısı)
  ] },
  'pazaryeri-satis-fiyati-nasil-belirlenir': { cover: true, from: ['602080eadbb9de2bcf8b153c121f18093b6f21c6dcd421c5f1927effae1a8ce0'] },
  'trendyol-buybox-nedir-nasil-kazanilir': { from: ['82469bb500c9a3855e0e6f7d3921d13c4854ec3f0301d4deb8bba85c6a4be9a4', '7eac057feea66d545e09127caef70366ef7aae65b9c9345dd7e3075eb8098b3b'] },
  'pazaryeri-hakedis-nedir-ne-zaman-yatar': { cover: true, from: ['9f0f2b7253b0bb4e7b2eb3ffcf1820da01daefa679bfd26b9c8157a79adb9d53'] },
  // 2: Amazon komisyon oranı da KDV dahildir (üzerine KDV eklenmez); kontrol listesindeki fatura maddesi sadeleşti
  'amazon-turkiye-satici-olma-rehberi': { from: ['a8068c8cd5052bdafc7b16a09ad9cb0016cb69abb3e1f1644f63f57c7258c135'] },
  // 3: "15 dakika" ifadesi kaldırıldı (senkron aralığı süre olarak vurgulanmaz; "düzenli aralıklarla")
  'coklu-pazaryeri-urun-eslestirme-barkod-stok-kodu': { from: ['48a2f4dfb121adc6a4df9da5d3cb345bca71db865e48c58754a5837f74fc1cf0'] },
  'doviz-kuru-ile-fiyatlandirma-ithal-urun': { from: ['2a2b14418f1db9b1f0cfeaf62bf7deb081bd182cbc6d6cc752a0fca9804b9aa4'] },
  'e-ticarette-stok-takibi-fazla-satis': { from: ['9a592327179aeeb668e4c226d8eb81d0fb1b5d73202e98346c180011e9d593db'] },
  'pazaryeri-entegrasyon-programi-nasil-secilir': { from: ['8cc549a56887f094b743f08d984ffe5201fb760f424d8023216e5be5dab43009'] },
  'pazaryeri-entegrasyonu-nedir': { from: ['6b171975ac13a8fd93dd658027af06dd8820eb7c96da7b6d4cebc8870f70593c'] },
  'pazaryeri-siparis-yonetimi-geciken-siparis': { from: ['298656a389bf6fdd4ae0a8367885c20bd2be90f2a3c3af723b17d24f5504e055'] },
  'trendyol-satici-puani-nasil-yukseltilir': { from: ['26bcfe97b11be73db3e78a81c38b7994dbb2eb95344f90b3218da8a5c666f84d'] },
  'trendyol-satis-artirma-yollari': { from: ['3776fdeb6ca32018233a0041a9a28fdb4fbf60afb1521252c68254f31c46d443'] },
};
// Yeni düzeltme eklenince sürüm artar: düzeltmeler yeniden taranır (önceki düzeltmeler gövde değiştiği için atlanır)
export const REV = 'once:blog_rev_3';
const FIELDS = ['title', 'summary', 'seo_title', 'seo_desc'];
const sha256 = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((x) => x.toString(16).padStart(2, '0')).join('');

const KEY = 'blog_seed';
const TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const newId = () => [...crypto.getRandomValues(new Uint8Array(10))].map((x) => x.toString(16).padStart(2, '0')).join('');

// public/_seed/ dosyası (Worker'ın statik dosyalarından)
export const assetSource = (env) => async (path) => {
  if (!env.ASSETS) throw new Error('Statik dosya bağlantısı yok (wrangler.jsonc → assets.binding)');
  const r = await env.ASSETS.fetch(new Request('https://assets.local/_seed/' + path));
  if (!r.ok) throw new Error(`Hazır yazı dosyası okunamadı (${r.status}): ${path}`);
  return r.json();
};

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

// Düzeltmeler (bkz. REVISIONS): gövdeler bir kez, kapaklar site yeni görseli verene kadar. Sonuç: düzeltilen yazılar ve yenilenen kapaklar
async function revise(env, db, getPost, revisions, fetcher, now) {
  const row = await first(db, 'SELECT v FROM settings WHERE k = ?', REV);
  let st = null;
  try { st = row ? JSON.parse(row.v) : null; } catch { st = { covers: [] }; }
  const out = { revised: [], covers: [] };
  if (!st) {
    st = { covers: [], until: now + 14 * 864e5 };
    for (const [slug, r] of Object.entries(revisions)) {
      const cur = await first(db, 'SELECT id, body FROM blog_posts WHERE slug = ?', slug);
      if (!cur || !r.from.includes(await sha256(String(cur.body ?? '')))) continue;
      const p = await getPost(slug).catch(() => null);
      if (!p) continue;
      const f = FIELDS.filter((k) => r.fields?.includes(k) && p[k] != null);
      await run(db, `UPDATE blog_posts SET body = ?${f.map((k) => `, ${k} = ?`).join('')}, updated_at = ? WHERE id = ? AND body = ?`, p.body, ...f.map((k) => p[k]), now, cur.id, cur.body);
      out.revised.push(slug);
      if (r.cover && p.cover) st.covers.push(slug);
    }
  }
  const left = [];
  for (const slug of st.covers || []) {
    const p = await getPost(slug).catch(() => null);
    const old = p && await first(db, 'SELECT p.id, p.cover_id, i.name, i.data FROM blog_posts p JOIN blog_images i ON i.id = p.cover_id WHERE p.slug = ?', slug);
    if (!old || old.name !== p.cover) continue; // kapak elle değiştirilmiş / kaldırılmış
    try {
      const id = await coverImage(env, db, p.cover, fetcher);
      if ((await first(db, 'SELECT data FROM blog_images WHERE id = ?', id)).data === old.data) { await run(db, 'DELETE FROM blog_images WHERE id = ?', id); throw new Error('site henüz eski kapağı veriyor'); }
      await db.batch([
        db.prepare('UPDATE blog_posts SET cover_id = ? WHERE id = ? AND cover_id = ?').bind(id, old.id, old.cover_id),
        db.prepare('UPDATE blog_images SET post_id = ? WHERE id = ?').bind(old.id, id),
        db.prepare('DELETE FROM blog_images WHERE id = ? AND NOT EXISTS (SELECT 1 FROM blog_posts WHERE cover_id = ? OR body LIKE ?)').bind(old.cover_id, old.cover_id, `%img:${old.cover_id}%`),
      ]);
      out.covers.push(slug);
    } catch { if (now < (st.until || 0)) left.push(slug); }
  }
  const v = JSON.stringify({ covers: left, until: st.until || 0 });
  if (!row || row.v !== v) await run(db, 'INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v', REV, v);
  return out;
}

// posts: (testler) yazıların kendisi; verilmezse kaynak (public/_seed) manifest'i okunur, yazılar gerektikçe tek tek alınır
export async function blogSeed(env, db, { posts, source, fetcher = fetch, now = Date.now(), revisions } = {}) {
  if (env.TENANT_SLUG || env.DEMO) return null;
  let list, getPost;
  if (posts) { list = posts.map((p, i) => ({ ...p, i })); getPost = async (slug) => posts.find((p) => p.slug === slug) || null; }
  else {
    const src = source || assetSource(env);
    list = (await src('manifest.json')).map((p, i) => ({ ...p, i }));
    getPost = async (slug) => ({ ...(await src(`posts/${slug}.json`)), slug });
    revisions = revisions || REVISIONS;
    // İkinci parti önceden ileri tarihli (2 günde bir) yüklendiyse tarihleri bir kez Ekim başına çekilir; elle tarihi değiştirilmiş
    // (artık ileri tarihli olmayan) yazıya dokunulmaz
    if (!(await first(db, 'SELECT 1 AS x FROM settings WHERE k = ?', REDATE))) {
      await db.batch([
        ...list.filter((p) => p.batch === 2).map((p) => db.prepare('UPDATE blog_posts SET published_at = ? WHERE slug = ? AND published_at > ?').bind(p.at, p.slug, now)),
        db.prepare("INSERT INTO settings (k, v) VALUES (?, '1') ON CONFLICT (k) DO NOTHING").bind(REDATE),
      ]);
    }
  }
  revisions = revisions || {};
  const rev = Object.keys(revisions).length ? await revise(env, db, getPost, revisions, fetcher, now) : { revised: [], covers: [] };
  const row = await first(db, 'SELECT v FROM settings WHERE k = ?', KEY);
  const done = row ? JSON.parse(row.v) : [];
  // Sırası gelenler: yayın saatine 3 gün kalmış (ya da saati geçmiş) ve henüz eklenmemiş yazılar, en fazla PER_RUN
  const due = list.filter((p) => !done.includes(p.slug) && (p.at == null || p.at <= now + AHEAD));
  const todo = due.slice(0, PER_RUN);
  if (!todo.length) return rev.revised.length || rev.covers.length ? { added: [], skipped: [], errors: [], ...rev } : null;
  const out = { added: [], skipped: [], errors: [], ...rev, left: due.length - todo.length };
  for (const [k, m] of todo.entries()) {
    try {
      if (await first(db, 'SELECT id FROM blog_posts WHERE slug = ?', m.slug)) { out.skipped.push(m.slug); done.push(m.slug); continue; }
      const p = posts ? m : { ...(await getPost(m.slug)), at: m.at };
      const cover_id = p.cover ? await coverImage(env, db, p.cover, fetcher) : null;
      // at: yayın saati (ileri tarihli yazı sitede o saatte görünür); day: yüklemeden bu kadar gün sonra;
      // ikisi de yoksa yayın tarihleri birkaç gün arayla geriye dağıtılır (hepsi aynı dakikada görünmesin)
      const published_at = p.at != null ? p.at : p.day != null ? now + p.day * 864e5 + k * 60e3 : now - (list.length - 1 - m.i) * 2 * 864e5 - k * 60e3;
      await insertPost(db, { ...p, cover_id, status: 'published', published_at, author: p.author || 'Hastürk CRM' }, { name: 'Hastürk CRM' });
      out.added.push(m.slug); done.push(m.slug);
    } catch (e) { out.errors.push(`${m.slug}: ${e.message}`); }
  }
  await run(db, "INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v", KEY, JSON.stringify(done));
  return out;
}
