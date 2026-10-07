import test from 'node:test';
import assert from 'node:assert/strict';

import { CopilotRuntime } from '../src/runtime/chat.js';
import { LicenseGate } from '../src/license/gate.js';
import { generateKeyPair, mintLicense } from '../src/license/validate.js';
import { normalizeConfig } from '../src/config.js';

const skill = {
  name: 'sales-summary',
  description: 'Summarize sales',
  parameters: { type: 'object', properties: {}, required: [] },
  readOnly: true,
  async run() { return { total: 999 }; },
};

class NoopAdapter {
  async complete({ messages }) {
    return { answer: 'ok', usage: { inputTokens: 1, outputTokens: 1 } };
  }
}

class StreamAdapter {
  async complete({ messages }) {
    return { answer: 'ok', usage: { inputTokens: 1, outputTokens: 1 } };
  }
  async *stream() {
    yield { type: 'delta', text: 'hi' };
    yield { type: 'done', usage: { inputTokens: 1, outputTokens: 1 } };
  }
}

test('runtime refuses chat without a valid license when gate is set', async () => {
  const { publicKeyPem, privateKeyPem } = generateKeyPair();
  const gate = new LicenseGate({ publicKeyPem });
  const runtime = new CopilotRuntime({ config: normalizeConfig({ skills: [skill] }), adapter: new NoopAdapter(), licenseGate: gate });

  // no license env
  delete process.env.GROUTER_LICENSE;
  const out = await runtime.chat({ message: 'ringkas', userId: 'u1' });
  assert.equal(out.status, 'error');
  assert.equal(out.code, 'SCOPE_DENIED');
});

test('runtime serves chat with a valid license', async () => {
  const { publicKeyPem, privateKeyPem } = generateKeyPair();
  const token = mintLicense({ privateKeyPem, payload: { aud: 'grouter-copilot', features: ['core'] } });
  const gate = new LicenseGate({ publicKeyPem });
  const runtime = new CopilotRuntime({ config: normalizeConfig({ skills: [skill] }), adapter: new NoopAdapter(), licenseGate: gate });

  process.env.GROUTER_LICENSE = token;
  const out = await runtime.chat({ message: 'ringkas', userId: 'u1' });
  assert.equal(out.status, 'complete');
  delete process.env.GROUTER_LICENSE;
});

test('streamChat refuses to start without a valid license (fail before first event)', async () => {
  const { publicKeyPem } = generateKeyPair();
  const gate = new LicenseGate({ publicKeyPem });
  const runtime = new CopilotRuntime({ config: normalizeConfig({ skills: [skill] }), adapter: new StreamAdapter(), licenseGate: gate });

  delete process.env.GROUTER_LICENSE;
  const events = [];
  for await (const e of runtime.streamChat({ message: 'ringkas', userId: 'u1' })) {
    events.push(e);
  }
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'run.failed');
  assert.equal(events[0].code, 'SCOPE_DENIED');
});

test('streamChat streams with a valid license', async () => {
  const { publicKeyPem, privateKeyPem } = generateKeyPair();
  const token = mintLicense({ privateKeyPem, payload: { aud: 'grouter-copilot', features: ['core'] } });
  const gate = new LicenseGate({ publicKeyPem });
  const runtime = new CopilotRuntime({ config: normalizeConfig({ skills: [skill] }), adapter: new StreamAdapter(), licenseGate: gate });

  process.env.GROUTER_LICENSE = token;
  const events = [];
  for await (const e of runtime.streamChat({ message: 'ringkas', userId: 'u1' })) {
    events.push(e);
  }
  const types = events.map((e) => e.type);
  assert.ok(types.includes('run.started'));
  assert.ok(types.includes('answer.delta'));
  assert.ok(types.includes('run.completed'));
  delete process.env.GROUTER_LICENSE;
});
