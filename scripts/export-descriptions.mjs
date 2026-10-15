// Bilgi bankası hammaddesi (sadece okuma): ikas'taki tüm ürünlerin adı, adresi, markası, kategorileri ve açıklama metni.
// docs/bilgi/urunler-<mağaza>.json dosyasına yazılır; Ak Bilgi ürün kartları ve doz tabloları bundan hazırlanır.
import { writeFile, mkdir } from 'node:fs/promises';
const env = process.env, API = 'https://api.myikas.com/api/v1/admin/graphql', NAME = env.OUT_NAME || 'hasturk';
const tok = await (await fetch(`https://${env.IKAS_STORE}.myikas.com/api/admin/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.IKAS_CLIENT_ID, client_secret: env.IKAS_CLIENT_SECRET }) })).json();
const gql = async (query, variables = {}) => { const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok.access_token }, body: JSON.stringify({ query, variables }) }); const j = await r.json(); if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 400)); return j.data; };
const pf = ((await gql('{ __type(name: "Product") { fields { name } } }')).__type.fields || []).map((f) => f.name);
const descF = ['description', 'shortDescription'].filter((f) => pf.includes(f));
console.log('Açıklama alanları: ' + descF.join(', '));
const cats = new Map();
try { for (const c of (await gql('{ listCategory { id name parentId } }')).listCategory) cats.set(c.id, c); } catch {}
const path = (id) => { const o = []; for (let c = cats.get(id); c; c = cats.get(c.parentId)) o.unshift(c.name); return o.join(' > '); };
const text = (h) => String(h || '').replace(/<(br|\/p|\/li|\/h\d|\/tr)[^>]*>/gi, '\n').replace(/<li[^>]*>/gi, '• ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
const out = [];
for (let page = 1; page < 50; page++) {
  const d = (await gql(`query($p: Int!) { listProduct(pagination: { page: $p, limit: 100 }) { hasNext data { id name ${descF.join(' ')} metaData { slug } brand { name } categoryIds } } }`, { p: page })).listProduct;
  for (const p of d.data) out.push({ id: p.id, ad: p.name, adres: p.metaData && p.metaData.slug, marka: p.brand && p.brand.name, kategoriler: (p.categoryIds || []).map(path), aciklama: text(descF.map((f) => p[f]).filter(Boolean).join('\n')) });
  if (!d.hasNext) break;
}
const doz = (t) => /(\d+[.,]?\d*)\s*(ml|cc|gr|g|kg|lt|litre|l)\b.{0,40}(su|toprak|saksı|dekar|m2|m²|ağaç|fide|litre)/i.test(t);
console.log(`Ürün: ${out.length} · açıklaması olan: ${out.filter((p) => p.aciklama.length > 40).length} · doz bilgisi geçen: ${out.filter((p) => doz(p.aciklama)).length}`);
await mkdir('docs/bilgi', { recursive: true });
await writeFile(`docs/bilgi/urunler-${NAME}.json`, JSON.stringify(out, null, 1) + '\n');
