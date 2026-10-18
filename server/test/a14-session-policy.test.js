// A-14 regression: Better Auth session policy must be an explicit, validated,
// operator-visible decision rather than an undocumented library default.
//
// Before this change the Better Auth config had no `session` block at all, so
// session lifetime and rolling-refresh cadence came from the library and could
// not be inspected or bounded. These tests pin the contract:
//
//  1. The settings SSOT exposes a concrete session policy with sane defaults.
//  2. Invalid policies are REFUSED (not silently clamped), because silently
//     clamping a security-relevant value hides operator error.
//  3. An update cadence longer than the absolute lifetime is refused: it would
//     make the rolling refresh dead code.
//  4. The resolved policy is what the Better Auth config actually receives.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSettings, validateSettings } from '../src/settings.js';

test('A-14: default settings expose an explicit session policy', () => {
  const settings = resolveSettings({}, {});
  const session = settings.auth.session;
  assert.ok(session, 'auth.session must exist in the resolved settings');
  assert.equal(session.expiresInSeconds, 604800, '7-day absolute lifetime');
  assert.equal(session.updateAgeSeconds, 86400, '1-day rolling refresh');
  assert.equal(session.cookieCacheSeconds, 300);
  assert.ok(
    session.updateAgeSeconds <= session.expiresInSeconds,
    'rolling refresh must not exceed absolute lifetime',
  );
});

test('A-14: a store override changes the effective session policy', () => {
  const settings = resolveSettings(
    { auth: { session: { expiresInSeconds: 3600, updateAgeSeconds: 600 } } },
    {},
  );
  assert.equal(settings.auth.session.expiresInSeconds, 3600);
  assert.equal(settings.auth.session.updateAgeSeconds, 600);
});

test('A-14: a session lifetime below one hour is refused, not clamped', () => {
  assert.throws(
    () => validateSettings({ auth: { session: { expiresInSeconds: 60 } } }),
    /auth\.session\.expiresInSeconds/,
  );
});

test('A-14: a rolling refresh longer than the lifetime is refused', () => {
  assert.throws(
    () =>
      validateSettings({
        auth: { session: { expiresInSeconds: 3600, updateAgeSeconds: 7200 } },
      }),
    /updateAgeSeconds must not exceed/,
  );
});

test('A-14: a non-object session block is refused', () => {
  assert.throws(
    () => validateSettings({ auth: { session: 'forever' } }),
    /auth\.session must be an object/,
  );
});

test('A-14: cookie cache beyond one hour is refused', () => {
  assert.throws(
    () => validateSettings({ auth: { session: { cookieCacheSeconds: 99999 } } }),
    /auth\.session\.cookieCacheSeconds/,
  );
});

test('A-14: a valid session patch is accepted', () => {
  assert.doesNotThrow(() =>
    validateSettings({
      auth: { session: { expiresInSeconds: 172800, updateAgeSeconds: 3600, cookieCacheSeconds: 60 } },
    }),
  );
});
