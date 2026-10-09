/**
 * Copilot backend AI gateway (D-021).
 *
 * The ONLY component that holds GROUTER_API_KEY (server-side env) and calls
 * gRouter: validate license (authoritative server-side state) → reserve quota
 * → call gRouter → reconcile tokens → record usage ledger. Customer identity
 * never leaves Copilot; gRouter only sees the single service credential.
 *
 * Request flow (docs/30 audit §8): the host-app runtime runs the license gate
 * offline, executes developer skills (they live in the host app — the backend
 * has no access to customer data), builds the context/messages, and sends them
 * to this gateway with the license token. The backend re-validates everything
 * server-side, enforces quota, and performs the provider call.
 *
 * Quota semantics (documented decision): token-based metering with a safe
 * reservation/reconciliation design. Actual token usage is only known AFTER
 * the upstream call, so the reservation is an approximate ceiling, not a hard
 * per-request guarantee; concurrent in-flight requests are counted via their
 * reservations to prevent trivial quota bypass. The check-then-reserve block
 * is fully synchronous (no await between read and write) so concurrent
 * requests on the single-threaded event loop cannot interleave past the
 * check. Errored requests are never charged (reservation released).
 */

import { CopilotError, ErrorCode } from '../../src/adapter/errors.js';
import { GrouterAdapter } from '../../src/adapter/grouter.js';
import { resolveSettings, resolvePlanAiPolicy } from './settings.js';

const REQUEST_ID_PATTERN = /^req_[a-zA-Z0-9_-]{1,80}$/;
const ROLE_PATTERN = /^(system|user|assistant)$/;
const MAX_MESSAGES = 40;
const MAX_COMPLETION_TOKENS = 4000;

const UPSTREAM_ERROR_CLASSIFICATION = {
  NOT_CONFIGURED: 'upstream_not_configured',
  INVALID_REQUEST: 'upstream_rejected_request',
  TIMEOUT: 'upstream_timeout',
  UPSTREAM_UNAVAILABLE: 'upstream_unavailable',
};

export class CopilotGateway {
  /**
   * @param {object} opts
   * @param {object} opts.store  JsonStore (usage ledger)
   * @param {object} opts.licenseService  LicenseService (validate/list)
   * @param {string} opts.publicKeyPem  license verifier public key
   * @param {object} opts.adapter  GrouterAdapter or test double (holds the key)
   * @param {function} opts.resolveSettings  () => effective settings
   * @param {object} [opts.gatewayConfig]  { defaultReservationTokens, maxReservationTokens, maxMessageBytes }
   */
  constructor({ store, licenseService, publicKeyPem, adapter, resolveSettings: resolve, gatewayConfig } = {}) {
    this.store = store;
    this.licenseService = licenseService;
    this.publicKeyPem = publicKeyPem;
    this.adapter = adapter;
    this.resolveSettings = resolve;
    this.config = gatewayConfig ?? { defaultReservationTokens: 2000, maxReservationTokens: 20000, maxMessageBytes: 32000 };
  }

  get configured() {
    return Boolean(this.adapter?.configured);
  }

