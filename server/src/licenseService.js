/**
 * License service — mint/revoke licenses and record heartbeats.
 * Uses the shared license module from ../src/license (private key on server only).
 */

import { mintLicense } from '../../src/license/validate.js';
import { validateLicense } from '../../src/license/validate.js';

let idCounter = 0;
function nextId(prefix) {
  idCounter = (idCounter + 1) % 0xffffff;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

export class LicenseService {
  constructor({ store, privateKeyPem, audience = 'grouter-copilot' }) {
    this.store = store;
    this.privateKeyPem = privateKeyPem;
    this.audience = audience;
  }

  issue({ customer, accountId = null, features = ['core'], expiresInDays = 365, quota = null, notBefore, grouterApiKey = null, planKey = null } = {}) {
    const id = nextId('lic');
    const expiresAt = notBefore
      ? null
      : Math.floor(Date.now() / 1000) + expiresInDays * 24 * 3600;

    const token = mintLicense({
      privateKeyPem: this.privateKeyPem,
      payload: { aud: this.audience, lic: id, customer, features, quota },
      notBefore,
      expiresAt: expiresAt ? expiresAt * 1000 : undefined,
    });

    const record = {
      id,
      customer,
      accountId: accountId ?? null,
      planKey: planKey ?? null, // links the license to the plan catalogue (quotaTokens)
      features,
      quota: quota ?? null,
      createdAt: Date.now(),
      expiresAt: expiresAt ? expiresAt * 1000 : null,
      revokedAt: null,
      installIds: [],
      lastSeenAt: null,
      grouterApiKey: grouterApiKey ?? null, // LEGACY (pre-D-021), unused by the gateway; never returned via API
      // The signed license token is customer-facing material, not a provider credential.
      // Persist it so an authenticated purchaser can retrieve it after payment.
      token,
    };

    this.store.addLicense(record);
    return { record, token };
  }

  /**
   * Bind a gRouter api key to a license (admin action). The api key is NEVER
   * embedded in the license token; it is resolved server-side only.
   */
  bindApiKey(id, grouterApiKey) {
    const l = this.store.getLicense(id);
    if (!l) return null;
    l.grouterApiKey = grouterApiKey;
    this.store._save();
    return l;
  }

  /**
   * Resolve the gRouter api key for a license (used by the plugin during
   * install via the key-handoff endpoint). Returns null if not bound.
   */
  resolveApiKey(id) {
    const l = this.store.getLicense(id);
    if (!l || l.revokedAt) return null;
    return l.grouterApiKey ?? null;
  }

  revoke(id) {
    return this.store.revokeLicense(id);
  }

  validate(token, publicKeyPem) {
    return validateLicense(token, { publicKeyPem, requiredAudience: this.audience });
  }

  list() {
    return this.store.listLicenses();
  }

  stats() {
    return this.store.stats();
  }
}
