/**
 * Notification engine — the single sync/derivation module for in-app
 * notifications (customer + admin) and their email delivery.
 *
 * Customer events are derived ONLY from persisted store state (orders,
 * licenses, usage ledger + plan catalogue) and are idempotent via the
 * store's (accountId, type, dedupeKey) dedupe. Admin events mirror the
 * same state changes into a SEPARATE `adminNotifications` collection
 * with generic operational payloads only (ids/prefixes, link kind/id,
 * timestamps) — never customer email/name/accountId.
 *
 * Thresholds (quota percent, expiring-soon days, scheduler interval,
 * email toggles) come from the settings SSOT: resolveSettings(
 * store.getSettings()) at call time. Defaults live only in
 * DEFAULT_SETTINGS (settings.js).
 *
 * Email is attempted at sync time ONLY for a newly created notification
 * (or a retry of a `failed` one). Repeat syncs / lazy GETs never resend
 * a `sent` / `log_only` / `disabled` notification.
 */
import { resolveSettings, resolvePlanAiPolicy } from './settings.js';
import {
  createMailer,
  buildPaymentReceivedEmail,
  buildLicenseIssuedEmail,
  buildLicenseExpiringEmail,
} from './mail.js';

const DAY_MS = 86_400_000;

function shortId(id) {
  const s = String(id ?? '');
  return s ? `${s.slice(0, 14)}…` : '—';
}
function shortId8(id) {
  const s = String(id ?? '');
  return s ? `${s.slice(0, 8)}…` : '—';
}

/** expiredAt may be epoch ms, epoch s, numeric string, or "YYYY-MM-DD HH:mm:ss". */
export function parseTimeMs(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value < 1e12 ? value * 1000 : value;
  }
  const str = String(value).trim();
  if (!str) return null;
  if (/^\d+$/.test(str)) {
    const n = Number(str);
    return n < 1e12 ? n * 1000 : n;
  }
  const hasTz = /Z$|[+-]\d{2}:?\d{2}$/.test(str);
  const ms = new Date(str.replace(' ', 'T') + (hasTz || str.includes('T') ? '' : 'Z')).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function orderStatus(order) {
  return String(order?.status ?? '').toUpperCase();
}

function isOrderExpired(order, nowMs) {
  const status = orderStatus(order);
  if (status === 'EXPIRED') return true;
  if (status !== 'PENDING') return false;
  const expMs = parseTimeMs(order.expiredAt);
  return expMs != null && !Number.isNaN(expMs) && expMs <= nowMs;
}

function licenseQuotaLimit(license, eff) {
  const plansByKey = new Map((eff?.plans || []).map((p) => [p.key, p]));
  const plan = license?.planKey ? plansByKey.get(license.planKey) : undefined;
  if (license?.planKey && !plan) {
    // Unknown plan: fall back to any legacy quota on the license record;
    // never invent unlimited for a plan that should have a quota, and
    // never invent a quota either — resolvePlanAiPolicy handles known plans.
    return license?.quotaTokens ?? null;
  }
  const policy = resolvePlanAiPolicy(plan, eff);
  return policy.quotaTokens ?? license?.quotaTokens ?? null;
}

/**
 * @param {{store:object, settingsGetter?:Function, resolveSettings?:Function,
 *          mailer?:object, now?:Function, fetchImpl?:Function, env?:object}} deps
 * settingsGetter / resolveSettings: injectable settings resolution. The
 * canonical wiring passes `() => resolveSettings(store.getSettings())`.
 */
