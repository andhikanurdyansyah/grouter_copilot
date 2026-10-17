/**
 * Mail — Brevo delivery for Copilot notification + password-reset email.
 *
 * Single mail entry point. Uses the Brevo HTTP API only when
 * BREVO_API_KEY is present AND email is enabled in the notifications
 * settings (resolveSettings at call time). Without a key the result is
 * `log_only` (the caller records the attempt on the notification row);
 * per-kind toggles / global disable yield `disabled`. No secret (API
 * key, reset URL/token, full body) is ever returned or logged here —
 * errors are sanitized to a short string.
 */
import { resolveSettings } from './settings.js';

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const DEFAULT_FROM = 'gRouter Copilot <copilot@grouter.id>';
const MAX_ERROR_LEN = 200;

function sanitizeError(err, secret) {
  let msg = '';
  try { msg = err instanceof Error ? err.message : String(err ?? ''); } catch { msg = 'mail error'; }
  if (secret && msg.includes(secret)) msg = msg.split(secret).join('[redacted]');
  // Strip any URL-like material (reset links must never surface via errors).
  msg = msg.replace(/https?:\/\/\S+/g, '[redacted-url]');
  return msg.slice(0, MAX_ERROR_LEN);
}

function resolveNotificationsSettings(settingsGetter) {
  try {
    if (typeof settingsGetter === 'function') {
      const s = settingsGetter();
      if (s && typeof s === 'object') {
        // Accept either a full effective-settings object or the section itself.
        return s.notifications ?? s;
      }
    }
  } catch { /* fall through to defaults */ }
  return resolveSettings({}, {}).notifications;
}

