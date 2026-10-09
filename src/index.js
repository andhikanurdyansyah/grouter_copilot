/**
 * gRouter Copilot — public API.
 */

export { GrouterAdapter, FakeSupplier } from './adapter/grouter.js';
export { CopilotError, ErrorCode, toErrorEnvelope } from './adapter/errors.js';
export { loadCopilotConfig, normalizeConfig, DEFAULT_MODEL, DEFAULT_SYSTEM_PROMPT } from './config.js';
export { SkillRegistry } from './skills/registry.js';
export { validateSkill, validateArgs } from './skills/validator.js';
export { CopilotRuntime } from './runtime/chat.js';
export { buildContext, redact } from './runtime/context.js';
export { validateLicense, mintLicense, generateKeyPair, LicenseStatus } from './license/validate.js';
export const CHAT_PROTOCOL_VERSION = '1.0.0';
export const SKILL_CONTRACT_VERSION = '1.0.0';
export const ADAPTER_CONTRACT_VERSION = '1.0.0';
export { LicenseGate, DEFAULT_PUBLIC_KEY, LICENSE_AUDIENCE } from './license/gate.js';
export { getCopilotHealth } from './health.js';
import { loadCopilotConfig } from './config.js';
import { GrouterAdapter } from './adapter/grouter.js';
import { SkillRegistry } from './skills/registry.js';
import { CopilotRuntime } from './runtime/chat.js';
import { LicenseGate } from './license/gate.js';
import { CopilotError, ErrorCode } from './adapter/errors.js';

/**
 * One-call factory: create a ready-to-use Copilot from a config path.
 * @param {{configPath:string, adapter?:object, licenseGate?:object}} opts
 */
export async function createCopilot({ configPath, adapter, licenseGate } = {}) {
  const config = await loadCopilotConfig(configPath);
  const registry = new SkillRegistry({ skills: config.skills });
  const grouterAdapter = adapter ?? new GrouterAdapter({ baseUrl: config.adapter?.baseUrl });
  // Default: fail-closed license gate. Without a configured verifier public key
  // (GROUTER_LICENSE_PUBLIC_KEY or LicenseGate.DEFAULT_PUBLIC_KEY build default),
  // every runtime.chat()/streamChat() is rejected before touching data or the
  // adapter. An explicitly injected `licenseGate` or `adapter` is preserved.
  const gate = licenseGate ?? new LicenseGate({
    publicKeyPem: process.env.GROUTER_LICENSE_PUBLIC_KEY ?? undefined,
  });
  const runtime = new CopilotRuntime({ config, adapter: grouterAdapter, registry, licenseGate: gate });
  return { config, registry, adapter: grouterAdapter, runtime };
}

/**
 * D-021 gateway client: build the payload locally (skills + context + license
 * gate) and POST it to the Copilot backend gateway. The gRouter service
 * credential never leaves the backend. Accepts an injected fetchImpl for tests.
 */
export async function gatewayChat({ runtime, gatewayUrl, fetchImpl = globalThis.fetch, ...req } = {}) {
  if (!gatewayUrl) {
    throw new CopilotError(ErrorCode.INVALID_REQUEST, 'gatewayUrl is required.', { status: 500 });
  }
  const payload = await runtime.buildGatewayPayload(req);
  let res;
  try {
    res = await fetchImpl(gatewayUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new CopilotError(ErrorCode.UPSTREAM_UNAVAILABLE, 'Unable to reach the Copilot gateway.', { retryable: true, cause: err });
  }
  let body = null;
  try { body = await res.json(); } catch { /* malformed body handled below */ }
  if (!res.ok || !body || body.status === 'error') {
    if (body?.status === 'error') return body;
    throw new CopilotError(
      ErrorCode.UPSTREAM_UNAVAILABLE,
      'The Copilot gateway returned an error.',
      { retryable: res.status >= 500 || res.status === 429, cause: body?.error ?? null },
    );
  }
  return body;
}
