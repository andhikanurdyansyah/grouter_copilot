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
  bg: '#06080b',
  panel: '#0d1117',
  panelAlt: '#10151d',
  border: '#1f2733',
  ink: '#f2f6f9',
  inkDim: '#9aa7b4',
  inkFaint: '#6b7885',
  accent: '#22d3ee',
  accentInk: '#04222b',
  ok: '#34d399',
  warn: '#fbbf24',
};

function emailDetailRow(label, valueHtml) {
  return `<tr>`
    + `<td style="padding:7px 0;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:${EMAIL_BRAND.inkFaint};vertical-align:top;">${label}</td>`
    + `<td align="right" style="padding:7px 0 7px 16px;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:13px;color:${EMAIL_BRAND.ink};vertical-align:top;">${valueHtml}</td>`
    + `</tr>`;
}

/**
 * Shared enterprise shell. `tone`: 'ok' | 'warn'. `rows`: pre-built detail
 * rows. `cta`: { href, label } | null. `preheader` is hidden preview text.
 */
function buildEmailShell({ preheader, eyebrow, tone = 'ok', title, lead, rows = '', cta = null, footnote = 'Email otomatis dari sistem gRouter Copilot — mohon tidak membalas.' }) {
  const toneColor = tone === 'warn' ? EMAIL_BRAND.warn : EMAIL_BRAND.ok;
  const ctaRow = cta
    ? `<tr><td style="padding:26px 32px 6px 32px;">`
      + `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>`
      + `<td style="background-color:${EMAIL_BRAND.accent};border-radius:8px;">`
      + `<a href="${cta.href}" style="display:inline-block;padding:13px 26px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;letter-spacing:.01em;color:${EMAIL_BRAND.accentInk};text-decoration:none;">${cta.label}</a>`
      + `</td></tr></table></td></tr>`
    : '';
  return `<!doctype html>`
    + `<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"></head>`
    + `<body style="margin:0;padding:0;background-color:${EMAIL_BRAND.bg};">`
    + `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${EMAIL_BRAND.bg};">`
    + `<tr><td align="center" style="padding:32px 16px 40px 16px;">`
    + `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">`
    // Header: brand left, eyebrow right
    + `<tr><td style="padding:0 4px 20px 4px;">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>`
    + `<td style="font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:17px;font-weight:700;letter-spacing:-.01em;color:${EMAIL_BRAND.ink};">gRouter <span style="color:${EMAIL_BRAND.accent};">Copilot</span></td>`
    + `<td align="right" style="font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${EMAIL_BRAND.inkFaint};">copilot.grouter.id</td>`
    + `</tr></table></td></tr>`
    // Card
    + `<tr><td style="background-color:${EMAIL_BRAND.panel};border:1px solid ${EMAIL_BRAND.border};border-radius:14px;">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">`
    // Status line: one accent rule + status label
    + `<tr><td style="padding:26px 32px 0 32px;">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>`
    + `<td width="34" style="border-top:3px solid ${toneColor};font-size:0;line-height:0;">&nbsp;</td>`
    + `<td style="padding-left:12px;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:${toneColor};">${eyebrow}</td>`
    + `<td>&nbsp;</td></tr></table></td></tr>`
    + `<tr><td style="padding:14px 32px 0 32px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:26px;line-height:1.2;font-weight:700;letter-spacing:-.02em;color:${EMAIL_BRAND.ink};">${title}</td></tr>`
    + `<tr><td style="padding:10px 32px 0 32px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${EMAIL_BRAND.inkDim};">${lead}</td></tr>`
    + (rows
      ? `<tr><td style="padding:20px 32px 2px 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${EMAIL_BRAND.border};">${rows}</table></td></tr>`
      : '')
    + ctaRow
    + `<tr><td style="padding:22px 32px 28px 32px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12.5px;line-height:1.6;color:${EMAIL_BRAND.inkFaint};">${footnote}</td></tr>`
    + `</table></td></tr>`
    // Footer
    + `<tr><td style="padding:22px 4px 0 4px;">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">`
    + `<tr><td style="font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${EMAIL_BRAND.inkFaint};">Butuh bantuan? Balas email ini atau buka <a href="https://copilot.grouter.id/app/" style="color:${EMAIL_BRAND.accent};text-decoration:none;">dashboard Copilot</a>.</td></tr>`
    + `<tr><td style="padding-top:8px;font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#48525e;">gRouter Copilot · copilot.grouter.id</td></tr>`
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
      ? `Pembayaran untuk order <strong style="color:${EMAIL_BRAND.ink};">${escapeHtml(shortId(orderId))}</strong>${escapeHtml(plan)} telah dikonfirmasi server, dan lisensi <strong style="color:${EMAIL_BRAND.ink};">${escapeHtml(shortId(licenseId))}</strong> telah diterbitkan untuk akun Anda.`
      : `Pembayaran untuk order <strong style="color:${EMAIL_BRAND.ink};">${escapeHtml(shortId(orderId))}</strong>${escapeHtml(plan)} telah dikonfirmasi server. Terima kasih.`,
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
    lead: `Lisensi <strong style="color:${EMAIL_BRAND.ink};">${escapeHtml(shortId(licenseId))}</strong>${escapeHtml(plan)} telah diterbitkan untuk akun Anda dan siap dipakai di aplikasi host Anda.`,
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
    lead: `Lisensi <strong style="color:${EMAIL_BRAND.ink};">${escapeHtml(shortId(licenseId))}</strong> akan berakhir${dateStr ? ` pada <strong style="color:${EMAIL_BRAND.ink};">${escapeHtml(dateStr)}</strong>` : ''}${days != null ? ` (${days} hari lagi)` : ''}. Perpanjang sekarang agar layanan di aplikasi host Anda tidak terputus.`,
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
