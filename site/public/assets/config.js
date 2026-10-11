// Site ayarları: şirket bilgileri, iletişim ve paket fiyatları BURADAN düzenlenir (sayfalar bu değerleri kendisi doldurur).
// Boş bırakılan iletişim alanları sitede gösterilmez. Yasal sayfalardaki köşeli parantezli alanlar ([Şirket ünvanı] …) buradan dolar.
document.documentElement.classList.add('js'); // kaydırınca beliren bölümler yalnız JS varken gizlenir
window.SITE = {
  brand: 'Hastürk CRM',
  panelUrl: 'https://panel.hasturkcrm.com',
  // Demo / iletişim formları bu adrese gönderilir; talepler panelde Destek sayfasına "Web sitesi" olarak düşer
  leadUrl: 'https://panel.hasturkcrm.com/api/public/lead',
  // "Canlı demo" düğmeleri: bilgi istemeden örnek verilerle çalışan demo paneline girer
  demoUrl: 'https://panel.hasturkcrm.com/api/public/demo',
  // Online paket satışı (iyzico): satın alma formu buraya gönderilir; ödeme iyzico'nun güvenli sayfasında yapılır.
  // Tutar paneldeki fiyattan alınır (panel/src/plans.js) — fiyat değişince iki yerde de güncelleyin.
  checkoutUrl: 'https://panel.hasturkcrm.com/api/public/checkout',
  company: {
    legal: 'Hastürk Gübre Sanayi ve Ticaret Limited Şirketi', // Şirket tam ünvanı (Hastürk CRM Sistemleri'nin tüm hakları bu şirkete aittir)
    address: 'Kızılcaali Mahallesi, Karakoçan Çıkmazı Sokak, No:7/1, 34540 Çatalca / İstanbul',
    phone: '+90 553 942 29 61',
    whatsapp: '905539422961',       // yalnız rakam, ülke koduyla
    email: 'info@hasturkcrm.com',
    kvkkEmail: 'info@hasturkcrm.com',                  // KVKK başvuruları için e-posta (boşsa yukarıdaki e-posta)
    taxOffice: 'Büyükçekmece',                  // Vergi dairesi
    taxNo: '4590601809',                      // Vergi numarası
    mersis: '0459060180900001',                     // MERSİS no (varsa)
  },
  // WhatsApp düğmesine basınca hazır gelen mesaj
  waText: 'Merhaba, Hastürk CRM hakkında bilgi almak istiyorum.',
  // Paketler: aylık ve yıllık fiyat (TL, KDV DAHİL). Fiyat boşsa "Teklif alın" yazar.
  installments: 3,          // yıllık alımda kredi kartına peşin fiyatına taksit sayısı (0 = gösterme)
  maxInstallments: 12,      // anlaşmalı kartlara en fazla taksit (ödeme sayfasında bankanın sunduğu seçenekler görünür)
  installmentCards: ['Axess', 'Bonus', 'Maximum', 'World', 'Paraf', 'QNB'],
  eftDiscount: 5,           // havale / EFT ile ödemede indirim (%), yalnız yıllık alımda; 0 = gösterme (panel/src/plans.js → EFT_DISCOUNT ile aynı tutun)
  // Google Ads etiketi: id (AW-…). Dönüşüm etiketleri (Google Ads → Dönüşümler → işlem → "Etiketi kendiniz yükleyin" →
  // send_to: 'AW-…/ETİKET' içindeki ETİKET kısmı) girilirse tutar ve sipariş no ile dönüşüm gönderilir; boşken Google'da
  // "URL içerir /odeme-basarili" kuralıyla dönüşüm tanımlanabilir. Etiket ve çerez onayı: assets/gtag.js
  ads: { id: 'AW-18503315802', trial: 'pSafCOvm8ZcdENriiPdE', contact: '', purchase: '', lead: '' },  // etiketler asıl olarak panelden (Ayarlar → Google Ads) okunur
  // Google Analytics 4 ölçüm kimliği (G-…): aynı Google etiketi ve aynı çerez onayıyla çalışır
  analytics: 'G-TL715957RJ',
  // Havale / EFT: satın alma sayfasında "Havale / EFT" seçilince gösterilir (panel/src/billing.js → bankOf ile aynı tutun)
  bank: { name: 'Ziraat Katılım Bankası', holder: 'Hastürk Gübre Sanayi ve Ticaret Limited Şirketi', iban: 'TR63 0020 9000 0207 5858 0000 01' },
  vat: 'Tüm fiyatlara KDV dahildir. Yıllık alımda 12 ay yerine 10 ay ücret alınır ve kredi kartına peşin fiyatına 3 taksit yapılır; Axess, Bonus, Maximum, World, Paraf ve QNB kartlarına 12 taksite kadar ödenebilir. Yıllık alımda havale / EFT ile ödemede %5 indirim uygulanır.',
  plans: [
    // tag: kime uygun · limits: kartta fiyatın altında · base: "… paketindeki her şey" satırı · items: kartta öne çıkanlar (5–7 madde)
    { key: 'baslangic', name: 'Başlangıç', tag: 'Az kanalla satış yapan küçük ekipler', monthly: 990, yearly: 9900, limits: ['3 mağaza', '2 kullanıcı'],
      items: ['Tüm aktif entegrasyonlar', 'Sipariş, kargo etiketi ve toplama listesi', 'Stok senkronu ve ürün eşleştirme', 'Çok kanala ürün yükleme', 'Gelir & gider, kâr-zarar raporu', 'Müşteri soruları ve iade talepleri', 'E-posta ve WhatsApp destek'] },
    { key: 'profesyonel', name: 'Profesyonel', tag: 'Çok kanalda büyüyen işletmeler', monthly: 1990, yearly: 19900, featured: true, limits: ['10 mağaza', '5 kullanıcı'], base: 'Başlangıç',
      items: ['Buybox takibi ve otomatik fiyat', 'Otomatik ürün gönderimi', 'Hakediş takvimi ve kesilen faturalar', 'Excel ile toplu fiyat / stok / maliyet', 'Personel yetkileri ve rol şablonları', 'Öncelikli destek'] },
    { key: 'kurumsal', name: 'Kurumsal', tag: 'Yüksek hacimli ve yurt dışına satan firmalar', monthly: 3990, yearly: 39900, limits: ['25 mağaza', 'Sınırsız kullanıcı'], base: 'Profesyonel',
      items: ['Yurt dışı pazaryerleri (eBay, Etsy, Ozon, yurt dışı Amazon)', 'Kendi kargo anlaşmanızla 7 kargo firması', 'Döviz kuruna endeksli otomatik fiyat', 'Kurulum ve veri aktarımında birebir destek', 'Telefon destek hattı', 'Yeni kanal ve özel geliştirme önceliği'],
      // soon: pakete eklenecek ama henüz aktif olmayan özellikler ("Yakında" rozetiyle görünür; panel/src/plans.js → soon ile aynı tutun)
      soon: ['e-Fatura / e-Arşiv entegrasyonu'] },
  ],
  // Ek mağaza: paketteki mağaza sınırının üstüne, mağaza başına yıllık ücret (TL, KDV dahil; panel/src/plans.js → EXTRA_STORE ile aynı tutun)
  extraStore: 3000,
  // Paket karşılaştırma tablosu (gruplu): [özellik, Başlangıç, Profesyonel, Kurumsal]; true = var, false = yok, metin = değer ('Yakında' mor görünür)
  compare: [
    { group: 'Kanallar ve mağazalar', rows: [
      ['Mağaza bağlantısı', '3', '10', '25'],
      ['Ek mağaza (mağaza başına)', '3.000 ₺ / yıl', '3.000 ₺ / yıl', '3.000 ₺ / yıl'],
      ['Tüm aktif entegrasyonlar', true, true, true],
      ['Yurt dışı pazaryerleri (eBay, Etsy, Ozon, yurt dışı Amazon)', false, false, true],
    ] },
    { group: 'Sipariş ve kargo', rows: [
      ['Sipariş yönetimi ve gecikme uyarısı', true, true, true],
      ['Kargo etiketi ve toplama listesi', true, true, true],
      ['Müşteri soruları ve iade talepleri', true, true, true],
      ['Kendi anlaşmalı kargo entegrasyonu (7 kargo firması)', false, false, true],
    ] },
    { group: 'Ürün ve stok', rows: [
      ['Sipariş, ürün ve ilan sayısı', 'Sınırsız', 'Sınırsız', 'Sınırsız'],
      ['Stok senkronu ve ürün eşleştirme', true, true, true],
      ['Çok kanala ürün yükleme', true, true, true],
      ['Otomatik ürün gönderimi', false, true, true],
      ['Excel ile toplu fiyat / stok / maliyet', false, true, true],
    ] },
    { group: 'Fiyat yönetimi', rows: [
      ['Buybox takibi ve otomatik fiyat', false, true, true],
      ['Döviz kuruna endeksli otomatik fiyat (USD / EUR / GBP)', false, false, true],
    ] },
    { group: 'Raporlar ve kâr', rows: [
      ['Gelir & gider, kâr-zarar', true, true, true],
      ['Satış analizi ve raporlar', true, true, true],
      ['Hakediş ve kesilen faturalar', false, true, true],
      ['e-Fatura / e-Arşiv entegrasyonu', false, false, 'Yakında'],
    ] },
    { group: 'Ekip ve güvenlik', rows: [
      ['Kullanıcı', '2', '5', 'Sınırsız'],
      ['Personel yetkileri ve rol şablonları', false, true, true],
      ['İki adımlı doğrulama', true, true, true],
    ] },
    { group: 'Destek', rows: [
      ['E-posta ve WhatsApp destek', true, true, true],
      ['Öncelikli destek', false, true, true],
      ['Telefon destek hattı', false, false, true],
      ['Kurulum ve veri aktarımında birebir destek', false, false, true],
      ['Yeni kanal ve özel geliştirme önceliği', false, false, true],
    ] },
  ],
};
