/** Host-local readiness only; never return license payloads or provider credentials. */
export function getCopilotHealth(copilot, token = process.env.GROUTER_LICENSE) {
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
    provider: runtime.adapter.configured === true,
  };
  return { status: Object.values(checks).every(Boolean) ? 'ok' : 'unavailable', checks };
}