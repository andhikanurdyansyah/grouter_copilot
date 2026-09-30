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
export { LicenseGate, DEFAULT_PUBLIC_KEY, LICENSE_AUDIENCE } from './license/gate.js';

import { loadCopilotConfig } from './config.js';
import { GrouterAdapter } from './adapter/grouter.js';
import { SkillRegistry } from './skills/registry.js';
import { CopilotRuntime } from './runtime/chat.js';

/**
 * One-call factory: create a ready-to-use Copilot from a config path.
 * @param {{configPath:string, adapter?:object}} opts
 */
export async function createCopilot({ configPath, adapter } = {}) {
  const config = await loadCopilotConfig(configPath);
  const registry = new SkillRegistry({ skills: config.skills });
  const grouterAdapter = adapter ?? new GrouterAdapter({ baseUrl: config.adapter?.baseUrl });
  const runtime = new CopilotRuntime({ config, adapter: grouterAdapter, registry });
  return { config, registry, adapter: grouterAdapter, runtime };
}
