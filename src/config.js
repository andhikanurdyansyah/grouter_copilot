/**
 * Config loader — read copilot.config.js (or .cjs/.mjs/.json) and normalize.
 * Also reads environment defaults for the gRouter adapter.
 */

import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const DEFAULT_MODEL = process.env.GROUTER_MODEL || 'grouter-default';
export const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful assistant for this application. ' +
  'Answer only from the data provided to you. ' +
  'If the data is insufficient, say so clearly. Do not invent facts.';

export async function loadCopilotConfig(configPath) {
  const resolved = path.resolve(configPath);
  if (!existsSync(resolved)) {
    throw new Error(`Copilot config not found: ${resolved}`);
  }

  let raw;
  if (resolved.endsWith('.json')) {
    const { readFileSync } = await import('node:fs');
    raw = JSON.parse(readFileSync(resolved, 'utf8'));
  } else {
    raw = await import(pathToFileURL(resolved).href);
  }

  const mod = raw?.default ?? raw;
  const config =
    typeof mod === 'function' ? await mod() : mod;

  return normalizeConfig(config ?? {});
}

export function normalizeConfig(config = {}) {
  return {
    model: config.model ?? DEFAULT_MODEL,
    systemPrompt: config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
    skills: Array.isArray(config.skills) ? config.skills : [],
    limits: {
      maxContextBytes: config.limits?.maxContextBytes ?? 32_000,
      maxRows: config.limits?.maxRows ?? 500,
      maxTokens: config.limits?.maxTokens ?? 2_000,
      ...(config.limits ?? {}),
    },
    adapter: {
      baseUrl: config.adapter?.baseUrl ?? process.env.GROUTER_BASE_URL ?? undefined,
      timeoutMs: config.adapter?.timeoutMs ?? undefined,
      ...(config.adapter ?? {}),
    },
    // allow passing through arbitrary custom keys for future use
    extra: { ...config },
  };
}
