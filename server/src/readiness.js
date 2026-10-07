/**
 * Production readiness validation — neutral, non-blocking evaluation of the
 * external gates that must be satisfied before go-live. This does NOT change
 * runtime behavior: it produces a structured report the entry point logs at
 * boot (and operators can consume). Hard gates that DO refuse to boot (admin
 * token fail-closed, persisted license keypair) live in server.js; everything
 * here is advisory so isolated tests and local dev stay undisturbed.
 */

/**
 * Evaluate production readiness from the process environment + key state.
 * @param {{nodeEnv?:string, adminToken?:string, licenseKeysPersisted?:boolean,
 *          betterAuthApiKey?:string, paymentConfigured?:boolean,
 *          paymentMode?:string}} facts
 * @returns {{ready:boolean, checks:Array<{id:string, ok:boolean, blocking:boolean, detail:string}>}}
 */
export function evaluateProductionReadiness({
  nodeEnv = process.env.NODE_ENV,
  adminToken = process.env.ADMIN_TOKEN,
  licenseKeysPersisted = false,
  betterAuthApiKey = process.env.BETTER_AUTH_API_KEY,
  paymentConfigured = false,
  paymentMode = 'sandbox',
} = {}) {
  const isDev = nodeEnv === 'test' || nodeEnv === 'development';
  const authKeyPresent = Boolean((betterAuthApiKey ?? '').trim());
  const checks = [
    {
      id: 'admin-token',
      ok: Boolean((adminToken ?? '').trim()),
      blocking: true,
      detail: 'ADMIN_TOKEN must be set so admin routes fail closed.',
    },
    {
      id: 'license-keypair-persisted',
      ok: licenseKeysPersisted,
      blocking: true,
      detail: 'LICENSE_PRIVATE_KEY_PEM/LICENSE_PUBLIC_KEY_PEM (or server/data/keys/*.pem) must persist across restarts.',
    },
    {
      id: 'better-auth-api-key',
      // Advisory: Better Auth dash/sentinel run degraded (local heuristics only)
      // without BETTER_AUTH_API_KEY; authentication itself still works. The
      // warning is so the operator consciously accepts the reduced protection.
      ok: authKeyPresent,
      blocking: false,
      detail: authKeyPresent
        ? 'BETTER_AUTH_API_KEY is set — Better Auth dash/sentinel have full infrastructure enrichment.'
        : 'BETTER_AUTH_API_KEY missing → Better Auth dash/sentinel run in degraded mode (no infrastructure analytics/enrichment).',
    },
    {
      id: 'klikqris-production',
      ok: paymentConfigured && paymentMode === 'production',
      blocking: false,
      detail: `KlikQRIS is ${paymentMode}; production payments need production credentials (D-018).`,
    },
  ];
  return {
    ready: checks.filter((c) => c.blocking).every((c) => c.ok),
    checks,
    environment: isDev ? 'development/test (gates advisory only)' : 'production (blocking gates enforced)',
  };
}

/** Render the readiness report as log-friendly lines. */
export function formatReadinessReport(report) {
  const lines = [`Production readiness (${report.environment}): ${report.ready ? 'READY' : 'NOT READY'}`];
  for (const c of report.checks) {
    lines.push(`  ${c.ok ? '✔' : c.blocking ? '✖' : '⚠'} [${c.id}] ${c.detail}`);
  }
  return lines.join('\n');
}
