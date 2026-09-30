import test from 'node:test';
import assert from 'node:assert/strict';

import { validateSkill, validateArgs } from '../src/skills/validator.js';

test('validateSkill accepts a valid read-only skill', () => {
  const skill = {
    name: 'sales-summary',
    description: 'Summarize sales',
    parameters: { type: 'object', properties: {}, required: [] },
    readOnly: true,
    async run() {},
  };
  const r = validateSkill(skill);
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
});

test('validateSkill rejects missing required fields', () => {
  const r = validateSkill({ name: 'x' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('description')));
  assert.ok(r.errors.some((e) => e.includes('parameters')));
  assert.ok(r.errors.some((e) => e.includes('readOnly')));
  assert.ok(r.errors.some((e) => e.includes('run')));
});

test('validateSkill rejects non-function run and non-boolean readOnly', () => {
  const skill = {
    name: 'x',
    description: 'd',
    parameters: { type: 'object' },
    readOnly: 'yes',
    run: 'not a function',
  };
  const r = validateSkill(skill);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('readOnly')));
  assert.ok(r.errors.some((e) => e.includes('run')));
});

test('validateArgs enforces required + enum + type', () => {
  const schema = {
    type: 'object',
    properties: { period: { type: 'string', enum: ['7d', '30d'] }, n: { type: 'integer' } },
    required: ['period'],
  };
  assert.equal(validateArgs(schema, {}).ok, false);
  assert.equal(validateArgs(schema, { period: '7d' }).ok, true);
  assert.equal(validateArgs(schema, { period: '99d' }).ok, false);
  assert.equal(validateArgs(schema, { period: '7d', n: 3.5 }).ok, false);
  assert.equal(validateArgs(schema, { period: '7d', n: 3 }).ok, true);
});
