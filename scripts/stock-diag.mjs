// Stok tanısı (sadece okuma): bir ürünün depo bazında stoğu ve satış kanallarının bağlı olduğu depolar.
import { appendFileSync } from 'node:fs';
const env = process.env, API = 'https://api.myikas.com/api/v1/admin/graphql';
const out = []; const log = (s) => { out.push(s); console.log(s); };
const t = await (await fetch(`https://${env.IKAS_STORE}.myikas.com/api/admin/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.IKAS_CLIENT_ID, client_secret: env.IKAS_CLIENT_SECRET }) })).json();
const gql = async (query, variables = {}) => { const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t.access_token }, body: JSON.stringify({ query, variables }) }); return r.json(); };
const fields = async (n) => ((await gql(`{ __type(name: "${n}") { fields { name type { name kind ofType { name kind ofType { name } } } } } }`)).data.__type?.fields || []).map((f) => f.name);
log('SalesChannel alanları: ' + (await fields('SalesChannel')).join(', '));
log('ProductStockLocation alanları: ' + (await fields('ProductStockLocation')).join(', '));
log('StockLocation alanları: ' + (await fields('StockLocation')).join(', '));
for (const q of ['{ listSalesChannel { id name type stockLocations { id order } } }', '{ listSalesChannel { id name type } }']) {
  const r = await gql(q); log('Satış kanalları: ' + JSON.stringify(r.data || r.errors).slice(0, 1500)); if (r.data) break;
}
log('Depolar: ' + JSON.stringify((await gql('{ listStockLocation { id name type } }')).data || 'okunamadı').slice(0, 1000));
const name = env.NAME || 'Line Tabaklı Bitki Saksısı 1.1L';
for (let page = 1; page <= 5; page++) {
  const r = await gql(`query($p: Int!) { listProduct(pagination: { page: $p, limit: 200 }) { hasNext data { id name salesChannelIds variants { id isActive sellIfOutOfStock stocks { stockCount stockLocationId } variantValueIds { variantTypeId variantValueId } } } } }`, { p: page });
  if (r.errors) { log('HATA: ' + JSON.stringify(r.errors).slice(0, 500)); break; }
  for (const p of r.data.listProduct.data) if (p.name.startsWith(name.slice(0, 26))) log(`\nÜRÜN ${p.name}\n kanallar: ${JSON.stringify(p.salesChannelIds)}\n${p.variants.map((v) => ` varyant ${v.id.slice(0, 8)} aktif=${v.isActive} stoksuzSat=${v.sellIfOutOfStock} stok=${JSON.stringify(v.stocks)}`).join('\n')}`);
  if (!r.data.listProduct.hasNext) break;
}
if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, '```\n' + out.join('\n') + '\n```\n');
