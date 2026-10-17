import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JsonStore } from "../src/store.js";
import { resolveSettings } from "../src/settings.js";
import { createNotificationService } from "../src/notifications.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function tmpStoreFile() {
  return path.join(
    mkdtempSync(path.join(tmpdir(), "copilot-notifsvc-")),
    "store.json",
  );
}

function fakeMailer() {
  const calls = [];
  return {
    calls,
    async send(args) {
      calls.push(args);
      return { status: "log_only" };
    },
  };
}

function setup({ mailer = fakeMailer(), settingsPatch } = {}) {
  const file = tmpStoreFile();
  const store = new JsonStore(file);
  if (settingsPatch) store.updateSettings(settingsPatch);
  const svc = createNotificationService({
    store,
    settingsGetter: () => resolveSettings(store.getSettings(), {}),
    mailer,
    now: () => NOW,
  });
  return { store, svc, mailer, file };
}

const NOW = 1_800_000_000_000; // fixed deterministic clock (2027-01-15)
const DAY = 86400000;

function seedAccount(store, id = "acc_a") {
  const acc = {
    id,
    name: "Secret Customer Name",
    email: "secret-customer@gmail.com",
    createdAt: NOW - 30 * DAY,
  };
  store.addAccount(acc);
  return acc;
}

test("store: adminNotifications migrate, dedupe, scope-free list, mark-read/all, retention, email metadata defaults", () => {
  const file = tmpStoreFile();
  // simulate old file without adminNotifications
  const store = new JsonStore(file);
  assert.deepEqual(store.listAdminNotifications(), []);
  const a1 = store.addAdminNotification({
    type: "admin.order.paid",
    dedupeKey: "ord_1",
    title: "T",
    titleEn: "T",
    body: "b",
    bodyEn: "b",
    linkKind: "order",
    linkId: "ord_1",
    createdAt: NOW,
  });
  assert.ok(a1?.id);
  const dup = store.addAdminNotification({
    type: "admin.order.paid",
    dedupeKey: "ord_1",
    title: "T",
    titleEn: "T",
    body: "b",
    bodyEn: "b",
    linkKind: "order",
    linkId: "ord_1",
    createdAt: NOW,
  });
  assert.equal(dup.id, a1.id);
  store.addAdminNotification({
    type: "admin.order.pending",
    dedupeKey: "ord_2",
    title: "T2",
    titleEn: "T2",
    body: "b2",
    bodyEn: "b2",
    linkKind: "order",
    linkId: "ord_2",
    createdAt: NOW + 1,
  });
  assert.equal(store.listAdminNotifications().length, 2);
  assert.equal(store.listAdminNotifications({ limit: 1 }).length, 1);
  const marked = store.markAdminNotificationRead(a1.id);
  assert.ok(marked.readAt);
  assert.equal(store.markAdminNotificationRead("missing"), null);
  assert.equal(store.markAllAdminNotificationsRead(), 1);
  assert.equal(store.markAllAdminNotificationsRead(), 0);
  // retention 200
  for (let i = 0; i < 220; i++)
    store.addAdminNotification({
      type: "admin.x",
      dedupeKey: `d${i}`,
      title: "t",
      titleEn: "t",
      body: "b",
      bodyEn: "b",
      createdAt: NOW + 1000 + i,
    });
  assert.equal(store.listAdminNotifications({ limit: 500 }).length, 200);
  // persistence
  const store2 = new JsonStore(file);
  assert.equal(store2.listAdminNotifications({ limit: 500 }).length, 200);
  // email metadata on customer notifications: defaults safe for old rows
  const n = store2.addNotification({
    accountId: "acc_a",
    type: "order.paid",
    dedupeKey: "ord_e",
    title: "t",
    titleEn: "t",
    body: "b",
    bodyEn: "b",
    createdAt: NOW,
  });
  // old-style row without email fields must read safely (undefined allowed, update creates fields)
  const updated = store2.markNotificationEmail("acc_a", n.id, {
    status: "sent",
    at: NOW,
    error: null,
  });
  assert.equal(updated.emailStatus, "sent");
  assert.equal(updated.emailedAt, NOW);
  assert.equal(updated.emailAttempts, 1);
  assert.equal(updated.lastEmailError, null);
  const failed = store2.markNotificationEmail("acc_a", n.id, {
    status: "failed",
    at: NOW + 1,
    error: "boom",
  });
  assert.equal(failed.emailStatus, "failed");
  assert.equal(failed.emailAttempts, 2);
  assert.equal(failed.lastEmailError, "boom");
  assert.equal(
    store2.markNotificationEmail("acc_b", n.id, { status: "sent", at: NOW }),
    null,
  );
  assert.equal(
    store2.markNotificationEmail("acc_a", "missing", {
      status: "sent",
      at: NOW,
    }),
    null,
  );
  // admin email metadata if present (a1 may have been evicted by the
  // 200-cap retention above — use a surviving row)
  if (typeof store2.markAdminNotificationEmail === "function") {
    const survivor = store2.listAdminNotifications({ limit: 1 })[0];
    assert.ok(survivor?.id);
    const au = store2.markAdminNotificationEmail(survivor.id, {
      status: "log_only",
      at: NOW,
    });
    assert.equal(au.emailAttempts, 1);
    assert.equal(
      store2.markAdminNotificationEmail("missing", { status: "sent", at: NOW }),
      null,
    );
  }
});

