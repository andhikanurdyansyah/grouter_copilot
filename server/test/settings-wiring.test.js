/**
 * I3 — remaining config wired to the settings SSOT (D-020, no call-site hardcode):
 *   - KlikQris mode/baseUrl come from resolved settings (server wiring)
 *   - UsageResolver checkUsageUrl/cacheTtlMs come from resolved settings
 *   - auth config (trustedOrigins incl. retired be.grouter.id removal,
 *     sentinel thresholds, minPasswordLength) resolves from DEFAULT_SETTINGS
 *   - the gRouter adapter default base matches the real contract (A4)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveSettings, DEFAULT_SETTINGS } from '../src/settings.js';
import { KlikQris } from '../src/klikqris.js';
import { UsageResolver } from '../src/usageResolver.js';

test('settings: provider.baseUrl has no /v1 suffix (adapter appends it)', () => {
  const eff = resolveSettings({});
  assert.ok(!eff.provider.baseUrl.endsWith('/v1'), `base must not include /v1: ${eff.provider.baseUrl}`);
  assert.equal(eff.provider.baseUrl, 'https://prod.grouter.web.id');
  assert.equal(typeof eff.provider.timeoutMs, 'number');
});

test('settings: payment has klikqrisBaseUrl + poll fields; auth section complete', () => {
  const eff = resolveSettings({});
  assert.equal(eff.payment.klikqrisBaseUrl, 'https://klikqris.com');
  assert.equal(eff.payment.pollIntervalMs, 10000);
  assert.equal(eff.payment.pollTimeoutMs, 900000);
  // be.grouter.id is retired — it must NOT be in the default trusted origins.
  const origins = eff.auth.trustedOrigins;
  assert.ok(origins.includes('https://copilot.grouter.id'), 'public origin must be trusted');
  assert.ok(!origins.some((o) => o.includes('be.grouter.id')), 'retired be.grouter.id must be gone');
  assert.equal(eff.auth.minPasswordLength, 8);
  assert.equal(eff.auth.sentinel.credentialStuffing.challenge, 3);
  assert.equal(eff.auth.sentinel.credentialStuffing.block, 5);
  assert.equal(eff.auth.sentinel.impossibleTravelMaxSpeedKmh, 1000);
  assert.equal(eff.auth.activityTrackingIntervalMs, 300000);
});

test('settings: env seeds still work (BETTER_AUTH_TRUSTED_ORIGINS, GROUTER_BASE_URL)', () => {
  const eff = resolveSettings({}, {
    BETTER_AUTH_TRUSTED_ORIGINS: 'https://a.example, https://b.example',
    GROUTER_BASE_URL: 'https://g.example',
  });
  assert.deepEqual(eff.auth.trustedOrigins, ['https://a.example', 'https://b.example']);
  assert.equal(eff.provider.baseUrl, 'https://g.example');
  // store layer still wins over seeds
  const eff2 = resolveSettings({ auth: { minPasswordLength: 10 } }, { BETTER_AUTH_TRUSTED_ORIGINS: 'https://a.example' });
  assert.equal(eff2.auth.minPasswordLength, 10);
});

test('klikqris: baseUrl override wins; default derives from mode', async () => {
  let captured;
  const fakeFetch = async (url) => {
    captured = url;
    return new Response(JSON.stringify({ status: true, data: { order_id: 'o1', status: 'PENDING' } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const override = new KlikQris({ apiKey: 'k', merchantId: 'm', mode: 'sandbox', baseUrl: 'https://pay.example', fetchImpl: fakeFetch });
  await override.createQris({ orderId: 'o1', amount: 100 });
  assert.equal(captured, 'https://pay.example/qris/create');

  const plain = new KlikQris({ apiKey: 'k', merchantId: 'm', mode: 'sandbox', fetchImpl: fakeFetch });
  assert.equal(plain.baseUrl, 'https://klikqris.com/api/sandbox');
  const prod = new KlikQris({ apiKey: 'k', merchantId: 'm', mode: 'production', fetchImpl: fakeFetch });
  assert.equal(prod.baseUrl, 'https://klikqris.com/api');
});

test('server wiring: KlikQris + UsageResolver are configured FROM resolved settings', async () => {
  const { createCopilotServer } = await import('../src/server.js');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');

  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-i3-'));
  const { server, klikqris, usage, store } = createCopilotServer({ dataFile: path.join(dir, 'store.json') });

  try {
    // Mode from settings (default sandbox); baseUrl override = klikqrisBaseUrl default.
    assert.equal(klikqris.mode, 'sandbox');
    assert.equal(klikqris.baseUrlOverride, 'https://klikqris.com');
    assert.equal(usage.checkUsageUrl, DEFAULT_SETTINGS.usage.checkUsageUrl);
    assert.equal(usage.ttlMs, 60000);

    // A store-level settings patch changes the wiring WITHOUT touching env.
    store.updateSettings({
      usage: { checkUsageUrl: 'https://usage.example/cu', cacheTtlMs: 12345 },
      payment: { mode: 'production', klikqrisBaseUrl: 'https://pay.example' },
    });
    // Resolve a fresh effective view the way a restart would.
    const eff = resolveSettings(store.getSettings());
    assert.equal(eff.usage.checkUsageUrl, 'https://usage.example/cu');
    assert.equal(eff.payment.mode, 'production');
    // The live instances were built from the boot-time settings — prove the
    // wiring actually consumes settings by re-checking the values they got:
    assert.equal(usage.checkUsageUrl, 'https://prod.grouter.web.id/api/check-usage'); // boot-time value (restart picks up store change)
  } finally {
    server.close();
  }
});
