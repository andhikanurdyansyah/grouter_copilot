/**
 * Load persisted license keys from server/data/keys/ (gitignored).
 * Falls back to env vars, then null (server will generate ephemeral + warn).
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadPersistedKeys() {
  const privatePath = path.join(__dirname, '..', 'data', 'keys', 'license-private.pem');
  const publicPath = path.join(__dirname, '..', 'data', 'keys', 'license-public.pem');

  const privateKeyPem = process.env.LICENSE_PRIVATE_KEY_PEM
    || (existsSync(privatePath) ? readFileSync(privatePath, 'utf8') : null);
  const publicKeyPem = process.env.LICENSE_PUBLIC_KEY_PEM
    || (existsSync(publicPath) ? readFileSync(publicPath, 'utf8') : null);

  return { privateKeyPem, publicKeyPem, persisted: Boolean(privateKeyPem && publicKeyPem) };
}
