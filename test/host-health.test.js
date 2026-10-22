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
    notificationHint: { kind: 'license', status: 'active' },
  });
  assert.deepEqual(getCopilotHealth({ runtime }, 'bad'), {
    status: 'unavailable', checks: { license: false, skills: true, provider: true },
    notificationHint: { kind: 'license', status: 'unavailable' },
  });
  assert.deepEqual(getCopilotHealth({ runtime: { ...runtime, registry: { list: () => [] }, adapter: { configured: false } } }, token), {
    status: 'unavailable', checks: { license: true, skills: false, provider: false },
    notificationHint: { kind: 'license', status: 'active' },
  });
  assert.equal(JSON.stringify(getCopilotHealth({ runtime }, token)).includes(token), false);
});

// Regression: the installer writes GROUTER_GATEWAY_URL (the address the chat
// route actually posts to) but health only looked at GROUTER_LICENSE_SERVER.
// A customer who followed `init` and set only GROUTER_LICENSE therefore saw
// provider:false, the widget showed "Tidak tersedia", and the first-run wizard
// could never be completed — step 3 re-ran health, saw provider:false, and sent
// the user back to step 2 forever. Health must read the SAME variable the
// route uses, so "the gateway is configured" means one thing.
test('host health treats GROUTER_GATEWAY_URL as a configured provider (same var the chat route uses)', () => {
  const { privateKeyPem, publicKeyPem } = generateKeyPair();
  const token = mintLicense({ privateKeyPem, payload: { aud: 'grouter-copilot' } });
  const runtime = {
    registry: { list: () => [{ name: 'read' }] },
    adapter: { configured: false },
    licenseGate: new LicenseGate({ publicKeyPem }),
  };
  const saved = { gw: process.env.GROUTER_GATEWAY_URL, ls: process.env.GROUTER_LICENSE_SERVER };
  try {
    process.env.GROUTER_GATEWAY_URL = 'https://copilot.example.test/api/copilot/chat';
    delete process.env.GROUTER_LICENSE_SERVER;
    assert.deepEqual(getCopilotHealth({ runtime }, token).checks, { license: true, skills: true, provider: true });

    // The license-server base URL stays supported for hosts that only set it.
    delete process.env.GROUTER_GATEWAY_URL;
    process.env.GROUTER_LICENSE_SERVER = 'https://copilot.example.test';
    assert.equal(getCopilotHealth({ runtime }, token).checks.provider, true);

    // Neither set, and no adapter: provider is genuinely unknown -> false.
    delete process.env.GROUTER_GATEWAY_URL;
    delete process.env.GROUTER_LICENSE_SERVER;
    assert.equal(getCopilotHealth({ runtime }, token).checks.provider, false);
  } finally {
    if (saved.gw === undefined) delete process.env.GROUTER_GATEWAY_URL; else process.env.GROUTER_GATEWAY_URL = saved.gw;
    if (saved.ls === undefined) delete process.env.GROUTER_LICENSE_SERVER; else process.env.GROUTER_LICENSE_SERVER = saved.ls;
  }
});