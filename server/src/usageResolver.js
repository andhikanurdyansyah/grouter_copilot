/**
 * Usage resolver — consume gRouter /check-usage (READ-ONLY) for the single
 * service credential, cache and aggregate for the Copilot dashboard.
 *
 * This NEVER writes to gRouter. D-021: the response describes INFRASTRUCTURE
 * usage of the whole service credential (all customers) — it is NOT any
 * individual customer's quota. Customer usage lives in the gateway ledger.
 */

import { CopilotError, ErrorCode } from '../../src/adapter/errors.js';

const DEFAULT_CHECK_USAGE_URL = 'https://prod.grouter.web.id/api/check-usage';

export class UsageResolver {
  constructor({ checkUsageUrl = DEFAULT_CHECK_USAGE_URL, fetchImpl = globalThis.fetch, ttlMs = 60_000 } = {}) {
    this.checkUsageUrl = checkUsageUrl;
    this.fetch = fetchImpl;
    this.ttlMs = ttlMs;
    this.cache = new Map(); // licenseId -> { at, data }
  }

  /**
   * Fetch usage for a license's bound gRouter api key.
   * @param {string} licenseId
   * @param {string} grouterApiKey
   * @returns {Promise<object|null>} normalized usage, or null if not available
   */
  async fetchUsage(licenseId, grouterApiKey, { force = false } = {}) {
    if (!grouterApiKey) return null;

    const cached = this.cache.get(licenseId);
    if (!force && cached && Date.now() - cached.at < this.ttlMs) {
      return cached.data;
    }

    const url = `${this.checkUsageUrl}?key=${encodeURIComponent(grouterApiKey)}`;
    try {
      const res = await this.fetch(url);
      if (!res.ok) {
        throw new CopilotError(ErrorCode.UPSTREAM_UNAVAILABLE, 'Unable to fetch usage from gRouter.', {
          retryable: res.status >= 500 || res.status === 429,
        });
      }
      const raw = await res.json();
      if (raw.error) {
        throw new CopilotError(ErrorCode.SCOPE_DENIED, `gRouter: ${raw.error}`, { status: 403 });
      }
      const data = normalizeUsage(raw);
      this.cache.set(licenseId, { at: Date.now(), data });
      return data;
    } catch (err) {
      if (err instanceof CopilotError) throw err;
      return null; // network/parse failure → null, not a crash
    }
  }

  clear(licenseId) {
    this.cache.delete(licenseId);
  }
}

/**
 * Normalize the raw /check-usage response into a compact, safe summary.
 * Never exposes raw model provider internals; only catalog-safe fields.
 */
export function normalizeUsage(raw) {
  return {
    status: raw.status ?? null,
    name: raw.name ?? null,
    usage: {
      tokens: raw.usage?.tokens ?? 0,
      limit: raw.usage?.limit ?? null,
      remaining: raw.usage?.remaining ?? null,
      percentage: raw.usage?.percentage ?? null,
    },
    daily: raw.daily ? {
      used: raw.daily.used,
      effectiveLimit: raw.daily.effectiveLimit,
      remaining: raw.daily.remaining,
      resetAt: raw.daily.resetAt,
    } : null,
    fairUse: raw.fairUse ? {
      level: raw.fairUse.level,
      actionable: raw.fairUse.actionable,
      retryAfter: raw.fairUse.retryAfter ?? null,
    } : null,
    subscription: raw.subscription ? {
      packageName: raw.subscription.packageName,
      expiresAt: raw.subscription.expiresAt,
    } : null,
    requests: raw.requests ?? 0,
    modelCount: Array.isArray(raw.models) ? raw.models.length : 0,
  };
}
