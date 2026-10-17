/**
 * Copilot backend — JSON file storage (no external DB dependency).
 *
 * This is a MONOREPO: the plugin (../src) and this backend (server/) share the
 * license validation logic but have separate responsibilities:
 *   - plugin: verifies licenses offline (public key only)
 *   - backend: mints/revokes licenses (private key), records installs, serves admin
 *
 * Storage shape:
 * {
 *   accounts: [{ id, name, email, createdAt }],
 *   licenses: [{ id, customer, accountId, features[], expiresAt, revokedAt, createdAt, installIds, grouterApiKey }],
 *   heartbeats: [{ licenseId, installId, at, baseUrl }],
 * }
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import { deepMerge } from './settings.js';

// Retention bound for per-account in-app notifications (newest kept).
const NOTIFICATION_MAX = 100;
// Retention bound for the (single, operator-wide) admin notification list.
const ADMIN_NOTIFICATION_MAX = 200;

function sanitizeEmailError(error) {
  if (error == null) return null;
  return String(error).replace(/https?:\/\/\S+/g, '[redacted-url]').slice(0, 200);
}

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    mkdirSync(path.dirname(filePath), { recursive: true });
    this.data = this._load();
  }

  _load() {
    const empty = { accounts: [], licenses: [], orders: [], heartbeats: [], usage: [], notifications: [], adminNotifications: [], settings: {} };
    if (!existsSync(this.filePath)) {
      return empty;
    }
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8'));
      return {
        accounts: parsed.accounts ?? [],
        licenses: parsed.licenses ?? [],
        orders: parsed.orders ?? [],
        heartbeats: parsed.heartbeats ?? [],
        usage: parsed.usage ?? [],
        // In-app notification events (per-account, persisted). Bounded list;
        // retention is enforced on write (see addNotification).
        notifications: parsed.notifications ?? [],
        // Operator notification events (single list, generic payloads — no
        // customer identity). Migrated for old store files.
        adminNotifications: parsed.adminNotifications ?? [],
        // Runtime configuration (SSOT). Resolved against defaults + env seeds
        // by server/src/settings.js — this is only the persisted override layer.
        settings: parsed.settings ?? {},
      };
    } catch {
      return empty;
    }
  }

  // --- notifications (in-app product events; durable, per-account) ---

  /**
   * Append a notification event. Idempotent by (accountId, type, dedupeKey):
   * replaying the same event never duplicates the row.
   * Retention: keep at most NOTIFICATION_MAX newest per account.
   */
  addNotification({ accountId, type, title, titleEn, body, bodyEn, dedupeKey, createdAt = Date.now(), linkKind, linkId }) {
    if (!accountId || !type) return null;
    const existing = this.data.notifications.find(
      (n) => n.accountId === accountId && n.type === type && (dedupeKey == null || n.dedupeKey === dedupeKey),
    );
    if (existing) return existing;
    const item = {
      id: `ntf_${createdAt.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
      accountId, type, title, titleEn, body, bodyEn, dedupeKey: dedupeKey ?? null,
      linkKind: linkKind ?? null, linkId: linkId ?? null,
      // Email delivery metadata. Old rows persisted before this field set
      // exist simply lack these keys; readers must default them safely
      // (null / null / 0 / null) — see markNotificationEmail.
      emailStatus: null, emailedAt: null, emailAttempts: 0, lastEmailError: null,
      readAt: null, createdAt,
    };
    this.data.notifications.push(item);
    const perAccount = this.data.notifications.filter((n) => n.accountId === accountId);
    if (perAccount.length > NOTIFICATION_MAX) {
      const overflowIds = new Set(
        perAccount.sort((a, b) => a.createdAt - b.createdAt).slice(0, perAccount.length - NOTIFICATION_MAX).map((n) => n.id),
      );
      this.data.notifications = this.data.notifications.filter((n) => !overflowIds.has(n.id));
    }
    this._save();
    return item;
  }

  listNotifications(accountId, { limit = 50 } = {}) {
    return this.data.notifications
      .filter((n) => n.accountId === accountId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, Math.min(Math.max(1, limit), 200));
  }

  markNotificationRead(accountId, id) {
    const n = this.data.notifications.find((x) => x.id === id && x.accountId === accountId);
    if (!n) return null;
    if (!n.readAt) {
      n.readAt = Date.now();
      this._save();
    }
    return n;
  }

  markAllNotificationsRead(accountId) {
    let changed = 0;
    for (const n of this.data.notifications) {
      if (n.accountId === accountId && !n.readAt) {
        n.readAt = Date.now();
        changed++;
      }
    }
    if (changed) this._save();
    return changed;
  }

  /**
   * Record an email attempt outcome on a customer notification.
   * Increments emailAttempts on every call (one call = one attempt);
   * emailedAt is set only for terminal success states (sent / log_only /
   * disabled). Old rows without email fields are upgraded in place.
   */
  markNotificationEmail(accountId, id, { status, at = Date.now(), error = null } = {}) {
    const n = this.data.notifications.find((x) => x.id === id && x.accountId === accountId);
    if (!n) return null;
    n.emailStatus = status ?? null;
    n.emailAttempts = (typeof n.emailAttempts === 'number' ? n.emailAttempts : 0) + 1;
    if (status === 'sent' || status === 'log_only' || status === 'disabled') n.emailedAt = at;
    n.lastEmailError = status === 'failed' ? sanitizeEmailError(error) : (error != null ? sanitizeEmailError(error) : null);
    this._save();
    return n;
  }

  // --- admin notifications (operator events; generic, no customer identity) ---

  /**
   * Append an admin notification. Idempotent by (type, dedupeKey).
   * Retention: keep at most ADMIN_NOTIFICATION_MAX newest overall.
   * Payload contract: only generic operational fields (type, titles,
   * linkKind/linkId, timestamps) — callers must never pass customer
   * email/name/accountId (the service layer never does).
   */
  addAdminNotification({ type, title, titleEn, body, bodyEn, dedupeKey, linkKind, linkId, createdAt = Date.now() }) {
    if (!type) return null;
    if (!Array.isArray(this.data.adminNotifications)) this.data.adminNotifications = [];
    const existing = this.data.adminNotifications.find(
      (n) => n.type === type && (dedupeKey == null || n.dedupeKey === dedupeKey),
    );
    if (existing) return existing;
    const item = {
      id: `antf_${createdAt.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
      type, title, titleEn, body, bodyEn, dedupeKey: dedupeKey ?? null,
      linkKind: linkKind ?? null, linkId: linkId ?? null,
      emailStatus: null, emailedAt: null, emailAttempts: 0, lastEmailError: null,
      readAt: null, createdAt,
    };
    this.data.adminNotifications.push(item);
    if (this.data.adminNotifications.length > ADMIN_NOTIFICATION_MAX) {
      const sorted = this.data.adminNotifications.slice().sort((a, b) => a.createdAt - b.createdAt);
      const overflowIds = new Set(sorted.slice(0, this.data.adminNotifications.length - ADMIN_NOTIFICATION_MAX).map((n) => n.id));
      this.data.adminNotifications = this.data.adminNotifications.filter((n) => !overflowIds.has(n.id));
    }
    this._save();
    return item;
  }

  listAdminNotifications({ limit = 50 } = {}) {
    if (!Array.isArray(this.data.adminNotifications)) this.data.adminNotifications = [];
    return this.data.adminNotifications
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, Math.min(Math.max(1, limit), 500));
  }

  markAdminNotificationRead(id) {
    if (!Array.isArray(this.data.adminNotifications)) this.data.adminNotifications = [];
    const n = this.data.adminNotifications.find((x) => x.id === id);
    if (!n) return null;
    if (!n.readAt) {
      n.readAt = Date.now();
      this._save();
    }
    return n;
  }

  markAllAdminNotificationsRead() {
    if (!Array.isArray(this.data.adminNotifications)) this.data.adminNotifications = [];
    let changed = 0;
    for (const n of this.data.adminNotifications) {
      if (!n.readAt) {
        n.readAt = Date.now();
        changed++;
      }
    }
    if (changed) this._save();
    return changed;
  }

  markAdminNotificationEmail(id, { status, at = Date.now(), error = null } = {}) {
    if (!Array.isArray(this.data.adminNotifications)) this.data.adminNotifications = [];
    const n = this.data.adminNotifications.find((x) => x.id === id);
    if (!n) return null;
    n.emailStatus = status ?? null;
    n.emailAttempts = (typeof n.emailAttempts === 'number' ? n.emailAttempts : 0) + 1;
    if (status === 'sent' || status === 'log_only' || status === 'disabled') n.emailedAt = at;
    n.lastEmailError = status === 'failed' ? sanitizeEmailError(error) : (error != null ? sanitizeEmailError(error) : null);
    this._save();
    return n;
  }

  // --- settings (runtime configuration SSOT) ---

  getSettings() {
    return this.data.settings ?? {};
  }

  /**
   * Deep-merge a partial patch into the persisted settings and save.
   * @param {object} patch already validated by settings.validateSettings()
   */
  updateSettings(patch) {
    this.data.settings = deepMerge(this.data.settings ?? {}, patch);
    this._save();
    return this.data.settings;
  }

  _save() {
    // atomic-ish: write temp then rename
    const tmp = `${this.filePath}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    renameSync(tmp, this.filePath);
  }

  listLicenses() {
    return this.data.licenses;
  }

  getLicense(id) {
    return this.data.licenses.find((l) => l.id === id) ?? null;
  }

  // --- accounts (D-017: 1 account = N licenses) ---

  listAccounts() {
    return this.data.accounts;
  }

  getAccount(id) {
    return this.data.accounts.find((a) => a.id === id) ?? null;
  }

  getAccountByEmail(email) {
    return this.data.accounts.find((a) => a.email === email) ?? null;
  }

  addAccount(account) {
    this.data.accounts.push(account);
    this._save();
    return account;
  }

  licensesByAccount(accountId) {
    return this.data.licenses.filter((l) => l.accountId === accountId);
  }

  // --- orders (payment flow) ---

  listOrders() {
    return this.data.orders;
  }

  getOrder(id) {
    return this.data.orders.find((o) => o.id === id) ?? null;
  }

  addOrder(order) {
    this.data.orders.push(order);
    this._save();
    return order;
  }

  updateOrderStatus(id, status) {
    const order = this.data.orders.find((o) => o.id === id);
    if (!order) return null;
    order.status = status;
    this._save();
    return order;
  }

  addLicense(license) {
    this.data.licenses.push(license);
    this._save();
    return license;
  }

  // --- AI usage ledger (D-021 gateway; customer dimension) ---

  getUsageRecord(requestId) {
    return this.data.usage.find((u) => u.requestId === requestId) ?? null;
  }

  listUsage() {
    return this.data.usage;
  }

  addUsageRecord(record) {
    this.data.usage.push(record);
    this._save();
    return record;
  }

  updateUsageRecord(requestId, patch) {
    const record = this.getUsageRecord(requestId);
    if (!record) return null;
    Object.assign(record, patch);
    this._save();
    return record;
  }

  /**
   * Effective charged tokens for a license. Reserved requests count their
   * reservation (prevents quota bypass via concurrent in-flight requests);
   * errored requests count nothing (reservation released).
   */
  usageTotals(licenseId) {
    let usedTokens = 0;
    let requestCount = 0;
    for (const u of this.data.usage) {
      if (u.licenseId !== licenseId) continue;
      if (u.status === 'ok') {
        usedTokens += u.totalTokens ?? 0;
        requestCount += 1;
      } else if (u.status === 'reserved') {
        usedTokens += u.reservedTokens ?? 0;
      }
    }
    return { usedTokens, requestCount };
  }

  revokeLicense(id, { at = Date.now() } = {}) {
    const l = this.getLicense(id);
    if (!l) return null;
    l.revokedAt = at;
    this._save();
    return l;
  }

  recordHeartbeat({ licenseId, installId, at = Date.now(), baseUrl }) {
    const l = this.getLicense(licenseId);
    if (l) {
      l.installIds = l.installIds ?? [];
      if (!l.installIds.includes(installId)) {
        l.installIds.push(installId);
      }
      l.lastSeenAt = at;
    }
    this.data.heartbeats.push({ licenseId, installId, at, baseUrl });
    this._save();
    return l;
  }

  installCount(licenseId) {
    const l = this.getLicense(licenseId);
    return l?.installIds?.length ?? 0;
  }

  stats() {
    const active = this.data.licenses.filter((l) => !l.revokedAt);
    const revoked = this.data.licenses.filter((l) => l.revokedAt);
    const totalInstalls = this.data.licenses.reduce((sum, l) => sum + (l.installIds?.length ?? 0), 0);
    return {
      totalLicenses: this.data.licenses.length,
      activeLicenses: active.length,
      revokedLicenses: revoked.length,
      totalInstalls,
      totalHeartbeats: this.data.heartbeats.length,
    };
  }
}
