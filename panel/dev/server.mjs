// Paneli yerelde çalıştırma (Cloudflare hesabı gerekmeden): node dev/server.mjs  → http://localhost:8787
// Varsayılan DEMO=1 (örnek veri, şifre: demo). Veritabanı: dev/panel.db
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { d1, d1Stats } from './d1.mjs';
import worker, { TenantPanel } from '../src/index.js';
import { doNamespace } from './do.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = { DEMO: '1', ...process.env, DB: d1(process.env.DB_FILE || join(ROOT, 'dev', 'panel.db')) };
// Müşteri panelleri (Durable Object taklidi): dev/tenant-<kod>.db
env.TENANT = doNamespace(TenantPanel, () => env, process.env.TENANT_DIR || join(ROOT, 'dev'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.woff2': 'font/woff2', '.webp': 'image/webp' };
env.ASSETS = {
  async fetch(req) {
    let p = new URL(req.url).pathname;
    if (p.endsWith('/')) p += 'index.html';
    try { return new Response(await readFile(join(ROOT, 'public', p.replace(/\.\./g, ''))), { headers: { 'Content-Type': TYPES[extname(p)] || 'application/octet-stream' } }); }
    catch { return new Response('Bulunamadı', { status: 404 }); }
  },
};
const port = Number(process.env.PORT) || 8787;
createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const request = new Request(`http://localhost:${port}${req.url}`, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) });
  const waits = [];
  const q0 = d1Stats.q, t0 = Date.now();
  const r = await worker.fetch(request, env, { waitUntil: (p) => waits.push(p) });
  if (process.env.DEV_STATS && req.url.startsWith('/api/')) console.log(`${req.method} ${req.url} · ${d1Stats.q - q0} sorgu · ${Date.now() - t0} ms`);
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
  await Promise.allSettled(waits);
}).listen(port, () => console.log(`Panel: http://localhost:${port}  (DEMO=${env.DEMO}, şifre: ${env.PANEL_PASSWORD || 'demo'})`));
// Zamanlanmış senkronu yerelde de çalıştır
if (process.env.NO_CRON !== '1') setInterval(() => worker.scheduled({}, env, { waitUntil: () => {} }), 10 * 60e3);
