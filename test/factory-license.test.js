import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createCopilot } from '../src/index.js';
import { generateKeyPair, mintLicense } from '../src/license/validate.js';

function makeTempProject() {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-factory-'));
  writeFileSync(path.join(dir, 'skill.mjs'), `export default { name: 'sales-summary', description: 'Summarize sales', parameters: { type: 'object', properties: {}, required: [] }, readOnly: true, async run() { return { total: 42 }; } };\n`);
  writeFileSync(path.join(dir, 'copilot.config.mjs'), "import skill from './skill.mjs'; export default { skills: [skill] };\n");
  return { dir, configPath: path.join(dir, 'copilot.config.mjs') };
}

test('createCopilot defaults to fail-closed license enforcement', async () => {
  const { dir, configPath } = makeTempProject();
  const previousLicense = process.env.GROUTER_LICENSE;
  delete process.env.GROUTER_LICENSE;
  try {
    const { runtime } = await createCopilot({
      configPath,
      adapter: { async complete() { return { answer: 'unexpected', usage: {} }; } },
    });
    const result = await runtime.chat({ message: 'summarize sales' });
    assert.equal(result.status, 'error');
    assert.equal(result.code, 'NOT_CONFIGURED');
  } finally {
    if (previousLicense === undefined) delete process.env.GROUTER_LICENSE;
    else process.env.GROUTER_LICENSE = previousLicense;
    rmSync(dir, { recursive: true, force: true });
  }
});

test('createCopilot default license gate accepts a valid signed license and fake adapter', async () => {
  const { dir, configPath } = makeTempProject();
  const previousLicense = process.env.GROUTER_LICENSE;
  const previousPublicKey = process.env.GROUTER_LICENSE_PUBLIC_KEY;
  const { publicKeyPem, privateKeyPem } = generateKeyPair();
  process.env.GROUTER_LICENSE = mintLicense({ privateKeyPem, payload: { aud: 'grouter-copilot', features: ['core'] } });
  process.env.GROUTER_LICENSE_PUBLIC_KEY = publicKeyPem;
  try {
    const { runtime } = await createCopilot({
      configPath,
      adapter: {
        async complete({ messages }) {
          assert.ok(messages.some((message) => message.role === 'user' && message.content.includes('42')));
          return { answer: 'Total sales is 42.', usage: { inputTokens: 1, outputTokens: 1 } };
        },
      },
    });
    const result = await runtime.chat({ message: 'summarize sales' });
    assert.equal(result.status, 'complete');
    assert.equal(result.answer, 'Total sales is 42.');
  } finally {
    if (previousLicense === undefined) delete process.env.GROUTER_LICENSE;
    else process.env.GROUTER_LICENSE = previousLicense;
    if (previousPublicKey === undefined) delete process.env.GROUTER_LICENSE_PUBLIC_KEY;
    else process.env.GROUTER_LICENSE_PUBLIC_KEY = previousPublicKey;
    rmSync(dir, { recursive: true, force: true });
  }
});