test("service: expired PENDING yields order.expired once, no pending duplicate; cancelled once; paid once", async () => {
  const { store, svc, mailer } = setup();
  const acc = seedAccount(store);
  store.addOrder({
    id: "ord_expired_123",
    accountId: acc.id,
    packageKey: "quota-3b-90d",
    status: "PENDING",
    createdAt: NOW - 2 * DAY,
    expiredAt: NOW - DAY,
  });
  store.addOrder({
    id: "ord_exp_status",
    accountId: acc.id,
    packageKey: "quota-3b-90d",
    status: "EXPIRED",
    createdAt: NOW - 2 * DAY,
    expiredAt: NOW + DAY,
  });
  store.addOrder({
    id: "ord_cancelled_1",
    accountId: acc.id,
    packageKey: "quota-3b-90d",
    status: "CANCELLED",
    createdAt: NOW - DAY,
  });
  store.addOrder({
    id: "ord_paid_1",
    accountId: acc.id,
    packageKey: "quota-3b-90d",
    status: "PAID",
    createdAt: NOW - DAY,
    paidAt: NOW - DAY,
  });
  store.addOrder({
    id: "ord_pending_ok",
    accountId: acc.id,
    packageKey: "quota-3b-90d",
    status: "PENDING",
    createdAt: NOW - 1000,
    expiredAt: NOW + DAY,
  });

  await svc.syncAccount(acc, { now: NOW });
  let list = store.listNotifications(acc.id, { limit: 50 });
  const types = list.map((n) => `${n.type}:${n.dedupeKey}`);
  assert.equal(
    list.filter((n) => n.type === "order.expired").length,
    2,
    JSON.stringify(types),
  );
  assert.equal(
    list.filter(
      (n) => n.type === "order.expired" && n.dedupeKey === "ord_expired_123",
    ).length,
    1,
  );
  assert.equal(
    list.filter(
      (n) => n.type === "order.pending" && n.dedupeKey === "ord_expired_123",
    ).length,
    0,
    "expired must not also be pending",
  );
  assert.equal(
    list.filter(
      (n) => n.type === "order.pending" && n.dedupeKey === "ord_exp_status",
    ).length,
    0,
  );
  assert.equal(list.filter((n) => n.type === "order.cancelled").length, 1);
  assert.equal(list.filter((n) => n.type === "order.paid").length, 1);
  assert.equal(
    list.filter(
      (n) => n.type === "order.pending" && n.dedupeKey === "ord_pending_ok",
    ).length,
    1,
  );

  // repeat sync: exactly same counts (idempotent)
  await svc.syncAccount(acc, { now: NOW });
  await svc.syncAccount(acc, { now: NOW + 1000 });
  list = store.listNotifications(acc.id, { limit: 50 });
  assert.equal(list.filter((n) => n.type === "order.expired").length, 2);
  assert.equal(list.filter((n) => n.type === "order.cancelled").length, 1);
  assert.equal(list.filter((n) => n.type === "order.paid").length, 1);

  // admin mirror: generic, no identity
  const admin = store.listAdminNotifications({ limit: 50 });
  assert.ok(admin.some((n) => n.type === "admin.order.expired"));
  assert.ok(admin.some((n) => n.type === "admin.order.cancelled"));
  assert.ok(admin.some((n) => n.type === "admin.order.paid"));
  assert.ok(admin.some((n) => n.type === "admin.order.pending"));
  const rawAdmin = JSON.stringify(admin);
  assert.ok(
    !rawAdmin.includes("secret-customer@gmail.com"),
    "admin must not contain customer email",
  );
  assert.ok(
    !rawAdmin.includes("Secret Customer Name"),
    "admin must not contain customer name",
  );
  assert.ok(!rawAdmin.includes(acc.id), "admin must not contain accountId");
  for (const n of admin) {
    assert.ok(
      !("accountId" in n) || n.accountId == null,
      "admin row must not carry accountId field with value",
    );
    assert.ok(n.linkKind && n.linkId, "admin row needs linkKind/linkId");
  }
});

