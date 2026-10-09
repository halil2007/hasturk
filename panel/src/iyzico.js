// iyzico ödeme formu (Checkout Form): kart bilgisi panele hiç gelmez, ödeme iyzico'nun sayfasında yapılır.
//   1) initialize → iyzico ödeme sayfası adresi (paymentPageUrl) ve token
//   2) müşteri öder, iyzico tarayıcıyı callbackUrl'e token ile geri gönderir (POST)
//   3) retrieve → ödeme sonucu iyzico'dan sunucu tarafında doğrulanır (tutar, sepet no, durum)
// Kimlik (Cloudflare → Variables and Secrets): IYZICO_API_KEY, IYZICO_SECRET_KEY; test ortamı için IYZICO_SANDBOX = 1.
// İstek imzası: IYZWSv2 (HMAC-SHA256: rastgele anahtar + istek yolu + gövde).
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export const iyzicoReady = (env) => !!(env.IYZICO_API_KEY && env.IYZICO_SECRET_KEY);
const base = (env) => (env.IYZICO_BASE_URL || (env.IYZICO_SANDBOX === '1' || env.IYZICO_SANDBOX === 'true' ? 'https://sandbox-api.iyzipay.com' : 'https://api.iyzipay.com')).replace(/\/+$/, '');

export async function authHeader(apiKey, secret, path, body, rnd) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = hex(await crypto.subtle.sign('HMAC', key, enc.encode(rnd + path + body)));
  return 'IYZWSv2 ' + btoa(`apiKey:${apiKey}&randomKey:${rnd}&signature:${sig}`);
}

async function call(env, path, payload, fetchFn = fetch) {
  if (!iyzicoReady(env)) throw new Error('Online ödeme henüz ayarlanmamış (iyzico API anahtarı tanımlı değil)');
  const body = JSON.stringify(payload), rnd = String(Date.now()) + Math.random().toString(36).slice(2, 10);
  const r = await fetchFn(base(env) + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'x-iyzi-rnd': rnd, Authorization: await authHeader(env.IYZICO_API_KEY, env.IYZICO_SECRET_KEY, path, body, rnd) }, body });
  let j = null;
  try { j = await r.json(); } catch { /* boş */ }
  if (!j) throw new Error(`iyzico yanıt vermedi (HTTP ${r.status})`);
  return j;
}
const money = (n) => (Math.round(Number(n) * 100) / 100).toFixed(2);

// order: { id, amount, plan, period, name, buyer: { name, email, phone, city, address, identity, billName, ip }, installments }
// identity: TC kimlik no (yoksa iyzico'nun kabul ettiği 11111111111); billName: fatura adresindeki ad (kurumsalda firma unvanı)
export async function initCheckout(env, order, callbackUrl, fetchFn) {
  const b = order.buyer, parts = String(b.name || '').trim().split(/\s+/);
  const surname = parts.length > 1 ? parts.pop() : '-', name = parts.join(' ') || b.name || '-';
  const gsm = String(b.phone || '').replace(/[^\d+]/g, '');
  const address = String(b.address || b.city || 'Türkiye').slice(0, 250);
  const r = await call(env, '/payment/iyzipos/checkoutform/initialize/auth/ecom', {
    locale: 'tr', conversationId: order.id, price: money(order.amount), paidPrice: money(order.amount), currency: 'TRY', basketId: order.id,
    paymentGroup: 'SUBSCRIPTION', callbackUrl, enabledInstallments: order.installments || [1],
    buyer: { id: String(order.buyerId || b.email).slice(0, 60), name, surname, gsmNumber: gsm.startsWith('+') ? gsm : gsm ? '+90' + gsm.replace(/^0+/, '').replace(/^90/, '') : undefined,
      email: b.email, identityNumber: /^\d{11}$/.test(String(b.identity || '')) ? String(b.identity) : '11111111111', registrationAddress: address, ip: b.ip || '127.0.0.1', city: b.city || 'İstanbul', country: 'Turkey' },
    billingAddress: { contactName: String(b.billName || b.name).slice(0, 200), city: b.city || 'İstanbul', country: 'Turkey', address },
    basketItems: [{ id: `${order.plan}-${order.period}`, name: order.itemName || `Hastürk CRM ${order.name} paketi (${order.period === 'yearly' ? 'yıllık' : 'aylık'})`, category1: 'Yazılım', category2: 'Abonelik', itemType: 'VIRTUAL', price: money(order.amount) }],
  }, fetchFn);
  if (r.status !== 'success' || !r.paymentPageUrl) throw new Error('Ödeme başlatılamadı: ' + (r.errorMessage || r.errorCode || 'bilinmeyen hata'));
  return { token: r.token, url: r.paymentPageUrl };
}
export async function retrieveCheckout(env, token, conversationId, fetchFn) {
  return call(env, '/payment/iyzipos/checkoutform/auth/ecom/detail', { locale: 'tr', conversationId, token }, fetchFn);
}
