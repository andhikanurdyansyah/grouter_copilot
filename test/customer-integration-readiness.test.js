import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readiness = readFileSync(path.join(root, 'docs/36-customer-integration-readiness.md'), 'utf8');
const installer = readFileSync(path.join(root, 'bin/grouter-copilot.js'), 'utf8');
const healthSource = readFileSync(path.join(root, 'src/health.js'), 'utf8');
const healthRouteTemplate = readFileSync(path.join(root, 'bin/grouter-copilot.js'), 'utf8');

 test('customer readiness guide stays anchored to the shipped integration contract', () => {
  for (const required of [
    '@grouter/copilot',
    'npm install @grouter/copilot',
    'npm install ./grouter-copilot-0.1.0.tgz',
    'npx grouter-copilot install',
    'POST /api/resolve',
    '`baseUrl` and `licensePublicKey`',
    'GET /api/copilot/health',
    'POST /api/copilot/chat',
    'GROUTER_LICENSE',
    'GROUTER_GATEWAY_URL',
    'GROUTER_LICENSE_PUBLIC_KEY',
    'Never expose',
    'read-only',
    'npm test',
  ]) {
    assert.match(readiness, new RegExp(required.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')), `readiness guide missing ${required}`);
  }
  assert.match(installer, /new URL\('\/api\/resolve', licenseServerUrl\)/);
  assert.match(installer, /licenseServerUrl.*GROUTER_LICENSE_SERVER.*https:\/\/copilot\.grouter\.id/);
  assert.match(installer, /licenseServerUrl,\n\s+licensePublicKey:/);
  assert.match(healthSource, /provider:[\s\S]*Boolean\(gatewayUrl[\s\S]*GROUTER_LICENSE_SERVER/);
  assert.match(healthSource, /configured|configuration/i);
  assert.doesNotMatch(healthSource, /fetch\(|https?:\/\//, 'health must not probe provider reachability');
  assert.match(healthRouteTemplate, /status: "unavailable"/);
});

 test('readiness guide describes the health response shape that the source actually returns', () => {
  assert.match(readiness, /health response is ready only when all three checks are true/i);
  assert.match(readiness, /An unavailable host returns HTTP 503/i);
  assert.match(readiness, /may return only\s+`\{"status":"unavailable"\}`/);
  assert.match(readiness, /returned checks \*\*when the response includes\s+them\*\*/i);
});

 test('readiness guide explicitly distinguishes host health from provider usage', () => {
  assert.match(readiness, /host-local readiness/i);
  assert.match(readiness, /infrastructure usage for the\s+single service credential/i);
  assert.match(readiness, /not.*per-customer/i);
});