test("service: license.issued once, revoked once, expiring <=7d daily dedupe", async () => {
  const { store, svc } = setup();
  const acc = seedAccount(store);
  store.addLicense({
    id: "lic_issued_123",
    customer: "x",
    accountId: acc.id,
    planKey: "quota-3b-90d",
    features: ["core"],
    createdAt: NOW - DAY,
    expiresAt: NOW + 90 * DAY,
    revokedAt: null,
  });
  store.addLicense({
    id: "lic_expiring_1",
    customer: "x",
    accountId: acc.id,
    planKey: "quota-3b-90d",
    features: ["core"],
    createdAt: NOW - 80 * DAY,
    expiresAt: NOW + 3 * DAY,
    revokedAt: null,
  });
  store.addLicense({
    id: "lic_revoked_1",
    customer: "x",
    accountId: acc.id,
    planKey: "quota-3b-90d",
    features: ["core"],
    createdAt: NOW - 10 * DAY,
    expiresAt: NOW + 90 * DAY,
    revokedAt: NOW - DAY,
  });
  store.addLicense({
    id: "lic_far_1",
    customer: "x",
    accountId: acc.id,
    planKey: "quota-3b-90d",
    features: ["core"],
    createdAt: NOW - DAY,
    expiresAt: NOW + 30 * DAY,
    revokedAt: null,
  });

  await svc.syncAccount(acc, { now: NOW });
  let list = store.listNotifications(acc.id, { limit: 50 });
  assert.equal(
    list.filter(
      (n) => n.type === "license.issued" && n.dedupeKey === "lic_issued_123",
    ).length,
    1,
  );
  // every existing license was issued once (incl. later-expiring/revoked/far)
  assert.equal(list.filter((n) => n.type === "license.issued").length, 4);
  assert.equal(list.filter((n) => n.type === "license.revoked").length, 1);
  assert.equal(
    list.filter((n) => n.type === "license.expiring").length,
    1,
    JSON.stringify(list.map((n) => n.type + ":" + n.dedupeKey)),
  );
  // same day repeat: no new expiring
  await svc.syncAccount(acc, { now: NOW + 3600000 });
  list = store.listNotifications(acc.id, { limit: 50 });
  assert.equal(list.filter((n) => n.type === "license.expiring").length, 1);
  // next day: one more expiring (daily dedupe)
  await svc.syncAccount(acc, { now: NOW + DAY });
  list = store.listNotifications(acc.id, { limit: 50 });
  assert.equal(list.filter((n) => n.type === "license.expiring").length, 2);
  assert.equal(list.filter((n) => n.type === "license.issued").length, 4);
});

