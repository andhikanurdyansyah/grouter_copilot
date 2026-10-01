/**
 * Settings — the single source of truth for runtime configuration.
 *
 * Effective settings are resolved as:
 *
 *     DEFAULT_SETTINGS  <-  env seeds  <-  store.settings
 *
 * - `DEFAULT_SETTINGS` documents the product's out-of-the-box behaviour.
 * - environment variables act only as SEEDS / fallbacks for values that have
 *   not been set in the store yet (so an existing `.env` keeps working).
 * - `store.settings` (persisted in the JSON store, gitignored) WINS, and is
 *   what the admin panel writes to. Changing a setting there must never
 *   require editing code or redeploying.
 *
 * Secrets (payment credentials) are stored server-side and are NEVER returned
 * raw by the admin API — `maskSettings()` replaces them with a mask before they
 * leave the process. A masked value sent back on PATCH means "keep the stored
 * value" (see `stripMaskedSecrets`).
 *
 * No hardcoded configuration belongs outside this module: every service reads
 * from the effective settings it resolves here.
 */

export const SETTINGS_VERSION = 1;

/** Mask prefix used for secret fields in admin responses / round-trips. */
export const MASK = '\u2022\u2022\u2022\u2022'; // ••••

/** Fields that must never be returned raw (path within settings). */
export const SECRET_PATHS = [
  ['payment', 'apiKey'],
  ['payment', 'merchantId'],
];

/**
 * Default settings — these mirror the product's current behaviour exactly.
 * Anything a deployment needs to change must be editable here / via the admin
 * panel, NOT hardcoded at a call site.
 */
export const DEFAULT_SETTINGS = {
  branding: {
    productName: 'gRouter Copilot',
    publicDomain: 'copilot.grouter.id',
    supportEmail: '',
    logoUrl: '',
    currency: 'IDR',
  },
  plans: [
    { key: 'basic', name: 'Basic', amount: 99000, currency: 'IDR', quota: '5M tokens', features: ['core'], expiresInDays: 365, active: true },
    { key: 'pro', name: 'Pro', amount: 249000, currency: 'IDR', quota: '15M tokens', features: ['core', 'pro'], expiresInDays: 365, active: true },
    { key: 'enterprise', name: 'Enterprise', amount: 749000, currency: 'IDR', quota: '50M tokens', features: ['core', 'pro', 'enterprise'], expiresInDays: 365, active: true },
  ],
  payment: {
    provider: 'klikqris',
    mode: 'sandbox',
    baseUrl: 'https://klikqris.com',
    apiKey: '',
    merchantId: '',
    pollIntervalMs: 10000,
    pollTimeoutMs: 900000,
  },
  usage: {
    checkUsageUrl: 'https://prod.grouter.web.id/api/check-usage',
    cacheTtlMs: 60000,
  },
  provider: {
    baseUrl: 'https://prod.grouter.web.id/v1',
    timeoutMs: 60000,
  },
  limits: {
    maxContextBytes: 32000,
    maxRows: 500,
    maxTokens: 2000,
  },
  license: {
    audience: 'grouter-copilot',
    defaultFeatures: ['core'],
    defaultExpiresInDays: 365,
  },
  auth: {
    minPasswordLength: 8,
    trustedOrigins: [],
  },
};

/** Top-level sections the admin panel is allowed to write. */
const WRITABLE_SECTIONS = Object.keys(DEFAULT_SETTINGS);

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

/**
 * Deep-merge `source` onto `target`. Arrays and scalars REPLACE (a plans list
 * is a whole list, not an element-wise merge); plain objects recurse.
 */
export function deepMerge(target, source) {
  if (!isPlainObject(source)) return clone(source);
  const out = isPlainObject(target) ? { ...target } : {};
  for (const [k, v] of Object.entries(source)) {
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : clone(v);
  }
  return out;
}

/** Read a nested path. */
export function getPath(obj, path) {
  return path.reduce((acc, k) => (isPlainObject(acc) ? acc[k] : undefined), obj);
}

/** Set a nested path (mutates a copy). */
function setPath(obj, path, value) {
  let cur = obj;
  for (let i = 0; i < path.length - 1; i += 1) {
    if (!isPlainObject(cur[path[i]])) cur[path[i]] = {};
    cur = cur[path[i]];
  }
  cur[path[path.length - 1]] = value;
  return obj;
}

/** Seed values derived from the environment (used only when unset in store). */
export function envSeeds(env = process.env) {
  const seeds = {};
  if (env.KLIKQRIS_MODE) seeds.payment = { ...(seeds.payment || {}), mode: env.KLIKQRIS_MODE };
  if (env.KLIKQRIS_API_KEY) seeds.payment = { ...(seeds.payment || {}), apiKey: env.KLIKQRIS_API_KEY };
  if (env.KLIKQRIS_MERCHANT_ID) seeds.payment = { ...(seeds.payment || {}), merchantId: env.KLIKQRIS_MERCHANT_ID };
  if (env.GROUTER_CHECK_USAGE_URL) seeds.usage = { checkUsageUrl: env.GROUTER_CHECK_USAGE_URL };
  if (env.GROUTER_BASE_URL) seeds.provider = { baseUrl: env.GROUTER_BASE_URL };
  return seeds;
}

/**
 * Resolve the effective settings: defaults <- env seeds <- stored.
 * @param {object} stored  what the store holds (may be {} on a fresh install)
 * @param {object} env
 */
