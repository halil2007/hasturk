// Kendi e-posta sunucunuzdan gönderim (SMTP). Cloudflare Workers TCP soketi (cloudflare:sockets) ile:
//   465 → doğrudan TLS (SMTPS) · 587 → STARTTLS. Kimlik: AUTH LOGIN (kullanıcı adı genelde e-posta adresinin kendisi).
// Not: Cloudflare 25 numaralı porta çıkışa izin vermez; hosting / kurumsal e-posta sağlayıcınızın 465 ya da 587 portunu kullanın.
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (s) => { const u = enc.encode(String(s)); let r = ''; for (const x of u) r += String.fromCharCode(x); return btoa(r); };
const wrap = (s) => s.replace(/.{1,76}/g, '$&\r\n');
const word = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

async function openSocket(host, port, connect) {
  const c = connect || (await import('cloudflare:sockets')).connect;
  return c({ hostname: host, port }, { secureTransport: port === 465 ? 'on' : 'starttls', allowHalfOpen: false });
}

function session(sock) {
  let reader = sock.readable.getReader(), writer = sock.writable.getWriter(), buf = '';
  const read = async () => {
    // Çok satırlı cevap: "250-..." satırları "250 ..." ile biter
    for (;;) {
      const lines = buf.split('\r\n');
      for (let i = 0; i < lines.length - 1; i++) if (/^\d{3} /.test(lines[i])) { const out = lines.slice(0, i + 1); buf = lines.slice(i + 1).join('\r\n'); return { code: Number(out[i].slice(0, 3)), text: out.join(' ') }; }
      const { value, done } = await reader.read();
      if (done) throw new Error('SMTP sunucusu bağlantıyı kapattı');
      buf += dec.decode(value, { stream: true });
    }
  };
  const send = async (line) => { await writer.write(enc.encode(line + '\r\n')); };
  const cmd = async (line, ok, what) => {
    if (line != null) await send(line);
    const r = await read();
    if (!ok.includes(r.code)) throw new Error(`SMTP ${what || (line || '').split(' ')[0]}: ${r.text.slice(0, 200)}`);
    return r;
  };
  return {
    read, send, cmd,
    upgrade(s2) { reader.releaseLock(); writer.releaseLock(); reader = s2.readable.getReader(); writer = s2.writable.getWriter(); buf = ''; },
    close() { try { writer.releaseLock(); reader.releaseLock(); } catch { /* yok */ } },
  };
}

// mail: { host, port, user, pass, from, fromName, to: [..], subject, html, text }
export async function smtpSend(m, { connect } = {}) {
  const port = Number(m.port) || 465;
  if (port === 25) throw new Error('Cloudflare 25 numaralı porta izin vermiyor: 465 (SSL) ya da 587 (STARTTLS) kullanın');
  let sock = await openSocket(m.host, port, connect);
  const s = session(sock);
  try {
    await s.cmd(null, [220], 'bağlantı');
    await s.cmd('EHLO panel.local', [250]);
    if (port !== 465) {
      await s.cmd('STARTTLS', [220]);
      const tls = sock.startTls();
      s.upgrade(tls); sock = tls;
      await s.cmd('EHLO panel.local', [250]);
    }
    await s.cmd('AUTH LOGIN', [334]);
    await s.cmd(b64(m.user), [334], 'kullanıcı adı');
    await s.cmd(b64(m.pass), [235], 'şifre (kullanıcı adı / şifre hatalı olabilir)');
    await s.cmd(`MAIL FROM:<${m.from}>`, [250]);
    for (const t of m.to) await s.cmd(`RCPT TO:<${t}>`, [250, 251], `alıcı ${t}`);
    await s.cmd('DATA', [354]);
    const bd = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2), dom = String(m.from).split('@')[1] || 'panel.local';
    const msg = [
      `From: ${word(m.fromName || m.from)} <${m.from}>`, `To: ${m.to.join(', ')}`, `Subject: ${word(m.subject)}`, `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}@${dom}>`, 'MIME-Version: 1.0', `Content-Type: multipart/alternative; boundary="${bd}"`, '',
      `--${bd}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap(b64(m.text || '')),
      `--${bd}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap(b64(m.html || '')),
      `--${bd}--`, '.',
    ].join('\r\n');
    await s.send(msg);
    await s.cmd(null, [250], 'gönderim');
    await s.send('QUIT').catch(() => {});
    return { ok: true };
  } finally {
    s.close();
    try { sock.close(); } catch { /* kapalı */ }
  }
}