  /**
   * Handle a gateway chat request from a customer application.
   * Trusted inputs only: token (license), messages, optional requestId/model/maxTokens.
   * Customer-supplied customer_id/license_id/plan/quota/usage are ignored —
   * identity and entitlement resolve from server-side state.
   * @returns {Promise<object>} sanitized response (never contains credentials)
   */
  async chat(input = {}) {
    const requestId = typeof input.requestId === 'string' && REQUEST_ID_PATTERN.test(input.requestId)
      ? input.requestId
      : `req_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;

    // 1. License validation against authoritative server-side state:
    //    signature, expiry, and revocation (the store is the source of truth).
    const token = typeof input.token === 'string' ? input.token : '';
    const result = this.licenseService.validate(token, this.publicKeyPem);
    if (result.status !== 'valid') {
      // Not attributable to a durable license record — reject without ledger.
      return { requestId, status: 'error', code: 'LICENSE_INVALID', message: 'License is invalid or expired.', retryable: false };
    }
    const lic = this.licenseService.list().find((l) => l.id === result.payload.lic);
    if (!lic || lic.revokedAt) {
      return { requestId, status: 'error', code: 'LICENSE_REVOKED', message: 'License has been revoked.', retryable: false };
    }

    // 2. Messages from the host app (already skill-scoped + context-limited
    //    there, but re-validated here — never trust the caller).
    const validated = this._validateMessages(input.messages, requestId);
    if (validated.error) return validated.error;
    const messages = validated.messages;

    // 3. Model + completion cap.
    const model = typeof input.model === 'string' && input.model.trim() && input.model.length <= 120
      ? input.model.trim()
      : null;
    const maxTokens = Number.isSafeInteger(input.maxTokens) && input.maxTokens > 0
      ? Math.min(input.maxTokens, MAX_COMPLETION_TOKENS)
      : undefined;

    // 4. Fail closed without the service credential — no unauthenticated calls.
    if (!this.configured) {
      return { requestId, status: 'error', code: ErrorCode.NOT_CONFIGURED, message: 'AI gateway is not configured.', retryable: false };
    }

    // 5. Idempotency: a repeated requestId never creates a duplicate charge.
    const existing = this.store.getUsageRecord(requestId);
    if (existing) {
      if (existing.status === 'ok') {
        const eff = this.resolveSettings();
        const plan = (eff.plans || []).find((p) => p.key === lic.planKey);
        return {
          requestId, status: 'ok', answer: existing.answer ?? '',
          usage: { inputTokens: existing.inputTokens ?? 0, outputTokens: existing.outputTokens ?? 0 },
          licenseId: lic.id,
          quota: this._quotaView(plan?.quotaTokens ?? null, this.store.usageTotals(lic.id)),
          idempotentReplay: true,
        };
      }
      return {
        requestId, status: 'error',
        code: existing.errorCode ?? 'REQUEST_IN_PROGRESS', message: 'This requestId was already used.',
        retryable: existing.retryable ?? false, licenseId: lic.id,
      };
    }

    // 6. Quota reservation — SYNCHRONOUS read-then-write (no await between
    //    usageTotals and addUsageRecord) so concurrent requests cannot
    //    interleave past the check on the event loop.
    const eff = this.resolveSettings();
    const plan = (eff.plans || []).find((p) => p.key === lic.planKey);

    // 6b. Package AI policy (entitlement, resolved server-side from the plan
    //     catalogue — never from request input). The Package decides whether
    //     this customer may call AI at all, with which models, and how many
    //     tokens. The global provider.model is INFRASTRUCTURE fallback only;
    //     it can never widen a package allowlist.
    const policy = resolvePlanAiPolicy(plan, eff);
    if (!policy.enabled) {
      this.store.addUsageRecord(this._ledgerEntry({ requestId, lic, status: 'rejected', errorClassification: 'ai_disabled' }));
      return { requestId, status: 'error', code: 'AI_DISABLED', message: 'AI access is not enabled for this package.', retryable: false, licenseId: lic.id };
    }
    if (policy.provider !== 'grouter') {
      // Only gRouter is wired to a real upstream (SUPPORTED_AI_PROVIDERS);
      // validation already keeps other values out of the catalogue.
      this.store.updateUsageRecord(requestId, { status: 'error', completedAt: Date.now(), reservedTokens: 0, errorClassification: 'not_configured', errorStatus: 503, errorCode: 'NOT_CONFIGURED' });
      return { requestId, status: 'error', code: 'NOT_CONFIGURED', message: 'The configured AI provider is not available.', retryable: false, licenseId: lic.id };
    }
    // Model resolution + allowlist enforcement (server-side policy):
    // - client override accepted ONLY if it is in the package allowlist;
    // - no client model → package default (which validation keeps inside the
    //   allowlist); legacy packages without a policy use the provider default.
    let effModel;
    if (model) {
      if (policy.allowedModels && !policy.allowedModels.includes(model)) {
        this.store.addUsageRecord(this._ledgerEntry({ requestId, lic, status: 'rejected', errorClassification: 'model_not_allowed' }));
        return { requestId, status: 'error', code: 'MODEL_NOT_ALLOWED', message: 'The requested model is not allowed for this package.', retryable: false, licenseId: lic.id };
      }
      effModel = model;
    } else {
      effModel = policy.defaultModel ?? this.resolveSettings().provider?.model ?? null;
      if (policy.allowedModels && effModel && !policy.allowedModels.includes(effModel)) {
        // Global default drifted outside the package allowlist → fail closed
        // rather than silently running a model the package never allowed.
        effModel = null;
      }
    }
    if (!effModel) {
      this.store.updateUsageRecord(requestId, {
        status: 'error',
        completedAt: Date.now(),
        reservedTokens: 0,
        errorClassification: 'not_configured',
        errorStatus: 503, errorCode: 'NOT_CONFIGURED',
      });
      return { requestId, status: 'error', code: 'NOT_CONFIGURED', message: 'No usable model is configured for this package.', retryable: false, licenseId: lic.id };
    }

    // 6c. Quota reservation — package AI quota (falls back to the legacy
    //     top-level quotaTokens; null = unlimited). SYNCHRONOUS read-then-write
    //     (no await between usageTotals and addUsageRecord) so concurrent
    //     requests cannot interleave past the check on the event loop.
    const quotaTokens = policy.quotaTokens ?? null; // null/undefined = unlimited (documented)
    const { usedTokens } = this.store.usageTotals(lic.id);
    const remaining = quotaTokens === null || quotaTokens === undefined
      ? Number.MAX_SAFE_INTEGER
      : Math.max(0, quotaTokens - usedTokens);
    if (remaining < 1) {
      this.store.addUsageRecord(this._ledgerEntry({ requestId, lic, status: 'rejected', errorClassification: 'quota_exhausted' }));
      return { requestId, status: 'error', code: 'QUOTA_EXHAUSTED', message: 'Token quota is exhausted for this license.', retryable: false, licenseId: lic.id };
    }
    const reservation = Math.min(this.config.defaultReservationTokens, this.config.maxReservationTokens, remaining);
    this.store.addUsageRecord(this._ledgerEntry({ requestId, lic, status: 'reserved', reservation }));

    // 7. Call gRouter via the server-side adapter, then reconcile.
    try {
      const { answer, usage } = await this.adapter.complete({
        model: effModel,
        messages,
        maxTokens,
      });
      const inputTokens = Number.isSafeInteger(usage?.inputTokens) ? usage.inputTokens : 0;
      const outputTokens = Number.isSafeInteger(usage?.outputTokens) ? usage.outputTokens : 0;
      this.store.updateUsageRecord(requestId, {
        status: 'ok',
        model: effModel,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        reservedTokens: 0,
        completedAt: Date.now(),
        errorClassification: null, errorStatus: null, errorCode: null,
      });
      return {
        requestId, status: 'ok', answer,
        usage: { inputTokens, outputTokens },
        licenseId: lic.id,
        quota: this._quotaView(quotaTokens, this.store.usageTotals(lic.id)),
      };
    } catch (err) {
      // Release the reservation: failed requests are never charged (documented).
      this.store.updateUsageRecord(requestId, {
        status: 'error',
        completedAt: Date.now(),
        reservedTokens: 0,
        errorClassification: UPSTREAM_ERROR_CLASSIFICATION[err?.code] ?? 'upstream_error',
        errorStatus: Number.isSafeInteger(err?.status) ? err.status : null,
        errorCode: err?.code ?? null,
      });
      if (err instanceof CopilotError) {
        return { requestId, status: 'error', code: err.code, message: err.message, retryable: err.retryable, licenseId: lic.id };
      }
      return { requestId, status: 'error', code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.', retryable: false, licenseId: lic.id };
    }
  }

  /** Validate the caller-supplied messages array (safe, bounded). */
  _validateMessages(messages, requestId) {
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
      return { error: { requestId, status: 'error', code: 'INVALID_REQUEST', message: `messages must be an array of 1..${MAX_MESSAGES}.`, retryable: false } };
    }
    let totalBytes = 0;
    for (const m of messages) {
      if (!m || typeof m !== 'object' || !ROLE_PATTERN.test(String(m.role ?? '')) || typeof m.content !== 'string') {
        return { error: { requestId, status: 'error', code: 'INVALID_REQUEST', message: 'each message needs role (system|user|assistant) and string content.', retryable: false } };
      }
      totalBytes += Buffer.byteLength(m.content, 'utf8');
      if (totalBytes > this.config.maxMessageBytes) {
        return { error: { requestId, status: 'error', code: 'INVALID_REQUEST', message: 'messages exceed the context size limit.', retryable: false } };
      }
    }
    return { messages };
  }

  /** Public-safe quota view (tokens only; never provider internals). */
  _quotaView(quotaTokens, totals) {
    return quotaTokens === null || quotaTokens === undefined
      ? { unit: 'tokens', limit: null, usedTokens: totals.usedTokens, requestCount: totals.requestCount }
      : { unit: 'tokens', limit: quotaTokens, usedTokens: Math.min(totals.usedTokens, quotaTokens), requestCount: totals.requestCount };
  }

  _ledgerEntry({ requestId, lic, status, errorClassification = null, reservation = 0 }) {
    return {
      requestId,
      licenseId: lic.id,
      accountId: lic.accountId ?? null,
      planKey: lic.planKey ?? null,
      model: null,
      status, // reserved | ok | error | rejected
      reservedTokens: status === 'reserved' ? reservation : 0,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      answer: null,
      createdAt: Date.now(),
      completedAt: null,
      errorClassification,
      errorStatus: null,
      errorCode: null,
    };
  }
}

/**
 * Build the gateway from server components (wired in server.js).
 * The service credential comes ONLY from the server-side environment
 * (GROUTER_API_KEY) — never from the store, never from request input.
 */
export function createGateway({ store, licenseService, publicKeyPem, settings, fetchImpl, env = process.env } = {}) {
  const eff = resolveSettings(settings?.() ?? {}, env);
  const adapter = new GrouterAdapter({
    apiKey: env.GROUTER_API_KEY || null,
    baseUrl: eff.provider?.baseUrl,
    timeoutMs: eff.provider?.timeoutMs ?? 60000,
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  return new CopilotGateway({
    store,
    licenseService,
    publicKeyPem,
    adapter,
    resolveSettings: () => resolveSettings(settings?.() ?? {}, env),
    gatewayConfig: eff.provider?.gateway,
  });
}
