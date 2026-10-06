// İki adımlı doğrulama (Google Authenticator vb.): girişte kod adımı, zorunlu kurulum ekranı ve Hesabım → iki adımlı doğrulama.
import { api, html, raw, render, $, sheet, toast, busy, confirmBox } from './core.js';

const CODE_INPUT = (ph = '123 456') => html`<input class="input otp-input" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="9" placeholder="${ph}" required>`;

// Girişin ikinci adımı: form, kod alanına dönüşür. Başarılıysa sunucunun yanıtı döner.
export function codeStep(form, { ticket, tenant }) {
  return new Promise((resolve, reject) => {
    let backup = false;
    const draw = () => {
      render(form, html`<div><h2>Doğrulama kodu</h2><div class="muted small">${backup ? 'Kurulumda kaydettiğiniz yedek kodlardan birini girin (ör. abcd-ef23).' : 'Telefonunuzdaki doğrulama uygulamasında (Google Authenticator vb.) görünen 6 haneli kodu girin.'}</div></div>
        <label class="field"><span>${backup ? 'Yedek kod' : 'Kod'}</span>${CODE_INPUT(backup ? 'abcd-ef23' : '123 456')}</label>
        <div class="login-err" data-err role="alert"></div>
        <button class="btn primary block lg" type="submit">Doğrula ve giriş yap</button>
        <button type="button" class="link-btn" data-backup>${backup ? 'Uygulamadaki kodu kullan' : 'Telefonum yanımda değil — yedek kod kullan'}</button>`);
      const inp = $('[name=code]', form);
      inp.focus();
      // 6 hane yazılınca kendiliğinden gönder
      if (!backup) inp.oninput = () => { if (/^\d{6}$/.test(inp.value.replace(/\s/g, ''))) form.requestSubmit(); };
      $('[data-backup]', form).onclick = () => { backup = !backup; draw(); };
    };
    draw();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type=submit]'), err = $('[data-err]', form);
      btn.disabled = true;
      try { resolve(await api('login', { method: 'POST', body: { tenant, ticket, code: $('[name=code]', form).value.trim() } })); } catch (x) {
        if (/süresi doldu|Geçersiz doğrulama/.test(x.message)) return reject(x);
        err.textContent = x.message; btn.disabled = false; $('[name=code]', form).select();
      }
    };
  });
}

// Yedek kodları göster (bir kez): kopyala / indir
export function showRecovery(codes, onDone) {
  const text = codes.join('\n');
  const s = sheet({
    title: 'Yedek kodlarınız', size: 'narrow', onClose: onDone,
    body: html`<div class="stack">
      <div class="notice warn small"><i class="ico ico-warn"></i><div>Telefonunuz kaybolursa bu kodlarla giriş yaparsınız. <b>Her kod bir kez kullanılır.</b> Şimdi güvenli bir yere kaydedin; bir daha gösterilmez.</div></div>
      <div class="recovery-codes num">${codes.map((c) => html`<span>${c}</span>`)}</div>
      <div class="row" style="gap:8px"><button class="btn" data-copy><i class="ico ico-copy"></i>Kopyala</button><button class="btn" data-dl><i class="ico ico-download"></i>İndir (.txt)</button></div>
    </div>`,
    foot: html`<span class="spacer"></span><button class="btn primary" data-close>Kaydettim</button>`,
  });
  $('[data-copy]', s.el).onclick = () => navigator.clipboard.writeText(text).then(() => toast('Kodlar kopyalandı'), () => toast('Kopyalanamadı; elle seçip kopyalayın', true));
  $('[data-dl]', s.el).onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`Hastürk panel — iki adımlı doğrulama yedek kodları\n${new Date().toLocaleString('tr-TR')}\n\n${text}\n`], { type: 'text/plain' }));
    a.download = 'yedek-kodlar.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  return s;
}

