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
    taxOffice: '',                  // Vergi dairesi
    taxNo: '',                      // Vergi numarası
    mersis: '0459060180900001',                     // MERSİS no (varsa)
  },
  // WhatsApp düğmesine basınca hazır gelen mesaj
  waText: 'Merhaba, Hastürk CRM hakkında bilgi almak istiyorum.',
  // Paketler: aylık ve yıllık fiyat (TL, KDV DAHİL). Fiyat boşsa "Teklif alın" yazar.
  installments: 3,
  eftDiscount: 5,           // havale / EFT ile ödemede indirim (%), yalnız yıllık alımda; 0 = gösterme (panel/src/plans.js → EFT_DISCOUNT ile aynı tutun)
  // Google Ads etiketi: id (AW-…). Dönüşüm etiketleri (Google Ads → Dönüşümler → işlem → "Etiketi kendiniz yükleyin" →
  // send_to: 'AW-…/ETİKET' içindeki ETİKET kısmı) girilirse tutar ve sipariş no ile dönüşüm gönderilir; boşken Google'da
  // "URL içerir /odeme-basarili" kuralıyla dönüşüm tanımlanabilir. Etiket ve çerez onayı: assets/gtag.js
  ads: { id: 'AW-18503315802', purchase: '', lead: '' },
  // Havale / EFT: satın alma sayfasında "Havale / EFT" seçilince gösterilir (panel/src/billing.js → bankOf ile aynı tutun)
  bank: { name: 'Ziraat Katılım Bankası', holder: 'Hastürk Gübre Sanayi ve Ticaret Limited Şirketi', iban: 'TR63 0020 9000 0207 5858 0000 01' },          // yıllık alımda kredi kartına peşin fiyatına taksit sayısı (0 = gösterme)
  vat: 'Tüm fiyatlara KDV dahildir. Yıllık alımda 12 ay yerine 10 ay ücret alınır ve kredi kartına peşin fiyatına 3 taksit yapılır. Yıllık alımda havale / EFT ile ödemede %5 indirim uygulanır.',
  plans: [
    { key: 'baslangic', name: 'Başlangıç', tag: 'Tek mağaza, küçük ekip', monthly: 990, yearly: 9900, limits: ['3 mağaza bağlantısı', '2 kullanıcı'],
      items: ['Tüm aktif entegrasyonlar', 'Sipariş, kargo ve etiket yönetimi', 'Stok senkronu ve ürün eşleştirme', 'Çok kanala ürün yükleme', 'Gelir & gider, kâr-zarar raporu', 'Müşteri soruları ve iade talepleri', 'E-posta ve WhatsApp destek'] },
    { key: 'profesyonel', name: 'Profesyonel', tag: 'Çok kanallı büyüyen işletmeler', monthly: 1990, yearly: 19900, featured: true, limits: ['10 mağaza bağlantısı', '5 kullanıcı'],
      items: ['Başlangıç paketindeki her şey', 'Buybox takibi ve otomatik fiyat', 'Otomatik ürün gönderimi', 'Hakediş takvimi ve kesilen faturalar', 'Excel ile toplu fiyat / stok / maliyet', 'Personel yetkileri ve rol şablonları', 'Öncelikli destek'] },
    { key: 'kurumsal', name: 'Kurumsal', tag: 'Tüm özellikler ve birebir destek', monthly: 3990, yearly: 39900, limits: ['25 mağaza bağlantısı', 'Sınırsız kullanıcı'],
      items: ['Profesyonel paketteki her şey', 'Döviz kuruna endeksli otomatik fiyat (USD / EUR / GBP)', 'Stok API (kendi sisteminize / bayilerinize stok aktarımı)', 'Kurulum ve veri aktarımında birebir destek', 'Yeni kanal ve özel geliştirme talepleri önceliği', 'Telefon destek hattı', 'Daha fazla mağaza için özel teklif'],
      // soon: pakete eklenecek ama henüz aktif olmayan özellikler ("Yakında" rozetiyle görünür)
      soon: ['e-Fatura / e-Arşiv entegrasyonu', 'Kendi anlaşmalı kargo entegrasyonu', 'Yapay zekâ ile ürün yönetimi: "şu ürünü kapat", "şu ürünlerin fiyatını %5 artır" deyin, sistem tek tek uğraştırmadan kendisi yapsın'] },
  ],
  // Paket karşılaştırma tablosu: [özellik, Başlangıç, Profesyonel, Kurumsal]; true = var, false = yok, metin = değer
  compare: [
    ['Mağaza bağlantısı', '3', '10', '25 (fazlası teklifle)'],
    ['Kullanıcı', '2', '5', 'Sınırsız'],
    ['Sipariş, ürün ve ilan sayısı', 'Sınırsız', 'Sınırsız', 'Sınırsız'],
    ['Tüm aktif entegrasyonlar', true, true, true],
    ['Sipariş yönetimi ve gecikme uyarısı', true, true, true],
    ['Kargo etiketi ve toplama listesi', true, true, true],
    ['Stok senkronu ve ürün eşleştirme', true, true, true],
    ['Çok kanala ürün yükleme', true, true, true],
    ['Müşteri soruları ve iade talepleri', true, true, true],
    ['Gelir & gider, kâr-zarar', true, true, true],
    ['Satış analizi ve raporlar', true, true, true],
    ['İki adımlı doğrulama', true, true, true],
    ['Buybox takibi ve otomatik fiyat', false, true, true],
    ['Otomatik ürün gönderimi', false, true, true],
    ['Hakediş ve kesilen faturalar', false, true, true],
    ['Excel ile toplu güncelleme', false, true, true],
    ['Personel yetkileri ve rol şablonları', false, true, true],
    ['Döviz kuruna endeksli otomatik fiyat', false, false, true],
    ['Stok API (bayi / kendi sisteminiz)', false, false, true],
    ['e-Fatura / e-Arşiv entegrasyonu', false, false, 'Yakında'],
    ['Kendi anlaşmalı kargo entegrasyonu', false, false, 'Yakında'],
    ['Yapay zekâ ile ürün yönetimi', false, false, 'Yakında'],
    ['Yıllık alımda peşin fiyatına 3 taksit', true, true, true],
    ['Destek', 'E-posta, WhatsApp', 'Öncelikli', 'Telefon + birebir kurulum'],
  ],
};
