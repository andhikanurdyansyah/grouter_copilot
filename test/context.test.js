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

test('redact strips known secret keys and sk- tokens', () => {
  const out = redact({ apiKey: 'sk-abc123456789', password: 'hunter2', name: 'bob' });
  assert.equal(out.apiKey, '[REDACTED]');
  assert.equal(out.password, '[REDACTED]');
  assert.equal(out.name, 'bob');
});

test('redact strips sk- tokens inside nested strings', () => {
  const out = redact({ note: 'use sk-abcdefgh1234 here', nested: { token: 'sk-zzz' } });
  assert.equal(out.note, 'use [REDACTED] here');
  assert.equal(out.nested.token, '[REDACTED]');
});
