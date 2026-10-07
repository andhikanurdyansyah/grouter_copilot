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
