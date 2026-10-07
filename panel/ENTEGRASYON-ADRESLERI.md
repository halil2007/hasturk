# Entegrasyon adresleri (geliştirme ortamı ağ izni)

Claude Code bulut ortamının **Network access → Allowed domains** listesine eklenecek adresler. Geliştirme sırasında API
belgelerini okumak ve bağlantıyı denemek için gerekir. Yayındaki panel (Cloudflare) bu listeye ihtiyaç duymaz.

Durum: **var** = panelde entegrasyonu bulunan kanal · **sırada** = ileride eklenecek (adresler başlangıç noktasıdır;
entegrasyona başlarken belge ve API alt alan adları kesinleştirilip bu listeye işlenir).

## Tek parça liste (kopyala → yapıştır)

```
developers.trendyol.com
apigw.trendyol.com
developers.hepsiburada.com
listing-external.hepsiburada.com
oms-external.hepsiburada.com
mpop.hepsiburada.com
mpfinance-external.hepsiburada.com
diskonto-external.hepsiburada.com
api-asktoseller-merchant.hepsiburada.com
developers.pttavm.com
integration-api.pttavm.com
shipment.pttavm.com
ws.pttavm.com
www.n11.com
api.n11.com
developer.idefix.com
merchantapi.idefix.com
isortagim.pazarama.com
isortagimapi.pazarama.com
isortagimgiris.pazarama.com
apis.ciceksepeti.com
sandbox-apis.ciceksepeti.com
koctas-prod.mirakl.net
developer.mirakl.com
developer-docs.amazon.com
sellingpartnerapi-eu.amazon.com
api.amazon.com
api.myikas.com
cdn.myikas.com
shopify.dev
woocommerce.github.io
woocommerce.com
docs.opencart.com
developers.etsy.com
openapi.etsy.com
api.etsy.com
www.teknosa.com
www.boyner.com.tr
www.modanisa.com
www.lcw.com
www.flo.com.tr
www.farmazon.com.tr
www.ticimax.com
www.ideasoft.com.tr
www.tsoft.com.tr
www.shopier.com
www.faprika.com
developer.ebay.com
api.ebay.com
auth.ebay.com
developer.allegro.pl
api.allegro.pl
dev.wix.com
www.wixapis.com
devdocs.prestashop-project.org
developer.adobe.com
api.brevo.com
developers.brevo.com
api.resend.com
resend.com
api.iyzipay.com
sandbox-api.iyzipay.com
docs.iyzico.com
developers.cloudflare.com
open.er-api.com
www.tcmb.gov.tr
```

## Gruplar

| Grup | Durum | Kanallar |
|---|---|---|
| Pazaryerleri | var | Trendyol, Hepsiburada, PttAVM, N11, idefix, Pazarama, Çiçeksepeti, Koçtaş (Mirakl), Amazon |
| E-ticaret siteleri | var | ikas, Shopify, WooCommerce, OpenCart, Etsy |
| Pazaryerleri | sırada | Teknosa, Boyner, Modanisa, LC Waikiki, FLO, Farmazon |
| Türkiye e-ticaret altyapıları | sırada | Ticimax, IdeaSoft, T-Soft, Shopier, Faprika |
| Yurt dışı | sırada | eBay, Allegro, Wix, PrestaShop, Magento (Adobe Commerce) |
| Diğer servisler | var | E-posta (Brevo, Resend), ödeme (iyzico), Cloudflare belgeleri, döviz kuru |

GittiGidiyor ve Morhipo kapandığı için listede yok.

Ayar `*.alanadi.com` biçimini kabul ediyorsa aynı firmanın satırları yerine tek satır yazılabilir (ör. `*.hepsiburada.com`,
`*.ticimax.com`); sırada olan firmalarda API alt alan adları henüz bilinmediği için bu biçim daha kullanışlıdır.
