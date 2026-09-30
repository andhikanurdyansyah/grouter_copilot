import test from 'node:test';
import assert from 'node:assert/strict';

import { CopilotRuntime } from '../src/runtime/chat.js';
import { FakeSupplier } from '../src/adapter/grouter.js';
import { normalizeConfig } from '../src/config.js';

const salesSkill = {
  name: 'sales-summary',
  description: 'Summarize total sales in a period',
  parameters: {
    type: 'object',
    properties: { period: { type: 'string', enum: ['7d', '30d'] } },
    required: ['period'],
  },
  readOnly: true,
  async run({ period, user }) {
    return { period, total: 999, user: user?.id ?? null };
  },
};

const customersSkill = {
  name: 'list-customers',
  description: 'List active customers',
  parameters: { type: 'object', properties: {}, required: [] },
  readOnly: true,
  async run() {
    return [{ id: 1, name: 'Acme' }];
  },
};

function makeRuntime(skills) {
  const config = normalizeConfig({ skills, model: 'grouter-default' });
  const adapter = new FakeSupplierAdapter();
  return new CopilotRuntime({ config, adapter });
}

// Adapter matching CopilotRuntime's expected `.complete()` and `.stream()`.
class FakeSupplierAdapter {
  async complete({ messages }) {
    const last = messages[messages.length - 1].content;
    return { answer: `answered:${last.slice(0, 20)}`, usage: { inputTokens: 1, outputTokens: 2 } };
  }
  async *stream() {
    yield { type: 'delta', text: 'hi' };
    yield { type: 'done', usage: { inputTokens: 1, outputTokens: 1 } };
  }
}

test('runtime.chat returns a complete answer with explicit args', async () => {
  const runtime = makeRuntime([salesSkill]);
  const out = await runtime.chat({ message: 'ringkas sales', userId: 'u1', args: { period: '7d' } });
  assert.equal(out.status, 'complete');
  assert.match(out.answer, /answered:/);
  assert.equal(out.skill, 'sales-summary');
});

test('runtime.chat returns skill error when args invalid', async () => {
  const runtime = makeRuntime([salesSkill]);
  const out = await runtime.chat({ message: 'ringkas sales', userId: 'u1', args: { period: '99d' } });
  assert.equal(out.status, 'error');
  assert.equal(out.code, 'SKILL_INVALID_ARGS');
});

test('runtime.chat rejects empty message', async () => {
  const runtime = makeRuntime([salesSkill]);
  const out = await runtime.chat({ message: '' });
  assert.equal(out.status, 'error');
  assert.equal(out.code, 'INVALID_REQUEST');
});

test('runtime.streamChat yields ordered events', async () => {
  const runtime = makeRuntime([customersSkill]);
  const events = [];
  for await (const e of runtime.streamChat({ message: 'list customers', userId: 'u1' })) {
    events.push(e);
  }
  const types = events.map((e) => e.type);
  assert.ok(types.includes('run.started'));
  assert.ok(types.includes('retrieval.status'));
  assert.ok(types.includes('answer.delta'));
  assert.ok(types.includes('run.completed'));
});

test('runtime.streamChat fails cleanly when no skill resolves (multi-skill ambiguous)', async () => {
  const runtime = makeRuntime([salesSkill, customersSkill]);
  const events = [];
  // message matches neither skill's description tokens
  for await (const e of runtime.streamChat({ message: 'xyzzy', userId: 'u1' })) {
    events.push(e);
  }
  const failed = events.find((e) => e.type === 'run.failed');
  assert.ok(failed);
  assert.equal(failed.code, 'SKILL_NOT_FOUND');
});

test('runtime.streamChat blocks mutating skill', async () => {
  const mutating = {
    name: 'delete-order',
    description: 'Delete an order',
    parameters: { type: 'object', properties: {}, required: [] },
    readOnly: false,
    async run() {},
  };
  const runtime = makeRuntime([mutating]);
  const events = [];
  for await (const e of runtime.streamChat({ message: 'delete order', userId: 'u1' })) {
    events.push(e);
  }
  const failed = events.find((e) => e.type === 'run.failed');
  assert.ok(failed);
  assert.equal(failed.code, 'SCOPE_DENIED');
});
