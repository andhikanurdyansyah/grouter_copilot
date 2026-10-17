import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { JsonStore } from "../src/store.js";
import { resolveSettings } from "../src/settings.js";
import {
  createNotificationService,
  parseTimeMs,
} from "../src/notifications.js";
import {
  buildPaymentReceivedEmail,
  buildLicenseIssuedEmail,
  buildLicenseExpiringEmail,
  buildPasswordResetEmail,
  createMailer,
} from "../src/mail.js";

const NOW = 1_800_000_000_000;
const DAY = 86400000;

function tmpFile() {
  return path.join(
    mkdtempSync(path.join(tmpdir(), "copilot-notifqa-svc-")),
    "store.json",
  );
}

function setup({ mailer } = {}) {
  const file = tmpFile();
  const store = new JsonStore(file);
  const svc = createNotificationService({
    store,
    settingsGetter: () => resolveSettings(store.getSettings(), {}),
    mailer,
    now: () => NOW,
  });
  return { store, svc, file };
}
function seed(store, id = "acc_qa", email = "qa-customer@example.com") {
  const acc = { id, name: "Qa Name", email, createdAt: NOW - 30 * DAY };
  store.addAccount(acc);
  return acc;
}

test("QA-3 injection: malicious plan/order/license ids are escaped in every email template", () => {
  const evilScript = "<script>alert(1)</script>";
  const evilImg = '"><img src=x onerror=alert(2)>';
  for (const tpl of [
    buildPaymentReceivedEmail({
      orderId: `ord_${evilScript}`,
      licenseId: `lic_${evilScript}`,
      planName: evilScript,
    }),
    buildPaymentReceivedEmail({
      orderId: "ord_x",
      licenseId: null,
      planName: evilImg,
    }),
    buildLicenseIssuedEmail({
      licenseId: `lic_${evilScript}`,
      planName: evilImg,
    }),
    buildLicenseExpiringEmail({
      licenseId: `lic_${evilScript}`,
      expiresAt: NOW + DAY,
      daysLeft: 1,
    }),
  ]) {
    assert.ok(
      !tpl.html.includes("<script>alert"),
      `raw script must not land in html: ${tpl.subject}`,
    );
    assert.ok(
      !tpl.html.includes("<img src=x onerror"),
      "raw img/onerror must not land in html",
    );
    assert.ok(
      !tpl.html.includes(evilImg),
      "raw attribute-breakout must not land in html",
    );
  }
  // notification-driven path: order.planName flows into the payment template
  const svcTpl = buildPaymentReceivedEmail({
    orderId: "ord_123",
    licenseId: null,
    planName: evilScript,
  });
  assert.ok(svcTpl.html.includes("&lt;script&gt;"), "escaped form present");
  // shortId truncation alone is not the defence: a payload inside the first
  // 8 chars must still be escaped
  const shortPayload = buildLicenseIssuedEmail({
    licenseId: "<script>",
    planName: "x",
  });
  assert.ok(
    !shortPayload.html.includes("<script>"),
    "short payload must be escaped, not truncated away",
  );
  // text fallback carries raw ids by design (plain text, not HTML) — assert it is NOT html
  assert.ok(!svcTpl.text.includes("&lt;"), "text part stays plain text");
});

test("QA-3b injection via service: malicious planName on a PAID order reaches mailer only escaped", async () => {
  const sent = [];
  const mailer = {
    async send(a) {
      sent.push(a);
      return { status: "sent" };
    },
  };
  const { store, svc } = setup({ mailer });
  const acc = seed(store);
  store.addOrder({
    id: "ord_qa_inj_1",
    accountId: acc.id,
    packageKey: "p",
    planName: "<script>alert(9)</script>",
    status: "PAID",
    createdAt: NOW - DAY,
    paidAt: NOW - DAY,
    licenseId: null,
  });
  await svc.syncAccount(acc, { now: NOW });
  assert.equal(sent.length, 1);
  assert.ok(
    !sent[0].html.includes("<script>alert(9)"),
    "mailer html must be escaped",
  );
  assert.ok(sent[0].html.includes("&lt;script&gt;"));
});

