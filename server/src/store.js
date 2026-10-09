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

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    mkdirSync(path.dirname(filePath), { recursive: true });
    this.data = this._load();
  }

  _load() {
    const empty = { accounts: [], licenses: [], orders: [], heartbeats: [], usage: [], settings: {} };
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
        // Runtime configuration (SSOT). Resolved against defaults + env seeds
        // by server/src/settings.js — this is only the persisted override layer.
        settings: parsed.settings ?? {},
      };
    } catch {
      return empty;
    }
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

  addLicense(license) {
    this.data.licenses.push(license);
    this._save();
    return license;
  }

  // --- AI usage ledger (D-021 gateway; customer dimension) ---

  getUsageRecord(requestId) {
    return this.data.usage.find((u) => u.requestId === requestId) ?? null;
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
