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
  // Providers the backend actually supports (D-021: gRouter is the only one
  // wired to a real upstream). Package AI policy may only reference these.
  supportedAiProviders: ['grouter'],
  branding: {
    productName: 'gRouter Copilot',
    publicDomain: 'copilot.grouter.id',
    supportEmail: '',
    logoUrl: '',
    currency: 'IDR',
  },
  plans: [
    { key: 'quota-3b-90d', name: '3B · 3 months', amount: 0, currency: 'IDR', quota: '3B usage', quotaTokens: 3000000, features: ['core'], expiresInDays: 90, active: true },
    { key: 'quota-15b-365d', name: '15B · 1 year', amount: 0, currency: 'IDR', quota: '15B usage', quotaTokens: 15000000, features: ['core', 'pro'], expiresInDays: 365, active: true },
    { key: 'custom', name: 'Custom', amount: 0, currency: 'IDR', quota: 'Custom usage', quotaTokens: null, features: ['core', 'pro', 'enterprise'], expiresInDays: 365, active: true },
  ],
  payment: {
    provider: 'klikqris',
    mode: 'sandbox',
    baseUrl: 'https://klikqris.com',
    klikqrisBaseUrl: 'https://klikqris.com',
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
    // gRouter base WITHOUT the /v1 prefix — the adapter appends /v1/chat/completions.
    baseUrl: 'https://prod.grouter.web.id',
    timeoutMs: 60000,
    // Default model when the request does not specify one. MUST be a model the
    // gRouter service credential can actually call — verified live 2026-10-09
    // (grouter-default is NOT available on this credential: 403
    // insufficient_quota; DeepSeek-V4-Flash answered successfully).
    model: 'DeepSeek-V4-Flash',
    // D-021 gateway: the service credential itself is server-side env-only
    // (GROUTER_API_KEY in server/.env), never a store setting.
    gateway: {
      defaultReservationTokens: 2000,
      maxReservationTokens: 20000,
      maxMessageBytes: 32000,
    },
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
    trustedOrigins: ['https://copilot.grouter.id', 'http://localhost:4601', 'http://127.0.0.1:4601'],
    sentinel: {
      credentialStuffing: { challenge: 3, block: 5 },
      impossibleTravelMaxSpeedKmh: 1000,
      compromisedPasswordMinBreaches: 1,
    },
    activityTrackingIntervalMs: 300000,
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
  if (env.BETTER_AUTH_TRUSTED_ORIGINS) {
    seeds.auth = {
      ...(seeds.auth || {}),
      trustedOrigins: String(env.BETTER_AUTH_TRUSTED_ORIGINS)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }
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
    if (p.quotaTokens !== undefined && p.quotaTokens !== null) {
      assertInt(p.quotaTokens, `plans[${i}].quotaTokens`, { min: 1 });
    }
    if (p.features !== undefined && !Array.isArray(p.features)) {
      throw fail(`plans[${i}].features must be an array.`);
    }
    if (p.active !== undefined && typeof p.active !== 'boolean') {
      throw fail(`plans[${i}].active must be a boolean.`);
    }
    validatePlanAiPolicy(p.ai, `plans[${i}].ai`);
  });
}

/**
 * Providers the backend actually supports for package AI policies. gRouter is
 * the only one wired to a real upstream; extending this list requires a real
 * adapter implementation, not just a UI option.
 */
const SUPPORTED_AI_PROVIDERS = ['grouter'];

/**
 * Per-package AI policy (product decision 2026-10-09): the Package is the
 * source of the customer's AI entitlement — which provider, which models are
 * allowed, the package default model, and the per-license token quota.
 * Stored under plans[n].ai. Semantics:
 * - enabled (bool, default true): false → the package may not call the AI
 *   gateway at all.
 * - provider (string, default 'grouter'): only providers the backend actually
 *   supports; never a free-text fake.
 * - allowedModels (string[]): the allowlist enforced at request time. Must be
 *   non-empty when AI is enabled.
 * - defaultModel: REQUIRED and must be a member of allowedModels — the model
 *   used when the request omits one. Fail-closed otherwise.
 * - quotaTokens (positive int | null): per-license total token quota from the
 *   server-side ledger (unchanged semantics: lifetime total, null = unlimited
 *   only via explicit null; overrides the legacy top-level quotaTokens when
 *   present). Malformed/negative values are rejected — never coerced to
 *   unlimited.
 */