test("QA-4 dedupe/replay: syncAccount x2 + syncAll x2 -> zero duplicates (customer + admin), sent email not resent", async () => {
  const mailer = {
    calls: [],
    async send(a) {
      this.calls.push(a);
      return { status: "sent", providerId: "p1" };
    },
  };
  const { store, svc } = setup({ mailer });
  const acc = seed(store);
  const other = seed(store, "acc_qb", "qb@example.com");
  store.addOrder({
    id: "ord_qa_dedupe_1",
    accountId: acc.id,
    packageKey: "p",
    status: "PAID",
    createdAt: NOW - DAY,
    paidAt: NOW - DAY,
    licenseId: "lic_qa_dedupe_1",
  });
  store.addLicense({
    id: "lic_qa_dedupe_1",
    customer: "x",
    accountId: acc.id,
    planKey: "quota-3b-90d",
    features: [],
    createdAt: NOW - DAY,
    expiresAt: NOW + 90 * DAY,
    revokedAt: null,
  });
  await svc.syncAccount(acc, { now: NOW });
  await svc.syncAccount(acc, { now: NOW });
  const afterSync = store.listNotifications(acc.id, { limit: 50 }).length;
  const adminAfterSync = store.listAdminNotifications({ limit: 50 }).length;
  const callsAfterSync = mailer.calls.length;
  await svc.syncAll({ now: NOW });
  await svc.syncAll({ now: NOW });
  assert.equal(
    store.listNotifications(acc.id, { limit: 50 }).length,
    afterSync,
    "no customer duplicates after syncAll x2",
  );
  assert.equal(
    store.listAdminNotifications({ limit: 50 }).length,
    adminAfterSync,
    "no admin duplicates after syncAll x2",
  );
  assert.equal(
    mailer.calls.length,
    callsAfterSync,
    "sent email must never be re-attempted",
  );
  assert.ok(callsAfterSync >= 1);
  const paid = store
    .listNotifications(acc.id)
    .find((n) => n.type === "order.paid");
  assert.equal(paid.emailStatus, "sent");
  assert.equal(paid.emailAttempts, 1);
  // other account untouched by acc syncs
  assert.equal(store.listNotifications(other.id, { limit: 50 }).length, 0);
});

test("QA-5 retry policy: failing mailer retried until the attempt cap, then stops", async () => {
  let attempts = 0;
  const failing = {
    async send() {
      attempts++;
      return { status: "failed", error: "provider down" };
    },
  };
  const { store, svc } = setup({ mailer: failing });
  const acc = seed(store);
  store.addOrder({
    id: "ord_qa_retry_1",
    accountId: acc.id,
    packageKey: "p",
    status: "PAID",
    createdAt: NOW - DAY,
    paidAt: NOW - DAY,
  });
  // Default cap is 5 total attempts (1 initial + 4 retries). Retries are
  // gated by the persisted backoff (emailNextRetryAt), so syncs 1s apart do
  // NOT each burn an attempt; time-travel past the gate each round. Past
  // the cap the row is terminally `exhausted` and never attempted again.
  let t = NOW;
  await svc.syncAccount(acc, { now: t });
  for (let i = 0; i < 7; i++) {
    t += 2 * 3_600_000; // 2h — beyond the largest backoff step (1h cap)
    await svc.syncAccount(acc, { now: t });
  }
  const row = store
    .listNotifications(acc.id)
    .find((n) => n.type === "order.paid");
  assert.equal(
    row.emailAttempts,
    5,
    `expected capped 5 attempts, got ${row.emailAttempts}`,
  );
  assert.equal(attempts, 5);
  assert.equal(row.emailStatus, "exhausted");
  assert.equal(row.emailedAt, null);
});

