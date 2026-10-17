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
 * Email delivery runs through a persisted state machine on the row
 * (store.claimNotificationEmail / settleNotificationEmail):
 * claim -> 'sending' (attempt counted + lease stamped) -> provider call ->
 * 'sent'/'log_only'/'disabled' (terminal) or 'failed'/'ambiguous' with a
 * persisted, bounded backoff (emailNextRetryAt). A threw mailer is
 * 'ambiguous' (provider may have accepted). Every attempt of one
 * notification carries the same Brevo IdempotencyKey (derived from the
 * notification id): a retry inside Brevo's 30-min TTL whose original
 * landed is suppressed upstream (duplicate_parameter -> recorded sent),
 * so the residual duplicate window is only a retry after the TTL or a
 * provider that ignores the key — exactly-once is still not promised, but
 * the common crash/timeout path is de-duplicated by the provider itself. Reads use delivery:'new' (first attempts
 * only, NEVER retries); the scheduler (delivery:'all') owns retries.
 * Repeat syncs never resend a terminal row.
 */
import { resolveSettings, resolvePlanAiPolicy } from './settings.js';
import {
  createMailer,
  buildPaymentReceivedEmail,
  buildLicenseIssuedEmail,
  buildLicenseExpiringEmail,
} from './mail.js';

