/**
 * License gate — enforces that Copilot only runs with a valid license.
 *
 * The plugin verifies the license offline (Ed25519 signature) against an
 * embedded PUBLIC key, then optionally phones home (best-effort) to the license
 * server for revocation and usage counting.
 */

import { validateLicense, LicenseStatus } from './validate.js';
import { CopilotError, ErrorCode } from '../adapter/errors.js';

export const DEFAULT_PUBLIC_KEY = process.env.GROUTER_LICENSE_PUBLIC_KEY ?? '';
export const LICENSE_AUDIENCE = 'grouter-copilot';

export class LicenseGate {
  constructor({ publicKeyPem = DEFAULT_PUBLIC_KEY, licenseServerUrl, now, onHeartbeat } = {}) {
    this.publicKeyPem = publicKeyPem;
    this.licenseServerUrl = licenseServerUrl;
    this.now = now;
    this.onHeartbeat = onHeartbeat;
  }

  get requiredAudience() {
    return LICENSE_AUDIENCE;
  }

  /**
   * Enforce a valid license. Throws CopilotError unless the license validates.
   * @param {string} token
   */
  enforce(token) {
    if (!this.publicKeyPem) {
      // No public key compiled in — fail closed (can never run unlicensed).
      throw new CopilotError(ErrorCode.NOT_CONFIGURED, 'License verifier is not configured.', { status: 500 });
    }
    const result = validateLicense(token, {
      publicKeyPem: this.publicKeyPem,
      now: this.now,
      requiredAudience: this.requiredAudience,
    });
    if (result.status !== LicenseStatus.VALID) {
      throw new CopilotError(
        ErrorCode.SCOPE_DENIED,
        `License ${result.status}: ${result.error ?? 'invalid'}.`,
        { status: 403 },
      );
    }
    return result.payload;
  }

  /**
   * Offline enforce + best-effort online heartbeat. Does not fail on network errors.
   */
  async enforceOnline(token) {
    const payload = this.enforce(token);
    try {
      await this.onHeartbeat?.({ token, payload, licenseServerUrl: this.licenseServerUrl });
    } catch {
      // best-effort
    }
    return payload;
  }
}