function escapeHtml(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function shortId(id) {
  const s = String(id ?? '');
  return s ? `${s.slice(0, 8)}…` : '—';
}

/**
 * ── Enterprise email design system (single place, all templates) ──
 * Email-client safe: table layout + inline styles only (no external CSS,
 * no background images, no webfonts). Dark premium chassis matching the
 * Copilot dashboard: gunmetal #06080b, ONE accent cyan #22d3ee, mono for
 * data-shaped values, restrained depth via hairlines (no heavy shadows).
 * Every dynamic value is escaped at the template call sites below.
 */
const EMAIL_BRAND = {
  // Fluid-hybrid responsive (see buildEmailShell): the 600px container is
  // width:100%/max-width:600px and a single @media block collapses padding,
  // type scale and CTA width under 620px. Clients without media-query
  // support still get the fluid layout — nothing is fixed-width pixel-locked.
  bg: '#06080b',
  panel: '#0d1117',
  panelAlt: '#11161f',
  border: '#232c38',
  ink: '#f2f6f9',
  inkDim: '#a7b3c0',
  inkFaint: '#76828f',
  accent: '#22d3ee',
  accentInk: '#032630',
  ok: '#34d399',
  warn: '#fbbf24',
  sans: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  mono: "ui-monospace,'SF Mono',SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace",
};

/**
 * Light theme — applied ONLY via @media (prefers-color-scheme: light) class
 * overrides in buildEmailShell, so dark stays the inline default and light
 * is a true adaptation (not a recolor): warm paper stage, white card, deep
 * cyan accent darkened for 4.5:1+ text contrast on white.
 */
const EMAIL_LIGHT = {
  bg: '#f4f4f2',
  panel: '#ffffff',
  border: '#e3e3de',
  ink: '#101418',
  inkDim: '#4c5865',
  inkFaint: '#71808e',
  accentText: '#0b7d99',
  ok: '#0a7d5c',
  warn: '#9a6206',
  signature: '#9aa3ab',
};

function emailDetailRow(label, valueHtml) {
  return `<tr>`
    + `<td class="em-det-label" style="padding:7px 0;border-top:1px solid ${EMAIL_BRAND.border};font-family:${EMAIL_BRAND.mono};font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:${EMAIL_BRAND.inkFaint};vertical-align:middle;">${label}</td>`
    + `<td class="em-det-value" align="right" style="padding:7px 0 7px 20px;border-top:1px solid ${EMAIL_BRAND.border};font-family:${EMAIL_BRAND.mono};font-size:12.5px;color:${EMAIL_BRAND.ink};vertical-align:middle;word-break:break-word;">${valueHtml}</td>`
    + `</tr>`;
}

/** Status glyph (drawn, not emoji): filled dot + label in the tone color. */
function emailStatusChip(tone, label) {
  const c = tone === 'warn' ? EMAIL_BRAND.warn : EMAIL_BRAND.ok;
  const cls = tone === 'warn' ? 'em-status-warn' : 'em-status-ok';
  return `<span class="${cls}" style="display:inline-block;width:7px;height:7px;border-radius:50%;background-color:${c};vertical-align:middle;"></span>`
    + `<span class="${cls}-text" style="display:inline-block;padding-left:8px;font-family:${EMAIL_BRAND.mono};font-size:10px;font-weight:600;letter-spacing:.15em;text-transform:uppercase;color:${c};vertical-align:middle;">${label}</span>`;
}

/**
 * Shared enterprise shell v3 — measured spacing, dual-theme, anti-clip.
 *
 * Spacing thesis (4pt-based, tight groups / separated groups): stage
 * 24px, header→card 14px, card padding 26px, chip→title 12px, title→lead
 * 8px, lead→details 18px, details→CTA 20px, CTA→footnote 18px, card→footer
 * 16px. No interval exceeds 28px; the card hugs its content.
 * Anti-clip: fluid container (100%/max-600px), no fixed heights, long
 * values wrap (word-break on detail values), CTA never overflows.
 * Themes: dark is the inline default; @media (prefers-color-scheme:
 * light) re-skins via classes (Apple Mail, iOS/Android Gmail dark-mode
 * aware clients). Clients without scheme support keep the dark default.
 */
function buildEmailShell({ preheader, eyebrow, tone = 'ok', title, lead, rows = '', cta = null, footnote = 'Email otomatis dari sistem gRouter Copilot — mohon tidak membalas ke alamat ini.' }) {
  const L = EMAIL_LIGHT;
  const styleBlock = `<style>`
    + `html,body{margin:0!important;padding:0!important;width:100%!important;}`
    + `table,td{mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;border-collapse:collapse!important;}`
    + `a{text-decoration:none;}`
    + `@media only screen and (max-width:620px){`
    + `.em-outer{padding:16px 10px 24px 10px!important;}`
    + `.em-pad{padding-left:20px!important;padding-right:20px!important;}`
    + `.em-title{font-size:24px!important;line-height:1.2!important;}`
    + `.em-lead{font-size:14.5px!important;line-height:1.6!important;}`
    + `.em-cta{width:100%!important;}`
    + `.em-cta a{display:block!important;text-align:center!important;padding:14px 18px!important;}`
    + `}`
    + `@media (prefers-color-scheme: light){`
    + `.em-stage{background-color:${L.bg}!important;}`
    + `.em-card{background-color:${L.panel}!important;border-color:${L.border}!important;}`
    + `.em-ink{color:${L.ink}!important;}`
    + `.em-dim{color:${L.inkDim}!important;}`
    + `.em-faint{color:${L.inkFaint}!important;}`
    + `.em-accent-t{color:${L.accentText}!important;}`
    + `.em-det-label{color:${L.inkFaint}!important;border-top-color:${L.border}!important;}`
    + `.em-det-value{color:${L.ink}!important;border-top-color:${L.border}!important;}`
    + `.em-status-ok{background-color:${L.ok}!important;}.em-status-ok-text{color:${L.ok}!important;}`
    + `.em-status-warn{background-color:${L.warn}!important;}.em-status-warn-text{color:${L.warn}!important;}`
    + `.em-foot-rule{border-top-color:${L.border}!important;}`
    + `.em-sig{color:${L.signature}!important;}`
    + `}`
    + `</style>`;
  const ctaRow = cta
    ? `<tr><td class="em-pad" style="padding:20px 28px 0 28px;">`
      + `<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="em-cta"><tr>`
      + `<td style="background-color:${EMAIL_BRAND.accent};border-radius:8px;">`
      + `<a href="${cta.href}" style="display:inline-block;padding:12px 26px;font-family:${EMAIL_BRAND.sans};font-size:14px;font-weight:700;letter-spacing:.01em;color:${EMAIL_BRAND.accentInk};text-decoration:none;">${cta.label}&nbsp;&rarr;</a>`
      + `</td></tr></table></td></tr>`
    : '';
  return `<!doctype html>`
    + `<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>gRouter Copilot</title>${styleBlock}</head>`
    + `<body style="margin:0;padding:0;word-spacing:normal;background-color:${EMAIL_BRAND.bg};">`
    + `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${preheader}</div>`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="em-stage" style="width:100%;background-color:${EMAIL_BRAND.bg};">`
    + `<tr><td class="em-outer" align="center" style="padding:24px 14px 32px 14px;">`
    + `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">`
    + `<tr><td style="padding:0 2px 14px 2px;">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>`
    + `<td class="em-ink" style="font-family:${EMAIL_BRAND.sans};font-size:16px;font-weight:700;letter-spacing:-.01em;color:${EMAIL_BRAND.ink};">gRouter&nbsp;<span class="em-accent-t" style="color:${EMAIL_BRAND.accent};">Copilot</span></td>`
    + `<td class="em-faint" align="right" style="font-family:${EMAIL_BRAND.mono};font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:${EMAIL_BRAND.inkFaint};">copilot.grouter.id</td>`
    + `</tr></table></td></tr>`
    + `<tr><td class="em-card" style="background-color:${EMAIL_BRAND.panel};border:1px solid ${EMAIL_BRAND.border};border-radius:12px;">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">`
    + `<tr><td class="em-pad" style="padding:24px 28px 0 28px;">${emailStatusChip(tone, eyebrow)}</td></tr>`
    + `<tr><td class="em-pad em-title em-ink" style="padding:12px 28px 0 28px;font-family:${EMAIL_BRAND.sans};font-size:27px;line-height:1.18;font-weight:700;letter-spacing:-.022em;color:${EMAIL_BRAND.ink};">${title}</td></tr>`
    + `<tr><td class="em-pad em-lead em-dim" style="padding:8px 28px 0 28px;font-family:${EMAIL_BRAND.sans};font-size:14.5px;line-height:1.6;color:${EMAIL_BRAND.inkDim};">${lead}</td></tr>`
    + (rows
      ? `<tr><td class="em-pad" style="padding:18px 28px 2px 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;width:100%;">${rows}</table></td></tr>`
      : '')
    + ctaRow
    + `<tr><td class="em-pad em-faint" style="padding:18px 28px 24px 28px;font-family:${EMAIL_BRAND.sans};font-size:12px;line-height:1.6;color:${EMAIL_BRAND.inkFaint};">${footnote}</td></tr>`
    + `</table></td></tr>`
    + `<tr><td style="padding:16px 2px 0 2px;">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">`
    + `<tr><td class="em-faint em-foot-rule" style="border-top:1px solid ${EMAIL_BRAND.border};padding-top:14px;font-family:${EMAIL_BRAND.sans};font-size:11.5px;line-height:1.6;color:${EMAIL_BRAND.inkFaint};">Butuh bantuan? Balas email ini, atau buka <a href="https://copilot.grouter.id/app/" class="em-accent-t" style="color:${EMAIL_BRAND.accent};text-decoration:none;">dashboard Copilot</a>.</td></tr>`
    + `<tr><td class="em-sig" style="padding-top:8px;font-family:${EMAIL_BRAND.mono};font-size:9px;letter-spacing:.13em;text-transform:uppercase;color:#48525e;">gRouter Copilot &middot; Sistem lisensi &amp; AI untuk aplikasi Anda</td></tr>`
    + `</table></td></tr>`
    + `</table></td></tr></table></body></html>`;
}

/** Payment received (+ license issued when licenseId refers to the same purchase). */
export function buildPaymentReceivedEmail({ orderId, licenseId, planName } = {}) {
  const plan = planName ? ` (${String(planName)})` : '';
  const subject = licenseId ? 'Pembayaran diterima — lisensi diterbitkan' : 'Pembayaran diterima';
  const rows = emailDetailRow('Order', escapeHtml(shortId(orderId)))
    + (licenseId ? emailDetailRow('Lisensi', escapeHtml(shortId(licenseId))) : '')
    + (planName ? emailDetailRow('Paket', escapeHtml(String(planName))) : '');
  const html = buildEmailShell({
    preheader: 'Pembayaran terkonfirmasi server — lisensi Anda telah diterbitkan.',
    eyebrow: 'Pembayaran berhasil',
    tone: 'ok',
    title: 'Pembayaran diterima.',
    lead: licenseId
      ? `Pembayaran untuk order <strong class="em-ink" style="color:${EMAIL_BRAND.ink};">${escapeHtml(shortId(orderId))}</strong>${escapeHtml(plan)} telah dikonfirmasi server, dan lisensi <strong class="em-ink" style="color:${EMAIL_BRAND.ink};">${escapeHtml(shortId(licenseId))}</strong> telah diterbitkan untuk akun Anda.`
      : `Pembayaran untuk order <strong class="em-ink" style="color:${EMAIL_BRAND.ink};">${escapeHtml(shortId(orderId))}</strong>${escapeHtml(plan)} telah dikonfirmasi server. Terima kasih.`,
    rows,
    cta: { href: 'https://copilot.grouter.id/app/', label: 'Buka Dashboard' },
  });
  const licLine = licenseId ? ` Lisensi ${shortId(licenseId)} telah diterbitkan.` : '';
  const text = `Pembayaran diterima. Pembayaran untuk order ${shortId(orderId)}${plan} telah dikonfirmasi server.${licLine} Buka dashboard: https://copilot.grouter.id/app/ — Tim gRouter Copilot`;
  return { subject, html, text };
}

/** License issued (standalone, when not combined with payment). */
export function buildLicenseIssuedEmail({ licenseId, planName } = {}) {
  const plan = planName ? ` (${String(planName)})` : '';
  const subject = 'Lisensi diterbitkan';
  const rows = emailDetailRow('Lisensi', escapeHtml(shortId(licenseId)))
    + (planName ? emailDetailRow('Paket', escapeHtml(String(planName))) : '');
  const html = buildEmailShell({
    preheader: 'Lisensi baru telah diterbitkan untuk akun Anda.',
    eyebrow: 'Lisensi aktif',
    tone: 'ok',
    title: 'Lisensi diterbitkan.',
    lead: `Lisensi <strong class="em-ink" style="color:${EMAIL_BRAND.ink};">${escapeHtml(shortId(licenseId))}</strong>${escapeHtml(plan)} telah diterbitkan untuk akun Anda dan siap dipakai di aplikasi host Anda.`,
    rows,
    cta: { href: 'https://copilot.grouter.id/app/', label: 'Buka Dashboard' },
  });
  const text = `Lisensi diterbitkan. Lisensi ${shortId(licenseId)}${plan} telah diterbitkan untuk akun Anda. Buka dashboard: https://copilot.grouter.id/app/ — Tim gRouter Copilot`;
  return { subject, html, text };
}

/** License expiring — copy differs for the H-7 vs H-1 window via daysLeft. */
export function buildLicenseExpiringEmail({ licenseId, expiresAt, daysLeft } = {}) {
  const days = Number.isFinite(daysLeft) ? daysLeft : null;
  const dateStr = expiresAt ? new Date(expiresAt).toISOString().slice(0, 10) : '';
  const subject = days === 1
    ? 'Lisensi berakhir besok (H-1)'
    : days === 7
      ? 'Lisensi berakhir dalam 7 hari (H-7)'
      : `Lisensi segera berakhir${days != null ? ` dalam ${days} hari` : ''}`;
  const rows = emailDetailRow('Lisensi', escapeHtml(shortId(licenseId)))
    + (dateStr ? emailDetailRow('Berakhir', escapeHtml(dateStr)) : '')
    + (days != null ? emailDetailRow('Sisa waktu', `${days} hari`) : '');
  const html = buildEmailShell({
    preheader: 'Lisensi Anda segera berakhir — perpanjang agar layanan tidak terputus.',
    eyebrow: 'Perlu perhatian',
    tone: 'warn',
    title: days === 1 ? 'Lisensi berakhir besok.' : 'Lisensi segera berakhir.',
    lead: `Lisensi <strong class="em-ink" style="color:${EMAIL_BRAND.ink};">${escapeHtml(shortId(licenseId))}</strong> akan berakhir${dateStr ? ` pada <strong class="em-ink" style="color:${EMAIL_BRAND.ink};">${escapeHtml(dateStr)}</strong>` : ''}${days != null ? ` (${days} hari lagi)` : ''}. Perpanjang sekarang agar layanan di aplikasi host Anda tidak terputus.`,
    rows,
    cta: { href: 'https://copilot.grouter.id/app/', label: 'Perpanjang Lisensi' },
  });
  const text = `Lisensi segera berakhir. Lisensi ${shortId(licenseId)} akan berakhir${dateStr ? ` pada ${dateStr}` : ''}${days != null ? ` (${days} hari lagi)` : ''}. Perpanjang agar layanan tidak terputus: https://copilot.grouter.id/app/ — Tim gRouter Copilot`;
  return { subject, html, text };
}

/** Password reset — the reset URL lives ONLY inside this payload. */
export function buildPasswordResetEmail({ url } = {}) {
  const safeUrl = String(url ?? '');
  const subject = 'Atur ulang password akun gRouter Copilot Anda';
  const html = buildEmailShell({
    preheader: 'Tautan atur ulang password Anda (berlaku 1 jam, sekali pakai).',
    eyebrow: 'Keamanan akun',
    tone: 'warn',
    title: 'Atur ulang password Anda.',
    lead: 'Kami menerima permintaan atur ulang password untuk akun gRouter Copilot Anda. Gunakan tombol di bawah untuk membuat password baru.',
    rows: emailDetailRow('Berlaku', '1 jam · sekali pakai'),
    cta: { href: escapeHtml(safeUrl), label: 'Buat Password Baru' },
    footnote: 'Kalau Anda tidak meminta ini, abaikan email ini — password Anda tidak berubah. Tautan hanya berlaku 1 jam dan sekali pakai.',
  });
  const text = `Kami menerima permintaan atur ulang password akun gRouter Copilot Anda. Buka tautan berikut untuk membuat password baru (berlaku 1 jam, sekali pakai): ${safeUrl} Kalau Anda tidak meminta ini, abaikan email ini.`;
  return { subject, html, text };
}

const KIND_SETTING_KEY = {
  paymentReceived: 'paymentReceived',
  licenseIssued: 'licenseIssued',
  licenseExpiring: 'licenseExpiring',
  passwordReset: 'passwordReset',
};

/** Parse a "Name <email>" (or bare email) sender into Brevo's sender shape. */
function parseSender(from) {
  const str = String(from ?? '').trim();
  const m = str.match(/^(.*?)\s*<([^>]+)>$/);
  if (m) {
    const name = m[1].replace(/^["']|["']$/g, '').trim();
    const email = m[2].trim();
    return name ? { name, email } : { email };
  }
  return { email: str };
}

/**
 * @param {{fetchImpl?:Function, env?:object, settingsGetter?:Function}} deps
 * fetchImpl defaults to global fetch; env defaults to process.env (read at
 * send time so tests / rotated keys behave). settingsGetter returns the
 * effective settings (or the notifications section).
 */
export function createMailer({ fetchImpl, env, settingsGetter } = {}) {
  const doFetch = fetchImpl ?? globalThis.fetch;
  const getEnv = () => env ?? process.env;

  async function send({ to, subject, html, text, kind } = {}, { timeoutMs = 10_000 } = {}) {
    const e = getEnv() || {};
    const apiKey = String(e.BREVO_API_KEY || '').trim();
    const notifications = resolveNotificationsSettings(settingsGetter);
    const emailCfg = notifications?.email ?? {};
    if (emailCfg.enabled === false) return { status: 'disabled' };
    const kindKey = kind ? KIND_SETTING_KEY[kind] : null;
    if (kindKey && emailCfg[kindKey] === false) return { status: 'disabled' };
    if (!to || typeof to !== 'string') return { status: 'failed', error: 'missing recipient' };
    if (!apiKey) return { status: 'log_only' };
    if (typeof doFetch !== 'function') return { status: 'failed', error: 'fetch unavailable' };
    const from = String(e.MAIL_FROM || '').trim() || DEFAULT_FROM;
    const sender = parseSender(from);
    try {
      const res = await doFetch(BREVO_URL, {
        method: 'POST',
        headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender,
          to: [{ email: to }],
          subject: String(subject ?? ''),
          htmlContent: String(html ?? ''),
          textContent: String(text ?? ''),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res && res.ok) {
        let providerId;
        try {
          const data = await res.json();
          if (data && typeof data.messageId === 'string') providerId = data.messageId;
        } catch { /* provider id is best-effort */ }
        return providerId ? { status: 'sent', providerId } : { status: 'sent' };
      }
      const status = res ? res.status : 'unknown';
      let detail = '';
      try { detail = (await res.text()).slice(0, 120); } catch { /* ignore */ }
      return { status: 'failed', error: sanitizeError(`Brevo HTTP ${status}${detail ? `: ${detail}` : ''}`, apiKey) };
    } catch (err) {
      return { status: 'failed', error: sanitizeError(err, apiKey) };
    }
  }

  return { send };
}

export default createMailer;
