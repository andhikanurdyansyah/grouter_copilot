import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeUsage } from '../src/usageResolver.js';

test('normalizeUsage maps raw /check-usage to compact safe summary', () => {
  const raw = {
    key: 'gRouter••••••••••••4a45',
    name: 'commerce-ORD-...',
    status: 'active',
    models: ['DeepSeek-V4-Pro', 'claude-opus-5'],
    usage: { tokens: 353672, limit: 15000000, remaining: 14646328, percentage: 2 },
    daily: { used: 0, effectiveLimit: 100, remaining: 100, resetAt: '2026-10-01T17:00:00.000Z' },
    fairUse: null,
    subscription: { packageName: 'Monthly | 15M Tokens', expiresAt: '2026-10-08T00:00:00.000Z' },
    requests: 115,
  };
  const n = normalizeUsage(raw);
  assert.equal(n.status, 'active');
  assert.equal(n.usage.tokens, 353672);
  assert.equal(n.usage.limit, 15000000);
  assert.equal(n.usage.percentage, 2);
  assert.equal(n.requests, 115);
  assert.equal(n.modelCount, 2);
  assert.equal(n.subscription.packageName, 'Monthly | 15M Tokens');
  // no raw model list leaked
  assert.equal(n.models, undefined);
  assert.equal(n.raw, undefined);
});

test('normalizeUsage tolerates missing fields', () => {
  const n = normalizeUsage({});
  assert.equal(n.status, null);
  assert.equal(n.usage.tokens, 0);
  assert.equal(n.usage.limit, null);
  assert.equal(n.requests, 0);
  assert.equal(n.modelCount, 0);
});
