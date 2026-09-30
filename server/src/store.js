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
 *   licenses: [{ id, customer, features[], expiresAt, revokedAt, createdAt, installIds:Set }],
 *   heartbeats: [{ licenseId, installId, at, baseUrl }],
 * }
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import path from 'node:path';

export class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    mkdirSync(path.dirname(filePath), { recursive: true });
    this.data = this._load();
  }

  _load() {
    if (!existsSync(this.filePath)) {
      return { licenses: [], heartbeats: [] };
    }
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8'));
      return { licenses: parsed.licenses ?? [], heartbeats: parsed.heartbeats ?? [] };
    } catch {
      return { licenses: [], heartbeats: [] };
    }
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

  addLicense(license) {
    this.data.licenses.push(license);
    this._save();
    return license;
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