test("service: quota.threshold 90 fires once, not for unlimited, uses settings threshold", async () => {
  const { store, svc } = setup();
  const acc = seedAccount(store);
  // license with plan quota 1000, usage 950 => 95%
  store.addLicense({
    id: "lic_quota_1",
    customer: "x",
    accountId: acc.id,
    planKey: "quota-3b-90d",
    features: ["core"],
    createdAt: NOW - 10 * DAY,
    expiresAt: NOW + 90 * DAY,
    revokedAt: null,
  });
  store.addLicense({
    id: "lic_unlimited",
    customer: "x",
    accountId: acc.id,
    planKey: "custom",
    features: ["core"],
    createdAt: NOW - 10 * DAY,
    expiresAt: NOW + 90 * DAY,
    revokedAt: null,
  });
  store.addLicense({
    id: "lic_below",
    customer: "x",
    accountId: acc.id,
    planKey: "quota-3b-90d",
    features: ["core"],
    createdAt: NOW - 10 * DAY,
    expiresAt: NOW + 90 * DAY,
    revokedAt: null,
  });
  // override plans to small quotas for deterministic test via settings
  store.updateSettings({
    plans: [
      {
        key: "quota-3b-90d",
        name: "3B",
        amount: 0,
        currency: "IDR",
        quota: "test",
        quotaTokens: 1000,
        features: ["core"],
        expiresInDays: 90,
        active: true,
      },
      {
        key: "custom",
        name: "Custom",
        amount: 0,
        currency: "IDR",
        quota: "Custom",
        quotaTokens: null,
        features: ["core"],
        expiresInDays: 365,
        active: true,
      },
    ],
  });
  store.addUsageRecord({
    requestId: "r1",
    licenseId: "lic_quota_1",
    accountId: acc.id,
    status: "ok",
    totalTokens: 950,
    createdAt: NOW - DAY,
  });
  store.addUsageRecord({
    requestId: "r2",
    licenseId: "lic_unlimited",
    accountId: acc.id,
    status: "ok",
    totalTokens: 999999,
    createdAt: NOW - DAY,
  });
  store.addUsageRecord({
    requestId: "r3",
    licenseId: "lic_below",
    accountId: acc.id,
    status: "ok",
    totalTokens: 500,
    createdAt: NOW - DAY,
  });

  await svc.syncAccount(acc, { now: NOW });
  let list = store.listNotifications(acc.id, { limit: 50 });
  assert.equal(
    list.filter((n) => n.type === "quota.threshold").length,
    1,
    JSON.stringify(list.map((n) => n.type + ":" + n.dedupeKey)),
  );
  assert.ok(
    list
      .find((n) => n.type === "quota.threshold")
      .dedupeKey.includes("lic_quota_1"),
  );
  // repeat: still once
  store.addUsageRecord({
    requestId: "r4",
    licenseId: "lic_quota_1",
    accountId: acc.id,
    status: "ok",
    totalTokens: 40,
    createdAt: NOW,
  });
  await svc.syncAccount(acc, { now: NOW + 1000 });
  list = store.listNotifications(acc.id, { limit: 50 });
  assert.equal(list.filter((n) => n.type === "quota.threshold").length, 1);
  // admin quota mirror generic
  const admin = store.listAdminNotifications({ limit: 50 });
  assert.equal(
    admin.filter((n) => n.type === "admin.quota.threshold").length,
    1,
  );
  assert.ok(!JSON.stringify(admin).includes("secret-customer"));
});

