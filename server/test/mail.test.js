import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, validateSettings, resolveSettings } from '../src/settings.js';
import { createMailer, buildPaymentReceivedEmail, buildLicenseExpiringEmail, buildPasswordResetEmail } from '../src/mail.js';

test('settings: notifications defaults documented', () => {
  assert.deepEqual(DEFAULT_SETTINGS.notifications, {
    schedulerIntervalMs: 900000,
    quotaThresholdPercent: 90,
    expiringSoonDays: 7,
    email: { enabled: true, paymentReceived: true, licenseIssued: true, licenseExpiring: true, passwordReset: true },
  });
  const eff = resolveSettings({}, {});
  assert.equal(eff.notifications.quotaThresholdPercent, 90);
  assert.equal(eff.notifications.expiringSoonDays, 7);
});

test('settings: validate notifications accepts valid and rejects invalid', () => {
  assert.doesNotThrow(() => validateSettings({ notifications: { schedulerIntervalMs: 60000, quotaThresholdPercent: 80, expiringSoonDays: 14, email: { enabled: false, paymentReceived: true } } }));
  assert.throws(() => validateSettings({ notifications: { quotaThresholdPercent: 0 } }), /quotaThresholdPercent/);
  assert.throws(() => validateSettings({ notifications: { quotaThresholdPercent: 101 } }), /quotaThresholdPercent/);
  assert.throws(() => validateSettings({ notifications: { quotaThresholdPercent: 90.5 } }), /quotaThresholdPercent/);
  assert.throws(() => validateSettings({ notifications: { expiringSoonDays: 0 } }), /expiringSoonDays/);
  assert.throws(() => validateSettings({ notifications: { expiringSoonDays: 31 } }), /expiringSoonDays/);
  assert.throws(() => validateSettings({ notifications: { schedulerIntervalMs: 0 } }), /schedulerIntervalMs/);
  assert.throws(() => validateSettings({ notifications: { schedulerIntervalMs: -5 } }), /schedulerIntervalMs/);
  assert.throws(() => validateSettings({ notifications: { email: { enabled: 'yes' } } }), /email\.enabled/);
  assert.throws(() => validateSettings({ notifications: { email: { paymentReceived: 1 } } }), /paymentReceived/);
  assert.throws(() => validateSettings({ notifications: 'nope' }), /notifications must be an object/);
  assert.throws(() => validateSettings({ notifications: { email: 'nope' } }), /notifications\.email must be an object/);
  assert.throws(() => validateSettings({ unknownSection: {} }), /Unknown settings section/);
});

function settingsGetter(notifOverrides = {}) {
  return () => {
    const eff = resolveSettings({}, {});
    return { ...eff, notifications: { ...eff.notifications, ...notifOverrides, email: { ...eff.notifications.email, ...(notifOverrides.email || {}) } } };
  };
}

test('mail: log_only when no BREVO_API_KEY, returns no secret, calls no fetch', async () => {
  let fetchCalls = 0;
  const mailer = createMailer({ fetchImpl: async () => { fetchCalls++; return new Response('{}', { status: 200 }); }, env: {}, settingsGetter: settingsGetter() });
  const res = await mailer.send({ to: 'user@gmail.com', subject: 'Hi', html: '<p>x</p>', text: 'x', kind: 'paymentReceived' });
  assert.equal(res.status, 'log_only');
  assert.equal(fetchCalls, 0);
  assert.ok(!JSON.stringify(res).includes('user@gmail.com'));
});

test('mail: disabled when email.enabled false', async () => {
  let fetchCalls = 0;
  const mailer = createMailer({ fetchImpl: async () => { fetchCalls++; return new Response(JSON.stringify({messageId:'<e1@brevo>'}), { status: 201 }); }, env: { BREVO_API_KEY: 'xkeysib-testkey', MAIL_FROM: 'Test <t@example.com>' }, settingsGetter: settingsGetter({ email: { enabled: false } }) });
  const res = await mailer.send({ to: 'user@gmail.com', subject: 'Hi', html: '<p>x</p>', text: 'x', kind: 'paymentReceived' });
  assert.equal(res.status, 'disabled');
  assert.equal(fetchCalls, 0);
});

test('mail: disabled per-kind when kind toggle false', async () => {
  let fetchCalls = 0;
  const mailer = createMailer({ fetchImpl: async () => { fetchCalls++; return new Response(JSON.stringify({messageId:'<e1@brevo>'}), { status: 201 }); }, env: { BREVO_API_KEY: 'xkeysib-testkey' }, settingsGetter: settingsGetter({ email: { paymentReceived: false } }) });
  const res = await mailer.send({ to: 'user@gmail.com', subject: 'Hi', html: '<p>x</p>', text: 'x', kind: 'paymentReceived' });
  assert.equal(res.status, 'disabled');
  assert.equal(fetchCalls, 0);
  // other kind still allowed
  const res2 = await mailer.send({ to: 'user@gmail.com', subject: 'Hi', html: '<p>x</p>', text: 'x', kind: 'licenseExpiring' });
  assert.equal(res2.status, 'sent');
  assert.equal(fetchCalls, 1);
});

