#!/usr/bin/env node
/**
 * purge-store-residue.mjs — remove QA/test residue from the PRODUCTION
 * `store.json` (accounts + their orders/licenses/usage/notifications) that the
 * auth-DB sweeper (`purge-test-accounts.mjs`) cannot reach.
 *
 * WHY: E2E runs target production (:4601) and create app-level accounts +
 * orders + licenses in store.json. `purge-test-accounts.mjs` only cleans
 * auth.sqlite, so the store kept the orphaned residue.
 *
 * SAFETY (read before running):
 *   - DRY-RUN by default. Nothing is written unless --apply is passed.
 *   - NEVER deletes a NON-test account (matches an explicit test pattern only).
 *   - NEVER deletes an order/license owned by a non-test account.
 *   - NEVER deletes a license whose `customer` is not a test fixture — in
 *     particular the real "Mini CRM Demo (Jie acceptance)" license and its
 *     usage history are preserved.
 *   - Takes a timestamped backup of store.json (and auth.sqlite for reference)
 *     before --apply.
 *   - Prints exactly what it will remove; --apply prints the same plan again.
 *
 * IMPORTANT (operational): the running backend holds store.json in memory and
 * rewrites the whole file on every mutation. Run this while the backend is
 * stopped, or restart it right after (`pm2 restart copilot-backend --update-env`),
 * so an in-memory write cannot clobber the purge.
 *
 * USAGE:
 *   node server/scripts/purge-store-residue.mjs             # dry-run
 *   node server/scripts/purge-store-residue.mjs --apply     # delete
 */

import { existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, '..');
const dataDir = process.env.DATA_DIR || path.join(serverDir, 'data');
const storeFile = process.env.DATA_FILE || path.join(dataDir, 'store.json');
const authDb = process.env.AUTH_DB_FILE || path.join(dataDir, 'auth.sqlite');

// Test-account email patterns — mirror purge-test-accounts.mjs (keep in sync).
const TEST_EMAIL_PATTERNS = [
  /^qa[-_.a-z0-9]*@/i,
  /^ntf[-_.a-z0-9]*@/i,
  /^lictok[-_.a-z0-9]*@/i,
  /^qaclean[a-z0-9]*@/i,
  /^d45-app[-_.a-z0-9]*@/i,
  /^iso-probe[-_.a-z0-9]*@/i,
  /^cp-qa[-_.a-z0-9]*@/i,
  /^spa-qa[-_.a-z0-9]*@/i,
  /^routing-qa[-_.a-z0-9]*@/i,
  /^audit-probe[-_.a-z0-9]*@/i,
  /^dbg-qa[-_.a-z0-9]*@/i,
];
// Test license "customer" name patterns (licenses with accountId=null).
const TEST_CUSTOMER_PATTERNS = [
  /^QA-E2E\b/i,
];

const isTestEmail = (e) => TEST_EMAIL_PATTERNS.some((re) => re.test(e || ''));
const isTestCustomer = (c) => TEST_CUSTOMER_PATTERNS.some((re) => re.test(c || ''));

const args = process.argv.slice(2);
const apply = args.includes('--apply');

const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };
if (!existsSync(storeFile)) fail(`store not found: ${storeFile}`);

const store = JSON.parse(readFileSync(storeFile, 'utf8'));
const accounts = store.accounts ?? [];
const licenses = store.licenses ?? [];
const orders = store.orders ?? [];
const usage = store.usage ?? [];
const notifications = store.notifications ?? [];

// --- classify accounts -------------------------------------------------------
const testAccounts = accounts.filter((a) => isTestEmail(a.email));
const realAccounts = accounts.filter((a) => !isTestEmail(a.email));
const testAccountIds = new Set(testAccounts.map((a) => a.id));

// --- classify licenses -------------------------------------------------------
// removed if: owned by a test account, OR (accountId null AND test customer name)
const removeLicenses = licenses.filter(
  (l) => testAccountIds.has(l.accountId) || (!l.accountId && isTestCustomer(l.customer)),
);
const removeLicenseIds = new Set(removeLicenses.map((l) => l.id));
const keepLicenses = licenses.filter((l) => !removeLicenseIds.has(l.id));

