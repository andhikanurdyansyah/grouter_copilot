// A paid plan must actually deliver AI access.
//
// Defect found 2026-10-18: the production plan catalogue carried
// `ai: { enabled: false }` on both paid plans (quota-3b-90d at Rp 10.000 and
// quota-15b-365d at Rp 20.000), each of which also declares quotaTokens. Two
// orders had already been PAID and their licenses issued. Calling the gateway
// with such a license returned:
//
//   status: error | code: AI_DISABLED | "AI access is not enabled for this package."
//
// So a customer paid for a package that could not do the one thing it sells.
// The default catalogue in settings.js has no `ai` key at all, and
// resolvePlanAiPolicy treats a missing policy as enabled — the disabling was
// introduced by stored settings, not by any decision in the decision log.
//
// These tests pin the invariant so the two concepts cannot drift apart again:
// a plan that charges money AND grants a token quota must have AI enabled.
// They also pin the legitimate inverse: a free/zero-price plan may explicitly
// disable AI, and an explicit disable must still be honoured.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveSettings, resolvePlanAiPolicy, validateSettings } from '../src/settings.js';

/** A minimal valid settings object with a supplied plan catalogue. */
function settingsWithPlans(plans) {
  return resolveSettings({ plans });
}

test('a priced plan with a token quota must not silently disable AI', () => {
  // This is the exact shape that shipped to production and broke paid access:
  // a plan charging money, granting quotaTokens, with ai.enabled=false. Two
  // orders had been PAID and their licenses issued before anyone noticed.
  //
  // The guard lives at the write boundary (validateSettings, the same path the
  // admin PATCH uses), so the contradictory catalogue can no longer be saved.
  const bad = {
    plans: [
      {
        key: 'paid-plan', name: 'Paid', amount: 10000, currency: 'IDR',
        quota: '3B usage', quotaTokens: 3000000, features: ['core'],
        expiresInDays: 90, active: true,
        ai: { enabled: false },
      },
    ],
  };
  assert.throws(
    () => validateSettings(bad),
    (err) => /enabled cannot be false/.test(String(err?.message ?? err)),
    'saving a priced plan with AI disabled must be refused, not silently accepted',
  );

  // The inverse must still be accepted: same plan, AI enabled.
  const good = structuredClone(bad);
  good.plans[0].ai = { enabled: true };
  const eff = validateSettings(good);
  const plan = eff.plans.find((p) => p.key === 'paid-plan');
  assert.equal(plan.amount > 0, true, 'precondition: the plan charges money');
  assert.equal(resolvePlanAiPolicy(plan, eff).enabled, true, 'paid plan must deliver AI access');
});

test('every priced plan in the default catalogue delivers AI access', () => {
  // The shipped defaults are what a fresh install starts from. Their amounts are
  // 0 (the operator sets real prices in stored settings), so this asserts the
  // weaker but still meaningful property: no default plan ships with AI
  // disabled. If one did, a deployment that only adds a price would inherit a
  // dead package.
  const eff = resolveSettings({});
  assert.ok(eff.plans.length > 0, 'default catalogue must not be empty');
  for (const plan of eff.plans) {
    const policy = resolvePlanAiPolicy(plan, eff);
    assert.equal(
      policy.enabled,
      true,
      `default plan ${plan.key} ships with AI disabled — adding a price would sell a dead package`,
    );
  }
});

test('a free plan may still disable AI explicitly', () => {
  const eff = settingsWithPlans([
    {
      key: 'free-trial', name: 'Free', amount: 0, currency: 'IDR',
      quota: 'trial', quotaTokens: 100000, features: ['core'],
      expiresInDays: 7, active: true,
      ai: { enabled: false },
    },
  ]);
  const plan = eff.plans.find((p) => p.key === 'free-trial');
  assert.equal(resolvePlanAiPolicy(plan, eff).enabled, false, 'a free plan may disable AI');
});

test('a plan with no ai policy is enabled (legacy default)', () => {
  const eff = settingsWithPlans([
    {
      key: 'legacy', name: 'Legacy', amount: 10000, currency: 'IDR',
      quota: 'x', quotaTokens: 1000, features: ['core'], expiresInDays: 30, active: true,
    },
  ]);
  const plan = eff.plans.find((p) => p.key === 'legacy');
  assert.equal(resolvePlanAiPolicy(plan, eff).enabled, true, 'missing policy means enabled');
});