test("QA-5b terminal states never re-attempted: sent / log_only / disabled", async () => {
  for (const status of ["sent", "log_only", "disabled"]) {
    const mailer = {
      calls: 0,
      async send() {
        this.calls++;
        return { status };
      },
    };
    const { store, svc } = setup({ mailer });
    const acc = seed(store);
    store.addOrder({
      id: `ord_qa_term_${status}`,
      accountId: acc.id,
      packageKey: "p",
      status: "PAID",
      createdAt: NOW - DAY,
      paidAt: NOW - DAY,
    });
    await svc.syncAccount(acc, { now: NOW });
    await svc.syncAccount(acc, { now: NOW + 1000 });
    await svc.syncAccount(acc, { now: NOW + 2000 });
    const row = store
      .listNotifications(acc.id)
      .find((n) => n.type === "order.paid");
    assert.equal(mailer.calls, 1, `${status} must be attempted exactly once`);
    assert.equal(row.emailAttempts, 1);
    assert.equal(row.emailStatus, status);
    assert.ok(row.emailedAt, `${status} sets emailedAt`);
  }
  // missing recipient email -> disabled, no mailer call
  const mailer2 = {
    calls: 0,
    async send() {
      this.calls++;
      return { status: "sent" };
    },
  };
  const s2 = setup({ mailer: mailer2 });
  const noMail = {
    id: "acc_nomail",
    name: "NoMail",
    email: "",
    createdAt: NOW - DAY,
  };
  s2.store.addAccount(noMail);
  s2.store.addOrder({
    id: "ord_qa_nomail_1",
    accountId: noMail.id,
    packageKey: "p",
    status: "PAID",
    createdAt: NOW - DAY,
    paidAt: NOW - DAY,
  });
  await s2.svc.syncAccount(noMail, { now: NOW });
  assert.equal(mailer2.calls, 0);
  assert.equal(
    s2.store.listNotifications(noMail.id).find((n) => n.type === "order.paid")
      .emailStatus,
    "disabled",
  );
});

test("QA-6 failure isolation: sync-throw / reject / HTTP500 mailers never break sync or other accounts", async () => {
  // (a) mailer throws synchronously
  const thrower = {
    send() {
      throw new Error("sync boom");
    },
  };
  const a = setup({ mailer: thrower });
  const accA = seed(a.store);
  a.store.addOrder({
    id: "ord_qa_throw_1",
    accountId: accA.id,
    packageKey: "p",
    status: "PAID",
    createdAt: NOW - DAY,
    paidAt: NOW - DAY,
  });
  const emitted = await a.svc.syncAccount(accA, { now: NOW });
  assert.ok(
    emitted.length >= 1,
    "syncAccount must still emit rows when mailer throws",
  );
  assert.equal(
    a.store.listNotifications(accA.id).find((n) => n.type === "order.paid")
      .emailStatus,
    "ambiguous",
  );

  // (b) mailer rejects + fails only for one account; syncAll still covers the other
  const selective = {
    async send({ to }) {
      if (to === "bad@example.com") throw new Error("reject boom");
      return { status: "sent" };
    },
  };
  const b = setup({ mailer: selective });
  const bad = seed(b.store, "acc_bad", "bad@example.com");
  const good = seed(b.store, "acc_good", "good@example.com");
  b.store.addOrder({
    id: "ord_qa_bad_1",
    accountId: bad.id,
    packageKey: "p",
    status: "PAID",
    createdAt: NOW - DAY,
    paidAt: NOW - DAY,
  });
  b.store.addOrder({
    id: "ord_qa_good_1",
    accountId: good.id,
    packageKey: "p",
    status: "PAID",
    createdAt: NOW - DAY,
    paidAt: NOW - DAY,
  });
  await b.svc.syncAll({ now: NOW });
  assert.equal(
    b.store.listNotifications("acc_bad").find((n) => n.type === "order.paid")
      .emailStatus,
    "ambiguous",
  );
  assert.equal(
    b.store.listNotifications("acc_good").find((n) => n.type === "order.paid")
      .emailStatus,
    "sent",
  );

  // (c) real mailer + provider HTTP 500 -> failed row, sync resolves
  const mailer500 = createMailer({
    fetchImpl: async () => new Response("provider error", { status: 500 }),
    env: { BREVO_API_KEY: "brevo-test-qa" },
    settingsGetter: () => resolveSettings({}, {}),
  });
  const c = setup({ mailer: mailer500 });
  const accC = seed(c.store);
  c.store.addOrder({
    id: "ord_qa_500_1",
    accountId: accC.id,
    packageKey: "p",
    status: "PAID",
    createdAt: NOW - DAY,
    paidAt: NOW - DAY,
  });
  await c.svc.syncAccount(accC, { now: NOW });
  const rowC = c.store
    .listNotifications(accC.id)
    .find((n) => n.type === "order.paid");
  assert.equal(rowC.emailStatus, "failed");
  assert.ok(
    !String(rowC.lastEmailError).includes("brevo-test-qa"),
    "error must not leak api key",
  );

  // (d) real mailer + fetch rejects -> failed row, sync resolves
  const mailerRej = createMailer({
    fetchImpl: async () => {
      throw new Error("network down");
    },
    env: { BREVO_API_KEY: "brevo-test-qa" },
    settingsGetter: () => resolveSettings({}, {}),
  });
  const d = setup({ mailer: mailerRej });
  const accD = seed(d.store);
  d.store.addOrder({
    id: "ord_qa_rej_1",
    accountId: accD.id,
    packageKey: "p",
    status: "PAID",
    createdAt: NOW - DAY,
    paidAt: NOW - DAY,
  });
  await d.svc.syncAccount(accD, { now: NOW });
  assert.equal(
    d.store.listNotifications(accD.id).find((n) => n.type === "order.paid")
      .emailStatus,
    "failed",
  );
});

