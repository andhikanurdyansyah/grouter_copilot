/**
 * Minimal .env loader (zero dependency). Node ≥20.6 has process.loadEnvFile.
 * Falls back to a manual parser for older Node.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export function loadEnv(filePath = path.join(process.cwd(), '.env')) {
  if (!existsSync(filePath)) return false;
  try {
    if (typeof process.loadEnvFile === 'function') {
      process.loadEnvFile(filePath);
      return true;
    }
  } catch {
    // fall through to manual parser
  }

  // Manual parser fallback
  const content = readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  return true;
}
