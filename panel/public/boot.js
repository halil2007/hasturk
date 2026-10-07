// Açılış koruması (app.js'ten önce, modül olmayan küçük betik): panel 12 sn içinde açılmazsa (ör. yeni yayından sonra cihazda
// eski / yeni dosyalar karıştı ve app.js hiç çalışamadı) saklanan uygulama dosyaları silinir ve sayfa bir kez yenilenir.
// app.js açılınca (ya da giriş / hata ekranı gösterilince) window.__booted işaretlenir. Döngüye girmesin diye 2 dakikada en fazla bir kez.
(function () {
  setTimeout(function () {
    if (window.__booted || document.querySelector('.login, [data-boot-error]')) return;
    var view = document.getElementById('view');
    if (view && view.childElementCount) return;
    var last = 0;
    try { last = Number(sessionStorage.getItem('boot_reload')) || 0; } catch (e) { /* yok */ }
    if (Date.now() - last < 120000) return;
    try { sessionStorage.setItem('boot_reload', String(Date.now())); } catch (e) { /* yok */ }
    var done = function () { location.reload(); };
    if (window.caches && caches.keys) caches.keys().then(function (ks) { return Promise.all(ks.map(function (k) { return caches.delete(k); })); }).then(done, done);
    else done();
  }, 12000);
})();
