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
    this.lastCompleteMessages = messages;
    const last = messages[messages.length - 1].content;
    return { answer: `answered:${last.slice(0, 20)}`, usage: { inputTokens: 1, outputTokens: 2 } };
  }
  async *stream({ messages }) {
    this.lastStreamMessages = messages;
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

test('runtime.streamChat answers general (no-skill) questions instead of failing', async () => {
  const runtime = makeRuntime([salesSkill, customersSkill]);
  const events = [];
  // Free-form question that matches neither skill's description tokens:
  // policy-compliant general mode — streamed answer, no SKILL_NOT_FOUND.
  for await (const e of runtime.streamChat({ message: 'xyzzy', userId: 'u1' })) {
    events.push(e);
  }
  const types = events.map((e) => e.type);
  assert.ok(types.includes('answer.delta'), 'general mode must stream an answer');
  assert.ok(types.includes('run.completed'), 'general mode must complete');
  assert.ok(!types.includes('run.failed'), 'no-skill must not fail when skills exist');
  const completed = events.find((e) => e.type === 'run.completed');
  assert.equal(completed.mode, 'general');
  assert.equal(completed.skill, null);
});

test('runtime.streamChat includes bounded history in general mode', async () => {
  const runtime = makeRuntime([salesSkill]);
  const history = [{ role: 'user', content: 'previous question' }];
  const events = [];
  for await (const e of runtime.streamChat({ message: 'xyzzy', history })) events.push(e);
  const messages = runtime.adapter.lastStreamMessages;
  assert.equal(messages[1].content, 'previous question');
  assert.equal(events.at(-1).status, 'complete');
});
test('runtime.chat free-form question gets a general answer (template-only removal)', async () => {
  const runtime = makeRuntime([salesSkill, customersSkill]);
  const out = await runtime.chat({ message: 'What can you help me with?', userId: 'u1' });
  assert.equal(out.status, 'complete');
  assert.equal(out.mode, 'general');
  assert.equal(out.skill, null);
  assert.match(out.answer, /answered:/);
  // Honest context: the general prompt must not pretend host data is attached.
  assert.equal(out.sources.length, 0);
});

test('runtime.chat with zero skills still supports general conversation', async () => {
  const runtime = makeRuntime([]);
  const out = await runtime.chat({ message: 'brainstorm names for a coffee shop', userId: 'u1' });
  assert.equal(out.status, 'complete');
  assert.equal(out.mode, 'general');
  assert.equal(out.skill, null);
  assert.deepEqual(out.sources, []);
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

test('unknown adapter failure becomes INTERNAL_ERROR without internals', async () => {
  const runtime = new CopilotRuntime({
    config: normalizeConfig({ skills: [customersSkill] }),
    adapter: { async complete() { throw new Error('connect ECONNREFUSED 127.0.0.1:5432'); } },
  });
  const out = await runtime.chat({ message: 'list customers', userId: 'u1' });
  assert.equal(out.status, 'error');
  assert.equal(out.code, 'INTERNAL_ERROR');
  assert.equal(out.message, 'An unexpected error occurred.');
  assert.doesNotMatch(JSON.stringify(out), /ECONNREFUSED/);
});

test('unknown stream failure yields a safe run.failed envelope', async () => {
  // streamChat requires .complete() to exist only after skill resolution — a
  // stream-only adapter is enough here because the failure happens inside stream().
  const runtime = new CopilotRuntime({
    config: normalizeConfig({ skills: [customersSkill] }),
    adapter: { async *stream() { throw new Error('socket hang up'); } },
  });
  const events = [];
  for await (const e of runtime.streamChat({ message: 'list customers', userId: 'u1' })) {
    events.push(e);
  }
  const failed = events.find((e) => e.type === 'run.failed');
  assert.ok(failed);
  assert.equal(failed.code, 'INTERNAL_ERROR');
  assert.doesNotMatch(JSON.stringify(events), /socket hang up/);
});

test('skill failure surfaces SKILL_FAILED without the underlying error text', async () => {
  const broken = {
    name: 'broken-skill',
    description: 'A skill that fails',
    parameters: { type: 'object', properties: {}, required: [] },
    readOnly: true,
    async run() { throw new Error('db down'); },
  };
  const runtime = makeRuntime([broken]);
  const out = await runtime.chat({ message: 'broken skill', userId: 'u1' });
  assert.equal(out.status, 'error');
  assert.equal(out.code, 'SKILL_FAILED');
  assert.doesNotMatch(JSON.stringify(out), /db down/);
});
