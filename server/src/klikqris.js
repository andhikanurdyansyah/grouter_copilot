/**
 * KlikQRIS payment client — QRIS payment gateway for gRouter Copilot.
 *
 * Verified endpoints (2026-09-30):
 *   POST https://klikqris.com/api/qris/create      (headers: x-api-key, id_merchant)
 *   GET  https://klikqris.com/api/qris/status/{order_id}  (headers: x-api-key, id_merchant)
 *
 * Response envelope: { status: true|false, message, data: {...} }
 *   create → data: { qris_image, qris_data, amount, expired_at, order_id, ... }
 *   status → data: { payment_status: "pending"|"paid"|"expired"|"failed", ... }
 *
 * Credentials come from env (never committed):
 *   KLIKQRIS_API_KEY, KLIKQRIS_MERCHANT_ID, KLIKQRIS_MODE=sandbox|production
 *
 * Sandbox note: the account/key must be activated in the KlikQRIS dashboard.
 * An inactive account returns: { status:false, message:"Unauthorized: Invalid API Key or Account Inactive" }.
 */

import crypto from 'node:crypto';

export const KLIKQRIS_BASE_URL = 'https://klikqris.com';

export class KlikQrisError extends Error {
  constructor(message, { code = 'KLIKQRIS_ERROR', cause = null } = {}) {
    super(message);
    this.name = 'KlikQrisError';
    this.code = code;
    this.cause = cause;
  }
}

export class KlikQris {
  constructor({
    apiKey = process.env.KLIKQRIS_API_KEY,
    merchantId = process.env.KLIKQRIS_MERCHANT_ID,
    mode = process.env.KLIKQRIS_MODE || 'sandbox',
    baseUrl = KLIKQRIS_BASE_URL,
    fetchImpl = globalThis.fetch,
  } = {}) {
    this.apiKey = apiKey;
    this.merchantId = merchantId;
    this.mode = mode;
    this.baseUrl = baseUrl;
    this.fetch = fetchImpl;
  }

  get configured() {
    return Boolean(this.apiKey && this.merchantId);
  }

  _headers() {
    return {
      'x-api-key': this.apiKey,
      'id_merchant': String(this.merchantId),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  /**
   * Create a QRIS payment.
   * @param {{orderId:string, amount:number, description?:string}} opts
   * @returns {Promise<object>} { orderId, amount, qrData, qrImage, expiredAt }
   */
  async createQris({ orderId, amount, description = '' }) {
    if (!this.configured) {
      throw new KlikQrisError('KlikQRIS is not configured.', { code: 'NOT_CONFIGURED' });
    }
    const payload = {
      order_id: orderId,
      amount: Math.round(Number(amount)),
      id_merchant: String(this.merchantId),
      keterangan: description,
    };
    let res;
    try {
      res = await this.fetch(`${this.baseUrl}/api/qris/create`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify(payload),
      });
    } catch (err) {
      throw new KlikQrisError('Unable to reach KlikQRIS.', { code: 'NETWORK', cause: err });
    }

    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      throw new KlikQrisError(data.message || 'Invalid API key or account inactive.', { code: 'AUTH_FAILED' });
    }
    if (data.status === false || data.status === true) {
      if (data.status === false) {
        throw new KlikQrisError(data.message || 'KlikQRIS error.', { code: 'REQUEST_FAILED' });
      }
    } else if (!res.ok) {
      throw new KlikQrisError(`KlikQRIS HTTP ${res.status}.`, { code: 'HTTP_ERROR' });
    }

    const d = data.data ?? {};
    return {
      orderId: d.order_id ?? orderId,
      amount: d.amount ?? payload.amount,
      qrData: d.qris_data ?? d.qris_image ?? null,
      qrImage: d.qris_image ?? null,
      expiredAt: d.expired_at ?? null,
    };
  }

  /**
   * Check payment status.
   * @returns {Promise<{orderId:string, paymentStatus:string, raw:object}>}
   */
  async checkStatus(orderId) {
    if (!this.configured) {
      throw new KlikQrisError('KlikQRIS is not configured.', { code: 'NOT_CONFIGURED' });
    }
    let res;
    try {
      res = await this.fetch(`${this.baseUrl}/api/qris/status/${encodeURIComponent(orderId)}`, {
        method: 'GET',
        headers: this._headers(),
      });
    } catch (err) {
      throw new KlikQrisError('Unable to reach KlikQRIS.', { code: 'NETWORK', cause: err });
    }

    const data = await res.json().catch(() => ({}));
    const paymentStatus = data?.data?.payment_status ?? 'unknown';
    return { orderId, paymentStatus, raw: data };
  }

  /**
   * Verify a webhook signature.
   * KlikQRIS signs with HMAC-SHA256 over the sorted JSON payload using the api key.
   * (Confirmed against the reference client; verify against official docs at activation.)
   */
  verifyWebhookSignature(payload, signature) {
    if (!this.apiKey || !signature) return false;
    const canonical = JSON.stringify(payload, Object.keys(payload ?? {}).sort());
    const expected = crypto.createHmac('sha256', this.apiKey).update(canonical).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(String(signature));
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }
}

/**
 * Poll a QRIS order until paid/expired/failed or timeout.
 * @returns {Promise<{paymentStatus:string}>}
 */
export async function pollUntilSettled(klikqris, orderId, { intervalMs = 10000, timeoutMs = 15 * 60_000 } = {}) {
  const start = Date.now();
  const terminal = new Set(['paid', 'expired', 'failed']);
  while (Date.now() - start < timeoutMs) {
    const { paymentStatus } = await klikqris.checkStatus(orderId);
    if (terminal.has(paymentStatus)) return { paymentStatus };
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { paymentStatus: 'timeout' };
}
