/**
 * Prepare an auth DB file for a server-booting test.
 *
 * History: every server test used to `copyFileSync(server/data/auth.sqlite)` to
 * get a DB that already had the Better Auth schema, because Better Auth has no
 * auto-migration and throws SchemaMismatchError on a schema-less file.
 *
 * That copy made the whole server suite depend on a gitignored PRODUCTION
 * artifact existing on disk. On a clean checkout (CI) the file is absent, so
 * every one of these tests died at import with ENOENT — the server suite had
 * never actually run in CI.
 *
 * Copy when the production schema is available (fast, and keeps tests honest
 * about the real schema). Otherwise leave the destination absent/empty and let
 * `src/auth.js` create the schema with the library's own migrations.
 */
import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const prodAuthDb = path.join(serverDir, 'data', 'auth.sqlite');

export function prepareAuthDb(destination) {
  if (existsSync(prodAuthDb)) {
    copyFileSync(prodAuthDb, destination);
    return 'copied';
  }
  // Deliberately do NOT create the file: auth.js migrates a schema-less DB, and
  // an empty file would be indistinguishable from a corrupt one.
  return 'migrate';
}

export { prodAuthDb };
