import test from 'node:test';
import assert from 'node:assert/strict';

import { SkillRegistry } from '../src/skills/registry.js';
import { CopilotError } from '../src/adapter/errors.js';

function makeSkills() {
  return [
    {
      name: 'sales-summary',
      description: 'Summarize total sales in a period',
      intent: {
        phrases: ['ringkasan penjualan', 'sales overview'],
        synonyms: ['omzet', 'revenue'],
      },
      parameters: {
        type: 'object',
        properties: { period: { type: 'string', enum: ['7d', '30d'] } },
        required: ['period'],
      },
      readOnly: true,
      async run({ period, user }) {
        return { period, total: 123, user: user?.id ?? null };
      },
    },
    {
      name: 'list-customers',
      description: 'List active customers',
      parameters: { type: 'object', properties: {}, required: [] },
      readOnly: true,
      async run() {
        return [{ id: 1, name: 'Acme' }];
      },
    },
  ];
}

test('register + resolve by explicit hint', () => {
  const reg = new SkillRegistry({ skills: makeSkills() });
  assert.equal(reg.resolve('sales-summary', ''), 'sales-summary');
});

test('resolve by keyword in message', () => {
  const reg = new SkillRegistry({ skills: makeSkills() });
  assert.equal(reg.resolve(null, 'ringkas total sales minggu ini'), 'sales-summary');
  assert.equal(reg.resolve(null, 'daftar customer aktif'), 'list-customers');
});

test('resolve by registered natural-language phrases and synonyms', () => {
  const reg = new SkillRegistry({ skills: makeSkills() });
  assert.equal(reg.resolve(null, 'tolong buat ringkasan penjualan'), 'sales-summary');
  assert.equal(reg.resolve(null, 'show me the revenue overview'), 'sales-summary');
});

test('intent metadata cannot route an unknown hint or mutate skill boundaries', async () => {
  const reg = new SkillRegistry({ skills: [{
    name: 'delete-order',
    description: 'Delete an order',
    intent: { synonyms: ['hapus pesanan', 'cancel order'] },
    parameters: { type: 'object', properties: {}, required: [] },
    readOnly: false,
    async run() { throw new Error('must not run'); },
  }] });
  assert.equal(reg.resolve('not-registered', 'hapus pesanan'), 'delete-order');
  await assert.rejects(() => reg.run('delete-order', {}), (err) => err.code === 'SCOPE_DENIED');
});

test('phrase matching is boundary-safe and ties remain unresolved', () => {
  const reg = new SkillRegistry({ skills: [
    { name: 'alpha', description: 'Alpha data', intent: { synonyms: ['report'] }, parameters: {}, readOnly: true, async run() {} },
    { name: 'beta', description: 'Beta data', intent: { synonyms: ['report'] }, parameters: {}, readOnly: true, async run() {} },
  ] });
  assert.equal(reg.resolve(null, 'report'), null);
  assert.equal(reg.resolve(null, 'reporting'), null);
});

test('intent matching is Unicode-safe, whitespace-normalized, bounded, and deduplicated', () => {
  const reg = new SkillRegistry({ skills: [
    {
      name: 'rapport', description: 'Read rapport',
      metadata: { intent: { phrases: ['  résumé   ventes  ', 'résumé ventes'], synonyms: ['売上'] } },
      parameters: {}, readOnly: true, async run() {},
    },
    {
      name: 'fallback', description: 'Read fallback', metadata: { phrases: ['résumé ventes'] },
      parameters: {}, readOnly: true, async run() {},
    },
  ] });
  assert.equal(reg.resolve(null, 'RÉSUMÉ\u00a0\u00a0ventes'), 'rapport');
  assert.equal(reg.resolve(null, '売上'), 'rapport');
  assert.equal(reg.resolve(null, 'rapporteur'), null);
});

test('arbitrary metadata does not contribute intent matches', () => {
  const reg = new SkillRegistry({ skills: [{
    name: 'orders', description: 'List orders', metadata: { synonyms: ['secret phrase'] },
    parameters: {}, readOnly: true, async run() {},
  }] });
  assert.equal(reg.resolve(null, 'secret phrase'), null);
});
test('run executes skill and injects user', async () => {
  const reg = new SkillRegistry({ skills: makeSkills() });
  const out = await reg.run('sales-summary', { period: '7d' }, { user: { id: 'u42' } });
  assert.equal(out.data.total, 123);
  assert.equal(out.data.user, 'u42');
});

test('run rejects invalid args', async () => {
  const reg = new SkillRegistry({ skills: makeSkills() });
  await assert.rejects(() => reg.run('sales-summary', { period: '99d' }), (err) => {
    assert.ok(err instanceof CopilotError);
    assert.equal(err.code, 'SKILL_INVALID_ARGS');
    return true;
  });
});

test('run rejects mutating (readOnly !== true) skills', async () => {
  const reg = new SkillRegistry({
    skills: [
      {
        name: 'delete-order',
        description: 'Delete an order',
        parameters: { type: 'object', properties: {}, required: [] },
        readOnly: false,
        async run() {},
      },
    ],
  });
  await assert.rejects(() => reg.run('delete-order', {}), (err) => {
    assert.equal(err.code, 'SCOPE_DENIED');
    return true;
  });
});

test('run rejects unknown skill', async () => {
  const reg = new SkillRegistry({ skills: makeSkills() });
  await assert.rejects(() => reg.run('nope', {}), (err) => err.code === 'SKILL_NOT_FOUND');
});

test('invalid skill is excluded, not fatal', () => {
  const reg = new SkillRegistry({ skills: [...makeSkills(), { name: 'broken' }] });
  assert.equal(reg.has('broken'), false);
  assert.equal(reg.invalid.length, 1);
});
