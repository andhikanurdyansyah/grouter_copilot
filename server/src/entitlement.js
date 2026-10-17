/** Canonical server-side premium capability resolution. */
export const CAPABILITY_FEATURES = Object.freeze({
  print_receipt: ['core'], export_usage: ['pro'], export_orders: ['pro'], export_licenses: ['admin'],
});
export function resolveCapability({ license, settings, capability, now = Date.now() } = {}) {
  if (!license || !settings || !capability) return { entitled: false, reason: 'UNKNOWN_PLAN' };
  if (license.revokedAt != null) return { entitled: false, reason: 'REVOKED' };
  if (license.expiresAt != null) {
    const expiresAt = Number(license.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= 0) return { entitled: false, reason: 'INVALID_EXPIRY' };
    if (expiresAt <= now) return { entitled: false, reason: 'EXPIRED' };
  }
  const plan = (settings.plans || []).find((p) => p.key === license.planKey);
  if (!plan || plan.active === false) return { entitled: false, reason: 'UNKNOWN_PLAN' };
  const required = CAPABILITY_FEATURES[capability];
  const features = Array.isArray(plan.features) ? plan.features : [];
  if (!required || !required.some((feature) => features.includes(feature))) return { entitled: false, reason: 'NOT_ENTITLED', planKey: plan.key };
  return { entitled: true, planKey: plan.key };
}
export function featureError(capability) { return { error: 'feature not entitled', code: 'FEATURE_NOT_ENTITLED', capability }; }
