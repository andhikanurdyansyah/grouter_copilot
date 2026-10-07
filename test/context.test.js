import test from 'node:test';
import assert from 'node:assert/strict';

import { buildContext, redact } from '../src/runtime/context.js';

test('buildContext produces system + user messages with data', () => {
  const { messages, truncated } = buildContext({
    systemPrompt: 'sys',
    data: { total: 5 },
    question: 'how much?',
    limits: {},
  });
  assert.equal(messages.length, 2);
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[1].role, 'user');
  assert.match(messages[1].content, /how much\?/);
  assert.match(messages[1].content, /"total":5/);
  assert.equal(truncated, false);
});

test('buildContext truncates rows over maxRows', () => {
  const data = Array.from({ length: 100 }, (_, i) => ({ i }));
  const { messages, truncated } = buildContext({
    systemPrompt: 'sys',
    data,
    question: 'q',
    limits: { maxRows: 5 },
  });
  assert.equal(truncated, true);
  const parsed = JSON.parse(messages[1].content.match(/Data:\n(\[[\s\S]*\])\n?/)[1]);
  assert.equal(parsed.length, 5);
});

test('buildContext enforces maxContextBytes, not only marks partial', () => {
  const out = buildContext({
    systemPrompt: 's',
    data: Array.from({ length: 10 }, (_, i) => ({ id: i, note: 'x'.repeat(40) })),
    question: 'q',
    limits: { maxRows: 10, maxContextBytes: 180 },
  });
  assert.equal(out.truncated, true);
  assert.ok(out.bytes <= 180, `context exceeded byte limit: ${out.bytes}`);
});
test('buildContext fails closed when maxContextBytes cannot fit the envelope', () => {
  assert.throws(() => buildContext({
    systemPrompt: 'system',
    data: [],
    question: 'question',
    limits: { maxContextBytes: 1 },
  }), /maxContextBytes is too small/);
});
test('redact strips known secret keys and sk- tokens', () => {
  const out = redact({ apiKey: '«reda...…»', password: 'hunter2', name: 'bob' });
  assert.equal(out.apiKey, '[REDACTED]');
  assert.equal(out.password, '[REDACTED]');
  assert.equal(out.name, 'bob');
});

test('redact strips sk- tokens inside nested strings', () => {
  const out = redact({ note: 'use sk-abcdefgh1234 here', nested: { token: 'sk-zzz' } });
  assert.equal(out.note, 'use [REDACTED] here');
  assert.equal(out.nested.token, '[REDACTED]');
});

test('redact strips gRouter provider keys but keeps the product name', () => {
  const out = redact({ note: 'bound key gRouter-abc123 here', ref: 'gRouter-copilot init', nested: { grouterApiKey: 'gRouter-x9y8z7w6' } });
  assert.equal(out.note, 'bound key [REDACTED] here');
  assert.equal(out.ref, 'gRouter-copilot init');
  assert.equal(out.nested.grouterApiKey, '[REDACTED]');
});

test('buildContext never ships a gRouter provider key to the model', () => {
  const { messages } = buildContext({
    systemPrompt: 's',
    data: [{ note: 'key gRouter-abc12345' }],
    question: 'q',
    limits: { maxRows: 10, maxContextBytes: 2000 },
  });
  assert.doesNotMatch(JSON.stringify(messages), /gRouter-abc12345/);
});
