// Site ayarları: şirket bilgileri, iletişim ve paket fiyatları BURADAN düzenlenir (sayfalar bu değerleri kendisi doldurur).
// Boş bırakılan iletişim alanları sitede gösterilmez. Yasal sayfalardaki köşeli parantezli alanlar ([Şirket ünvanı] …) buradan dolar.
document.documentElement.classList.add('js'); // kaydırınca beliren bölümler yalnız JS varken gizlenir
window.SITE = {
  brand: 'Hastürk CRM',
  panelUrl: 'https://panel.hasturkcrm.com',
  // Demo talep formu bu adrese gönderilir; talepler panelde Destek sayfasına "Web sitesi" olarak düşer
  leadUrl: 'https://panel.hasturkcrm.com/api/public/lead',
  company: {
    legal: '',        // Şirket ünvanı (ör. "Hastürk ... Ltd. Şti.")
    address: '',      // Açık adres
    phone: '',        // ör. "+90 5xx xxx xx xx"
    whatsapp: '',     // yalnız rakam, ülke koduyla: ör. "905xxxxxxxxx"
    email: '',        // ör. "destek@hasturkcrm.com"
    kvkkEmail: '',    // KVKK başvuruları için e-posta (boşsa yukarıdaki e-posta)
    taxOffice: '',    // Vergi dairesi
    taxNo: '',        // Vergi numarası
    mersis: '',       // MERSİS no (varsa)
  },
  // Paketler: price boşsa "Teklif alın" yazar. period: 'ay' | 'yıl'
  plans: [
    { name: 'Başlangıç', tag: 'Tek mağaza, küçük ekip', price: '', period: 'ay', users: '2 kullanıcı',
      items: ['Tüm aktif entegrasyonlar', 'Sipariş, kargo ve etiket yönetimi', 'Stok senkronu ve ürün eşleştirme', 'Gelir & gider, kâr-zarar raporu', 'Müşteri soruları ve iade talepleri', 'E-posta ile destek'] },
    { name: 'Profesyonel', tag: 'Çok kanallı büyüyen işletmeler', price: '', period: 'ay', users: '5 kullanıcı', featured: true,
      items: ['Başlangıç paketindeki her şey', 'Buybox takibi ve fiyat önerileri', 'Personel yetkileri ve iki adımlı doğrulama', 'Hakediş ve kesilen faturalar', 'Excel ile toplu güncelleme', 'Öncelikli destek'] },
    { name: 'Kurumsal', tag: 'Yüksek hacim ve özel ihtiyaçlar', price: '', period: 'ay', users: 'Sınırsız kullanıcı',
      items: ['Profesyonel paketteki her şey', 'Stok API (kendi sisteminize / bayilerinize stok aktarımı)', 'Kurulum ve veri aktarımında birebir destek', 'Yeni kanal / özel geliştirme talepleri', 'Telefon ve WhatsApp destek hattı'] },
  ],
};