// Kurulum: QR kodu + elle girilecek anahtar + doğrulama kodu. el içine çizer; açılınca onEnabled(recovery) çağrılır.
async function setupInto(el, onEnabled) {
  render(el, html`<div class="empty"><i class="ico ico-sync spin"></i></div>`);
  const r = await api('me/2fa/setup', { method: 'POST' });
  render(el, html`<div class="stack twofa-setup">
    <ol class="help-steps" style="margin:0">
      <li>Telefonunuza <b>Google Authenticator</b> (ya da Microsoft Authenticator) uygulamasını kurun.</li>
      <li>Uygulamada <b>+</b> → <b>QR kodu tara</b> ile aşağıdaki kodu okutun.</li>
      <li>Uygulamada görünen <b>6 haneli kodu</b> aşağıya yazın.</li>
    </ol>
    <div class="twofa-qr">${raw(r.qr)}</div>
    <details><summary class="small" style="cursor:pointer">QR okutamıyor musunuz? Anahtarı elle girin</summary><div class="num twofa-key" style="margin-top:6px">${r.secret}</div><div class="tiny muted">Uygulamada "Kurulum anahtarı gir" → hesap adı: panel adı, anahtar: yukarıdaki, tür: zamana dayalı.</div></details>
    <label class="field"><span>Doğrulama kodu</span>${CODE_INPUT()}</label>
    <div class="login-err" data-err role="alert"></div>
    <button class="btn primary block" data-enable><i class="ico ico-check"></i>Doğrula ve aç</button>
  </div>`);
  const inp = $('[name=code]', el), btn = $('[data-enable]', el);
  inp.oninput = () => { if (/^\d{6}$/.test(inp.value.replace(/\s/g, ''))) btn.click(); };
  btn.onclick = () => busy(btn, async () => {
    try {
      const x = await api('me/2fa/enable', { method: 'POST', body: { code: inp.value.trim() } });
      onEnabled(x.recovery);
    } catch (e) { $('[data-err]', el).textContent = e.message; inp.select(); }
  });
}

// Zorunlu kurulum: yönetici iki adımlı doğrulamayı zorunlu tuttuysa panel açılmadan önce gösterilir
export function forcedSetup() {
  if ($('.login')) return;
  document.querySelectorAll('.side, .main, .tabbar').forEach((e) => e.classList.add('hide'));
  const box = document.createElement('div');
  box.className = 'login';
  render(box, html`<div class="login-card stack">
    <div><h2>İki adımlı doğrulama</h2><div class="muted small">Yöneticiniz hesap güvenliği için iki adımlı doğrulamayı zorunlu tuttu. Bir kez kurmanız yeterli; sonraki girişlerde şifrenizle birlikte telefonunuzdaki kod istenir.</div></div>
    <div data-setup></div>
    <button type="button" class="link-btn" data-out>Çıkış yap</button></div>`);
  document.body.prepend(box);
  $('[data-out]', box).onclick = async () => { await api('logout', { method: 'POST' }).catch(() => {}); location.reload(); };
  setupInto($('[data-setup]', box), (codes) => showRecovery(codes, () => location.reload())).catch((e) => toast(e.message, true));
}

// Hesabım → iki adımlı doğrulama
export async function twofaSettings() {
  const s = sheet({ title: 'İki adımlı doğrulama', size: 'narrow', body: html`<div class="empty"><i class="ico ico-sync spin"></i></div>` });
  const draw = async () => {
    const st = await api('me/2fa', { fresh: true });
    if (!st.on) {
      s.setBody(html`<div class="stack"><p style="margin:0">Girişte şifrenize ek olarak telefonunuzdaki uygulamanın ürettiği kod istenir. Şifreniz başkasının eline geçse bile hesabınıza girilemez.</p>
        <button class="btn primary" data-start><i class="ico ico-key"></i>Kurulumu başlat</button></div>`);
      $('[data-start]', s.el).onclick = () => setupInto(s.body, (codes) => { s.close(); showRecovery(codes); toast('İki adımlı doğrulama açıldı'); }).catch((e) => toast(e.message, true));
      return;
    }
    s.setBody(html`<div class="stack">
      <div class="notice good small"><i class="ico ico-check"></i><div><b>Açık.</b> Girişte doğrulama kodu isteniyor. Kalan yedek kod: <b>${st.recoveryLeft}</b>${st.recoveryLeft < 3 ? ' — yenilerini oluşturun' : ''}.</div></div>
      ${st.required ? html`<div class="muted small">Yöneticiniz zorunlu tuttuğu için kapatılamaz.</div>` : ''}
      <label class="field"><span>İşlem için güncel kod (ya da yedek kod)</span>${CODE_INPUT()}</label>
      <div class="row wrap" style="gap:8px"><button class="btn" data-rec><i class="ico ico-sync"></i>Yeni yedek kodlar</button>${st.required ? '' : html`<button class="btn danger" data-off>Kapat</button>`}</div>
    </div>`);
    const code = () => $('[name=code]', s.el).value.trim();
    $('[data-rec]', s.el).onclick = (e) => busy(e.currentTarget, async () => { const r = await api('me/2fa/recovery', { method: 'POST', body: { code: code() } }); s.close(); showRecovery(r.recovery); });
    const off = $('[data-off]', s.el);
    if (off) off.onclick = async (e) => { if (await confirmBox('İki adımlı doğrulama kapatılsın mı? Hesabınız yalnız şifreyle korunur.', 'Kapat')) busy(e.target, async () => { await api('me/2fa/disable', { method: 'POST', body: { code: code() } }); toast('İki adımlı doğrulama kapatıldı'); await draw(); }); };
  };
  draw().catch((e) => { s.close(); toast(e.message, true); });
}
