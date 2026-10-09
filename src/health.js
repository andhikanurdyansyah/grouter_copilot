/** Host-local readiness only; never return license payloads or provider credentials. */
export function getCopilotHealth(copilot, token = process.env.GROUTER_LICENSE, { gatewayUrl } = {}) {
  const { runtime } = copilot;
  let license = false;
  try {
    runtime.licenseGate.enforce(token);
    license = true;
  } catch {
    // A missing, expired or invalid license leaves the host unready.
  }
  const checks = {
    license,
    skills: runtime.registry.list().length > 0,
    // D-021: the provider lives behind the Copilot backend gateway — reachable
    // gateway OR a directly configured adapter (legacy in-process mode) counts.
    provider: runtime.adapter.configured === true || Boolean(gatewayUrl ?? process.env.GROUTER_LICENSE_SERVER),
  };
  return { status: Object.values(checks).every(Boolean) ? 'ok' : 'unavailable', checks };
}