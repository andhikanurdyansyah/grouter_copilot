/**
 * Mail — Resend delivery for Copilot notification + password-reset email.
 *
 * Single mail entry point. Uses the Resend HTTP API only when
 * RESEND_API_KEY is present AND email is enabled in the notifications
 * settings (resolveSettings at call time). Without a key the result is
 * `log_only` (the caller records the attempt on the notification row);
 * per-kind toggles / global disable yield `disabled`. No secret (API
 * key, reset URL/token, full body) is ever returned or logged here —
 * errors are sanitized to a short string.
 */
import { resolveSettings } from './settings.js';

const RESEND_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'gRouter Copilot <onboarding@resend.dev>';
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

/** Payment received (+ license issued when licenseId refers to the same purchase). */
export function buildPaymentReceivedEmail({ orderId, licenseId, planName } = {}) {
  const plan = planName ? ` (${String(planName)})` : '';
  const licLine = licenseId ? ` Lisensi ${shortId(licenseId)} telah diterbitkan.` : '';
  const licLineEn = licenseId ? ` License ${shortId(licenseId)} was issued.` : '';
  const subject = licenseId ? 'Pembayaran diterima — lisensi diterbitkan' : 'Pembayaran diterima';
  const text = `Pembayaran untuk order ${shortId(orderId)}${plan} telah dikonfirmasi server.${licLine} Terima kasih. — Tim gRouter Copilot`;
  const html = `<p>Halo,</p><p>Pembayaran untuk order <strong>${escapeHtml(shortId(orderId))}</strong>${escapeHtml(plan)} telah dikonfirmasi server.${escapeHtml(licLine)}</p><p>Terima kasih.<br>Tim gRouter Copilot</p>`;
  return { subject, html, text };
}

/** License issued (standalone, when not combined with payment). */
export function buildLicenseIssuedEmail({ licenseId, planName } = {}) {
  const plan = planName ? ` (${String(planName)})` : '';
  const subject = 'Lisensi diterbitkan';
  const text = `Lisensi ${shortId(licenseId)}${plan} telah diterbitkan untuk akun Anda. — Tim gRouter Copilot`;
  const html = `<p>Halo,</p><p>Lisensi <strong>${escapeHtml(shortId(licenseId))}</strong>${escapeHtml(plan)} telah diterbitkan untuk akun Anda.</p><p>Tim gRouter Copilot</p>`;
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
  const text = `Lisensi ${shortId(licenseId)} akan berakhir${dateStr ? ` pada ${dateStr}` : ''}${days != null ? ` (${days} hari lagi)` : ''}. Perpanjang agar layanan tidak terputus. — Tim gRouter Copilot`;
  const html = `<p>Halo,</p><p>Lisensi <strong>${escapeHtml(shortId(licenseId))}</strong> akan berakhir${dateStr ? ` pada <strong>${escapeHtml(dateStr)}</strong>` : ''}${days != null ? ` (${days} hari lagi)` : ''}.</p><p>Perpanjang agar layanan tidak terputus.<br>Tim gRouter Copilot</p>`;
  return { subject, html, text };
}

/** Password reset — the reset URL lives ONLY inside this payload. */
export function buildPasswordResetEmail({ url } = {}) {
  const safeUrl = String(url ?? '');
  const subject = 'Atur ulang password akun gRouter Copilot Anda';
  const text = `Kami menerima permintaan atur ulang password akun gRouter Copilot Anda. Buka tautan berikut untuk membuat password baru (berlaku 1 jam, sekali pakai): ${safeUrl} Kalau Anda tidak meminta ini, abaikan email ini.`;
  const html = '<p>Halo,</p>'
    + '<p>Kami menerima permintaan atur ulang password akun gRouter Copilot Anda.</p>'
    + `<p><a href="${escapeHtml(safeUrl)}">Klik di sini untuk membuat password baru</a> (tautan berlaku 1 jam, hanya sekali pakai).</p>`
    + '<p>Kalau Anda tidak meminta ini, abaikan email ini — password Anda tidak berubah.</p>'
    + '<p>Tim gRouter Copilot</p>';
  return { subject, html, text };
}

const KIND_SETTING_KEY = {
  paymentReceived: 'paymentReceived',
  licenseIssued: 'licenseIssued',
  licenseExpiring: 'licenseExpiring',
  passwordReset: 'passwordReset',
};

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
    const apiKey = String(e.RESEND_API_KEY || '').trim();
    const notifications = resolveNotificationsSettings(settingsGetter);
    const emailCfg = notifications?.email ?? {};
    if (emailCfg.enabled === false) return { status: 'disabled' };
    const kindKey = kind ? KIND_SETTING_KEY[kind] : null;
    if (kindKey && emailCfg[kindKey] === false) return { status: 'disabled' };
    if (!to || typeof to !== 'string') return { status: 'failed', error: 'missing recipient' };
    if (!apiKey) return { status: 'log_only' };
    if (typeof doFetch !== 'function') return { status: 'failed', error: 'fetch unavailable' };
    const from = String(e.MAIL_FROM || '').trim() || DEFAULT_FROM;
    try {
      const res = await doFetch(RESEND_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject: String(subject ?? ''), html: String(html ?? ''), text: String(text ?? '') }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res && res.ok) {
        let providerId;
        try {
          const data = await res.json();
          if (data && typeof data.id === 'string') providerId = data.id;
        } catch { /* provider id is best-effort */ }
        return providerId ? { status: 'sent', providerId } : { status: 'sent' };
      }
      const status = res ? res.status : 'unknown';
      let detail = '';
      try { detail = (await res.text()).slice(0, 120); } catch { /* ignore */ }
      return { status: 'failed', error: sanitizeError(`Resend HTTP ${status}${detail ? `: ${detail}` : ''}`, apiKey) };
    } catch (err) {
      return { status: 'failed', error: sanitizeError(err, apiKey) };
    }
  }

  return { send };
}

export default createMailer;