// --- classify orders ---------------------------------------------------------
// removed if owned by a test account OR references a removed license
const removeOrders = orders.filter(
  (o) => testAccountIds.has(o.accountId) || (o.licenseId && removeLicenseIds.has(o.licenseId)),
);
const removeOrderIds = new Set(removeOrders.map((o) => o.id));

// --- classify usage ----------------------------------------------------------
const removeUsage = usage.filter((u) => removeLicenseIds.has(u.licenseId));
// --- classify notifications --------------------------------------------------
const removeNotifications = notifications.filter((n) => testAccountIds.has(n.accountId));

console.log(`store:   ${storeFile}`);
console.log(`mode:    ${apply ? 'APPLY (will delete)' : 'DRY-RUN (nothing written)'}`);
console.log('');
console.log(`accounts       : ${accounts.length} → remove ${testAccounts.length}, keep ${realAccounts.length}`);
console.log(`licenses       : ${licenses.length} → remove ${removeLicenses.length}, keep ${keepLicenses.length}`);
console.log(`orders         : ${orders.length} → remove ${removeOrders.length}, keep ${orders.length - removeOrders.length}`);
console.log(`usage rows     : ${usage.length} → remove ${removeUsage.length}, keep ${usage.length - removeUsage.length}`);
console.log(`notifications  : ${notifications.length} → remove ${removeNotifications.length}, keep ${notifications.length - removeNotifications.length}`);
console.log('');
console.log('KEEP — non-test accounts (never touched):');
for (const a of realAccounts) console.log(`  · ${a.email}  (${a.id})`);
console.log('KEEP — non-test licenses (never touched):');
for (const l of keepLicenses) {
  const used = usage.filter((u) => u.licenseId === l.id).length;
  console.log(`  · ${l.id}  customer="${l.customer}"  planKey=${l.planKey}  revoked=${l.revokedAt ? 'yes' : 'no'}  usageRows=${used}`);
}
console.log('');

// --- SAFETY ASSERTIONS -------------------------------------------------------
const keptNonTest = keepLicenses.some((l) => !l.accountId && !isTestCustomer(l.customer));
if (!keptNonTest) console.log('WARN: no non-test, package-less license found to preserve (unexpected for prod).');
for (const o of removeOrders) {
  if (!testAccountIds.has(o.accountId) && !removeLicenseIds.has(o.licenseId)) {
    fail(`refusing: order ${o.id} would be removed without a test owner`);
  }
}
if (removeLicenses.some((l) => isTestCustomer(l.customer) === false && !testAccountIds.has(l.accountId))) {
  fail('refusing: a license with no test owner and no test customer name would be removed');
}

if (!apply) {
  console.log('(dry-run — re-run with --apply to delete)');
  process.exit(0);
}
const totalToRemove = testAccounts.length + removeLicenses.length + removeOrders.length
  + removeUsage.length + removeNotifications.length;
if (totalToRemove === 0) {
  console.log('nothing to do.');
  process.exit(0);
}

// --- backup ------------------------------------------------------------------
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
const backupDir = path.join('/home/ubuntu/backups', `store-residue-${stamp}`);
try {
  mkdirSync(backupDir, { recursive: true });
  copyFileSync(storeFile, path.join(backupDir, 'store.json'));
  if (existsSync(authDb)) copyFileSync(authDb, path.join(backupDir, 'auth.sqlite'));
  console.log(`\nbackup -> ${backupDir}`);
} catch (e) {
  fail(`backup failed, aborting: ${e.message}`);
}

// --- write (atomic: temp + rename) -------------------------------------------
const next = {
  ...store,
  accounts: realAccounts,
  licenses: keepLicenses,
  orders: orders.filter((o) => !removeOrderIds.has(o.id)),
  usage: usage.filter((u) => !removeLicenseIds.has(u.licenseId)),
  notifications: notifications.filter((n) => !testAccountIds.has(n.accountId)),
};
const tmp = `${storeFile}.tmp-${process.pid}`;
writeFileSync(tmp, JSON.stringify(next, null, 2));
renameSync(tmp, storeFile);

console.log(`\n✔ removed — accounts ${testAccounts.length}, licenses ${removeLicenses.length}, orders ${removeOrders.length}, usage ${removeUsage.length}, notifications ${removeNotifications.length}`);
console.log(`  remaining — accounts ${next.accounts.length}, licenses ${next.licenses.length}, orders ${next.orders.length}, usage ${next.usage.length}, notifications ${next.notifications.length}`);
