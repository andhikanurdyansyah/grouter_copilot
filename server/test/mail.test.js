import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS,
  validateSettings,
  resolveSettings,
} from "../src/settings.js";
import {
  createMailer,
  buildPaymentReceivedEmail,
  buildLicenseIssuedEmail,
  buildLicenseExpiringEmail,
  buildPasswordResetEmail,
} from "../src/mail.js";

test("settings: notifications defaults documented", () => {
  assert.deepEqual(DEFAULT_SETTINGS.notifications, {
    schedulerIntervalMs: 900000,
    quotaThresholdPercent: 90,
    expiringSoonDays: 7,
    email: {
      enabled: true,
      paymentReceived: true,
      licenseIssued: true,
      licenseExpiring: true,
      passwordReset: true,
    },
  });
  const eff = resolveSettings({}, {});
  assert.equal(eff.notifications.quotaThresholdPercent, 90);
  assert.equal(eff.notifications.expiringSoonDays, 7);
});

test("settings: validate notifications accepts valid and rejects invalid", () => {
  assert.doesNotThrow(() =>
    validateSettings({
      notifications: {
        schedulerIntervalMs: 60000,
        quotaThresholdPercent: 80,
        expiringSoonDays: 14,
        email: { enabled: false, paymentReceived: true },
      },
    }),
  );
  assert.throws(
    () => validateSettings({ notifications: { quotaThresholdPercent: 0 } }),
    /quotaThresholdPercent/,
  );
  assert.throws(
    () => validateSettings({ notifications: { quotaThresholdPercent: 101 } }),
    /quotaThresholdPercent/,
  );
  assert.throws(
    () => validateSettings({ notifications: { quotaThresholdPercent: 90.5 } }),
    /quotaThresholdPercent/,
  );
  assert.throws(
    () => validateSettings({ notifications: { expiringSoonDays: 0 } }),
    /expiringSoonDays/,
  );
  assert.throws(
    () => validateSettings({ notifications: { expiringSoonDays: 31 } }),
    /expiringSoonDays/,
  );
  assert.throws(
    () => validateSettings({ notifications: { schedulerIntervalMs: 0 } }),
    /schedulerIntervalMs/,
  );
  assert.throws(
    () => validateSettings({ notifications: { schedulerIntervalMs: -5 } }),
    /schedulerIntervalMs/,
  );
  assert.throws(
    () => validateSettings({ notifications: { email: { enabled: "yes" } } }),
    /email\.enabled/,
  );
  assert.throws(
    () =>
      validateSettings({ notifications: { email: { paymentReceived: 1 } } }),
    /paymentReceived/,
  );
  assert.throws(
    () => validateSettings({ notifications: "nope" }),
    /notifications must be an object/,
  );
  assert.throws(
    () => validateSettings({ notifications: { email: "nope" } }),
    /notifications\.email must be an object/,
  );
  assert.throws(
    () => validateSettings({ unknownSection: {} }),
    /Unknown settings section/,
  );
});

function settingsGetter(notifOverrides = {}) {
  return () => {
    const eff = resolveSettings({}, {});
    return {
      ...eff,
      notifications: {
        ...eff.notifications,
        ...notifOverrides,
        email: { ...eff.notifications.email, ...(notifOverrides.email || {}) },
      },
    };
  };
}

test("mail: log_only when no BREVO_API_KEY, returns no secret, calls no fetch", async () => {
  let fetchCalls = 0;
  const mailer = createMailer({
    fetchImpl: async () => {
      fetchCalls++;
      return new Response("{}", { status: 200 });
    },
    env: {},
    settingsGetter: settingsGetter(),
  });
  const res = await mailer.send({
    to: "user@gmail.com",
    subject: "Hi",
    html: "<p>x</p>",
    text: "x",
    kind: "paymentReceived",
  });
  assert.equal(res.status, "log_only");
  assert.equal(fetchCalls, 0);
  assert.ok(!JSON.stringify(res).includes("user@gmail.com"));
});

test("mail: disabled when email.enabled false", async () => {
  let fetchCalls = 0;
  const mailer = createMailer({
    fetchImpl: async () => {
      fetchCalls++;
      return new Response(JSON.stringify({ messageId: "<e1@brevo>" }), {
        status: 201,
      });
    },
    env: {
      BREVO_API_KEY: "brevo-test-testkey",
      MAIL_FROM: "Test <t@example.com>",
    },
    settingsGetter: settingsGetter({ email: { enabled: false } }),
  });
  const res = await mailer.send({
    to: "user@gmail.com",
    subject: "Hi",
    html: "<p>x</p>",
    text: "x",
    kind: "paymentReceived",
  });
  assert.equal(res.status, "disabled");
  assert.equal(fetchCalls, 0);
});