test("QA-7 state integrity: read persists across reload; retention drops oldest (incl. unread) silently", () => {
  const file = tmpFile();
  const s1 = new JsonStore(file);
  const n = s1.addNotification({
    accountId: "acc_qa",
    type: "order.paid",
    dedupeKey: "qa-persist-1",
    title: "t",
    titleEn: "t",
    body: "b",
    bodyEn: "b",
    createdAt: NOW,
  });
  s1.markNotificationRead("acc_qa", n.id);
  const s2 = new JsonStore(file);
  assert.ok(s2.listNotifications("acc_qa")[0].readAt, "readAt survives reload");
  // unread vs rows on the reloaded store agree
  const rows = s2.listNotifications("acc_qa", { limit: 200 });
  assert.equal(rows.filter((r) => r.readAt == null).length, 0);

  // retention: 105 rows, oldest 5 are UNREAD -> they are dropped, count shrinks
  const file2 = tmpFile();
  const s3 = new JsonStore(file2);
  for (let i = 0; i < 105; i++)
    s3.addNotification({
      accountId: "acc_ret",
      type: "x.y",
      dedupeKey: `qa-ret-${i}`,
      title: "t",
      titleEn: "t",
      body: "b",
      bodyEn: "b",
      createdAt: NOW + i,
    });
  const kept = s3.listNotifications("acc_ret", { limit: 200 });
  assert.equal(kept.length, 100, "cap 100");
  assert.ok(
    !kept.some((r) => r.dedupeKey === "qa-ret-0"),
    "oldest unread rows dropped by retention (characterized)",
  );
  assert.equal(kept[0].dedupeKey, "qa-ret-104", "newest kept first");
  // file on disk matches memory
  const onDisk = JSON.parse(readFileSync(file2, "utf8"));
  assert.equal(
    onDisk.notifications.filter((r) => r.accountId === "acc_ret").length,
    100,
  );
});

