import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ADAPTER_CONTRACT_VERSION,
  CHAT_PROTOCOL_VERSION,
  SKILL_CONTRACT_VERSION,
} from '../src/index.js';

test('public contract versions are semver and remain aligned at v1', () => {
  for (const version of [CHAT_PROTOCOL_VERSION, SKILL_CONTRACT_VERSION, ADAPTER_CONTRACT_VERSION]) {
    assert.match(version, /^1\.0\.0$/);
  }
});

test('chat response and stream expose stable protocol fields', async () => {
  const { CopilotRuntime } = await import('../src/runtime/chat.js');
  const { normalizeConfig } = await import('../src/config.js');
  const runtime = new CopilotRuntime({
    config: normalizeConfig({
      skills: [{
        name: 'status',
        description: 'Show status',
        parameters: { type: 'object', properties: {}, required: [] },
        readOnly: true,
        async run() { return { data: { ok: true }, sources: [{ label: 'system' }] }; },
      }],
    }),
    adapter: {
      async complete() { return { answer: 'ok', usage: { inputTokens: 1, outputTokens: 1 } }; },
      async *stream() {
        yield { type: 'delta', text: 'ok' };
        yield { type: 'done', usage: { inputTokens: 1, outputTokens: 1 } };
      },
    },
  });
  const result = await runtime.chat({ message: 'status' });
  assert.deepEqual(Object.keys(result).sort(), ['answer', 'requestId', 'skill', 'sources', 'status', 'usage'].sort());
  assert.equal(result.status, 'complete');

  const events = [];
  for await (const event of runtime.streamChat({ message: 'status' })) events.push(event);
  assert.equal(events[0].type, 'run.started');
  assert.equal(events.at(-1).type, 'run.completed');
  assert.ok(events.some((event) => event.type === 'source.added'));
});
