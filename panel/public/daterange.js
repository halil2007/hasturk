// Raporlarda özel tarih aralığı: "Özel tarih" seçilince başlangıç ve bitiş günü (ikisi de dahil, Türkiye saati) girilir.
// Ters girilen aralık düzeltilir, gelecek gün bugüne çekilir. Değerler YYYY-AA-GG olarak saklanır.
import { html } from './core.js';

const TZ = 3 * 3600e3, DAY = 864e5;
export const ymd = (ms) => new Date(ms + TZ).toISOString().slice(0, 10);
export const dayStart = (s) => Date.parse(s + 'T00:00:00+03:00');
const ok = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && Number.isFinite(dayStart(s));
// [başlangıç, bitiş] günleri (geçerli, sıralı, bugünden ileri değil); eksikse son 7 gün
export function customDays(f) {
  const today = ymd(Date.now());
  let a = ok(f.from) ? f.from : ymd(Date.now() - 6 * DAY), b = ok(f.to) ? f.to : today;
  if (a > today) a = today;
  if (b > today) b = today;
  if (a > b) [a, b] = [b, a];
  return [a, b];
}
// Milisaniye aralığı: [başlangıç gününün başı, bitiş gününün sonu)
export const customSpan = (f) => { const [a, b] = customDays(f); return [dayStart(a), dayStart(b) + DAY]; };
// Çip satırının yanına gelen tarih alanları (yalnız "Özel tarih" seçiliyken)
export function customBox(f) {
  if (f.range !== 'custom') return '';
  const [a, b] = customDays(f), today = ymd(Date.now());
  return html`<form class="row" data-crange style="gap:6px;align-items:center;flex-wrap:wrap">
    <input class="input" type="date" name="from" value="${a}" max="${today}" style="width:auto" aria-label="Başlangıç">
    <span class="muted">–</span>
    <input class="input" type="date" name="to" value="${b}" max="${today}" style="width:auto" aria-label="Bitiş">
    <button class="btn sm primary">Göster</button></form>`;
}
// Form gönderilince (Göster / Enter) aralığı f'ye yazar ve apply() çağırır
export function bindCustom(el, f, apply) {
  el.addEventListener('submit', (e) => {
    const fm = e.target.closest('[data-crange]'); if (!fm) return;
    e.preventDefault();
    [f.from, f.to] = customDays({ from: fm.from.value, to: fm.to.value });
    apply();
  });
}