test("QA-8 CTA/URL safety: fixed origin CTAs; non-http(s) reset URL falls back to the public dashboard", () => {
  for (const tpl of [
    buildPaymentReceivedEmail({
      orderId: "ord_1",
      licenseId: "lic_1",
      planName: "P",
    }),
    buildLicenseIssuedEmail({ licenseId: "lic_1", planName: "P" }),
    buildLicenseExpiringEmail({
      licenseId: "lic_1",
      expiresAt: NOW + DAY,
      daysLeft: 1,
    }),
  ]) {
    const hrefs = [...tpl.html.matchAll(/<a href=\"([^\"]*)\"/g)].map(
      (m) => m[1],
    );
    assert.ok(hrefs.length >= 1);
    for (const h of hrefs)
      assert.ok(
        h === "https://copilot.grouter.id/app/" ||
          h.startsWith("https://copilot.grouter.id/"),
        `CTA must be fixed public origin, got ${h}`,
      );
    assert.ok(!tpl.html.includes("javascript:"));
  }
  // Hardening (safeHttpUrl): any URL that is not http(s) falls back to the
  // public dashboard, so a hostile or malformed reset URL can never become
  // an executable link in the inbox; well-formed http(s) URLs are preserved.
  const hostile = buildPasswordResetEmail({ url: "javascript:alert(1)" });
  assert.ok(
    !hostile.html.includes("javascript:"),
    "javascript: URL never reaches the html",
  );
  assert.ok(
    hostile.html.includes('href="https://copilot.grouter.id/app/"'),
    "non-http(s) reset falls back to the public dashboard",
  );
  assert.ok(
    !hostile.text.includes("javascript:"),
    "text part never carries a non-http(s) URL",
  );
  // Quote breakout is neutralized: the URL is parsed (URL normalization
  // percent-encodes the quote), so no raw attribute breakout survives.
  const breakout = buildPasswordResetEmail({
    url: 'https://copilot.grouter.id/reset?x=" onmouseover="alert(1)',
  });
  assert.ok(
    !breakout.html.includes('" onmouseover="'),
    "attribute breakout must not survive raw",
  );
  const ok = buildPasswordResetEmail({
    url: "https://copilot.grouter.id/reset-password?token=abc123",
  });
  assert.ok(
    ok.html.includes(
      'href="https://copilot.grouter.id/reset-password?token=abc123"',
    ),
    "https reset URL is preserved",
  );
});

test("QA-extra: parseTimeMs + store cross-account email marking guard", () => {
  assert.equal(parseTimeMs(null), null);
  assert.equal(parseTimeMs(""), null);
  assert.equal(parseTimeMs(1_700_000_000), 1_700_000_000_000);
  assert.equal(parseTimeMs(1_700_000_000_000), 1_700_000_000_000);
  const file = tmpFile();
  const s = new JsonStore(file);
  const n = s.addNotification({
    accountId: "acc_a",
    type: "t",
    dedupeKey: "k",
    title: "t",
    titleEn: "t",
    body: "b",
    bodyEn: "b",
    createdAt: NOW,
  });
  assert.equal(
    s.markNotificationEmail("acc_b", n.id, { status: "sent", at: NOW }),
    null,
    "foreign account cannot mark email",
  );
  assert.equal(s.markNotificationRead("acc_b", n.id), null);
  assert.equal(s.listNotifications("acc_b").length, 0);
});

test("QA-9 license.expired: emitted exactly once at lapse (customer + admin), deduped on re-sync", async () => {
  const sent = [];
  const mailer = {
    async send(a) {
      sent.push(a);
      return { status: "sent" };
    },
  };
  const { store, svc } = setup({ mailer });
  const acc = seed(store);
  store.addLicense({
    id: "lic_qa_exp_1",
    accountId: acc.id,
    planKey: "p",
    createdAt: NOW - 90 * DAY,
    expiresAt: NOW - DAY,
    revokedAt: null,
  });
  await svc.syncAccount(acc, { now: NOW });
  await svc.syncAccount(acc, { now: NOW + DAY });
  await svc.syncAll({ now: NOW + 2 * DAY });
  const cust = store
    .listNotifications(acc.id)
    .filter((n) => n.type === "license.expired");
  assert.equal(
    cust.length,
    1,
    "license.expired exactly once across repeated syncs",
  );
  assert.equal(cust[0].linkKind, "license");
  assert.equal(cust[0].linkId, "lic_qa_exp_1");
  assert.equal(
    cust[0].emailStatus,
    null,
    "license.expired is in-app only (no email row state)",
  );
  const adm = store
    .listAdminNotifications()
    .filter((n) => n.type === "admin.license.expired");
  assert.equal(adm.length, 1, "admin.license.expired exactly once");
  assert.ok(
    !sent.some((m) => /kedaluwarsa|expired/i.test(m.subject ?? "")),
    "no expiry email is sent for license.expired",
  );
});

test("QA-10 license.revoked wins over expired: no double closing signal", async () => {
  const { store, svc } = setup({});
  const acc = seed(store);
  store.addLicense({
    id: "lic_qa_rev_1",
    accountId: acc.id,
    planKey: "p",
    createdAt: NOW - 90 * DAY,
    expiresAt: NOW - DAY,
    revokedAt: NOW - 2 * DAY,
  });
  await svc.syncAccount(acc, { now: NOW });
  await svc.syncAccount(acc, { now: NOW + DAY });
  const types = store.listNotifications(acc.id).map((n) => n.type);
  assert.ok(types.includes("license.revoked"), "revoked event present");
  assert.ok(
    !types.includes("license.expired"),
    "expired must not fire for a revoked license",
  );
});

test("QA-11 quota.exhausted at 100% + quota.threshold at 90%, once per quota period", async () => {
  const { store, svc } = setup({});
  const acc = seed(store);
  store.addLicense({
    id: "lic_qa_quota_1",
    accountId: acc.id,
    planKey: "no-such-plan",
    quotaTokens: 100,
    createdAt: NOW - 10 * DAY,
    expiresAt: NOW + 30 * DAY,
    revokedAt: null,
  });
  store.addUsageRecord({
    requestId: "req_qa_q1",
    licenseId: "lic_qa_quota_1",
    accountId: acc.id,
    status: "ok",
    totalTokens: 100,
    createdAt: NOW - DAY,
  });
  await svc.syncAccount(acc, { now: NOW });
  await svc.syncAccount(acc, { now: NOW + DAY });
  const cust = store.listNotifications(acc.id);
  const thr = cust.filter((n) => n.type === "quota.threshold");
  const exh = cust.filter((n) => n.type === "quota.exhausted");
  assert.equal(thr.length, 1, "threshold fires once per period");
  assert.equal(exh.length, 1, "exhausted fires once per period");
  assert.equal(exh[0].linkKind, "license");
  assert.equal(exh[0].linkId, "lic_qa_quota_1");
  assert.equal(exh[0].emailStatus, null, "quota.exhausted is in-app only");
  const admExh = store
    .listAdminNotifications()
    .filter((n) => n.type === "admin.quota.exhausted");
  assert.equal(admExh.length, 1, "admin.quota.exhausted once");
});

test("QA-12 unlimited quota (no resolved limit) never fires threshold or exhausted", async () => {
  const { store, svc } = setup({});
  const acc = seed(store);
  store.addLicense({
    id: "lic_qa_unlim_1",
    accountId: acc.id,
    planKey: "no-such-plan",
    quotaTokens: null,
    createdAt: NOW - 10 * DAY,
    expiresAt: NOW + 30 * DAY,
    revokedAt: null,
  });
  store.addUsageRecord({
    requestId: "req_qa_u1",
    licenseId: "lic_qa_unlim_1",
    accountId: acc.id,
    status: "ok",
    totalTokens: 10_000_000,
    createdAt: NOW - DAY,
  });
  await svc.syncAccount(acc, { now: NOW });
  const types = store.listNotifications(acc.id).map((n) => n.type);
  assert.ok(!types.includes("quota.threshold"), "unlimited never thresholds");
  assert.ok(!types.includes("quota.exhausted"), "unlimited never exhausts");
});
