# Altı pozlu sayfayı ayrı, şeffaf arka planlı karelere böler. Beyaz zemin kenarlardan taşma (flood fill) ile silinir;
# robotun krem renkli gövdesi dış çizgiyle çevrili olduğu için içerideki açık renkler korunur.
from PIL import Image, ImageFilter
from collections import deque
import sys
im = Image.open(sys.argv[1]).convert('RGBA')
W, H = im.size
names = ['selam', 'dusunuyor', 'harika', 'fide', 'fikir', 'tesekkur']
cw, ch = W // 3, H // 2
for i, n in enumerate(names):
    c = im.crop(((i % 3) * cw, (i // 3) * ch, (i % 3 + 1) * cw, (i // 3 + 1) * ch))
    w, h = c.size; px = c.load()
    near = lambda p: p[0] > 238 and p[1] > 238 and p[2] > 238
    seen = bytearray(w * h); q = deque()
    for x in range(w):
        for y in (0, h - 1): q.append((x, y))
    for y in range(h):
        for x in (0, w - 1): q.append((x, y))
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y * w + x]: continue
        seen[y * w + x] = 1
        p = px[x, y]
        if not near(p): continue
        px[x, y] = (255, 255, 255, 0)
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    # Ayak altı gölgesi: açık gri ve renksiz pikseller, yalnız figürün alt %14'lük kısmında, zeminle bağlantılıysa silinir
    ys = [y for y in range(h) for x in range(0, w, 4) if px[x, y][3]]
    top, bot = min(ys), max(ys); lim = bot - int((bot - top) * 0.14)
    gray = lambda p: (sum(p[:3]) / 3) > 175 and (max(p[:3]) - min(p[:3])) < 22
    q = deque((x, y) for y in range(lim, h) for x in range(w) if px[x, y][3] == 0)
    seen2 = bytearray(w * h)
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if nx < 0 or ny < lim or nx >= w or ny >= h or seen2[ny * w + nx]: continue
            seen2[ny * w + nx] = 1
            p = px[nx, ny]
            if p[3] and gray(p): px[nx, ny] = (255, 255, 255, 0); q.append((nx, ny))
    # Komşu karelerden taşan parçalar: yalnız en büyük bağlı parça (figür) kalır
    lab = [0] * (w * h); best, bestn, cur = 0, 0, 0; sizes = {}
    for sy in range(h):
        for sx in range(w):
            if px[sx, sy][3] < 40 or lab[sy * w + sx]: continue
            cur += 1; cnt = 0; st = [(sx, sy)]; lab[sy * w + sx] = cur
            while st:
                x, y = st.pop(); cnt += 1
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not lab[ny * w + nx] and px[nx, ny][3] >= 40:
                        lab[ny * w + nx] = cur; st.append((nx, ny))
            sizes[cur] = cnt
            if cnt > bestn: best, bestn = cur, cnt
    for y in range(h):
        for x in range(w):
            if px[x, y][3] >= 40 and sizes.get(lab[y * w + x], 0) < bestn * 0.006: px[x, y] = (255, 255, 255, 0)
    # Kenar yumuşatma: zeminle komşu yarı açık pikselleri biraz saydamlaştır (beyaz hare kalmasın)
    a = c.getchannel('A')
    edge = a.filter(ImageFilter.MinFilter(3))
    for y in range(h):
        for x in range(w):
            r, g, b, al = px[x, y]
            if al and edge.getpixel((x, y)) == 0:
                lum = (r + g + b) / 3
                if lum > 215: px[x, y] = (r, g, b, int(max(0, 255 - (lum - 215) * 6)))
    bb = c.getbbox(); c = c.crop(bb)
    s = max(c.size) + 24; out = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    out.paste(c, ((s - c.size[0]) // 2, (s - c.size[1]) // 2), c)
    out = out.resize((512, 512), Image.LANCZOS)
    out.save(f'{sys.argv[2]}/{n}.png', optimize=True)
    out.resize((256, 256), Image.LANCZOS).save(f'{sys.argv[2]}/{n}.webp', 'WEBP', quality=88, method=6)
    print(n, bb, sorted(sizes.values())[-4:])