function validatePlanAiPolicy(ai, label) {
  if (ai === undefined || ai === null) return; // legacy plan without policy
  if (!isPlainObject(ai)) throw fail(`${label} must be an object.`);
  if (ai.enabled !== undefined && typeof ai.enabled !== 'boolean') {
    throw fail(`${label}.enabled must be a boolean.`);
  }
  const enabled = ai.enabled !== false;
  validStr(ai.provider ?? 'grouter', `${label}.provider`);
  if (ai.provider !== undefined && !SUPPORTED_AI_PROVIDERS.includes(ai.provider)) {
    throw fail(`${label}.provider must be one of: ${SUPPORTED_AI_PROVIDERS.join(', ')}.`);
  }
  if (ai.allowedModels !== undefined) {
    if (!Array.isArray(ai.allowedModels)) throw fail(`${label}.allowedModels must be an array.`);
    if (enabled && ai.allowedModels.length === 0) {
      throw fail(`${label}.allowedModels must not be empty while AI is enabled.`);
    }
    ai.allowedModels.forEach((m, j) => {
      validStr(m, `${label}.allowedModels[${j}]`);
      if (!m.trim()) throw fail(`${label}.allowedModels[${j}] must not be empty.`);
      if (m.length > 120) throw fail(`${label}.allowedModels[${j}] exceeds 120 chars.`);
    });
  }
  if (ai.defaultModel !== undefined) {
    validStr(ai.defaultModel, `${label}.defaultModel`);
    if (enabled) {
      if (!ai.defaultModel.trim()) throw fail(`${label}.defaultModel must not be empty while AI is enabled.`);
      const allow = ai.allowedModels;
      if (Array.isArray(allow) && !allow.includes(ai.defaultModel)) {
        throw fail(`${label}.defaultModel must be one of allowedModels.`);
      }
    }
  }
  if (ai.quotaTokens !== undefined && ai.quotaTokens !== null) {
    assertInt(ai.quotaTokens, `${label}.quotaTokens`, { min: 1 });
  }
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
    for (const k of ['apiKey', 'merchantId', 'baseUrl', 'klikqrisBaseUrl']) {
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
  if (p.supportedAiProviders !== undefined) {
    if (!Array.isArray(p.supportedAiProviders) || p.supportedAiProviders.length === 0
      || !p.supportedAiProviders.every((x) => typeof x === 'string' && x.trim())) {
      throw fail('supportedAiProviders must be a non-empty array of provider names.');
    }
  }
  if (p.provider?.baseUrl !== undefined) validStr(p.provider.baseUrl, 'provider.baseUrl');
  if (p.provider?.model !== undefined) validStr(p.provider.model, 'provider.model');
  if (p.provider?.gateway !== undefined) {
    const g = p.provider.gateway;
    if (!isPlainObject(g)) throw fail('provider.gateway must be an object.');
    for (const k of ['defaultReservationTokens', 'maxReservationTokens', 'maxMessageBytes']) {
      if (g[k] !== undefined) assertInt(g[k], `provider.gateway.${k}`, { min: 1 });
    }
  }
  if (p.auth?.minPasswordLength !== undefined) assertInt(p.auth.minPasswordLength, 'auth.minPasswordLength', { min: 6 });
  if (p.auth?.activityTrackingIntervalMs !== undefined) {
    assertInt(p.auth.activityTrackingIntervalMs, 'auth.activityTrackingIntervalMs', { min: 1000 });
  }
  if (p.auth?.trustedOrigins !== undefined) {
    if (!Array.isArray(p.auth.trustedOrigins) || p.auth.trustedOrigins.some((s) => typeof s !== 'string')) {
      throw fail('auth.trustedOrigins must be an array of strings.');
    }
  }
  if (p.auth?.sentinel !== undefined) {
    const s = p.auth.sentinel;
    if (!isPlainObject(s)) throw fail('auth.sentinel must be an object.');
    if (s.credentialStuffing !== undefined) {
      const cs = s.credentialStuffing;
      if (!isPlainObject(cs) || !Number.isInteger(cs.challenge) || !Number.isInteger(cs.block)) {
        throw fail('auth.sentinel.credentialStuffing must be { challenge: int, block: int }.');
      }
    }
    if (s.impossibleTravelMaxSpeedKmh !== undefined) assertInt(s.impossibleTravelMaxSpeedKmh, 'auth.sentinel.impossibleTravelMaxSpeedKmh', { min: 1 });
    if (s.compromisedPasswordMinBreaches !== undefined) assertInt(s.compromisedPasswordMinBreaches, 'auth.sentinel.compromisedPasswordMinBreaches', { min: 1 });
  }

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
    .map((p) => {
      const policy = resolvePlanAiPolicy(p, eff);
      return {
        key: p.key,
        name: p.name,
        amount: p.amount,
        currency: p.currency || eff.branding?.currency || 'IDR',
        quota: p.quota ?? null,
        features: p.features ?? [],
        expiresInDays: p.expiresInDays ?? eff.license?.defaultExpiresInDays ?? 365,
        // Customer-visible AI entitlement summary (non-secret): whether AI is
        // included and the effective token quota. Never the raw policy object
        // or anything provider-internal.
        ai: { enabled: policy.enabled, quotaTokens: policy.quotaTokens },
      };
    });
}

/** Find a plan by key (active or not). */
export function findPlan(eff, key) {
  return (eff.plans || []).find((p) => p.key === key) ?? null;
}

/**
 * Resolve the effective AI policy for a plan, merging defaults with the
 * stored policy. Backward compatibility (product decision 2026-10-09): a
 * legacy plan without an `ai` section keeps working — AI stays ENABLED with
 * the provider's configured default model and the plan's legacy top-level
 * quotaTokens (or unlimited). This does NOT silently grant new privileges:
 * the model catalogue is not widened, quota semantics are unchanged.
 * @returns {{enabled:boolean, provider:string, allowedModels:string[]|null,
 *            defaultModel:string|null, quotaTokens:number|null}}
 *   allowedModels null = no package allowlist configured (legacy) → the
 *   provider default model is permitted; enforcement falls back to
 *   infra settings. defaultModel null → caller fails closed.
 */
export function resolvePlanAiPolicy(plan, eff) {
  const ai = plan?.ai ?? null;
  const enabled = ai ? ai.enabled !== false : true;
  const provider = ai?.provider ?? 'grouter';
  const allowedModels = Array.isArray(ai?.allowedModels) && ai.allowedModels.length > 0
    ? ai.allowedModels.slice()
    : null; // null = legacy plan, no package allowlist
  let defaultModel = ai?.defaultModel ?? null;
  if (enabled && !defaultModel && allowedModels && allowedModels.length === 1) {
    defaultModel = allowedModels[0]; // single-model allowlist implies the default
  }
  // Quota: package AI quota wins; fall back to the legacy top-level quotaTokens.
  const quotaTokens = ai && ai.quotaTokens !== undefined && ai.quotaTokens !== null
    ? ai.quotaTokens
    : (plan?.quotaTokens ?? null);
  return { enabled, provider, allowedModels, defaultModel, quotaTokens };
}