export function resolveSettings(stored = {}, env = process.env) {
  let eff = clone(DEFAULT_SETTINGS);
  eff = deepMerge(eff, envSeeds(env));
  eff = deepMerge(eff, stored);
  return eff;
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

function fail(msg) {
  const err = new Error(msg);
  err.code = 'INVALID_SETTINGS';
  return err;
}

function assertInt(v, label, { min = 0 } = {}) {
  if (typeof v !== 'number' || !Number.isFinite(v) || Math.floor(v) !== v || v < min) {
    throw fail(`${label} must be an integer >= ${min}.`);
  }
}

function validStr(v, label) {
  if (typeof v !== 'string') throw fail(`${label} must be a string.`);
}

function validatePlans(plans) {
  if (!Array.isArray(plans)) throw fail('plans must be an array.');
  const seen = new Set();
  plans.forEach((p, i) => {
    if (!isPlainObject(p)) throw fail(`plans[${i}] must be an object.`);
    validStr(p.key, `plans[${i}].key`);
    if (!p.key.trim()) throw fail(`plans[${i}].key must not be empty.`);
    if (seen.has(p.key)) throw fail(`Duplicate plan key: ${p.key}.`);
    seen.add(p.key);
    validStr(p.name, `plans[${i}].name`);
    if (!p.name.trim()) throw fail(`plans[${i}].name must not be empty.`);
    assertInt(p.amount, `plans[${i}].amount`, { min: 0 });
    assertInt(p.expiresInDays ?? 365, `plans[${i}].expiresInDays`, { min: 1 });
    if (p.features !== undefined && !Array.isArray(p.features)) {
      throw fail(`plans[${i}].features must be an array.`);
    }
    if (p.active !== undefined && typeof p.active !== 'boolean') {
      throw fail(`plans[${i}].active must be a boolean.`);
    }
  });
}

/**
 * Validate a partial settings patch. Throws on invalid input; returns a
 * sanitized (clone) patch. Unknown top-level sections are rejected so a typo
 * fails loudly instead of silently doing nothing.
 */
export function validateSettings(patch) {
  if (!isPlainObject(patch)) throw fail('settings patch must be an object.');
  for (const key of Object.keys(patch)) {
    if (!WRITABLE_SECTIONS.includes(key)) throw fail(`Unknown settings section: ${key}.`);
  }
  const p = clone(patch);

  if (p.plans !== undefined) validatePlans(p.plans);

  if (p.payment !== undefined) {
    const pay = p.payment;
    if (!isPlainObject(pay)) throw fail('payment must be an object.');
    if (pay.mode !== undefined && !['sandbox', 'production'].includes(pay.mode)) {
      throw fail('payment.mode must be "sandbox" or "production".');
    }
    if (pay.provider !== undefined && pay.provider !== 'klikqris') {
      throw fail('payment.provider must be "klikqris".');
    }
    for (const k of ['apiKey', 'merchantId', 'baseUrl']) {
      if (pay[k] !== undefined) validStr(pay[k], `payment.${k}`);
    }
    for (const k of ['pollIntervalMs', 'pollTimeoutMs']) {
      if (pay[k] !== undefined) assertInt(pay[k], `payment.${k}`, { min: 1000 });
    }
  }

  for (const section of ['usage', 'provider', 'limits', 'license', 'auth', 'branding']) {
    if (p[section] !== undefined && !isPlainObject(p[section])) {
      throw fail(`${section} must be an object.`);
    }
  }
  if (p.usage?.checkUsageUrl !== undefined) validStr(p.usage.checkUsageUrl, 'usage.checkUsageUrl');
  if (p.provider?.baseUrl !== undefined) validStr(p.provider.baseUrl, 'provider.baseUrl');
  if (p.auth?.minPasswordLength !== undefined) assertInt(p.auth.minPasswordLength, 'auth.minPasswordLength', { min: 6 });

  return p;
}

/**
 * Remove secret fields whose patch value is a mask / empty — meaning the
 * caller echoed the masked value back and does not intend to change it.
 */
export function stripMaskedSecrets(patch) {
  const p = clone(patch);
  for (const path of SECRET_PATHS) {
    const cur = getPath(p, path);
    if (typeof cur === 'string' && (cur === '' || cur.startsWith(MASK))) {
      let parent = p;
      for (let i = 0; i < path.length - 1; i += 1) parent = parent?.[path[i]];
      if (parent) delete parent[path[path.length - 1]];
    }
  }
  return p;
}

/** Mask every secret field for outbound admin responses. */
export function maskSettings(eff) {
  const out = clone(eff);
  for (const path of SECRET_PATHS) {
    const v = getPath(out, path);
    if (typeof v === 'string' && v.length > 0) {
      setPath(out, path, `${MASK}${v.slice(-4)}`);
    }
  }
  return out;
}

/** Public plan catalogue (safe for the customer UI; no internals). */
export function publicPlans(eff) {
  return (eff.plans || [])
    .filter((p) => p.active !== false)
    .map((p) => ({
      key: p.key,
      name: p.name,
      amount: p.amount,
      currency: p.currency || eff.branding?.currency || 'IDR',
      quota: p.quota ?? null,
      features: p.features ?? [],
      expiresInDays: p.expiresInDays ?? eff.license?.defaultExpiresInDays ?? 365,
    }));
}

/** Find a plan by key (active or not). */
export function findPlan(eff, key) {
  return (eff.plans || []).find((p) => p.key === key) ?? null;
}