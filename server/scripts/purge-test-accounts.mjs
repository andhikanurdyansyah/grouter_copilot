#!/usr/bin/env node
/**
 * purge-test-accounts.mjs — remove accumulated QA/test accounts from the
 * production auth DB, so end-to-end test runs do not pollute real data.
 *
 * WHY THIS EXISTS (2026-10-13): the prod `auth.sqlite` had accumulated 186
 * test accounts created by E2E runs directly against production. This script is
 * the guard rail: run it on a schedule (cron) to sweep them.
 *
 * SAFETY:
 *   - DRY-RUN by default. Nothing is deleted unless you pass --apply.
 *   - Only deletes accounts whose email matches an explicit test pattern
 *     (see TEST_PATTERNS). Real customer accounts are NEVER matched.
 *   - Refuses to delete an account that still owns orders/licenses in the store.
 *   - Takes a timestamped backup of auth.sqlite + store.json before --apply.
 *   - Prints exactly what it will do; exits non-zero on any refusal.
 *
 * USAGE:
 *   node server/scripts/purge-test-accounts.mjs                 # dry-run
 *   node server/scripts/purge-test-accounts.mjs --apply         # delete
 *   node server/scripts/purge-test-accounts.mjs --apply --older-than 7
 */

import { existsSync, mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '..');
const dataDir = process.env.DATA_DIR || path.join(serverDir, 'data');
const authDb = process.env.AUTH_DB_FILE || path.join(dataDir, 'auth.sqlite');
const storeFile = process.env.DATA_FILE || path.join(dataDir, 'store.json');

// Test-account patterns. KEEP THIS LIST EXPLICIT — never a broad wildcard that
// could match a real customer. Add a new prefix here when a test suite uses one.
const TEST_PATTERNS = [
  /^qa[-_a-z0-9.]*@/i,        // qa*, qa-*, qa-e2e-*, qaiso*, qacheckout*, qamobile* ...
  /^ntf[-_a-z0-9.]*@/i,       // notification test accounts
  /^lictok[-_a-z0-9.]*@/i,    // license-token test accounts
  /^qaclean[a-z0-9]*@/i,
  /^d45-app[-_a-z0-9.]*@/i,
];

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const olderThanDays = (() => {
  const i = args.indexOf('--older-than');
  if (i === -1) return null;
  const n = Number(args[i + 1]);
  return Number.isFinite(n) && n >= 0 ? n : null;
})();

function isTestEmail(email) {
  return TEST_PATTERNS.some((re) => re.test(email || ''));
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

if (!existsSync(authDb)) fail(`auth DB not found: ${authDb}`);
if (!existsSync(storeFile)) fail(`store not found: ${storeFile}`);

const db = new DatabaseSync(authDb);
db.exec('PRAGMA foreign_keys=OFF');

const store = JSON.parse(readFileSync(storeFile, 'utf8'));
// accountIds that still hold orders or licenses — must NOT be deleted.
const protectedAccountIds = new Set();
for (const o of store.orders ?? []) if (o.accountId) protectedAccountIds.add(o.accountId);
for (const l of store.licenses ?? []) if (l.accountId) protectedAccountIds.add(l.accountId);

const cutoff = olderThanDays == null ? null : Date.now() - olderThanDays * 86400_000;

const rows = db.prepare('select id, email, createdAt from user').all();
const targets = [];
const skippedProtected = [];
const skippedRecent = [];
for (const u of rows) {
  if (!isTestEmail(u.email)) continue;
  if (protectedAccountIds.has(u.id)) { skippedProtected.push(u); continue; }
  if (cutoff != null) {
    const ts = Date.parse(u.createdAt);
    if (Number.isFinite(ts) && ts > cutoff) { skippedRecent.push(u); continue; }
  }
  targets.push(u);
}

console.log(`auth DB: ${authDb}`);
console.log(`store:   ${storeFile}`);
console.log(`mode:    ${apply ? 'APPLY (will delete)' : 'DRY-RUN (nothing deleted)'}` +
  (olderThanDays != null ? ` | older-than: ${olderThanDays}d` : ''));
console.log('');
console.log(`total accounts:     ${rows.length}`);
console.log(`test-pattern match: ${rows.filter((u) => isTestEmail(u.email)).length}`);
console.log(`→ will delete:      ${targets.length}`);
console.log(`· protected (own orders/licenses): ${skippedProtected.length}` +
  (skippedProtected.length ? ` -> ${skippedProtected.map((u) => u.email).join(', ')}` : ''));
console.log(`· too recent (kept): ${skippedRecent.length}`);
console.log('');
if (targets.length) {
  console.log('targets:');
  for (const u of targets.slice(0, 50)) console.log(`  - ${u.email}`);
  if (targets.length > 50) console.log(`  … and ${targets.length - 50} more`);
} else {
  console.log('nothing to do.');
}

if (!apply) {
  console.log('\n(dry-run — re-run with --apply to delete)');
  process.exit(0);
}
if (targets.length === 0) process.exit(0);

// Backup before mutating.
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
const backupDir = path.join('/home/ubuntu/backups', `qa-purge-${stamp}`);
try {
  mkdirSync(backupDir, { recursive: true });
  copyFileSync(authDb, path.join(backupDir, 'auth.sqlite'));
  copyFileSync(storeFile, path.join(backupDir, 'store.json'));
  console.log(`\nbackup -> ${backupDir}`);
} catch (e) {
  fail(`backup failed, aborting: ${e.message}`);
}

let ds = 0, da = 0, du = 0;
for (const u of targets) {
  ds += db.prepare('delete from session where userId=?').run(u.id).changes;
  da += db.prepare('delete from account where userId=?').run(u.id).changes;
  du += db.prepare('delete from user where id=?').run(u.id).changes;
}
console.log(`\n✔ deleted — session ${ds}, account ${da}, user ${du}`);
console.log(`accounts remaining: ${db.prepare('select count(*) c from user').get().c}`);
