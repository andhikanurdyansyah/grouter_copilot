import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sharedDir = mkdtempSync(path.join(tmpdir(), "copilot-notifqa-auth-"));
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

const FAKE_QRIS = async () =>
  new Response(
    JSON.stringify({
      status: true,
      data: { order_id: "x", status: "PENDING" },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

async function startApp(
  t,
  {
    adminToken = undefined,
    allowUnauthenticatedAdmin = true,
    mailer = null,
  } = {},
) {
  const { createCopilotServer } = await import("../src/server.js");
  const dataFile = path.join(
    mkdtempSync(path.join(tmpdir(), "copilot-notifqa-store-")),
    "store.json",
  );
  const opts = { dataFile, fetch: FAKE_QRIS, allowUnauthenticatedAdmin };
  if (adminToken !== undefined) opts.adminToken = adminToken;
  if (mailer) opts.notificationMailer = mailer;
  const app = createCopilotServer(opts);
  await new Promise((r) => app.server.listen(0, r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  t.after(() => {
    try {
      app.stopNotifications?.();
    } catch {}
    app.server.close();
  });
  return { app, base, store: app.store };
}

let seq = 0;
async function signup(base, label) {
  seq += 1;
  const email = `qa-${label}-${Date.now()}-${seq}@gmail.com`;
  const password = `Gr0ut3r-${Math.random().toString(36).slice(2)}!Zq9`;
  const res = await fetch(`${base}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:4601",
    },
    body: JSON.stringify({ email, password, name: label }),
  });
  assert.equal(res.status, 200, `signup ${label} should succeed`);
  const cookie = (res.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
  assert.ok(cookie, "session cookie present");
  const me = await (
    await fetch(`${base}/api/me`, { headers: { cookie } })
  ).json();
  assert.ok(
    me?.account?.id,
    `me for ${label}: ${JSON.stringify(me).slice(0, 200)}`,
  );
  return { email, cookie, accountId: me.account.id };
}

test("QA-1 IDOR: user B cannot see/mark A rows (404), read-all only own, unauth 401", async (t) => {
  const { base, store } = await startApp(t);
  const A = await signup(base, "AlphaQa");
  const B = await signup(base, "BetaQa");
  const now = Date.now();
  store.addOrder({
    id: "ord_qa_a_paid",
    accountId: A.accountId,
    packageKey: "p",
    planName: "PlanA",
    status: "PAID",
    createdAt: now - 1000,
    paidAt: now - 1000,
  });
  store.addOrder({
    id: "ord_qa_b_paid",
    accountId: B.accountId,
    packageKey: "p",
    planName: "PlanB",
    status: "PAID",
    createdAt: now - 1000,
    paidAt: now - 1000,
  });

  const listA = await (
    await fetch(`${base}/api/me/notifications`, {
      headers: { cookie: A.cookie },
    })
  ).json();
  assert.equal(listA.notifications.length, 1, JSON.stringify(listA));
  assert.equal(listA.unread, 1);
  const aNotif = listA.notifications[0];
  assert.ok(
    !JSON.stringify(listA).includes("ord_qa_b_paid"),
    "A must not see B order id",
  );

  const listB = await (
    await fetch(`${base}/api/me/notifications`, {
      headers: { cookie: B.cookie },
    })
  ).json();
  assert.equal(listB.notifications.length, 1);
  assert.ok(
    !JSON.stringify(listB).includes("ord_qa_a_paid"),
    "B must not see A order id",
  );
  assert.notEqual(listB.notifications[0].id, aNotif.id);

  // B marking A's id -> 404 (not 200/403-leak), A row stays unread
  const cross = await fetch(
    `${base}/api/me/notifications/${encodeURIComponent(aNotif.id)}/read`,
    { method: "POST", headers: { cookie: B.cookie } },
  );
  assert.equal(
    cross.status,
    404,
    `cross-tenant mark must be 404, got ${cross.status}`,
  );
  const listA2 = await (
    await fetch(`${base}/api/me/notifications`, {
      headers: { cookie: A.cookie },
    })
  ).json();
  assert.equal(listA2.unread, 1, "A row must stay unread after B attempt");

  // B read-all only affects B
  const raB = await fetch(`${base}/api/me/notifications/read-all`, {
    method: "POST",
    headers: { cookie: B.cookie },
  });
  assert.equal(raB.status, 200);
  assert.equal((await raB.json()).changed, 1);
  const listA3 = await (
    await fetch(`${base}/api/me/notifications`, {
      headers: { cookie: A.cookie },
    })
  ).json();
  assert.equal(listA3.unread, 1, "B read-all must not touch A");

  // owner mark succeeds
  const own = await fetch(
    `${base}/api/me/notifications/${encodeURIComponent(aNotif.id)}/read`,
    { method: "POST", headers: { cookie: A.cookie } },
  );
  assert.equal(own.status, 200);

  // unauthenticated
  for (const [method, url] of [
    ["GET", "/api/me/notifications"],
    ["POST", "/api/me/notifications/read-all"],
    ["POST", `/api/me/notifications/${aNotif.id}/read`],
  ]) {
    const r = await fetch(`${base}${url}`, { method });
    assert.equal(r.status, 401, `${method} ${url} anon must be 401`);
  }
  // malformed id encoding with session -> 400
  const mal = await fetch(`${base}/api/me/notifications/%E0%A4%A/read`, {
    method: "POST",
    headers: { cookie: A.cookie },
  });
  assert.equal(mal.status, 400);
});

test("QA-2 link fields are account-scoped + admin payload stays generic (strict server)", async (t) => {
  const { base, store } = await startApp(t, {
    adminToken: "qa-admin-secret",
    allowUnauthenticatedAdmin: false,
  });
  const A = await signup(base, "GammaQa");
  const now = Date.now();
  store.addOrder({
    id: "ord_qa_gamma_1",
    accountId: A.accountId,
    packageKey: "p",
    status: "PAID",
    createdAt: now - 1000,
    paidAt: now - 1000,
  });
  // Customer payload carries link fields NOW, but only for the account's OWN
  // resources (derived server-side from its orders -> order id, licenses ->
  // license id). Never accountId/dedupeKey/foreign identities.
  const cust = await (
    await fetch(`${base}/api/me/notifications`, {
      headers: { cookie: A.cookie },
    })
  ).json();
  assert.ok(cust.notifications.length >= 1, "customer rows exist");
  for (const n of cust.notifications) {
    assert.ok(
      !("accountId" in n),
      "customer payload must not contain accountId",
    );
    assert.ok(
      !("email" in n) && !("name" in n),
      "customer payload must not carry identity fields",
    );
    assert.ok(
      !("dedupeKey" in n),
      "customer payload must not contain dedupeKey",
    );
    if (n.linkKind === "order")
      assert.equal(
        n.linkId,
        "ord_qa_gamma_1",
        "order link points at the account own order",
      );
    if (n.linkKind === "license")
      assert.ok(
        !String(n.linkId).startsWith("ord_"),
        "license link never points at an order id",
      );
  }
  assert.ok(
    cust.notifications.some(
      (n) => n.type === "order.paid" && n.linkKind === "order",
    ),
    "order.paid row links to the order",
  );
  // admin gates: customer session cookie is NOT an admin credential
  const asCustomer = await fetch(`${base}/api/admin/notifications`, {
    headers: { cookie: A.cookie },
  });
  assert.equal(
    asCustomer.status,
    401,
    "customer session must not open admin list",
  );
  const noTok = await fetch(`${base}/api/admin/notifications`);
  assert.equal(noTok.status, 401);
  const wrongTok = await fetch(`${base}/api/admin/notifications`, {
    headers: { authorization: "Bearer wrong" },
  });
  assert.equal(wrongTok.status, 401);
  // admin payload: exact key set, generic links, no customer identity anywhere
  const adm = await (
    await fetch(`${base}/api/admin/notifications`, {
      headers: { authorization: "Bearer qa-admin-secret" },
    })
  ).json();
  assert.ok(adm.notifications.length >= 1, "admin rows exist");
  for (const n of adm.notifications) {
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
    const blob = JSON.stringify(n);
    assert.ok(
      !blob.includes("qa-admin"),
      "admin payload must not leak the admin token",
    );
    assert.ok(
      !blob.includes(A.email ?? ""),
      "admin payload must not carry customer email",
    );
    assert.ok(
      /@/.test(blob) === false,
      "admin payload must not contain an email address anywhere",
    );
  }
});

test("QA-6 HTTP: broken mailer -> GET /api/me/notifications still 200 with rows; admin GET still 200", async (t) => {
  const broken = {
    calls: 0,
    async send() {
      this.calls++;
      throw new Error("sync throw from mailer");
    },
  };
  const { base, store } = await startApp(t, { mailer: broken });
  const A = await signup(base, "BrokenQa");
  const now = Date.now();
  store.addOrder({
    id: "ord_qa_broken_1",
    accountId: A.accountId,
    packageKey: "p",
    status: "PAID",
    createdAt: now - 1000,
    paidAt: now - 1000,
  });
  const res = await fetch(`${base}/api/me/notifications`, {
    headers: { cookie: A.cookie },
  });
  assert.equal(res.status, 200, "broken mailer must not 500 the customer list");
  const json = await res.json();
  assert.equal(json.notifications.length, 1);
  assert.ok(broken.calls >= 1, "mailer was attempted");
  const row = store
    .listNotifications(A.accountId)
    .find((n) => n.type === "order.paid");
  assert.equal(row.emailStatus, "failed");
  // admin list also survives (syncAll isolates per-account failures)
  const adm = await fetch(`${base}/api/admin/notifications`);
  assert.equal(adm.status, 200);
});

test("QA-7 HTTP: unread/total describe the full collection, not the limited slice", async (t) => {
  const { base, store } = await startApp(t);
  const A = await signup(base, "LimitQa");
  // seed 3 unread rows directly (bypass derivation)
  for (let i = 0; i < 3; i++)
    store.addNotification({
      accountId: A.accountId,
      type: "order.paid",
      dedupeKey: `qa-limit-${i}`,
      title: "t",
      titleEn: "t",
      body: "b",
      bodyEn: "b",
      createdAt: Date.now() - i * 1000,
    });
  const limited = await (
    await fetch(`${base}/api/me/notifications?limit=1`, {
      headers: { cookie: A.cookie },
    })
  ).json();
  assert.equal(limited.notifications.length, 1);
  // Fixed: the slice stays limited, but unread/total always describe the
  // authorized full collection so the bell badge never under-reports.
  assert.equal(limited.total, 3, "customer total = full collection");
  assert.equal(limited.unread, 3, "customer unread = full collection");
  assert.equal(
    limited.notifications[0].linkKind ?? null,
    null,
    "seeded rows carry null link fields",
  );
  const full = await (
    await fetch(`${base}/api/me/notifications?limit=50`, {
      headers: { cookie: A.cookie },
    })
  ).json();
  assert.equal(full.unread, 3);
  assert.equal(full.total, 3);
});

test("QA-LEAK-CLOSED: customer payload attempts no delivery metadata", async (t) => {
  // Rule: delivery metadata lives on the row but is admin/engine-internal.
  // The customer serializer must never expose provider delivery state.
  const { base, store } = await startApp(t);
  const A = await signup(base, "LeakQa");
  store.addOrder({
    id: "ord_qa_leak_1",
    accountId: A.accountId,
    packageKey: "p",
    status: "PAID",
    createdAt: Date.now() - 1000,
    paidAt: Date.now() - 1000,
  });
  const json = await (
    await fetch(`${base}/api/me/notifications`, {
      headers: { cookie: A.cookie },
    })
  ).json();
  assert.ok(json.notifications.length >= 1, "row exists");
  for (const n of json.notifications) {
    assert.ok(
      !("emailStatus" in n),
      "customer payload must NOT expose emailStatus",
    );
    assert.ok(
      !("emailedAt" in n),
      "customer payload must NOT expose emailedAt",
    );
    assert.ok(
      !("emailAttempts" in n),
      "customer payload must NOT expose emailAttempts",
    );
    assert.ok(
      !("lastEmailError" in n) && !("lastError" in n),
      "customer payload must NOT expose delivery errors",
    );
  }
});