test("mail: disabled per-kind when kind toggle false", async () => {
  let fetchCalls = 0;
  const mailer = createMailer({
    fetchImpl: async () => {
      fetchCalls++;
      return new Response(JSON.stringify({ messageId: "<e1@brevo>" }), {
        status: 201,
      });
    },
    env: { BREVO_API_KEY: "brevo-test-testkey" },
    settingsGetter: settingsGetter({ email: { paymentReceived: false } }),
  });
  const res = await mailer.send({
    to: "user@gmail.com",
    subject: "Hi",
    html: "<p>x</p>",
    text: "x",
    kind: "paymentReceived",
  });
  assert.equal(res.status, "disabled");
  assert.equal(fetchCalls, 0);
  // other kind still allowed
  const res2 = await mailer.send({
    to: "user@gmail.com",
    subject: "Hi",
    html: "<p>x</p>",
    text: "x",
    kind: "licenseExpiring",
  });
  assert.equal(res2.status, "sent");
  assert.equal(fetchCalls, 1);
});

test("mail: sent with fake fetch, providerId captured, payload uses Brevo endpoint and safe from fallback", async () => {
  let seen = null;
  const mailer = createMailer({
    fetchImpl: async (url, opts) => {
      seen = { url, opts };
      return new Response(JSON.stringify({ messageId: "<email_123@brevo>" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      });
    },
    env: { BREVO_API_KEY: "brevo-test-testkey" },
    settingsGetter: settingsGetter(),
  });
  const res = await mailer.send({
    to: "user@gmail.com",
    subject: "Payment",
    html: "<p>paid</p>",
    text: "paid",
    kind: "paymentReceived",
  });
  assert.equal(res.status, "sent");
  assert.equal(res.providerId, "<email_123@brevo>");
  assert.equal(seen.url, "https://api.brevo.com/v3/smtp/email");
  const payload = JSON.parse(seen.opts.body);
  assert.deepEqual(payload.sender, {
    name: "gRouter Copilot",
    email: "copilot@grouter.id",
  });
  assert.deepEqual(payload.to, [{ email: "user@gmail.com" }]);
  assert.equal(payload.subject, "Payment");
  assert.equal(payload.htmlContent, "<p>paid</p>");
  assert.equal(payload.textContent, "paid");
  assert.equal(seen.opts.headers["api-key"], "brevo-test-testkey");
  assert.equal(seen.opts.headers.authorization, undefined);
  // return value must not leak key or body
  assert.ok(!JSON.stringify(res).includes("brevo-test-testkey"));
  assert.ok(!JSON.stringify(res).includes("paid"));
});

test("mail: failed on non-ok fetch and on throw, error sanitized short, no secret leak", async () => {
  const mailer = createMailer({
    fetchImpl: async () =>
      new Response(JSON.stringify({ message: "bad " + "x".repeat(500) }), {
        status: 500,
      }),
    env: { BREVO_API_KEY: "brevo-test-testkey" },
    settingsGetter: settingsGetter(),
  });
  const res = await mailer.send({
    to: "user@gmail.com",
    subject: "Hi",
    html: "<p>x</p>",
    text: "x",
    kind: "paymentReceived",
  });
  assert.equal(res.status, "failed");
  assert.ok(
    res.error && res.error.length <= 200,
    `error too long: ${res.error?.length}`,
  );
  assert.ok(!JSON.stringify(res).includes("brevo-test-testkey"));
  const mailer2 = createMailer({
    fetchImpl: async () => {
      throw new Error("network down brevo-test-testkey should not leak");
    },
    env: { BREVO_API_KEY: "brevo-test-testkey" },
    settingsGetter: settingsGetter(),
  });
  const res2 = await mailer2.send({
    to: "user@gmail.com",
    subject: "Hi",
    html: "<p>x</p>",
    text: "x",
    kind: "licenseExpiring",
  });
  assert.equal(res2.status, "failed");
  assert.ok(
    !JSON.stringify(res2).includes("brevo-test-testkey"),
    "error must be sanitized of key",
  );
});

test("mail: password reset template contains URL only in payload, mailer return never contains it", async () => {
  const url = "https://copilot.grouter.id/reset-password?token=SECRETTOKEN123";
  const tpl = buildPasswordResetEmail({ url });
  assert.ok(tpl.html.includes(url));
  assert.ok(tpl.text.includes(url));
  assert.ok(tpl.subject.length > 0);
  // log_only mailer with reset: return must not contain token/url
  const mailer = createMailer({
    fetchImpl: async () => new Response("{}", { status: 200 }),
    env: {},
    settingsGetter: settingsGetter(),
  });
  const res = await mailer.send({
    to: "user@gmail.com",
    ...tpl,
    kind: "passwordReset",
  });
  assert.equal(res.status, "log_only");
  assert.ok(!JSON.stringify(res).includes("SECRETTOKEN123"));
  assert.ok(!JSON.stringify(res).includes(url));
});

test("mail: templates carry the enterprise design shell (brand, detail rows, one CTA)", () => {
  const p = buildPaymentReceivedEmail({
    orderId: "ord_1234567890abcdef",
    licenseId: "lic_1234567890abcdef",
    planName: "Pro",
  });
  // single brand header + card shell
  assert.ok(p.html.includes("gRouter"));
  assert.ok(p.html.includes("#22d3ee"), "single cyan accent present");
  assert.ok(p.html.includes("Buka Dashboard"), "CTA label");
  assert.ok(p.html.includes("https://copilot.grouter.id/app/"), "CTA target");
  assert.ok(
    p.html.includes('role="presentation"'),
    "table layout for email clients",
  );
  // one <style> block max: client resets + the two media layers only (no base styling in CSS)
  assert.equal(
    (p.html.match(/<style/g) || []).length,
    1,
    "exactly one responsive style block",
  );
  const styleBlock = p.html.slice(
    p.html.indexOf("<style>"),
    p.html.indexOf("</style>"),
  );
  assert.ok(
    styleBlock.includes("html,body{margin:0!important"),
    "client reset layer present",
  );
  assert.ok(
    !/background-color:#0d1117/.test(styleBlock),
    "no dark base panel color baked into <style>",
  );
  assert.ok(
    !/\.em-title\{font-size:27px/.test(styleBlock),
    "no base title size baked into <style>",
  );
  assert.ok(
    p.html.includes("@media only screen and (max-width:620px)"),
    "mobile breakpoint present",
  );
  assert.ok(
    p.html.includes("@media (prefers-color-scheme: light)"),
    "light scheme layer present",
  );
  assert.ok(
    p.html.includes("max-width:600px"),
    "fluid-hybrid container (not fixed 600px)",
  );
  assert.ok(
    p.html.includes(".em-cta a{display:block"),
    "CTA goes full-width block on mobile",
  );
  assert.ok(
    !p.html.includes('width="600"'),
    "no fixed-width table (responsive)",
  );
  assert.ok(!p.html.includes("linear-gradient"), "no gradient slop");
  // detail rows in mono + escaped values
  assert.ok(p.html.includes("ord_1234"));
  assert.ok(p.html.includes("lic_1234"));
  // dual theme: dark inline default + light adaptation layer
  assert.ok(
    p.html.includes("@media (prefers-color-scheme: light)"),
    "light scheme layer present",
  );
  assert.ok(
    p.html.includes('content="light dark"'),
    "color-scheme declares both",
  );
  assert.ok(
    p.html.includes(".em-card{background-color:#ffffff"),
    "light card override",
  );
  assert.ok(p.html.includes("table-layout:fixed"), "anti-clip detail table");
  assert.ok(
    p.html.includes("word-break:break-word"),
    "long values wrap, never clip",
  );
  // text fallback still present and honest
  assert.ok(
    p.text.includes("konfirmasi server") ||
      p.text.includes("dikonfirmasi server"),
  );
  const evil = buildPaymentReceivedEmail({
    orderId: "ord_<script>alert(1)</script>",
    licenseId: null,
    planName: "<b>x</b>",
  });
  assert.ok(!evil.html.includes("<script>alert"), "dynamic values escaped");
  const rst = buildPasswordResetEmail({
    url: "https://copilot.grouter.id/reset-password?token=abc",
  });
  assert.ok(rst.html.includes("Buat Password Baru"));
  assert.ok(rst.html.includes("1 jam"));
});

test("mail: templates payment+license and expiring H-7/H-1", () => {
  const p = buildPaymentReceivedEmail({
    orderId: "ord_1234567890abcdef",
    licenseId: "lic_1234567890abcdef",
    planName: "Pro",
  });
  assert.ok(
    (p.subject.length > 0 && p.html.includes("ord_1234")) ||
      p.text.includes("ord_1234"),
  );
  const e7 = buildLicenseExpiringEmail({
    licenseId: "lic_1234567890abcdef",
    expiresAt: Date.now() + 7 * 86400000,
    daysLeft: 7,
  });
  assert.ok(/7/.test(e7.subject + e7.text));
  const e1 = buildLicenseExpiringEmail({
    licenseId: "lic_1234567890abcdef",
    expiresAt: Date.now() + 86400000,
    daysLeft: 1,
  });
  assert.ok(/1/.test(e1.subject + e1.text));
  assert.notEqual(e7.subject, e1.subject);
});

const DASHBOARD_URL = "https://copilot.grouter.id/app/";
const RESET_URL = "https://copilot.grouter.id/reset-password?token=abc";

function sampleTemplates() {
  return {
    payment: buildPaymentReceivedEmail({
      orderId: "ord_1234567890abcdef",
      licenseId: "lic_1234567890abcdef",
      planName: "Pro",
    }),
    licenseIssued: buildLicenseIssuedEmail({
      licenseId: "lic_1234567890abcdef",
      planName: "Pro",
    }),
    licenseExpiring: buildLicenseExpiringEmail({
      licenseId: "lic_1234567890abcdef",
      expiresAt: "2026-10-24T00:00:00.000Z",
      daysLeft: 7,
    }),
    passwordReset: buildPasswordResetEmail({ url: RESET_URL }),
  };
}

test("mail: footer has no reply contradiction — help points only to the dashboard", () => {
  for (const [name, t] of Object.entries(sampleTemplates())) {
    assert.ok(t.subject.length > 0, `${name}: meaningful subject`);
    assert.ok(
      !/Balas email ini/i.test(t.html),
      `${name}: html must not encourage replies`,
    );
    assert.ok(
      !/Balas email ini/i.test(t.text),
      `${name}: text must not encourage replies`,
    );
    assert.ok(
      t.html.includes("Butuh bantuan? Buka"),
      `${name}: html help line present`,
    );
    assert.ok(
      t.html.includes(`href="${DASHBOARD_URL}"`),
      `${name}: html help line links to dashboard`,
    );
    assert.ok(
      t.html.includes("mohon tidak membalas ke alamat ini"),
      `${name}: html keeps consistent no-reply footnote`,
    );
    assert.ok(
      t.text.includes("mohon tidak membalas ke alamat ini"),
      `${name}: text keeps consistent no-reply note`,
    );
    assert.ok(
      t.text.includes(DASHBOARD_URL),
      `${name}: text help line contains dashboard URL`,
    );
  }
});

test("mail: plain-text parity — same facts and CTA destination as HTML", () => {
  const { payment, licenseIssued, licenseExpiring, passwordReset } =
    sampleTemplates();
  // payment: short ids + plan + dashboard CTA in both parts
  for (const frag of ["ord_1234", "lic_1234", "Pro"]) {
    assert.ok(payment.html.includes(frag), `payment html carries ${frag}`);
    assert.ok(payment.text.includes(frag), `payment text carries ${frag}`);
  }
  assert.ok(
    payment.html.includes(`href="${DASHBOARD_URL}"`) &&
      payment.text.includes(DASHBOARD_URL),
  );
  // standalone license issued: short id + plan + dashboard CTA in both parts
  for (const frag of ["lic_1234", "Pro"]) {
    assert.ok(licenseIssued.html.includes(frag), `issued html carries ${frag}`);
    assert.ok(licenseIssued.text.includes(frag), `issued text carries ${frag}`);
  }
  assert.ok(
    licenseIssued.html.includes(`href="${DASHBOARD_URL}"`) &&
      licenseIssued.text.includes(DASHBOARD_URL),
  );
  // expiring: short id + expiry date + days left + dashboard CTA in both parts
  for (const frag of ["lic_1234", "2026-10-24", "7 hari"]) {
    assert.ok(
      licenseExpiring.html.includes(frag),
      `expiring html carries ${frag}`,
    );
    assert.ok(
      licenseExpiring.text.includes(frag),
      `expiring text carries ${frag}`,
    );
  }
  assert.ok(
    licenseExpiring.html.includes(`href="${DASHBOARD_URL}"`) &&
      licenseExpiring.text.includes(DASHBOARD_URL),
  );
  // reset: the validated reset URL is the CTA destination in both parts
  assert.ok(
    passwordReset.html.includes(`href="${RESET_URL}"`) &&
      passwordReset.text.includes(RESET_URL),
  );
  for (const frag of ["1 jam", "sekali pakai"]) {
    assert.ok(
      passwordReset.html.includes(frag) && passwordReset.text.includes(frag),
      `reset carries "${frag}" in both parts`,
    );
  }
});

test("mail: password reset validates the URL — unsafe input falls back to dashboard, valid http(s) passes through", () => {
  for (const bad of [
    "javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
    "",
    "not a url",
    "//evil.example/reset",
    "ftp://example.com/reset",
    null,
    undefined,
  ]) {
    const t = buildPasswordResetEmail({ url: bad });
    assert.ok(
      t.html.includes(`href="${DASHBOARD_URL}"`),
      `unsafe url ${JSON.stringify(bad)} must fall back to dashboard`,
    );
    assert.ok(
      t.text.includes(DASHBOARD_URL),
      `unsafe url ${JSON.stringify(bad)} text must carry dashboard fallback`,
    );
    assert.ok(
      !t.html.includes("javascript:") && !t.html.includes("data:text/html"),
      "unsafe scheme must not leak into html",
    );
    assert.equal(
      (t.html.match(/<a href=/g) || []).length < 10,
      true,
      "shell emitted",
    );
  }
  assert.ok(
    !buildPasswordResetEmail({ url: "javascript:alert(1)" }).html.includes(
      "alert(1)",
    ),
    "payload must not survive anywhere in html",
  );
  assert.ok(
    !buildPasswordResetEmail({ url: "javascript:alert(1)" }).text.includes(
      "alert(1)",
    ),
    "payload must not survive anywhere in text",
  );
  const ok = buildPasswordResetEmail({
    url: "https://copilot.grouter.id/reset-password?token=abc",
  });
  assert.ok(
    ok.html.includes(
      'href="https://copilot.grouter.id/reset-password?token=abc"',
    ),
  );
  assert.ok(
    ok.text.includes("https://copilot.grouter.id/reset-password?token=abc"),
  );
  const http = buildPasswordResetEmail({
    url: "http://localhost:4601/reset?token=abc",
  });
  assert.ok(
    http.html.includes('href="http://localhost:4601/reset?token=abc"'),
    "http: is accepted like https:",
  );
});

test("mail: malicious and very long values are escaped in html and never double-escaped in text", () => {
  const evilPlan = '<b>&"Pro"</b><script>alert(1)</script>';
  const longPlan = `${"Plan ".repeat(60)}${evilPlan}`;
  const p = buildPaymentReceivedEmail({
    orderId: "ord_<script>x</script>",
    licenseId: "lic_1234567890abcdef",
    planName: longPlan,
  });
  assert.ok(
    !p.html.includes("<script>alert(1)</script>"),
    "html: raw script tag must not survive",
  );
  assert.ok(
    p.html.includes("&lt;b&gt;&amp;&quot;Pro&quot;&lt;/b&gt;"),
    "html: plan name html-escaped",
  );
  assert.ok(
    p.text.includes(`(${longPlan})`),
    "text: plan name verbatim (plain text must not be escaped)",
  );
  assert.ok(
    !p.text.includes("&lt;"),
    "text: no html entities / double-escaping",
  );
  assert.ok(
    p.html.includes("word-break:break-word"),
    "long values keep the word-break wrap path",
  );
  const issued = buildLicenseIssuedEmail({
    licenseId: "lic_1234567890abcdef",
    planName: longPlan,
  });
  assert.ok(
    !issued.html.includes("<script>alert(1)</script>") &&
      issued.html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"),
    "issued html escaped",
  );
  assert.ok(
    issued.text.includes(longPlan) && !issued.text.includes("&lt;"),
    "issued text verbatim",
  );
});

test("mail: expiring tolerates invalid dates and numeric-string daysLeft without RangeError", () => {
  assert.doesNotThrow(() =>
    buildLicenseExpiringEmail({
      licenseId: "lic_1",
      expiresAt: "not-a-date",
      daysLeft: "7",
    }),
  );
  const t = buildLicenseExpiringEmail({
    licenseId: "lic_1",
    expiresAt: "not-a-date",
    daysLeft: "7",
  });
  assert.ok(
    !t.html.includes("Invalid Date") &&
      !t.text.includes("Invalid Date") &&
      !t.html.includes("RangeError"),
  );
});

test("mail: anti-clip — every card text cell wraps long words, not just detail values", () => {
  const longWord = "X".repeat(120);
  const p = buildPaymentReceivedEmail({
    orderId: "ord_1",
    licenseId: "lic_1",
    planName: `Pro ${longWord}`,
  });
  // inline word-break on the three shell text cells (title / lead / footnote)
  const hits = (p.html.match(/word-break:break-word/g) || []).length;
  assert.ok(
    hits >= 4,
    `expected word-break on title+lead+footnote+detail (>=4), got ${hits}`,
  );
  assert.ok(p.html.includes("em-title"), "title cell present");
  assert.ok(p.html.includes("em-lead"), "lead cell present");
});
