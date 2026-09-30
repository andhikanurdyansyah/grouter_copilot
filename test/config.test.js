import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeConfig, DEFAULT_MODEL, DEFAULT_SYSTEM_PROMPT } from '../src/config.js';

test('normalizeConfig applies defaults', () => {
  const c = normalizeConfig({});
  assert.equal(c.model, DEFAULT_MODEL);
  assert.equal(c.systemPrompt, DEFAULT_SYSTEM_PROMPT);
  assert.deepEqual(c.skills, []);
  assert.equal(c.limits.maxRows, 500);
  assert.equal(c.limits.maxContextBytes, 32000);
});

test('normalizeConfig preserves provided values', () => {
  const c = normalizeConfig({ model: 'x', limits: { maxRows: 3 } });
  assert.equal(c.model, 'x');
  assert.equal(c.limits.maxRows, 3);
  assert.equal(c.limits.maxContextBytes, 32000);
});
