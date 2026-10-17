import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { JsonStore } from "../src/store.js";
import { resolveSettings } from "../src/settings.js";
import { createNotificationService } from "../src/notifications.js";

// Reliability / fault-injection suite for the LOCKED email-delivery contract:
// claim/lease ("sending" + emailClaimedAt), attempt incremented at attempt
// START, exponential backoff via emailNextRetryAt, 5-attempt cap ->
// "exhausted", non-retryable -> immediate "exhausted", thrown mailer ->
// ambiguous (never "sent"), and syncAccount delivery modes all/new/none.
// Several tests are expected RED on the pre-hardening implementation: the
// service currently re-reads a null/failed row in every concurrent sync and
// retries it immediately, so parallel syncs duplicate mailer calls.

const BASE = 1_800_000_000_000;
const DAY = 86_400_000;
const HOUR = 3_600_000;

function tmpFile() {
  return path.join(
    mkdtempSync(path.join(tmpdir(), "copilot-notif-rel-")),
    "store.json",
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setup(mailer) {
  let nowMs = BASE;
  const store = new JsonStore(tmpFile());
  const svc = createNotificationService({
    store,
    settingsGetter: () => resolveSettings(store.getSettings(), {}),
    mailer,
    now: () => nowMs,
  });
  return {
    store,
    svc,
    get nowMs() {
      return nowMs;
    },
    advance(ms) {
      nowMs += ms;
    },
  };
}

function seedPaid(
  ctx,
  { accountId = "acc_r", email = "r@example.com", orderId = "ord_r_1" } = {},
) {
  const acc = {
    id: accountId,
    name: "Reliability Name",
    email,
    createdAt: ctx.nowMs - 30 * DAY,
  };
  ctx.store.addAccount(acc);
  ctx.store.addOrder({
    id: orderId,
    accountId: acc.id,
    packageKey: "p",
    planName: "Pro",
    status: "PAID",
    createdAt: ctx.nowMs - DAY,
    paidAt: ctx.nowMs - DAY,
    licenseId: null,
  });
  return acc;
}

function paidRow(ctx, accountId) {
  const row = ctx.store
    .listNotifications(accountId, { limit: 50 })
    .find((n) => n.type === "order.paid");
  assert.ok(row, "order.paid row must exist");
  return row;
}

function retryableFailureMailer(counter) {
  return {
    async send() {
      counter.calls++;
      await sleep(10);
      return {
        status: "failed",
        error: "provider down",
        category: "provider_error",
        retryable: true,
      };
    },
  };
}

test("R-1 concurrent initial delivery: two parallel syncs make exactly one mailer call", async () => {
  const counter = { calls: 0 };
  const mailer = {
    async send() {
      counter.calls++;
      await sleep(60);
      return { status: "sent", providerId: "msg-r1" };
    },
  };
  const ctx = setup(mailer);
  const acc = seedPaid(ctx, {
    accountId: "acc_r1",
    email: "r1@example.com",
    orderId: "ord_r1_1",
  });
  await Promise.all([ctx.svc.syncAccount(acc), ctx.svc.syncAccount(acc)]);
  const row = paidRow(ctx, acc.id);
  assert.equal(
    counter.calls,
    1,
    "parallel syncs must not duplicate the first attempt",
  );
  assert.equal(row.emailAttempts, 1);
  assert.equal(row.emailStatus, "sent");
});

test("R-2 concurrent retry: 5 parallel syncs after backoff make exactly one additional call", async () => {
  const counter = { calls: 0 };
  const ctx = setup(retryableFailureMailer(counter));
  const acc = seedPaid(ctx, {
    accountId: "acc_r2",
    email: "r2@example.com",
    orderId: "ord_r2_1",
  });
  await ctx.svc.syncAccount(acc);
  assert.equal(counter.calls, 1, "serial first attempt");
  ctx.advance(120_000);
  await Promise.all([
    ctx.svc.syncAccount(acc),
    ctx.svc.syncAccount(acc),
    ctx.svc.syncAccount(acc),
    ctx.svc.syncAccount(acc),
    ctx.svc.syncAccount(acc),
  ]);
  const row = paidRow(ctx, acc.id);
  assert.equal(counter.calls, 2, "exactly one retry under concurrency");
  assert.equal(row.emailAttempts, 2);
});

test("R-3 cap under concurrency: retries stop at 5 total attempts and become exhausted", async () => {
  const counter = { calls: 0 };
  const ctx = setup(retryableFailureMailer(counter));
  const acc = seedPaid(ctx, {
    accountId: "acc_r3",
    email: "r3@example.com",
    orderId: "ord_r3_1",
  });
  for (let round = 0; round < 6; round++) {
    ctx.advance(2 * HOUR);
    await Promise.all([
      ctx.svc.syncAccount(acc),
      ctx.svc.syncAccount(acc),
      ctx.svc.syncAccount(acc),
    ]);
  }
  const row = paidRow(ctx, acc.id);
  assert.equal(counter.calls, 5, "total mailer calls capped at 5");
  assert.equal(row.emailAttempts, 5);
  assert.equal(row.emailStatus, "exhausted");
  ctx.advance(24 * HOUR);
  await ctx.svc.syncAccount(acc);
  assert.equal(counter.calls, 5, "exhausted row is never attempted again");
  assert.equal(paidRow(ctx, acc.id).emailAttempts, 5);
});

test("R-4 backoff gate: failed row is not retried before emailNextRetryAt", async () => {
  const counter = { calls: 0 };
  const ctx = setup(retryableFailureMailer(counter));
  const acc = seedPaid(ctx, {
    accountId: "acc_r4",
    email: "r4@example.com",
    orderId: "ord_r4_1",
  });
  await ctx.svc.syncAccount(acc);
  assert.equal(counter.calls, 1, "first attempt at T");
  const failedRow = paidRow(ctx, acc.id);
  assert.equal(failedRow.emailStatus, "failed");
  // Backoff after 1st failure: base 60s doubling, jitter +-20% -> the gate
  // must sit safely after +30s and no later than +120s.
  assert.ok(
    typeof failedRow.emailNextRetryAt === "number" &&
      failedRow.emailNextRetryAt > BASE + 30_000,
    "emailNextRetryAt must be persisted after +30s",
  );
  assert.ok(
    failedRow.emailNextRetryAt <= BASE + 120_000,
    "first backoff must elapse by +120s",
  );
  await ctx.svc.syncAccount(acc);
  assert.equal(counter.calls, 1, "no retry at the same instant");
  ctx.advance(30_000);
  await ctx.svc.syncAccount(acc);
  assert.equal(counter.calls, 1, "no retry at T+30s");
  ctx.advance(90_000);
  await ctx.svc.syncAccount(acc);
  assert.equal(counter.calls, 2, "exactly one retry by T+120s");
  assert.equal(paidRow(ctx, acc.id).emailAttempts, 2);
});

test("R-5 read mode never retries: delivery new/none suppress retries and first attempts as specified", async () => {
  const counter = { calls: 0 };
  const ctx = setup(retryableFailureMailer(counter));
  const acc = seedPaid(ctx, {
    accountId: "acc_r5",
    email: "r5@example.com",
    orderId: "ord_r5_1",
  });
  await ctx.svc.syncAccount(acc);
  assert.equal(counter.calls, 1, "first attempt fails once");
  ctx.advance(120_000);
  await ctx.svc.syncAccount(acc, { delivery: "new" });
  assert.equal(
    counter.calls,
    1,
    "delivery:new (page-read mode) must never retry a failed row",
  );
  await ctx.svc.syncAccount(acc);
  assert.equal(
    counter.calls,
    2,
    "default delivery retries the eligible failed row once",
  );

  const counter2 = { calls: 0 };
  const sentMailer = {
    async send() {
      counter2.calls++;
      return { status: "sent", providerId: "msg-r5" };
    },
  };
  const ctx2 = setup(sentMailer);
  const acc2 = seedPaid(ctx2, {
    accountId: "acc_r5b",
    email: "r5b@example.com",
    orderId: "ord_r5_2",
  });
  await ctx2.svc.syncAccount(acc2, { delivery: "none" });
  const row2 = paidRow(ctx2, acc2.id);
  assert.ok(row2, "delivery:none still creates the in-app row");
  assert.equal(
    counter2.calls,
    0,
    "delivery:none makes no mailer call on a fresh PAID order",
  );
  assert.equal(row2.emailAttempts, 0);
});

test("R-6 ambiguous: mailer throws after possible provider accept -> not sent, flagged, backed off", async () => {
  let calls = 0;
  let accepted = 0;
  const mailer = {
    async send() {
      calls++;
      accepted++;
      throw new Error("request timed out");
    },
  };
  const ctx = setup(mailer);
  const acc = seedPaid(ctx, {
    accountId: "acc_r6",
    email: "r6@example.com",
    orderId: "ord_r6_1",
  });
  await ctx.svc.syncAccount(acc);
  const row = paidRow(ctx, acc.id);
  assert.equal(accepted, 1, "provider may have accepted the ambiguous attempt");
  assert.notEqual(
    row.emailStatus,
    "sent",
    "ambiguous outcome must not be recorded as sent",
  );
  assert.equal(
    row.emailAmbiguous,
    true,
    "thrown mailer outcome must be flagged ambiguous",
  );
  await ctx.svc.syncAccount(acc);
  assert.equal(calls, 1, "no immediate retry after an ambiguous outcome");
  ctx.advance(120_000);
  await ctx.svc.syncAccount(acc);
  assert.equal(calls, 2, "retry is allowed after backoff");
});

test("R-7 claim lease: fresh sending claim blocks delivery; stale claim (over 2 min) is reclaimable", async () => {
  const counter = { calls: 0 };
  const mailer = {
    async send() {
      counter.calls++;
      return { status: "sent", providerId: "msg-r7" };
    },
  };
  const ctx = setup(mailer);
  const acc = seedPaid(ctx, {
    accountId: "acc_r7",
    email: "r7@example.com",
    orderId: "ord_r7_1",
  });
  // Construction choice: seed the underlying PAID order AND the matching
  // order.paid row (dedupeKey = order id) via store.addNotification, then
  // mutate that live row into an in-flight claim. This exercises the real
  // syncAccount path -- the service re-derives order.paid for the seeded
  // order and re-encounters this exact row -- rather than a detached row
  // that no sync would ever visit.
  ctx.store.addNotification({
    accountId: acc.id,
    type: "order.paid",
    dedupeKey: "ord_r7_1",
    title: "Pembayaran diterima",
    titleEn: "Payment received",
    body: "b",
    bodyEn: "b",
    linkKind: "order",
    linkId: "ord_r7_1",
    createdAt: ctx.nowMs - DAY,
  });
  const live = paidRow(ctx, acc.id);
  live.emailStatus = "sending";
  live.emailAttempts = 1;
  live.emailClaimedAt = ctx.nowMs;
  await ctx.svc.syncAccount(acc);
  assert.equal(
    counter.calls,
    0,
    "a fresh sending claim must not be attempted by another sync",
  );
  live.emailClaimedAt = ctx.nowMs - 10 * 60_000;
  await ctx.svc.syncAccount(acc);
  const row = paidRow(ctx, acc.id);
  assert.equal(
    counter.calls,
    1,
    "a stale sending claim is reclaimable (crash recovery)",
  );
  assert.equal(row.emailStatus, "sent");
  assert.equal(row.emailAttempts, 2, "reclaim counts as the second attempt");
});

test("R-8 scheduler overlap: overlapping ticks on a slow mailer make exactly one call", async () => {
  const counter = { calls: 0 };
  const mailer = {
    async send() {
      counter.calls++;
      await sleep(80);
      return { status: "sent", providerId: "msg-r8" };
    },
  };
  const ctx = setup(mailer);
  seedPaid(ctx, {
    accountId: "acc_r8",
    email: "r8@example.com",
    orderId: "ord_r8_1",
  });
  try {
    ctx.svc.start(15);
    await sleep(250);
  } finally {
    ctx.svc.stop();
  }
  assert.equal(
    counter.calls,
    1,
    "scheduler ticks must not overlap into duplicate sends",
  );
});

test("R-9 legacy row compatibility: pre-hardening row without delivery fields is a first attempt", async () => {
  const counter = { calls: 0 };
  const mailer = {
    async send() {
      counter.calls++;
      return { status: "sent", providerId: "msg-r9" };
    },
  };
  const ctx = setup(mailer);
  const acc = seedPaid(ctx, {
    accountId: "acc_r9",
    email: "r9@example.com",
    orderId: "ord_r9_1",
  });
  await ctx.svc.syncAccount(acc);
  assert.equal(counter.calls, 1);
  const live = paidRow(ctx, acc.id);
  // Simulate a pre-hardening row: new delivery fields absent, email state reset.
  delete live.emailClaimedAt;
  delete live.emailNextRetryAt;
  delete live.emailLastAttemptAt;
  delete live.emailProviderId;
  delete live.emailErrorCategory;
  delete live.emailAmbiguous;
  live.emailStatus = null;
  live.emailAttempts = 0;
  await ctx.svc.syncAccount(acc);
  const row = paidRow(ctx, acc.id);
  assert.equal(counter.calls, 2, "legacy row is treated as a first attempt");
  assert.equal(row.emailStatus, "sent");
  assert.equal(row.emailAttempts, 1);
});

test("R-10 providerId persisted; non-retryable failure exhausts immediately and persists category", async () => {
  const ctx = setup({
    async send() {
      return { status: "sent", providerId: "msg-123" };
    },
  });
  const acc = seedPaid(ctx, {
    accountId: "acc_r10",
    email: "r10@example.com",
    orderId: "ord_r10_1",
  });
  await ctx.svc.syncAccount(acc);
  const sentRow = paidRow(ctx, acc.id);
  assert.equal(sentRow.emailStatus, "sent");
  assert.equal(
    sentRow.emailProviderId,
    "msg-123",
    "provider id from the mailer result is persisted",
  );

  const counter = { calls: 0 };
  const ctx2 = setup({
    async send() {
      counter.calls++;
      return {
        status: "failed",
        error: "invalid recipient",
        category: "invalid_recipient",
        retryable: false,
      };
    },
  });
  const acc2 = seedPaid(ctx2, {
    accountId: "acc_r10b",
    email: "r10b@example.com",
    orderId: "ord_r10_2",
  });
  await ctx2.svc.syncAccount(acc2);
  const failedRow = paidRow(ctx2, acc2.id);
  assert.equal(
    failedRow.emailStatus,
    "exhausted",
    "non-retryable failure exhausts immediately",
  );
  assert.equal(
    failedRow.emailErrorCategory,
    "invalid_recipient",
    "error category is persisted",
  );
  assert.equal(counter.calls, 1);
  ctx2.advance(24 * HOUR);
  await ctx2.svc.syncAccount(acc2);
  assert.equal(
    counter.calls,
    1,
    "exhausted non-retryable row is never attempted again",
  );
});

// ---------------------------------------------------------------------------
// Reliability hardening, round 2: reset-URL trust, mailer classification,
// and read-mode storm proof at the real HTTP/server level.
// ---------------------------------------------------------------------------
import {
  createMailer,
  safeResetUrl,
  safeHttpUrl,
  buildPasswordResetEmail,
} from "../src/mail.js";

test("X-1 safeResetUrl: only the configured origin (or loopback) keeps a reset token", () => {
  const base = "https://copilot.grouter.id";
  // trusted: same origin as BETTER_AUTH_URL -> preserved verbatim
  assert.equal(
    safeResetUrl("https://copilot.grouter.id/reset-password?token=t1", {
      baseUrl: base,
    }),
    "https://copilot.grouter.id/reset-password?token=t1",
  );
  // untrusted external https host -> fallback, token never forwarded
  assert.equal(
    safeResetUrl("https://evil.example/reset?token=t1", { baseUrl: base }),
    "https://copilot.grouter.id/app/",
  );
  // protocol-relative + non-http schemes -> fallback
  assert.equal(
    safeResetUrl("//evil.example/reset?token=t1", { baseUrl: base }),
    "https://copilot.grouter.id/app/",
  );
  assert.equal(
    safeResetUrl("javascript:alert(1)", { baseUrl: base }),
    "https://copilot.grouter.id/app/",
  );
  assert.equal(
    safeResetUrl("data:text/html,x", { baseUrl: base }),
    "https://copilot.grouter.id/app/",
  );
  // lookback dev/test origins survive without a configured base
  assert.equal(
    safeResetUrl("http://localhost:4601/reset?token=t2", { baseUrl: "" }),
    "http://localhost:4601/reset?token=t2",
  );
  assert.equal(
    safeResetUrl("http://127.0.0.1:4690/reset?token=t3", {}),
    "http://127.0.0.1:4690/reset?token=t3",
  );
  // malformed / empty -> fallback
  assert.equal(
    safeResetUrl("not a url", { baseUrl: base }),
    "https://copilot.grouter.id/app/",
  );
  assert.equal(
    safeResetUrl("", { baseUrl: base }),
    "https://copilot.grouter.id/app/",
  );
  // template level: a hostile reset URL never reaches html/text
  const hostile = buildPasswordResetEmail({
    url: "https://evil.example/steal?token=SECRET9",
    resetBaseUrl: base,
  });
  assert.ok(
    !hostile.html.includes("evil.example"),
    "hostile host must not appear in html",
  );
  assert.ok(
    !hostile.text.includes("evil.example"),
    "hostile host must not appear in text",
  );
  assert.ok(
    !hostile.html.includes("SECRET9") && !hostile.text.includes("SECRET9"),
    "token never leaks to an untrusted destination",
  );
  // plain protocol helper unchanged (dashboard CTA contract)
  assert.equal(safeHttpUrl("https://example.com/x"), "https://example.com/x");
  assert.equal(
    safeHttpUrl("javascript:alert(1)"),
    "https://copilot.grouter.id/app/",
  );
});

test("X-2 mailer classification: 5xx retryable, 4xx permanent, network throw ambiguous", async () => {
  const settingsGetter = () => resolveSettings({}, {});
  const env = { BREVO_API_KEY: "brevo-test-x2" };
  const m500 = createMailer({
    fetchImpl: async () => new Response("upstream broken", { status: 500 }),
    env,
    settingsGetter,
  });
  const r500 = await m500.send({
    to: "x@example.com",
    subject: "s",
    html: "h",
    text: "t",
    kind: "paymentReceived",
  });
  assert.equal(r500.status, "failed");
  assert.equal(r500.retryable, true);
  assert.equal(r500.category, "provider_error");

  const m400 = createMailer({
    fetchImpl: async () =>
      new Response(JSON.stringify({ message: "invalid recipient" }), {
        status: 400,
      }),
    env,
    settingsGetter,
  });
  const r400 = await m400.send({
    to: "bad@example.com",
    subject: "s",
    html: "h",
    text: "t",
    kind: "paymentReceived",
  });
  assert.equal(r400.status, "failed");
  assert.equal(r400.retryable, false);
  assert.equal(r400.category, "provider_rejected");

  const mNet = createMailer({
    fetchImpl: async () => {
      throw new Error("request timed out after provider accepted");
    },
    env,
    settingsGetter,
  });
  const rNet = await mNet.send({
    to: "x@example.com",
    subject: "s",
    html: "h",
    text: "t",
    kind: "paymentReceived",
  });
  assert.equal(rNet.status, "failed");
  assert.equal(rNet.ambiguous, true);
  assert.equal(rNet.category, "ambiguous_timeout");
  assert.ok(
    !String(rNet.error).includes("brevo-test-x2"),
    "error must not leak the provider key shape",
  );
});

test('X-3 brevoIdempotencyKey: stable UUID per notification, distinct across notifications', async () => {
  const { brevoIdempotencyKey } = await import('../src/mail.js');
  const a1 = brevoIdempotencyKey('ntf_abc');
  const a2 = brevoIdempotencyKey('ntf_abc');
  const b = brevoIdempotencyKey('ntf_xyz');
  assert.equal(a1, a2, 'same notification -> same key across attempts');
  assert.notEqual(a1, b, 'different notification -> different key');
  assert.ok(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(a1), 'key must be a UUID v4-shaped value Brevo accepts');
});

test('X-4 mailer sends idempotencyKey; Brevo duplicate_parameter (same key, TTL) is recorded as sent', async () => {
  const { createMailer: mkMailer } = await import('../src/mail.js');
  const settingsGetter = () => resolveSettings({}, {});
  const env = { BREVO_API_KEY: 'brevo-test-x4' };

  // payload carries the derived key
  let payload = null;
  const cap = mkMailer({
    fetchImpl: async (url, init) => {
      payload = JSON.parse(init.body);
      return new Response(JSON.stringify({ messageId: 'm-1' }), { status: 201, headers: { 'content-type': 'application/json' } });
    },
    env, settingsGetter,
  });
  const ok = await cap.send({ to: 'x@example.com', subject: 's', html: 'h', text: 't', kind: 'paymentReceived', idempotencyKey: 'ntf_abc' });
  assert.equal(ok.status, 'sent');
  assert.ok(payload.headers?.idempotencyKey, 'payload must carry headers.idempotencyKey');
  assert.ok(/^[0-9a-f-]{36}$/.test(payload.headers.idempotencyKey));

  // duplicate within TTL -> sent (original landed), never a failure/retry
  const dup = mkMailer({
    fetchImpl: async () => new Response(JSON.stringify({ code: 'duplicate_parameter', message: 'Key already used' }), { status: 400, headers: { 'content-type': 'application/json' } }),
    env, settingsGetter,
  });
  const d = await dup.send({ to: 'x@example.com', subject: 's', html: 'h', text: 't', kind: 'paymentReceived', idempotencyKey: 'ntf_abc' });
  assert.equal(d.status, 'sent', 'duplicate_parameter means the original send landed');
  assert.equal(d.duplicateSuppressed, true);

  // service level: notification id flows into the mailer as the key seed
  let seenKey = null;
  const ctx = setup({
    async send(args) {
      seenKey = args.idempotencyKey;
      return { status: 'sent', providerId: 'm-x4' };
    },
  });
  const acc = seedPaid(ctx, { accountId: 'acc_x4', email: 'x4@example.com', orderId: 'ord_x4_1' });
  await ctx.svc.syncAccount(acc);
  const row = paidRow(ctx, acc.id);
  assert.equal(seenKey, row.id, 'mailer receives the notification id as idempotency seed');
  assert.equal(row.emailStatus, 'sent');
});