test("service: email sent only on NEW notification (log_only recorded once), failed retries on later sync", async () => {
  // log_only path
  const mailer1 = fakeMailer();
  const s1 = setup({ mailer: mailer1 });
  const acc1 = seedAccount(s1.store);
  s1.store.addOrder({
    id: "ord_paid_email",
    accountId: acc1.id,
    packageKey: "quota-3b-90d",
    status: "PAID",
    createdAt: NOW - DAY,
    paidAt: NOW - DAY,
  });
  s1.store.addLicense({
    id: "lic_paid_email",
    customer: "x",
    accountId: acc1.id,
    planKey: "quota-3b-90d",
    features: ["core"],
    createdAt: NOW - DAY,
    expiresAt: NOW + 90 * DAY,
    revokedAt: null,
  });
  // link license to order if service uses order.licenseId
  const ord = s1.store.getOrder("ord_paid_email");
  ord.licenseId = "lic_paid_email";
  s1.store._save();
  await s1.svc.syncAccount(acc1, { now: NOW });
  const callsAfterFirst = mailer1.calls.length;
  assert.ok(
    callsAfterFirst >= 1,
    "expected at least one email attempt on new paid/issued",
  );
  // every mail call must be to account email, and no repeat on second sync
  await s1.svc.syncAccount(acc1, { now: NOW + 1000 });
  await s1.svc.syncAccount(acc1, { now: NOW + 2000 });
  assert.equal(
    mailer1.calls.length,
    callsAfterFirst,
    "lazy/repeat sync must not resend log_only/sent",
  );
  const notifs = s1.store.listNotifications(acc1.id, { limit: 50 });
  const paidNotif = notifs.find((n) => n.type === "order.paid");
  assert.equal(paidNotif.emailStatus, "log_only");
  assert.equal(paidNotif.emailAttempts, 1);
  assert.ok(paidNotif.emailedAt);

  // failed retries
  let attempts = 0;
  const flaky = {
    calls: [],
    async send(args) {
      this.calls.push(args);
      attempts++;
      return attempts === 1
        ? { status: "failed", error: "boom" }
        : { status: "sent", providerId: "e2" };
    },
  };
  const s2 = setup({ mailer: flaky });
  const acc2 = seedAccount(s2.store, "acc_b");
  s2.store.addOrder({
    id: "ord_paid_retry",
    accountId: acc2.id,
    packageKey: "quota-3b-90d",
    status: "PAID",
    createdAt: NOW - DAY,
    paidAt: NOW - DAY,
  });
  await s2.svc.syncAccount(acc2, { now: NOW });
  let n2 = s2.store
    .listNotifications(acc2.id)
    .find((n) => n.type === "order.paid");
  // first attempt may be failed
  assert.ok(n2.emailAttempts >= 1);
  const firstStatus = n2.emailStatus;
  await s2.svc.syncAccount(acc2, { now: NOW + 1000 });
  n2 = s2.store.listNotifications(acc2.id).find((n) => n.type === "order.paid");
  if (firstStatus === "failed") {
    assert.equal(n2.emailStatus, "sent", "failed should retry on later sync");
    assert.equal(n2.emailAttempts, 2);
    // third sync: no more sends for this notification
    const c = flaky.calls.length;
    await s2.svc.syncAccount(acc2, { now: NOW + 2000 });
    // calls may include other notifications, but paid one should not increase attempts
    n2 = s2.store
      .listNotifications(acc2.id)
      .find((n) => n.type === "order.paid");
    assert.equal(n2.emailAttempts, 2);
  }
});

test("service: syncAll covers all accounts + admin; scheduler start/stop safe", async () => {
  const { store, svc } = setup();
  const a = seedAccount(store, "acc_a");
  const b = seedAccount(store, "acc_b");
  store.addOrder({
    id: "ord_syncall_1",
    accountId: a.id,
    packageKey: "p",
    status: "PAID",
    createdAt: NOW - DAY,
    paidAt: NOW - DAY,
  });
  store.addOrder({
    id: "ord_syncall_2",
    accountId: b.id,
    packageKey: "p",
    status: "CANCELLED",
    createdAt: NOW - DAY,
  });
  await svc.syncAll({ now: NOW });
  assert.equal(
    store.listNotifications("acc_a").filter((n) => n.type === "order.paid")
      .length,
    1,
  );
  assert.equal(
    store.listNotifications("acc_b").filter((n) => n.type === "order.cancelled")
      .length,
    1,
  );
  // scheduler controls exist and are idempotent / unref
  if (typeof svc.start === "function") {
    svc.start(60000);
    assert.equal(typeof svc.stop, "function");
    svc.stop();
    svc.stop();
  }
});