const DAY_MS = 86_400_000;
// Bounded email retry: a failed/ambiguous row is retried only while
// emailAttempts < cap, and only after its persisted backoff has elapsed.
// The cap is an SSOT setting (notifications.maxEmailAttempts, default 5);
// the constants below are the engine defaults the settings layer seeds from.
const DEFAULT_MAX_EMAIL_ATTEMPTS = 5;
const EMAIL_CLAIM_LEASE_MS = 120_000; // 2 min — far above the 10s provider timeout
const EMAIL_RETRY_BASE_MS = 60_000; // 1 min, doubling
const EMAIL_RETRY_MAX_MS = 3_600_000; // 1 h cap

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
  random,
  fetchImpl,
  env,
} = {}) {
  if (!store) throw new Error('createNotificationService requires a store');
  const nowFn = typeof now === 'function' ? now : () => Date.now();
  const randomFn = typeof random === 'function' ? random : Math.random;

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
    const configuredMax = n.maxEmailAttempts;
    return {
      schedulerIntervalMs: n.schedulerIntervalMs ?? d.schedulerIntervalMs,
      quotaThresholdPercent: n.quotaThresholdPercent ?? d.quotaThresholdPercent,
      expiringSoonDays: n.expiringSoonDays ?? d.expiringSoonDays,
      maxEmailAttempts:
        Number.isInteger(configuredMax) && configuredMax >= 1 ? configuredMax : DEFAULT_MAX_EMAIL_ATTEMPTS,
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
  // A claim whose lease expired without an outcome (process crash, or a
  // sync that died mid-delivery) is reclaimable by any later sync.
  function staleClaim(n, atMs = nowFn()) {
    return !!n && n.emailStatus === 'sending'
      && (n.emailClaimedAt == null || n.emailClaimedAt <= atMs - EMAIL_CLAIM_LEASE_MS);
  }
  // Retry-eligible (scheduler only): failed/ambiguous, under the attempt cap,
  // and past the persisted backoff gate. A legacy failed row without
  // emailNextRetryAt is eligible immediately (its next failure stamps one).
  function needsRetry(n, cfg = notificationsConfig(effectiveSettings()), atMs = nowFn()) {
    if (!n || (n.emailStatus !== 'failed' && n.emailStatus !== 'ambiguous')) return false;
    const attempts = typeof n.emailAttempts === 'number' ? n.emailAttempts : 0;
    if (attempts >= cfg.maxEmailAttempts) return false;
    if (n.emailNextRetryAt != null && n.emailNextRetryAt > atMs) return false;
    return true;
  }
  // Deterministic bounded backoff: base doubling per attempt, capped,
  // jitter +-20% from the injectable random source.
  function backoffMs(attempts) {
    const base = Math.min(EMAIL_RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1), EMAIL_RETRY_MAX_MS);
    return Math.round(base * (0.8 + 0.4 * randomFn()));
  }

  /**
   * Attempt email for one customer notification and persist the outcome.
   * kind: mail kind ('paymentReceived' | 'licenseIssued' | 'licenseExpiring')
   * or null to skip email entirely (in-app only events).
   */
  async function deliver(account, notification, { kind, template } = {}, atMs, cfg) {
    if (!notification || !kind || !template) return notification;
    // CLAIM FIRST (synchronous, before any await): exactly one concurrent
    // sync wins the attempt; losers get null and never touch the provider.
    const claimed = store.claimNotificationEmail(account.id, notification.id, {
      at: atMs, maxAttempts: cfg.maxEmailAttempts, leaseMs: EMAIL_CLAIM_LEASE_MS,
    });
    if (!claimed) return notification;
    const settle = (fields) => store.settleNotificationEmail(account.id, notification.id, { at: atMs, ...fields }) ?? claimed;
    const to = account?.email;
    if (!to) return settle({ status: 'disabled' });
    let result;
    let thrown = false;
    try {
      result = await mailerImpl.send({ to, subject: template.subject, html: template.html, text: template.text, kind, idempotencyKey: notification.id });
    } catch (err) {
      thrown = true;
      result = { status: 'failed', error: String(err?.message ?? 'mail failed').slice(0, 200) };
    }
    const attempts = claimed.emailAttempts; // the attempt just consumed
    if (thrown) {
      // Ambiguous: the provider may have accepted before the failure
      // surfaced (e.g. timeout). Never record 'sent'; retry after backoff —
      // Brevo has no idempotency key, so a duplicate remains possible and
      // the wide backoff window is the mitigation.
      return settle({
        status: attempts >= cfg.maxEmailAttempts ? 'exhausted' : 'ambiguous',
        error: result.error ?? 'mail failed',
        errorCategory: 'ambiguous_timeout',
        ambiguous: true,
        nextRetryAt: attempts >= cfg.maxEmailAttempts ? null : atMs + backoffMs(attempts),
      });
    }
    const status = result?.status ?? 'failed';
    if (status === 'sent' || status === 'log_only' || status === 'disabled') {
      return settle({ status, providerId: result?.providerId ?? null });
    }
    // Definite provider failure. Non-retryable (e.g. invalid recipient) or
    // cap reached -> exhausted, never attempted again.
    const retryable = result?.retryable !== false;
    if (!retryable || attempts >= cfg.maxEmailAttempts) {
      return settle({
        status: 'exhausted',
        error: result?.error ?? 'mail failed',
        errorCategory: result?.category ?? (retryable ? 'attempt_cap' : 'non_retryable'),
      });
    }
    return settle({
      status: 'failed',
      error: result?.error ?? 'mail failed',
      errorCategory: result?.category ?? null,
      nextRetryAt: atMs + backoffMs(attempts),
    });
  }

  /**
   * Derive all events for one account. Returns the customer notifications
   * touched (new + existing, post-email-metadata). Async because email
   * delivery is async; store writes themselves stay synchronous.
   */
  /**
   * delivery mode: 'all' (default; first attempts + eligible retries — the
   * scheduler + explicit workers), 'new' (first attempts only, NEVER
   * retries — page reads), 'none' (derive rows only, no provider calls).
   */
  async function syncAccount(account, { now: nowOverride, delivery = 'all' } = {}) {
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
      if (!email || delivery === 'none') return item;
      if (delivery === 'new') {
        // Page reads may send a brand-new notification but must never become
        // a retry engine for failed/ambiguous rows. A crashed claim (stale
        // 'sending' lease) is NOT a retry — its attempt never reached the
        // provider — so reads may also reclaim it.
        if (isNew || needsFirstAttempt(item) || staleClaim(item, nowMs)) {
          emailJobs.push({ notification: item, kind: email.kind, template: email.template });
        }
      } else if (isNew || needsRetry(item, cfg, nowMs) || staleClaim(item, nowMs)) {
        emailJobs.push({ notification: item, kind: email.kind, template: email.template });
      } else if (needsFirstAttempt(item) && !isNew) {
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
        if (expiresMs != null && expiresMs <= nowMs) {
          // Lapsed without revoke: exactly one closing event, stable dedupe
          // (license id — NOT daily like license.expiring). In-app only: the
          // H-7/H-1 expiring emails already covered the warning path.
          emitCustomer({
            type: 'license.expired', dedupeKey: l.id,
            title: 'Lisensi kedaluwarsa', titleEn: 'License expired',
            body: `Lisensi ${shortId(l.id)} telah kedaluwarsa. Perpanjang untuk mengaktifkan kembali.`,
            bodyEn: `License ${shortId(l.id)} has expired. Renew to reactivate.`,
            linkKind: 'license', linkId: l.id, createdAt: expiresMs,
          });
          emitAdmin({
            type: 'admin.license.expired', dedupeKey: l.id,
            title: 'License expired', titleEn: 'License expired',
            body: `License ${shortId8(l.id)} expired.`, bodyEn: `License ${shortId8(l.id)} expired.`,
            linkKind: 'license', linkId: l.id, createdAt: expiresMs,
          });
        } else if (expiresMs != null && expiresMs - nowMs <= expiringDays * DAY_MS) {
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
            if (usedTokens >= limit) {
              // Distinct terminal signal at 100% (in-app only, same period
              // discipline): the gateway rejects further chat from here.
              emitCustomer({
                type: 'quota.exhausted', dedupeKey: periodKey,
                title: 'Kuota habis', titleEn: 'Quota exhausted',
                body: `Kuota token lisensi ${shortId(l.id)} telah habis. Perpanjang atau naik paket untuk melanjutkan.`,
                bodyEn: `License ${shortId(l.id)} has exhausted its token quota. Renew or upgrade to continue.`,
                linkKind: 'license', linkId: l.id, createdAt: nowMs,
              });
              emitAdmin({
                type: 'admin.quota.exhausted', dedupeKey: periodKey,
                title: 'Quota exhausted', titleEn: 'Quota exhausted',
                body: `License ${shortId8(l.id)} exhausted its quota.`,
                bodyEn: `License ${shortId8(l.id)} exhausted its quota.`,
                linkKind: 'license', linkId: l.id, createdAt: nowMs,
              });
            }
          }
        }
      }
    }

    // Email delivery: sequential, failures isolated to their own row.
    for (const job of emailJobs) {
      try { await deliver(account, job.notification, job, nowMs, cfg); } catch { /* claimed row keeps its state; scheduler retries per policy */ }
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
  let tickRunning = false; // scheduler overlap guard: never stack syncAll runs
  function start(intervalMs) {
    if (timer) return timer;
    const eff = effectiveSettings();
    const cfg = notificationsConfig(eff);
    const ms = intervalMs ?? cfg.schedulerIntervalMs;
    if (!ms || ms <= 0) return null;
    timer = setInterval(() => {
      if (tickRunning) return; // previous tick still working — skip, do not queue
      tickRunning = true;
      syncAll()
        .catch((err) => {
          // Never log secrets / customer identity — message only, sanitized.
          console.error(`[notifications] scheduler tick failed: ${String(err?.message ?? 'unknown').slice(0, 200)}`);
        })
        .finally(() => { tickRunning = false; });
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
