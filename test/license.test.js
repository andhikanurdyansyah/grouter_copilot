import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mintLicense,
  validateLicense,
  generateKeyPair,
  LicenseStatus,
} from '../src/license/validate.js';
import { LicenseGate } from '../src/license/gate.js';
import { CopilotError } from '../src/adapter/errors.js';

function makePair() {
  const { publicKeyPem, privateKeyPem } = generateKeyPair();
  return { publicKeyPem, privateKeyPem };
}

test('a freshly minted license validates', () => {
  const { publicKeyPem, privateKeyPem } = makePair();
  const token = mintLicense({ privateKeyPem, payload: { aud: 'grouter-copilot', features: ['core'] } });
  const r = validateLicense(token, { publicKeyPem, requiredAudience: 'grouter-copilot' });
  assert.equal(r.status, LicenseStatus.VALID);
  assert.equal(r.payload.features[0], 'core');
});

test('tampering with payload invalidates signature', () => {
  const { publicKeyPem, privateKeyPem } = makePair();
  const token = mintLicense({ privateKeyPem, payload: { aud: 'grouter-copilot' } });
  // flip a character in the payload part
  const parts = token.split('.');
  const payload = Buffer.from(parts[1], 'base64url').toString('utf8').replace('grouter-copilot', 'evil');
  const forged = `${parts[0]}.${Buffer.from(payload).toString('base64url')}.${parts[2]}`;
  const r = validateLicense(forged, { publicKeyPem });
  assert.equal(r.status, LicenseStatus.INVALID);
});

test('wrong audience is rejected', () => {
  const { publicKeyPem, privateKeyPem } = makePair();
  const token = mintLicense({ privateKeyPem, payload: { aud: 'other-product' } });
  const r = validateLicense(token, { publicKeyPem, requiredAudience: 'grouter-copilot' });
  assert.equal(r.status, LicenseStatus.INVALID);
});

test('expired license is rejected', () => {
  const { publicKeyPem, privateKeyPem } = makePair();
  const token = mintLicense({
    privateKeyPem,
    payload: { aud: 'grouter-copilot' },
    notBefore: 1000,
    expiresAt: 2000,
  });
  const r = validateLicense(token, { publicKeyPem, now: Date.now() });
  assert.equal(r.status, LicenseStatus.EXPIRED);
});

test('missing feature is rejected', () => {
  const { publicKeyPem, privateKeyPem } = makePair();
  const token = mintLicense({ privateKeyPem, payload: { aud: 'grouter-copilot', features: ['core'] } });
  const r = validateLicense(token, { publicKeyPem, requiredFeatures: ['core', 'pro'] });
  assert.equal(r.status, LicenseStatus.INVALID);
});

test('LicenseGate.enforce throws without license', () => {
  const { publicKeyPem } = makePair();
  const gate = new LicenseGate({ publicKeyPem });
  assert.throws(() => gate.enforce(null), (e) => e instanceof CopilotError && e.code === 'SCOPE_DENIED');
});

test('LicenseGate.enforce throws when no public key compiled in', () => {
  const gate = new LicenseGate({ publicKeyPem: '' });
  assert.throws(() => gate.enforce('anything'), (e) => e instanceof CopilotError && e.code === 'NOT_CONFIGURED');
});

test('LicenseGate accepts an env-safe escaped PEM verifier key', () => {
  const { publicKeyPem, privateKeyPem } = generateKeyPair();
  const token = mintLicense({ privateKeyPem, payload: { aud: 'grouter-copilot', features: ['core'] } });
  const gate = new LicenseGate({ publicKeyPem: publicKeyPem.replace(/\n/g, '\\n') });
  assert.equal(gate.enforce(token).aud, 'grouter-copilot');
});
test('LicenseGate.enforce accepts a valid license', () => {
  const { publicKeyPem, privateKeyPem } = makePair();
  const token = mintLicense({ privateKeyPem, payload: { aud: 'grouter-copilot', features: ['core'] } });
  const gate = new LicenseGate({ publicKeyPem });
  const payload = gate.enforce(token);
  assert.equal(payload.aud, 'grouter-copilot');
});
