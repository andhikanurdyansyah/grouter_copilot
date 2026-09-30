import test from 'node:test';
import assert from 'node:assert/strict';

import { GrouterAdapter, FakeSupplier } from '../src/adapter/grouter.js';
import { CopilotError } from '../src/adapter/errors.js';

test('adapter.complete works with FakeSupplier', async () => {
  const adapter = new GrouterAdapter({ apiKey: 'test-key', fetchImpl: new FakeSupplier().fetch.bind(new FakeSupplier()) });
  const { answer, usage } = await adapter.complete({
    model: 'grouter-default',
    messages: [{ role: 'user', content: 'hello' }],
  });
  assert.match(answer, /hello/);
  assert.equal(usage.inputTokens, 5);
});

test('adapter.stream yields deltas and done', async () => {
  const fake = new FakeSupplier();
  const adapter = new GrouterAdapter({ apiKey: 'test-key', fetchImpl: fake.fetch.bind(fake) });
  const events = [];
  for await (const evt of adapter.stream({
    model: 'm',
    messages: [{ role: 'user', content: 'hello there' }],
  })) {
    events.push(evt);
  }
  const deltas = events.filter((e) => e.type === 'delta').map((e) => e.text).join('');
  assert.match(deltas, /hello there/);
  assert.ok(events.some((e) => e.type === 'done'));
});

test('adapter.complete throws NOT_CONFIGURED without key', async () => {
  const adapter = new GrouterAdapter({ apiKey: null, fetchImpl: () => {} });
  await assert.rejects(() => adapter.complete({ model: 'm', messages: [{ role: 'user', content: 'x' }] }), (e) => {
    assert.ok(e instanceof CopilotError);
    assert.equal(e.code, 'NOT_CONFIGURED');
    return true;
  });
});

test('adapter.complete surfaces upstream error as UPSTREAM_UNAVAILABLE', async () => {
  const failingFetch = async () => new Response('err', { status: 503 });
  const adapter = new GrouterAdapter({ apiKey: 'k', fetchImpl: failingFetch });
  await assert.rejects(() => adapter.complete({ model: 'm', messages: [{ role: 'user', content: 'x' }] }), (e) => {
    assert.equal(e.code, 'UPSTREAM_UNAVAILABLE');
    assert.equal(e.retryable, true);
    return true;
  });
});