test('mail: sent with fake fetch, providerId captured, payload uses Brevo endpoint and safe from fallback', async () => {
  let seen = null;
  const mailer = createMailer({ fetchImpl: async (url, opts) => { seen = { url, opts }; return new Response(JSON.stringify({ messageId: '<email_123@brevo>' }), { status: 201, headers: { 'content-type': 'application/json' } }); }, env: { BREVO_API_KEY: 'xkeysib-testkey' }, settingsGetter: settingsGetter() });
  const res = await mailer.send({ to: 'user@gmail.com', subject: 'Payment', html: '<p>paid</p>', text: 'paid', kind: 'paymentReceived' });
  assert.equal(res.status, 'sent');
  assert.equal(res.providerId, '<email_123@brevo>');
  assert.equal(seen.url, 'https://api.brevo.com/v3/smtp/email');
  const payload = JSON.parse(seen.opts.body);
  assert.deepEqual(payload.sender, { name: 'gRouter Copilot', email: 'copilot@grouter.id' });
  assert.deepEqual(payload.to, [{ email: 'user@gmail.com' }]);
  assert.equal(payload.subject, 'Payment');
  assert.equal(payload.htmlContent, '<p>paid</p>');
  assert.equal(payload.textContent, 'paid');
  assert.equal(seen.opts.headers['api-key'], 'xkeysib-testkey');
  assert.equal(seen.opts.headers.authorization, undefined);
  // return value must not leak key or body
  assert.ok(!JSON.stringify(res).includes('xkeysib-testkey'));
  assert.ok(!JSON.stringify(res).includes('paid'));
});

test('mail: failed on non-ok fetch and on throw, error sanitized short, no secret leak', async () => {
  const mailer = createMailer({ fetchImpl: async () => new Response(JSON.stringify({ message: 'bad ' + 'x'.repeat(500) }), { status: 500 }), env: { BREVO_API_KEY: 'xkeysib-testkey' }, settingsGetter: settingsGetter() });
  const res = await mailer.send({ to: 'user@gmail.com', subject: 'Hi', html: '<p>x</p>', text: 'x', kind: 'paymentReceived' });
  assert.equal(res.status, 'failed');
  assert.ok(res.error && res.error.length <= 200, `error too long: ${res.error?.length}`);
  assert.ok(!JSON.stringify(res).includes('xkeysib-testkey'));
  const mailer2 = createMailer({ fetchImpl: async () => { throw new Error('network down xkeysib-testkey should not leak'); }, env: { BREVO_API_KEY: 'xkeysib-testkey' }, settingsGetter: settingsGetter() });
  const res2 = await mailer2.send({ to: 'user@gmail.com', subject: 'Hi', html: '<p>x</p>', text: 'x', kind: 'licenseExpiring' });
  assert.equal(res2.status, 'failed');
  assert.ok(!JSON.stringify(res2).includes('xkeysib-testkey'), 'error must be sanitized of key');
});

test('mail: password reset template contains URL only in payload, mailer return never contains it', async () => {
  const url = 'https://copilot.grouter.id/reset-password?token=SECRETTOKEN123';
  const tpl = buildPasswordResetEmail({ url });
  assert.ok(tpl.html.includes(url));
  assert.ok(tpl.text.includes(url));
  assert.ok(tpl.subject.length > 0);
  // log_only mailer with reset: return must not contain token/url
  const mailer = createMailer({ fetchImpl: async () => new Response('{}', {status:200}), env: {}, settingsGetter: settingsGetter() });
  const res = await mailer.send({ to: 'user@gmail.com', ...tpl, kind: 'passwordReset' });
  assert.equal(res.status, 'log_only');
  assert.ok(!JSON.stringify(res).includes('SECRETTOKEN123'));
  assert.ok(!JSON.stringify(res).includes(url));
});

test('mail: templates payment+license and expiring H-7/H-1', () => {
  const p = buildPaymentReceivedEmail({ orderId: 'ord_1234567890abcdef', licenseId: 'lic_1234567890abcdef', planName: 'Pro' });
  assert.ok(p.subject.length > 0 && p.html.includes('ord_1234') || p.text.includes('ord_1234'));
  const e7 = buildLicenseExpiringEmail({ licenseId: 'lic_1234567890abcdef', expiresAt: Date.now() + 7*86400000, daysLeft: 7 });
  assert.ok(/7/.test(e7.subject + e7.text));
  const e1 = buildLicenseExpiringEmail({ licenseId: 'lic_1234567890abcdef', expiresAt: Date.now() + 86400000, daysLeft: 1 });
  assert.ok(/1/.test(e1.subject + e1.text));
  assert.notEqual(e7.subject, e1.subject);
});
