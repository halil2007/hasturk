// Widget derlemesi: widget/pm-search.js (okunabilir kaynak, düzenlemeler burada yapılır)
//   → public/pm-search.js (küçültülmüş, sitede yayınlanan; ~%30 daha küçük indirme)
// Kullanım:
//   node scripts/build-widget.mjs          derle ve yaz
//   node scripts/build-widget.mjs --check  yayınlanan dosya kaynakla güncel mi (PR kontrolü)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'widget', 'pm-search.js');
const OUT = join(ROOT, 'public', 'pm-search.js');
const MAP = OUT + '.map';
const TERSER = 'terser@5.51.2'; // sürüm sabit: aynı kaynaktan her yerde birebir aynı çıktı
const check = process.argv.includes('--check');

const tmp = mkdtempSync(join(tmpdir(), 'widget-'));
try {
  const out = join(tmp, 'pm-search.js');
  // ES5 korunur (eski telefonlar), açıklamalar atılır; baştaki /*! … */ kullanım notu kalır
  execFileSync('npx', ['--yes', TERSER, SRC, '--ecma', '5', '--compress', 'passes=2', '--mangle', '--comments', '/^!/',
    '--source-map', 'url=pm-search.js.map,includeSources', '-o', out], { stdio: ['ignore', 'inherit', 'inherit'], cwd: ROOT });
  const js = readFileSync(out, 'utf8');
  const map = readFileSync(out + '.map', 'utf8').replace(/"sources":\["[^"]*"\]/, '"sources":["widget/pm-search.js"]');
  if (check) {
    const same = readFileSync(OUT, 'utf8') === js && readFileSync(MAP, 'utf8') === map;
    if (!same) {
      console.error('public/pm-search.js, widget/pm-search.js ile güncel değil. Çalıştırın: node scripts/build-widget.mjs');
      process.exit(1);
    }
    console.log('public/pm-search.js güncel.');
  } else {
    writeFileSync(OUT, js);
    writeFileSync(MAP, map);
    const kb = (n) => (n / 1024).toFixed(1) + ' KB';
    console.log(`Yazıldı: public/pm-search.js ${kb(Buffer.byteLength(js))} (kaynak ${kb(readFileSync(SRC).length)})`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
