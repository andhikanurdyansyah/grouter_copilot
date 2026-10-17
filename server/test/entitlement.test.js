import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCapability } from '../src/entitlement.js';
const settings = { plans: [{ key: 'basic', features: ['core'], active: true }, { key: 'pro', features: ['core', 'pro'], active: true }] };
const license = (overrides = {}) => ({ planKey: 'pro', ...overrides });
test('capabilities resolve from canonical plan features and fail closed', () => {
  assert.equal(resolveCapability({ license: license(), settings, capability: 'export_usage' }).entitled, true);
  assert.equal(resolveCapability({ license: license({ planKey: 'basic' }), settings, capability: 'export_usage' }).reason, 'NOT_ENTITLED');
  assert.equal(resolveCapability({ license: license({ planKey: 'missing' }), settings, capability: 'export_usage' }).reason, 'UNKNOWN_PLAN');
  assert.equal(resolveCapability({ license: license({ expiresAt: 100 }), settings, capability: 'export_usage', now: 100 }).reason, 'EXPIRED');
  assert.equal(resolveCapability({ license: license({ revokedAt: 1 }), settings, capability: 'export_usage' }).reason, 'REVOKED');
});
test('receipt is available to every active configured plan', () => {
  assert.equal(resolveCapability({ license: license({ planKey: 'basic' }), settings, capability: 'print_receipt' }).entitled, true);
});

test('malformed present expiry fails closed', () => {
  assert.equal(resolveCapability({ license: license({ expiresAt: 'not-a-date' }), settings, capability: 'export_usage' }).reason, 'INVALID_EXPIRY');
  assert.equal(resolveCapability({ license: license({ expiresAt: 0 }), settings, capability: 'export_usage' }).reason, 'INVALID_EXPIRY');
});
