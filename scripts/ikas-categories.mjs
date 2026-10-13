// ikas mağazasında kategori ağacı açar (ad, üst kategori, adres, meta başlık ve meta açıklama).
// Plan dosyası: CATS_FILE (ör. scripts/categories/bitkiler.json). "apply": false iken sadece okur ve ne yapacağını
// yazar (kuru çalıştırma); true iken eksik kategorileri açar. Aynı üst kategoride aynı adda kategori varsa
// yeniden açılmaz (tekrar çalıştırmak güvenli). Menüye dokunmaz. GitHub Actions'ta çalışır (.github/workflows/ikas-categories.yml).
import { readFile, appendFile } from 'node:fs/promises';

const env = process.env;
const API = 'https://api.myikas.com/api/v1/admin/graphql';
const out = [];
const log = (s) => { out.push(s); console.log(s); };
const die = async (msg) => { log('HATA: ' + msg); await summary(); process.exit(1); };
async function summary() { if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, '```\n' + out.join('\n') + '\n```\n'); }

async function token() {
  const r = await fetch(`https://${env.IKAS_STORE}.myikas.com/api/admin/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.IKAS_CLIENT_ID, client_secret: env.IKAS_CLIENT_SECRET }),
  });
  const t = await r.text();
  if (!r.ok) await die(`Token alınamadı (${r.status}): ${t.slice(0, 200)}`);
  return JSON.parse(t).access_token;
}
let TOKEN;
async function gql(query, variables = {}) {
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN }, body: JSON.stringify({ query, variables }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.errors) throw new Error(`HTTP ${r.status}: ${JSON.stringify(j.errors || j).slice(0, 400)}`);
  return j.data;
}
const typeFields = async (name) => {
  const d = await gql(`query($n: String!) { __type(name: $n) { inputFields { name type { kind name ofType { kind name ofType { kind name } } } } } }`, { n: name });
  return (d.__type && d.__type.inputFields) || [];
};
const tname = (t) => (t ? t.name || tname(t.ofType) : '');

const plan = JSON.parse(await readFile(env.CATS_FILE || 'scripts/categories/bitkiler.json', 'utf8'));
const apply = plan.apply === true && env.APPLY !== '0';
TOKEN = await token();
log(`Mağaza: ${env.IKAS_STORE} · ${apply ? 'UYGULAMA (kategoriler açılacak)' : 'KURU ÇALIŞTIRMA (hiçbir şey değişmez)'}`);

// ikas şeması: kategori kaydetme mutasyonu ve alanları
const m = await gql(`{ __schema { mutationType { fields { name args { name type { kind name ofType { kind name ofType { kind name } } } } } } } }`);
const save = m.__schema.mutationType.fields.find((f) => f.name === 'saveCategory');
if (!save) await die('saveCategory mutasyonu bulunamadı: ' + m.__schema.mutationType.fields.map((f) => f.name).filter((n) => /categor/i.test(n)).join(', '));
const inputType = tname(save.args.find((a) => a.name === 'input').type);
const inFields = await typeFields(inputType);
const metaF = inFields.find((f) => f.name === 'metaData');
const metaType = metaF ? tname(metaF.type) : null;
const metaFields = metaType ? await typeFields(metaType) : [];
log(`Şema: saveCategory(input: ${inputType}) · alanlar: ${inFields.map((f) => f.name).join(', ')}`);
log(`Meta (${metaType}): ${metaFields.map((f) => f.name + (f.type.kind === 'NON_NULL' ? '!' : '')).join(', ')}`);
const required = inFields.filter((f) => f.type.kind === 'NON_NULL').map((f) => f.name);
log('Zorunlu alanlar: ' + (required.join(', ') || '-'));

// Mevcut kategoriler
let cats;
try { cats = (await gql('{ listCategory { id name parentId metaData { slug pageTitle description } } }')).listCategory; }
catch { cats = (await gql('{ listCategory { data { id name parentId metaData { slug pageTitle description } } } }')).listCategory.data; }
const fold = (s) => String(s || '').toLocaleLowerCase('tr-TR').trim();
log(`Mevcut kategori: ${cats.length}`);
const slugs = new Set(cats.map((c) => c.metaData && c.metaData.slug).filter(Boolean));

const has = (n) => metaFields.some((f) => f.name === n);
function input(c, parentId) {
  const meta = { slug: c.slug, pageTitle: c.pageTitle, description: c.description };
  if (has('targetType')) meta.targetType = 'CATEGORY';
  for (const k of Object.keys(meta)) if (!has(k)) delete meta[k];
  const o = { name: c.name, metaData: meta };
  if (parentId) o.parentId = parentId;
  if (inFields.some((f) => f.name === 'conditions') && required.includes('conditions')) o.conditions = [];
  if (inFields.some((f) => f.name === 'orderType') && required.includes('orderType')) o.orderType = 'MANUAL';
  return o;
}

let created = 0, existed = 0;
async function walk(list, parentId, depth) {
  for (const c of list) {
    const pad = '  '.repeat(depth);
    let hit = cats.find((x) => fold(x.name) === fold(c.name) && (x.parentId || null) === (parentId || null));
    if (hit) {
      existed++;
      log(`${pad}= ${c.name} zaten var (/${hit.metaData && hit.metaData.slug}); dokunulmadı`);
    } else {
      if (slugs.has(c.slug)) log(`${pad}! UYARI: /${c.slug} adresi başka bir kategoride kullanılıyor`);
      const inp = input(c, parentId);
      if (!apply) {
        log(`${pad}+ AÇILACAK: ${c.name}  /${c.slug}\n${pad}    başlık: ${c.pageTitle}\n${pad}    açıklama: ${c.description}`);
        hit = { id: parentId === undefined ? null : `(yeni:${c.slug})`, name: c.name };
      } else {
        try {
          const d = await gql(`mutation($input: ${inputType}!) { saveCategory(input: $input) { id name parentId metaData { slug pageTitle description } } }`, { input: inp });
          hit = d.saveCategory;
          cats.push(hit);
          created++;
          log(`${pad}+ AÇILDI: ${hit.name}  /${hit.metaData && hit.metaData.slug}  (id ${hit.id})`);
        } catch (e) {
          await die(`${c.name} açılamadı: ${e.message}\nGönderilen: ${JSON.stringify(inp)}`);
        }
      }
    }
    if (c.children) await walk(c.children, hit.id, depth + 1);
  }
}
await walk(plan.categories, null, 0);
log(`Sonuç: ${created} açıldı, ${existed} zaten vardı.`);
await summary();
