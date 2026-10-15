# hasturkgubre.com.tr/blog yazılarını indirir (yalnız okuma; mağazaya bir şey yazmaz).
# Yazı adresleri site haritasından ve blog liste sayfalarından toplanır; her yazının metni docs/blog/<adres>.txt olur.
import json, re, sys, html, urllib.request, os
SITE = 'https://hasturkgubre.com.tr'
UA = {'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36'}
def get(u):
    try:
        with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60) as r: return r.read().decode('utf-8', 'replace')
    except Exception as e:
        print('HATA', u, e); return ''
urls = set()
# 1) Site haritaları
todo, seen = [SITE + '/sitemap.xml'], set()
while todo:
    sm = todo.pop()
    if sm in seen: continue
    seen.add(sm); x = get(sm)
    for loc in re.findall(r'<loc>\s*([^<\s]+)\s*</loc>', x):
        loc = html.unescape(loc)
        if loc.endswith('.xml'): todo.append(loc)
        elif re.search(r'/blog/[^/?#]+', loc): urls.add(loc.split('#')[0])
print('site haritası:', len(seen), 'dosya,', len(urls), 'yazı')
# 2) Blog liste sayfaları
for page in range(1, 40):
    h = get(SITE + '/blog' + ('' if page == 1 else f'?page={page}'))
    found = {SITE + m for m in re.findall(r'href="(/blog/[a-z0-9\-]+)"', h)}
    new = found - urls
    urls |= found
    if page > 1 and not new: break
print('toplam yazı adresi:', len(urls))
os.makedirs('docs/blog', exist_ok=True)
index = []
def text_of(h):
    t = re.sub(r'(?is)<(script|style|noscript|svg).*?</\1>', '', h)
    t = re.sub(r'(?is)<(header|footer|nav)\b.*?</\1>', '', t)
    t = re.sub(r'(?s)<br\s*/?>|</(p|div|tr|li|h\d)>', '\n', t)
    t = re.sub(r'<[^>]+>', ' ', t); t = html.unescape(t)
    return re.sub(r'[ \t]+', ' ', re.sub(r'\n\s*\n+', '\n\n', t)).strip()
for u in sorted(urls):
    h = get(u)
    if not h: continue
    slug = u.rstrip('/').split('/')[-1]
    title = html.unescape((re.search(r'<title>(.*?)</title>', h, re.S) or [None, ''])[1]).strip()
    body = ''
    # ikas (Next.js) sayfa verisi: yazının HTML gövdesi __NEXT_DATA__ içinde olabilir
    m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', h, re.S)
    if m:
        try:
            data = json.loads(m.group(1)); best = ''
            def walk(o):
                global best
                if isinstance(o, dict):
                    for v in o.values(): walk(v)
                elif isinstance(o, list):
                    for v in o: walk(v)
                elif isinstance(o, str) and len(o) > len(best) and ('<p' in o or '<h2' in o or len(o) > 1500): best = o
            walk(data); body = text_of(best) if best else ''
        except Exception as e: print('json', slug, e)
    if len(body) < 300: body = text_of(h)
    open(f'docs/blog/{slug}.txt', 'w', encoding='utf-8').write(f'# Kaynak: {u}\n# Başlık: {title}\n\n{body}\n')
    index.append({'adres': u, 'slug': slug, 'baslik': title, 'karakter': len(body)})
    print(slug, len(body))
json.dump(index, open('docs/blog/_liste.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('kaydedilen yazı:', len(index))
