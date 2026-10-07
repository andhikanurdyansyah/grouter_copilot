import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, mintLicense, LicenseGate } from '../src/index.js';
import { getCopilotHealth } from '../src/health.js';

test('host health checks the runtime license, registered skills and provider without exposing secrets', () => {
  const { privateKeyPem, publicKeyPem } = generateKeyPair();
  const token = mintLicense({ privateKeyPem, payload: { aud: 'grouter-copilot' } });
  const runtime = {
    registry: { list: () => [{ name: 'read' }] },
    adapter: { configured: true },
    licenseGate: new LicenseGate({ publicKeyPem }),
  };
  assert.deepEqual(getCopilotHealth({ runtime }, token), {
    status: 'ok', checks: { license: true, skills: true, provider: true },
  });
  assert.deepEqual(getCopilotHealth({ runtime }, 'bad'), {
    status: 'unavailable', checks: { license: false, skills: true, provider: true },
  });
  assert.deepEqual(getCopilotHealth({ runtime: { ...runtime, registry: { list: () => [] }, adapter: { configured: false } } }, token), {
    status: 'unavailable', checks: { license: true, skills: false, provider: false },
  });
  assert.equal(JSON.stringify(getCopilotHealth({ runtime }, token)).includes(token), false);
});