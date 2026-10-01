// E2E A1 probe against the ISOLATED instance on 127.0.0.1:4690.
// Proves: (1) client-supplied amount is rejected, (2) legit checkout resolves
// the plan price server-side, (3) settled payment issues a plan-entitled license.
const BASE = 'http://127.0.0.1:4690';
const email = `e2e-a1-${Date.now()}@gmail.com`;

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
  console.log('OK:', msg);
}

const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'http://localhost:4690' },
  body: JSON.stringify({ email, password: `Gr0ut3r-${Math.random().toString(36).slice(2)}!Zq`, name: 'E2E A1' }),
});
assert(res.status === 200, `signup 200 (got ${res.status})`);
const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
assert(cookie.length > 0, 'session cookie set');

async function api(method, path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}

// (1) cheat attempt
const cheat = await api('POST', '/api/orders', { packageKey: 'pro', amount: 1 });
assert(cheat.status === 400, `amount:1 rejected 400 (got ${cheat.status}: ${JSON.stringify(cheat.json)})`);

// (2) unknown package
const unknown = await api('POST', '/api/orders', { packageKey: 'gratis' });
assert(unknown.status === 400, `unknown package 400 (got ${unknown.status})`);

// (3) legit checkout — pro = Rp249.000 from the plan catalogue
const order = await api('POST', '/api/orders', { packageKey: 'pro' });
assert(order.status === 201, `checkout 201 (got ${order.status}: ${JSON.stringify(order.json).slice(0, 200)})`);
assert(order.json.order.amount === 249000, `order amount = 249000 (got ${order.json.order.amount})`);
assert(order.json.order.planName === 'Pro' && order.json.order.quota === '15M tokens', `planName/quota from plan (${order.json.order.planName}, ${order.json.order.quota})`);
console.log('ORDER:', order.json.order.id, 'status:', order.json.order.status);

// (4) settle via the admin path (dev instance: ADMIN_TOKEN empty → no-auth fallback)
const settle = await api('POST', `/api/admin/orders/${order.json.order.id}/settle`, {});
assert(settle.status === 200, `settle 200 (got ${settle.status}: ${JSON.stringify(settle.json)})`);

// (5) license entitlement from the plan
const me = await api('GET', '/api/me');
const lic = (me.json.licenses || []).find((l) => l.customer === 'Pro');
assert(lic, 'license issued, named after the plan');
assert(JSON.stringify(lic.features) === JSON.stringify(['core', 'pro']), `features from plan: ${JSON.stringify(lic.features)}`);
const expDays = Math.round((lic.expiresAt - order.json.order.createdAt) / 86400000);
assert(Math.abs(expDays - 365) <= 1, `expiresIn ~365d (got ${expDays})`);
console.log('LICENSE:', lic.id, 'features:', JSON.stringify(lic.features));

// (6) order read-back shows PAID with the same amount
const latest = await api('GET', '/api/orders/latest');
assert(latest.json.order.status === 'PAID', `order now PAID (got ${latest.json.order.status})`);
assert(latest.json.order.amount === 249000, `PAID order amount still 249000 (got ${latest.json.order.amount})`);
console.log('\nE2E-A1 PASS — semua assertion hijau.');
