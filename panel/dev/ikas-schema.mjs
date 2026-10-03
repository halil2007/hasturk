// ikas Admin GraphQL şema kontrolü. Kaynak: ikas'ın resmi npm paketi @ikas/admin-api-client (MIT lisans),
// dist/src/api/admin/generated/index.d.ts. Bu dosya oradan tip → alan özetini çıkarır (test/fixtures/ikas-schema.json)
// ve bağdaştırıcının gönderdiği her sorgunun işlem adını, argümanlarını, değişken tiplerini ve alanlarını doğrular.
//   Özeti güncellemek: npm pack @ikas/admin-api-client && node dev/ikas-schema.mjs <index.d.ts> > test/fixtures/ikas-schema.json
import { readFileSync } from 'node:fs';

export function extract(dts) {
  const types = {}, enums = [];
  for (const m of dts.matchAll(/export type (\w+) = \{([\s\S]*?)\n\};/g)) {
    const fields = {};
    for (const f of m[2].matchAll(/^\s{4}(\w+)\??: (.+);$/gm)) {
      const t = f[2].replace(/(InputMaybe|Maybe|Array)</g, '').replace(/>+/g, '').trim();
      fields[f[1]] = /^Scalars/.test(t) ? 'Scalar' : t;
    }
    types[m[1]] = fields;
  }
  for (const m of dts.matchAll(/export declare enum (\w+)/g)) enums.push(m[1]);
  return { types, enums };
}

// Küçük GraphQL ayrıştırıcı: seçim kümeleri ağacı ve argüman adları
function parse(q) {
  const toks = q.replace(/#[^\n]*/g, '').match(/\.\.\.|[{}():!$,\[\]=]|"[^"]*"|[\w.]+/g);
  let i = 0;
  const peek = () => toks[i], next = () => toks[i++];
  const kind = next(), vars = {};
  if (peek() === '(') { next(); while (peek() !== ')') { if (next() === '$') { const n = next(); next(); let t = ''; while (![',', ')', '$'].includes(peek())) t += next(); vars[n] = t.replace(/[!\[\]]/g, ''); } } next(); }
  function sel() {
    const out = [];
    next();
    while (peek() !== '}') {
      const node = { name: next(), args: [], children: null };
      if (peek() === '(') {
        next();
        let depth = 1, expectName = true;
        while (depth) {
          const t = next();
          if (t === '(' || t === '{') { depth++; if (t === '{') expectName = true; } else if (t === ')' || t === '}') depth--;
          else if (depth === 1 && expectName && /^\w+$/.test(t) && peek() === ':') { node.args.push(t); expectName = false; } else if (t === ',') expectName = true;
          else if (depth === 1 && t !== ':') expectName = false;
        }
      }
      if (peek() === '{') node.children = sel();
      out.push(node);
    }
    next();
    return out;
  }
  return { kind, vars, sel: sel() };
}

export function validate(queries, { types, enums }) {
  const errors = [], en = new Set(enums);
  const check = (type, nodes, path) => {
    const fields = types[type];
    if (!fields) { errors.push(`${path}: tip bulunamadı ${type}`); return; }
    for (const n of nodes) {
      if (!(n.name in fields)) { errors.push(`${path}.${n.name}: ${type} tipinde böyle bir alan yok`); continue; }
      if (n.children) check(fields[n.name], n.children, `${path}.${n.name}`);
    }
  };
  for (const q of queries) {
    const doc = parse(q.trim().startsWith('{') ? 'query ' + q : q);
    for (const [v, t] of Object.entries(doc.vars)) if (!types[t] && !en.has(t) && !['String', 'Int', 'Float', 'Boolean', 'ID'].includes(t)) errors.push(`değişken $${v}: tip yok ${t}`);
    const rootName = doc.kind === 'mutation' ? 'Mutation' : 'Query', root = types[rootName];
    for (const n of doc.sel) {
      if (!(n.name in root)) { errors.push(`${doc.kind} ${n.name}: şemada böyle bir işlem yok`); continue; }
      const argsT = types[`${rootName}${n.name}Args`] || {};
      for (const a of n.args) if (!(a in argsT)) errors.push(`${n.name}(${a}:): böyle bir argüman yok`);
      if (n.children) check(root[n.name], n.children, n.name);
    }
  }
  return [...new Set(errors)];
}

// Komut satırı: .d.ts → JSON özet
if (process.argv[1] && process.argv[1].endsWith('ikas-schema.mjs') && process.argv[2]) {
  const s = extract(readFileSync(process.argv[2], 'utf8'));
  process.stdout.write(JSON.stringify({ source: '@ikas/admin-api-client ' + (process.argv[3] || '') + ' (MIT) dist/src/api/admin/generated/index.d.ts', ...s }));
}
