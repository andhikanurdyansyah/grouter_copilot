import test from 'node:test';
import assert from 'node:assert/strict';

import { createCopilotServer } from '../src/server.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

function startServer() {
  const dir = mkdtempSync(path.join(tmpdir(), 'copilot-account-'));
  const dataFile = path.join(dir, 'store.json');
  const { server, store } = createCopilotServer({ dataFile });
  return new Promise((resolve) => {
    server.listen(0, () => {
      resolve({ baseUrl: `http://127.0.0.1:${server.address().port}`, server, store });
    });
  });
}

test('store supports accounts + licensesByAccount (D-017)', async () => {
  const { server, store } = await startServer();
  try {
    const acct = store.addAccount({ id: 'acc_1', name: 'Acme', email: 'a@acme.com', createdAt: Date.now() });
    assert.equal(store.getAccount('acc_1').email, 'a@acme.com');
    assert.equal(store.getAccountByEmail('a@acme.com').id, 'acc_1');

    // licenses bound to different accounts
    store.addLicense({ id: 'lic_1', accountId: 'acc_1', customer: 'CRM', features: ['core'], createdAt: Date.now(), expiresAt: null, revokedAt: null, installIds: [], grouterApiKey: null });
    store.addLicense({ id: 'lic_2', accountId: 'acc_2', customer: 'POS', features: ['core'], createdAt: Date.now(), expiresAt: null, revokedAt: null, installIds: [], grouterApiKey: null });

    assert.equal(store.licensesByAccount('acc_1').length, 1);
    assert.equal(store.licensesByAccount('acc_1')[0].id, 'lic_1');
    assert.equal(store.licensesByAccount('acc_2').length, 1);
  } finally {
    server.close();
  }
});

test('issue accepts accountId and sanitizeLicense includes it (no secret leak)', async () => {
  const { baseUrl, server } = await startServer();
  try {
    const res = await fetch(`${baseUrl}/api/licenses`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ customer: 'CRM', accountId: 'acc_1', grouterApiKey: 'gRouter-secret' }),
    });
    const data = await res.json();
    assert.equal(data.license.accountId, 'acc_1');
    assert.equal(data.license.grouterApiKey, undefined); // secret never leaks
  } finally {
    server.close();
  }
});
