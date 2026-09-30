/**
 * License validation — the "lock" that makes gRouter Copilot license-based.
 *
 * Design: asymmetric signature. The license server (Copilot backend) holds the
 * Ed25519 PRIVATE key and mints licenses. The plugin embeds only the PUBLIC key
 * and verifies offline, so:
 *   - a valid license proves it was issued by us (cannot be forged client-side);
 *   - apps keep working without a network round-trip (no dependency on a server
 *     being up for normal use).
 *
 * Revocation (hard-kill) and usage counting require an online phone-home, which
 * is additive and best-effort, with a grace period (see validateOnline below).
 *
 * License format: JWT-style `base64url(header).base64url(payload).base64url(sig)`
 * where sig = Ed25519 over `header.payload`.
 */

import { createPublicKey, verify, sign, generateKeyPairSync } from 'node:crypto';

export const LicenseStatus = {
  VALID: 'valid',
  EXPIRED: 'expired',
  INVALID: 'invalid',
  NOT_PROVIDED: 'not_provided',
};

function b64urlEncode(buf) {
  return Buffer.from(buf).toString('base64url');
}

function b64urlDecode(str) {
  return Buffer.from(str, 'base64url');
}

function utf8(str) {
  return Buffer.from(str, 'utf8');
}

/**
 * Mint a license (license-server side). Exposed for testing and for the future
 * license backend; the private key NEVER ships with the plugin.
 */
export function mintLicense({ privateKeyPem, payload, notBefore, expiresAt }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'EdDSA', typ: 'JWT' };
  const body = {
    iat: notBefore ?? now,
    exp: expiresAt ?? now + 365 * 24 * 3600,
    ...payload,
  };
  const headerPart = b64urlEncode(utf8(JSON.stringify(header)));
  const payloadPart = b64urlEncode(utf8(JSON.stringify(body)));
  const signingInput = `${headerPart}.${payloadPart}`;
  const signature = sign(null, utf8(signingInput), privateKeyPem);
  return `${signingInput}.${b64urlEncode(signature)}`;
}

/**
 * Validate a license token offline against a public key.
 * @param {string} token
 * @param {object} opts { publicKeyPem, now?, requiredAudience?, requiredFeatures? }
 * @returns {{status:string, payload?:object, error?:string}}
 */
export function validateLicense(token, { publicKeyPem, now = Date.now(), requiredAudience, requiredFeatures } = {}) {
  if (!token || typeof token !== 'string') {
    return { status: LicenseStatus.NOT_PROVIDED, error: 'No license provided.' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { status: LicenseStatus.INVALID, error: 'Malformed license.' };
  }

  const [headerPart, payloadPart, sigPart] = parts;
  let payload;
  try {
    const sig = b64urlDecode(sigPart);
    const valid = verify(null, utf8(`${headerPart}.${payloadPart}`), publicKeyPem, sig);
    if (!valid) {
      return { status: LicenseStatus.INVALID, error: 'License signature is invalid.' };
    }
    payload = JSON.parse(b64urlDecode(payloadPart).toString('utf8'));
  } catch {
    return { status: LicenseStatus.INVALID, error: 'License could not be parsed.' };
  }

  const nowSec = Math.floor(now / 1000);
  if (payload.exp && nowSec > payload.exp) {
    return { status: LicenseStatus.EXPIRED, payload, error: 'License has expired.' };
  }
  if (payload.nbf && nowSec < payload.nbf) {
    return { status: LicenseStatus.INVALID, payload, error: 'License is not yet valid.' };
  }
  if (requiredAudience && payload.aud !== requiredAudience) {
    return { status: LicenseStatus.INVALID, payload, error: 'License is for a different product.' };
  }
  if (requiredFeatures && Array.isArray(requiredFeatures)) {
    const have = new Set(payload.features ?? []);
    for (const f of requiredFeatures) {
      if (!have.has(f)) {
        return { status: LicenseStatus.INVALID, payload, error: `License is missing feature "${f}".` };
      }
    }
  }

  return { status: LicenseStatus.VALID, payload };
}

/**
 * Best-effort online check for revocation + usage counting.
 * Returns the offline result and records a heartbeat via the injected callbacks.
 * This must NOT block normal operation (grace period).
 */
export async function validateOnline(token, { licenseServerUrl, publicKeyPem, onHeartbeat } = {}) {
  const offline = validateLicense(token, { publicKeyPem });
  if (offline.status !== LicenseStatus.VALID) return offline;

  // Fire-and-forget heartbeat; never throws into the caller.
  try {
    await onHeartbeat?.({ token, licenseServerUrl });
  } catch {
    // best-effort: ignore network errors
  }

  return offline;
}

/** Generate an Ed25519 keypair (license-server side, for tests and the backend). */
export function generateKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
}
