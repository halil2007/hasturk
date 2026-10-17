// "Kendi Toprak Karışımını Oluştur" ürününün seçenek setine metin (not) seçeneği eklemek için ön kontrol / yazma.
// Varsayılan: yalnız OKUR (ikas yönetim API şeması + seçenek setinin şu anki hali + yapılacak değişikliğin planı).
// YAZ=1 ile çalıştırılırsa planı uygular. Anahtarlar GitHub Secrets'tan gelir; çıktıya anahtar yazılmaz.
import { readFileSync } from 'node:fs';
const env = process.env, API = 'https://api.myikas.com/api/v1/admin/graphql';
const K = JSON.parse(readFileSync('public/karisim.json', 'utf8'));
const tok = await (async () => {
  const r = await fetch(`https://${env.IKAS_STORE}.myikas.com/api/admin/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.IKAS_CLIENT_ID, client_secret: env.IKAS_CLIENT_SECRET }) });
  const j = await r.json(); if (!j.access_token) throw new Error('token alınamadı ' + r.status); return j.access_token;
})();
const gql = async (query, variables = {}) => {
  const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ query, variables }) });
  const j = await r.json(); if (j.errors) throw new Error(j.errors.map((e) => e.message).join(' | ')); return j.data;
};
// 1) Şema: seçenek setiyle ilgili sorgu ve değişiklikler
const T = `fragment T on __Type { name kind ofType { name kind ofType { name kind ofType { name kind } } } }`;
const sch = await gql(`${T} { __schema { queryType { fields { name args { name type { ...T } } } } mutationType { fields { name args { name type { ...T } } } } } }`);
const ilgili = (f) => /option/i.test(f.name);
const tn = (t) => t ? (t.name || tn(t.ofType)) : '?';
console.log('Sorgular:', sch.__schema.queryType.fields.filter(ilgili).map((f) => f.name + '(' + f.args.map((a) => a.name + ':' + tn(a.type)).join(',') + ')').join(' | '));
const tumMut = sch.__schema.mutationType.fields;
console.log(`Tüm değişiklikler (${tumMut.length}):`, tumMut.map((f) => f.name).join(', '));
const urunMut = tumMut.filter((f) => /product|custom|kisisel|personal/i.test(f.name));
console.log('Ürün / kişiselleştirme ile ilgili:', urunMut.map((f) => f.name + '(' + f.args.map((a) => a.name + ':' + tn(a.type)).join(',') + ')').join(' | ') || 'yok');
const muts = tumMut.filter(ilgili);
console.log('Değişiklikler:', muts.map((f) => f.name + '(' + f.args.map((a) => a.name + ':' + tn(a.type)).join(',') + ')').join(' | '));
// Girdi türlerinin alanları
const tipAlan = async (ad, d = 0) => {
  if (!ad || d > 2) return;
  const t = (await gql(`${T} query($n:String!){ __type(name:$n){ name kind inputFields { name type { ...T } } enumValues { name } } }`, { n: ad })).__type;
  if (!t) return;
  if (t.enumValues) { console.log(`${'  '.repeat(d)}enum ${ad}: ${t.enumValues.map((e) => e.name).join(', ')}`); return; }
  console.log(`${'  '.repeat(d)}${ad}: ${(t.inputFields || []).map((f) => f.name + ':' + tn(f.type)).join(', ')}`);
  for (const f of t.inputFields || []) { const n = tn(f.type); if (/Input$|Type$|Enum$/.test(n) && !/^(String|Float|Int|Boolean)$/.test(n)) await tipAlan(n, d + 1); }
};
for (const m of muts.filter((f) => /save|create|update/i.test(f.name) && /set/i.test(f.name))) for (const a of m.args) await tipAlan(tn(a.type));
// Ürün kaydetme girdisinde seçenek / kişiselleştirme alanı var mı
for (const m of urunMut.filter((f) => /^(save|create|update)Product$/i.test(f.name))) for (const a of m.args) {
  const t = (await gql(`${T} query($n:String!){ __type(name:$n){ inputFields { name type { ...T } } } }`, { n: tn(a.type) })).__type;
  console.log(`${m.name}.${a.name} (${tn(a.type)}) alanları:`, t ? t.inputFields.map((f) => f.name + ':' + tn(f.type)).join(', ') : '-');
}
// 2) Seçenek setinin şu anki hali
const q = sch.__schema.queryType.fields.find((f) => /^list.*optionset/i.test(f.name) || /optionset/i.test(f.name));
console.log('Okuma sorgusu:', q && q.name);
if (q) {
  try {
    const d = await gql(`{ ${q.name} { id name options { id name type isOptional order } } }`);
    const list = [].concat(d[q.name] || []), set = list.find((x) => x.id === K.set);
    console.log(`Toplam ${list.length} seçenek seti; karışım seti: ${set ? set.name + ' · ' + set.options.length + ' seçenek' : 'BULUNAMADI'}`);
    if (set) console.log('Türler:', [...new Set(set.options.map((o) => o.type))].join(', '), '· metin seçeneği:', set.options.some((o) => /TEXT/i.test(o.type)) ? 'VAR' : 'yok');
  } catch (e) { console.log('Okuma hatası (alanlar farklı olabilir):', e.message.slice(0, 300)); }
}
console.log(env.YAZ === '1' ? 'YAZ=1: henüz yazma adımı tanımlı değil (ön kontrol sonucu görülmeden yazılmaz).' : 'Ön kontrol bitti: hiçbir şey değiştirilmedi.');