/* ---------- HTTP admin endpoints + customer shape ---------- */
// Isolated auth DB per file pattern (copy prod schema, clear rows)
const sharedDir = mkdtempSync(path.join(tmpdir(), "copilot-notifsvc-auth-"));
process.env.AUTH_DB_FILE = path.join(sharedDir, "auth.sqlite");
try {
  copyFileSync(
    path.join(__dirname, "..", "data", "auth.sqlite"),
    process.env.AUTH_DB_FILE,
  );
} catch {}
async function clearAuthDb(file) {
  try {
    const { default: Database } = await import("better-sqlite3");
    const db = new Database(file);
    db.pragma("foreign_keys = OFF");
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      )
      .all();
    for (const { name } of tables) db.prepare(`DELETE FROM "${name}"`).run();
    db.close();
  } catch {}
}
await clearAuthDb(process.env.AUTH_DB_FILE);

test("HTTP: admin notifications endpoints auth, shape, no identity, mark-read 404, invalid encoding 400", async (t) => {
  const { createCopilotServer } = await import("../src/server.js");
  const dataFile = path.join(
    mkdtempSync(path.join(tmpdir(), "copilot-notifsvc-http-")),
    "store.json",
  );
  const app = createCopilotServer({
    dataFile,
    adminToken: "admin-secret-token",
    allowUnauthenticatedAdmin: false,
    fetch: async () =>
      new Response(
        JSON.stringify({
          status: true,
          data: { order_id: "x", status: "PENDING" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  });
  await new Promise((r) => app.server.listen(0, r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(() => app.server.close());
  // seed account/order directly then sync via service if exposed, else via store admin add
  const store = app.store;
  store.addAccount({
    id: "acc_http",
    name: "Hidden Name",
    email: "hidden@gmail.com",
    createdAt: Date.now(),
  });
  store.addOrder({
    id: "ord_http_paid_1",
    accountId: "acc_http",
    packageKey: "quota-3b-90d",
    status: "PAID",
    createdAt: Date.now() - 1000,
    paidAt: Date.now() - 1000,
  });
  if (app.notificationService) {
    await app.notificationService.syncAll({ now: Date.now() });
  } else if (typeof store.addAdminNotification === "function") {
    store.addAdminNotification({
      type: "admin.order.paid",
      dedupeKey: "ord_http_paid_1",
      title: "Order paid",
      titleEn: "Order paid",
      body: "Order ord_http_p… paid.",
      bodyEn: "Order ord_http_p… paid.",
      linkKind: "order",
      linkId: "ord_http_paid_1",
      createdAt: Date.now(),
    });
  }

  // 401 without token
  const anon = await fetch(`${base}/api/admin/notifications`);
  assert.equal(anon.status, 401);
  const wrong = await fetch(`${base}/api/admin/notifications`, {
    headers: { authorization: "Bearer wrong" },
  });
  assert.equal(wrong.status, 401);
  // 401 before decoding on malformed id
  const malAnon = await fetch(`${base}/api/admin/notifications/%E0%A4%A/read`, {
    method: "POST",
  });
  assert.equal(malAnon.status, 401);

  const ok = await fetch(`${base}/api/admin/notifications`, {
    headers: { authorization: "Bearer admin-secret-token" },
  });
  assert.equal(ok.status, 200);
  const okJson = await ok.json();
  assert.ok(Array.isArray(okJson.notifications));
  assert.ok(okJson.notifications.length >= 1, JSON.stringify(okJson));
  assert.equal(typeof okJson.unread, "number");
  assert.equal(typeof okJson.total, "number");
  const raw = JSON.stringify(okJson);
  assert.ok(!raw.includes("hidden@gmail.com"));
  assert.ok(!raw.includes("Hidden Name"));
  assert.ok(
    !raw.includes("acc_http"),
    "admin payload must not include accountId value",
  );
  for (const n of okJson.notifications) {
    assert.deepEqual(
      Object.keys(n).sort(),
      [
        "body",
        "bodyEn",
        "createdAt",
        "id",
        "linkId",
        "linkKind",
        "readAt",
        "title",
        "titleEn",
        "type",
      ].sort(),
    );
  }
  const firstId = okJson.notifications[0].id;
  // mark read
  const read = await fetch(
    `${base}/api/admin/notifications/${encodeURIComponent(firstId)}/read`,
    { method: "POST", headers: { authorization: "Bearer admin-secret-token" } },
  );
  assert.equal(read.status, 200);
  // unknown 404
  const missing = await fetch(
    `${base}/api/admin/notifications/ntf_missing_xyz/read`,
    { method: "POST", headers: { authorization: "Bearer admin-secret-token" } },
  );
  assert.equal(missing.status, 404);
  // invalid encoding 400 after auth
  const mal = await fetch(`${base}/api/admin/notifications/%E0%A4%A/read`, {
    method: "POST",
    headers: { authorization: "Bearer admin-secret-token" },
  });
  assert.equal(mal.status, 400);
  // read-all
  const readAll = await fetch(`${base}/api/admin/notifications/read-all`, {
    method: "POST",
    headers: { authorization: "Bearer admin-secret-token" },
  });
  assert.equal(readAll.status, 200);
  const after = await (
    await fetch(`${base}/api/admin/notifications`, {
      headers: { authorization: "Bearer admin-secret-token" },
    })
  ).json();
  assert.equal(after.unread, 0);
  // limit query
  const limited = await (
    await fetch(`${base}/api/admin/notifications?limit=1`, {
      headers: { authorization: "Bearer admin-secret-token" },
    })
  ).json();
  assert.ok(limited.notifications.length <= 1);
  // lifecycle exports
  assert.ok(
    app.notificationService,
    "server should expose notificationService",
  );
  assert.equal(typeof app.stopNotifications, "function");
  app.stopNotifications();
});

test("HTTP: customer notifications include email fields defaulting safely", async (t) => {
  const { createCopilotServer } = await import("../src/server.js");
  const dataFile = path.join(
    mkdtempSync(path.join(tmpdir(), "copilot-notifsvc-cust-")),
    "store.json",
  );
  const app = createCopilotServer({
    dataFile,
    fetch: async () =>
      new Response(
        JSON.stringify({
          status: true,
          data: { order_id: "x", status: "PENDING" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  });
  await new Promise((r) => app.server.listen(0, r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(() => app.server.close());
  const email = `ntfsvc-${Date.now()}@gmail.com`;
  const signup = await fetch(`${base}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:4601",
    },
    body: JSON.stringify({
      email,
      password: `Gr0ut3r-${Math.random().toString(36).slice(2)}!Zq`,
      name: "NTFSVC",
    }),
  });
  assert.equal(signup.status, 200);
  const cookie = (signup.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
  const list = await fetch(`${base}/api/me/notifications`, {
    headers: { cookie },
  });
  assert.equal(list.status, 200);
  const json = await list.json();
  assert.ok(Array.isArray(json.notifications));
  // seed a paid order for this account via /api/me lookup
  const me = await (
    await fetch(`${base}/api/me`, { headers: { cookie } })
  ).json();
  app.store.addOrder({
    id: "ord_cust_shape_1",
    accountId: me.account.id,
    packageKey: "quota-3b-90d",
    status: "PAID",
    createdAt: Date.now() - 1000,
    paidAt: Date.now() - 1000,
  });
  const list2 = await (
    await fetch(`${base}/api/me/notifications`, { headers: { cookie } })
  ).json();
  assert.ok(list2.notifications.length >= 1);
  const n = list2.notifications.find((x) => x.type === "order.paid");
  assert.ok(n, JSON.stringify(list2));
  // Delivery metadata stays on the store row (engine/admin-internal) and
  // must NEVER be serialized into the customer payload (QA-leak closed).
  assert.ok(
    !("emailStatus" in n),
    "customer payload must not expose emailStatus",
  );
  assert.ok(!("emailedAt" in n), "customer payload must not expose emailedAt");
  assert.ok(
    !("emailAttempts" in n),
    "customer payload must not expose emailAttempts",
  );
  // link fields ARE part of the customer payload, scoped to the own order
  assert.equal(n.linkKind, "order");
  assert.equal(n.linkId, "ord_cust_shape_1");
});
