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

  issue({ customer, features = ['core'], expiresInDays = 365, notBefore } = {}) {
    const id = nextId('lic');
    const expiresAt = notBefore
      ? null
      : Math.floor(Date.now() / 1000) + expiresInDays * 24 * 3600;

    const token = mintLicense({
      privateKeyPem: this.privateKeyPem,
      payload: { aud: this.audience, lic: id, customer, features },
      notBefore,
      expiresAt: expiresAt ? expiresAt * 1000 : undefined,
    });

    const record = {
      id,
      customer,
      features,
      createdAt: Date.now(),
      expiresAt: expiresAt ? expiresAt * 1000 : null,
      revokedAt: null,
      installIds: [],
      lastSeenAt: null,
      // NOTE: raw token is returned to the operator ONCE at issue time; not persisted.
    };

    this.store.addLicense(record);
    return { record, token };
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
