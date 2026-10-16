# Paylaşım görseli (Open Graph / X kartı, 1200×630): public/img/og-hasturk-crm.jpg'i logo ve panel ekran görüntüsünden üretir.
# Kullanım: python3 site/scripts/og-image.py  (Pillow ve Inter yazı tipi gerekir; yoksa public/fonts'taki Inter kullanılır)
# Görsel değişirse layout.html'deki og:image adresini değiştirmeye gerek yok; sosyal ağların önbelleği için dosya adını değiştirebilirsiniz.
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
P=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public') + '/'
F='/usr/share/fonts/opentype/inter/'
def font(name, size):
    try: return ImageFont.truetype(F + name, size)
    except OSError:
        f = ImageFont.truetype(P + 'fonts/inter-latin-ext.woff2', size)
        f.set_variation_by_axes([{'Medium': 500, 'SemiBold': 600, 'ExtraBold': 800}.get(name[6:-4], 400)])
        return f
W,H=1200,630
img=Image.new('RGB',(W,H),'#ffffff')
# soft brand gradient background (site: --bg-2 #f5f8fe -> #e9f1ff)
g=Image.new('RGB',(W,H))
d=ImageDraw.Draw(g)
for y in range(H):
    t=y/H
    c=tuple(int(a+(b-a)*t) for a,b in zip((247,250,255),(228,238,255)))
    d.line([(0,y),(W,y)],fill=c)
img.paste(g)
draw=ImageDraw.Draw(img)
# screenshot card on the right, bleeding off the edge
shot=Image.open(P+'img/genel-bakis.jpg').convert('RGB')
sw=700; sh=int(shot.height*sw/shot.width)
shot=shot.resize((sw,sh),Image.LANCZOS)
x0,y0=610,150
# shadow
sh_mask=Image.new('L',(W,H),0); ImageDraw.Draw(sh_mask).rounded_rectangle([x0+6,y0+16,x0+sw+6,y0+sh+40+16],radius=18,fill=90)
sh_mask=sh_mask.filter(ImageFilter.GaussianBlur(22))
img.paste(Image.new('RGB',(W,H),(31,60,140)),(0,0),sh_mask)
draw=ImageDraw.Draw(img)
draw.rounded_rectangle([x0,y0,x0+sw,y0+sh+40],radius=16,fill='#ffffff',outline='#dbe3f0',width=2)
for i,c in enumerate(('#ff5f57','#febc2e','#28c840')):
    draw.ellipse([x0+18+i*20,y0+14,x0+30+i*20,y0+26],fill=c)
draw.text((x0+90,y0+11),'panel.hasturkcrm.com',font=font('Inter-Medium.otf',15),fill='#7b8699')
img.paste(shot,(x0,y0+40))
# logo
logo=Image.open(P+'assets/logo.webp').convert('RGBA')
lw=300; logo=logo.resize((lw,int(logo.height*lw/logo.width)),Image.LANCZOS)
img.paste(logo,(64,58),logo)
draw=ImageDraw.Draw(img)
fb=font('Inter-ExtraBold.otf',50)
y=230
for line in ['Pazaryeri ve','e-ticaret satışınız','tek panelde']:
    draw.text((64,y),line,font=fb,fill='#0d1b34' if line!='tek panelde' else '#1f6bff'); y+=62
fm=font('Inter-Medium.otf',23)
draw.text((64,y+20),'Sipariş · Kargo etiketi · Stok · Fiyat · Kâr',font=fm,fill='#4a5872')
fs=font('Inter-SemiBold.otf',21)
draw.rounded_rectangle([64,y+76,64+300,y+76+46],radius=23,fill='#1f6bff')
draw.text((64+150,y+76+23),'hasturkcrm.com',font=fs,fill='#ffffff',anchor='mm')
img.save(P+'img/og-hasturk-crm.jpg',quality=86,optimize=True,progressive=True)
print(img.size)