export function createNotificationService({
  store,
  settingsGetter,
  resolveSettings: resolveSettingsFn,
  mailer,
  now,
  fetchImpl,
  env,
} = {}) {
  if (!store) throw new Error('createNotificationService requires a store');
  const nowFn = typeof now === 'function' ? now : () => Date.now();

  function effectiveSettings() {
    if (typeof settingsGetter === 'function') {
      const s = settingsGetter();
      if (s && typeof s === 'object') {
        // Tolerate a getter returning only the notifications section.
        return s.notifications ? s : { ...resolveSettings({}, {}), notifications: s };
      }
    }
    if (typeof resolveSettingsFn === 'function') return resolveSettingsFn(store.getSettings());
    return resolveSettings(store.getSettings(), env ?? process.env);
  }

  function notificationsConfig(eff) {
    const n = eff?.notifications ?? {};
    const d = resolveSettings({}, {}).notifications;
    return {
      schedulerIntervalMs: n.schedulerIntervalMs ?? d.schedulerIntervalMs,
      quotaThresholdPercent: n.quotaThresholdPercent ?? d.quotaThresholdPercent,
      expiringSoonDays: n.expiringSoonDays ?? d.expiringSoonDays,
      email: { ...d.email, ...(n.email ?? {}) },
    };
  }

  const mailerImpl = mailer ?? createMailer({
    fetchImpl,
    env: env ?? process.env,
    settingsGetter: () => effectiveSettings(),
  });

  // Is a row still waiting for its first email attempt (created before the
  // email fields existed, or created by an add that returned an existing row)?
  function needsFirstAttempt(n) {
    return n && (n.emailAttempts ?? 0) === 0 && (n.emailStatus == null || n.emailStatus === undefined);
  }
  function needsRetry(n) {
    return n && n.emailStatus === 'failed';
  }

  /**
   * Attempt email for one customer notification and persist the outcome.
   * kind: mail kind ('paymentReceived' | 'licenseIssued' | 'licenseExpiring')
   * or null to skip email entirely (in-app only events).
   */
  async function deliver(account, notification, { kind, template } = {}, atMs) {
    if (!notification || !kind || !template) return notification;
    if (!needsFirstAttempt(notification) && !needsRetry(notification)) return notification;
    const to = account?.email;
    let result;
    if (!to) {
      result = { status: 'disabled' };
    } else {
      try {
        result = await mailerImpl.send({ to, subject: template.subject, html: template.html, text: template.text, kind });
      } catch (err) {
        result = { status: 'failed', error: String(err?.message ?? 'mail failed').slice(0, 200) };
      }
    }
    const status = result?.status ?? 'failed';
    return store.markNotificationEmail(account.id, notification.id, {
      status,
      at: atMs,
      error: status === 'failed' ? (result?.error ?? 'mail failed') : null,
    }) ?? notification;
  }

  /**
   * Derive all events for one account. Returns the customer notifications
   * touched (new + existing, post-email-metadata). Async because email
   * delivery is async; store writes themselves stay synchronous.
   */
  async function syncAccount(account, { now: nowOverride } = {}) {
    if (!account?.id) return [];
    const nowMs = nowOverride ?? nowFn();
    const eff = effectiveSettings();
    const cfg = notificationsConfig(eff);
    const quotaThreshold = cfg.quotaThresholdPercent;
    const expiringDays = cfg.expiringSoonDays;

    const orders = store.listOrders().filter((o) => o.accountId === account.id);
    const licenses = typeof store.licensesByAccount === 'function'
      ? store.licensesByAccount(account.id)
      : store.listLicenses().filter((l) => l.accountId === account.id);

    // Precompute "paid order -> license" for the combined payment email:
    // order.licenseId wins; otherwise the earliest license created at/after
    // the order for this account.
    const licenseById = new Map(licenses.map((l) => [l.id, l]));

    const emitted = [];
    const emailJobs = []; // { notification, kind, template }

    function emitCustomer(args, email) {
      const before = store.listNotifications(account.id, { limit: 500 })
        .find((n) => n.type === args.type && (args.dedupeKey == null || n.dedupeKey === args.dedupeKey));
      const item = store.addNotification({ accountId: account.id, ...args });
      if (!item) return null;
      emitted.push(item);
      const isNew = !before;
      if (email && (isNew || needsRetry(item))) {
        emailJobs.push({ notification: item, kind: email.kind, template: email.template });
      } else if (email && needsFirstAttempt(item) && !isNew) {
        // Row predates email metadata (migration): attempt once.
        emailJobs.push({ notification: item, kind: email.kind, template: email.template });
      }
      return item;
    }

    function emitAdmin({ type, dedupeKey, title, titleEn, body, bodyEn, linkKind, linkId, createdAt }) {
      if (typeof store.addAdminNotification !== 'function') return null;
      return store.addAdminNotification({ type, dedupeKey, title, titleEn, body, bodyEn, linkKind, linkId, createdAt });
    }

    for (const o of orders) {
      const status = orderStatus(o);
      const createdAt = o.createdAt ?? nowMs;
      if (status === 'PAID') {
        const licenseId = o.licenseId ?? null;
        const template = buildPaymentReceivedEmail({ orderId: o.id, licenseId, planName: o.planName ?? o.packageKey });
        emitCustomer({
          type: 'order.paid', dedupeKey: o.id,
          title: 'Pembayaran diterima', titleEn: 'Payment received',
          body: `Order ${shortId(o.id)} telah dikonfirmasi server dan lisensi diterbitkan.`,
          bodyEn: `Order ${shortId(o.id)} was confirmed server-side and the license was issued.`,
          linkKind: 'order', linkId: o.id,
          createdAt: o.paidAt ?? o.createdAt ?? nowMs,
        }, { kind: 'paymentReceived', template });
        emitAdmin({
          type: 'admin.order.paid', dedupeKey: o.id,
          title: 'Order paid', titleEn: 'Order paid',
          body: `Order ${shortId8(o.id)} paid.`, bodyEn: `Order ${shortId8(o.id)} paid.`,
          linkKind: 'order', linkId: o.id, createdAt: o.paidAt ?? o.createdAt ?? nowMs,
        });
      } else if (isOrderExpired(o, nowMs)) {
        // Exactly one closing notification; never an order.pending twin.
        emitCustomer({
          type: 'order.expired', dedupeKey: o.id,
          title: 'Order kedaluwarsa', titleEn: 'Order expired',
          body: `Order ${shortId(o.id)} kedaluwarsa sebelum pembayaran selesai. Buat order baru untuk melanjutkan.`,
          bodyEn: `Order ${shortId(o.id)} expired before payment completed. Create a new order to continue.`,
          linkKind: 'order', linkId: o.id,
          createdAt: parseTimeMs(o.expiredAt) ?? o.createdAt ?? nowMs,
        });
        emitAdmin({
          type: 'admin.order.expired', dedupeKey: o.id,
          title: 'Order expired', titleEn: 'Order expired',
          body: `Order ${shortId8(o.id)} expired.`, bodyEn: `Order ${shortId8(o.id)} expired.`,
          linkKind: 'order', linkId: o.id, createdAt: parseTimeMs(o.expiredAt) ?? o.createdAt ?? nowMs,
        });
      } else if (status === 'PENDING') {
        // Unexpired only (expired handled above).
        emitCustomer({
          type: 'order.pending', dedupeKey: o.id,
          title: 'Menunggu pembayaran', titleEn: 'Awaiting payment',
          body: `Order ${shortId(o.id)} menunggu pembayaran QRIS.`,
          bodyEn: `Order ${shortId(o.id)} is awaiting QRIS payment.`,
          linkKind: 'order', linkId: o.id, createdAt,
        });
        emitAdmin({
          type: 'admin.order.pending', dedupeKey: o.id,
          title: 'Order pending — needs attention', titleEn: 'Order pending — needs attention',
          body: `Order ${shortId8(o.id)} is pending payment.`, bodyEn: `Order ${shortId8(o.id)} is pending payment.`,
          linkKind: 'order', linkId: o.id, createdAt,
        });
      } else if (status === 'CANCELLED') {
        emitCustomer({
          type: 'order.cancelled', dedupeKey: o.id,
          title: 'Order dibatalkan', titleEn: 'Order cancelled',
          body: `Order ${shortId(o.id)} telah dibatalkan.`,
          bodyEn: `Order ${shortId(o.id)} was cancelled.`,
          linkKind: 'order', linkId: o.id, createdAt: o.cancelledAt ?? o.createdAt ?? nowMs,
        });
        emitAdmin({
          type: 'admin.order.cancelled', dedupeKey: o.id,
          title: 'Order cancelled', titleEn: 'Order cancelled',
          body: `Order ${shortId8(o.id)} cancelled.`, bodyEn: `Order ${shortId8(o.id)} cancelled.`,
          linkKind: 'order', linkId: o.id, createdAt: o.cancelledAt ?? o.createdAt ?? nowMs,
        });
      }
    }

    for (const l of licenses) {
      const createdAt = l.createdAt ?? nowMs;
      // license.issued — every persisted license was issued exactly once.
      // When this license is the license of a PAID order, the payment email
      // already combines both facts, so no second licenseIssued email.
      const paidOrderForLicense = orders.find((o) => orderStatus(o) === 'PAID' && o.licenseId === l.id);
      emitCustomer({
        type: 'license.issued', dedupeKey: l.id,
        title: 'Lisensi diterbitkan', titleEn: 'License issued',
        body: `Lisensi ${shortId(l.id)} telah diterbitkan.`,
        bodyEn: `License ${shortId(l.id)} was issued.`,
        linkKind: 'license', linkId: l.id, createdAt,
      }, paidOrderForLicense
        ? null
        : { kind: 'licenseIssued', template: buildLicenseIssuedEmail({ licenseId: l.id, planName: l.planKey }) });
      emitAdmin({
        type: 'admin.license.issued', dedupeKey: l.id,
        title: 'License issued', titleEn: 'License issued',
        body: `License ${shortId8(l.id)} issued.`, bodyEn: `License ${shortId8(l.id)} issued.`,
        linkKind: 'license', linkId: l.id, createdAt,
      });

      if (l.revokedAt) {
        emitCustomer({
          type: 'license.revoked', dedupeKey: l.id,
          title: 'Lisensi dicabut', titleEn: 'License revoked',
          body: `Lisensi ${shortId(l.id)} dicabut. Perpanjang untuk mengaktifkan kembali.`,
          bodyEn: `License ${shortId(l.id)} was revoked. Renew to reactivate.`,
          linkKind: 'license', linkId: l.id, createdAt: l.revokedAt,
        });
        emitAdmin({
          type: 'admin.license.revoked', dedupeKey: l.id,
          title: 'License revoked', titleEn: 'License revoked',
          body: `License ${shortId8(l.id)} revoked.`, bodyEn: `License ${shortId8(l.id)} revoked.`,
          linkKind: 'license', linkId: l.id, createdAt: l.revokedAt,
        });
      } else {
        const expiresMs = parseTimeMs(l.expiresAt);
        if (expiresMs != null && expiresMs > nowMs && expiresMs - nowMs <= expiringDays * DAY_MS) {
          const daysLeft = Math.max(1, Math.ceil((expiresMs - nowMs) / DAY_MS));
          const dayKey = new Date(nowMs).toISOString().slice(0, 10);
          emitCustomer({
            type: 'license.expiring', dedupeKey: `${l.id}:${dayKey}`,
            title: 'Lisensi segera berakhir', titleEn: 'License expiring soon',
            body: `Lisensi ${shortId(l.id)} berakhir ${new Date(expiresMs).toLocaleDateString('id-ID')}.`,
            bodyEn: `License ${shortId(l.id)} expires ${new Date(expiresMs).toISOString().slice(0, 10)}.`,
            linkKind: 'license', linkId: l.id, createdAt: nowMs,
          }, { kind: 'licenseExpiring', template: buildLicenseExpiringEmail({ licenseId: l.id, expiresAt: expiresMs, daysLeft }) });
          emitAdmin({
            type: 'admin.license.expiring', dedupeKey: `${l.id}:${dayKey}`,
            title: 'License expiring soon', titleEn: 'License expiring soon',
            body: `License ${shortId8(l.id)} expiring soon.`, bodyEn: `License ${shortId8(l.id)} expiring soon.`,
            linkKind: 'license', linkId: l.id, createdAt: nowMs,
          });
        }
      }

      // quota.threshold — once per license per quota period. Stable period
      // key: license id + issuance date (the quota period starts at issue).
      if (!l.revokedAt && typeof store.usageTotals === 'function') {
        const limit = licenseQuotaLimit(l, eff);
        if (limit != null && Number.isFinite(limit) && limit > 0) {
          const { usedTokens } = store.usageTotals(l.id);
          if (typeof usedTokens === 'number' && usedTokens / limit * 100 >= quotaThreshold) {
            const periodStart = l.createdAt ?? l.issuedAt ?? createdAt;
            const periodKey = `${l.id}:${new Date(periodStart).toISOString().slice(0, 10)}`;
            const percent = Math.floor(usedTokens / limit * 100);
            emitCustomer({
              type: 'quota.threshold', dedupeKey: periodKey,
              title: 'Kuota hampir habis', titleEn: 'Quota nearly exhausted',
              body: `Lisensi ${shortId(l.id)} telah memakai ${percent}% kuota token.`,
              bodyEn: `License ${shortId(l.id)} has used ${percent}% of its token quota.`,
              linkKind: 'license', linkId: l.id, createdAt: nowMs,
            });
            emitAdmin({
              type: 'admin.quota.threshold', dedupeKey: periodKey,
              title: 'Quota threshold reached', titleEn: 'Quota threshold reached',
              body: `License ${shortId8(l.id)} reached quota threshold (${percent}%).`,
              bodyEn: `License ${shortId8(l.id)} reached quota threshold (${percent}%).`,
              linkKind: 'license', linkId: l.id, createdAt: nowMs,
            });
          }
        }
      }
    }

    // Email delivery: sequential, failures isolated to their own row.
    for (const job of emailJobs) {
      try { await deliver(account, job.notification, job, nowMs); } catch { /* row keeps state; next sync retries failed */ }
    }
    return emitted;
  }

  function listAccountsSafe() {
    try { return typeof store.listAccounts === 'function' ? store.listAccounts() : []; } catch { return []; }
  }

  async function syncAll({ now: nowOverride } = {}) {
    const nowMs = nowOverride ?? nowFn();
    const accounts = listAccountsSafe();
    const results = [];
    for (const account of accounts) {
      try { results.push(await syncAccount(account, { now: nowMs })); } catch { /* one account must not block the rest */ }
    }
    // Admin derivation across licenses/orders whose account row is missing
    // (operator visibility must not silently drop them): syncAccount already
    // emitted admin rows for every known account; nothing extra to invent.
    return results;
  }

  let timer = null;
  function start(intervalMs) {
    if (timer) return timer;
    const eff = effectiveSettings();
    const cfg = notificationsConfig(eff);
    const ms = intervalMs ?? cfg.schedulerIntervalMs;
    if (!ms || ms <= 0) return null;
    timer = setInterval(() => {
      syncAll().catch((err) => {
        // Never log secrets / customer identity — message only, sanitized.
        console.error(`[notifications] scheduler tick failed: ${String(err?.message ?? 'unknown').slice(0, 200)}`);
      });
    }, ms);
    if (typeof timer.unref === 'function') timer.unref();
    return timer;
  }
  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  return { syncAccount, syncAll, start, stop, mailer: mailerImpl, effectiveSettings };
}

export default createNotificationService;
