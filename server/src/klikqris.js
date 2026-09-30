/**
 * KlikQRIS payment client — QRIS payment gateway for gRouter Copilot.
 *
 * Verified against LIVE sandbox (2026-10-01). Base URL depends on mode:
 *   sandbox:    https://klikqris.com/api/sandbox
 *   production: https://klikqris.com/api
 *
 * Endpoints:
 *   POST {base}/qris/create             → create QRIS
 *   GET  {base}/qris/status/{order_id}  → check status
 *
 * Auth headers (all requests): x-api-key, id_merchant.
 *
 * Verified response envelope (sandbox):
 *   { status: true, message: "...", data: { order_id, nama_toko, amount, amount_uniq,
 *     total_amount, status: "PENDING"|"PAID"|..., qris_url, qris_image, expired_at,
 *     paid_at, signature, keterangan, ... } }
 *
 * Status is `data.status` (NOT `payment_status`). The `signature` field is a
 * transaction signature returned by KlikQRIS (not a webhook HMAC header).
 */

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
    fetchImpl = globalThis.fetch,
  } = {}) {
    this.apiKey = apiKey;
    this.merchantId = merchantId;
    this.mode = mode;
    this.fetch = fetchImpl;
  }

  get configured() {
    return Boolean(this.apiKey && this.merchantId);
  }

  /** Base path per mode. */
  get baseUrl() {
    return this.mode === 'production'
      ? `${KLIKQRIS_BASE_URL}/api`
      : `${KLIKQRIS_BASE_URL}/api/sandbox`;
  }

  _headers() {
    return {
      'x-api-key': this.apiKey,
      'id_merchant': String(this.merchantId),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  async _request(method, path, body) {
    if (!this.configured) {
      throw new KlikQrisError('KlikQRIS is not configured.', { code: 'NOT_CONFIGURED' });
    }
    let res;
    try {
      res = await this.fetch(`${this.baseUrl}${path}`, {
        method,
        headers: this._headers(),
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch (err) {
      throw new KlikQrisError('Unable to reach KlikQRIS.', { code: 'NETWORK', cause: err });
    }

    const data = await res.json().catch(() => ({}));
    if (data.status === false) {
      const msg = data.message || 'KlikQRIS error.';
      if (res.status === 401 || /invalid api key|unauthorized|inactive/i.test(msg)) {
        throw new KlikQrisError(msg, { code: 'AUTH_FAILED' });
      }
      throw new KlikQrisError(msg, { code: 'REQUEST_FAILED' });
    }
    return data;
  }

  /**
   * Create a QRIS payment.
   * @param {{orderId:string, amount:number, description?:string}} opts
   * @returns {Promise<object>} normalized { orderId, amount, totalAmount, status, qrUrl, qrImage, expiredAt, signature }
   */
  async createQris({ orderId, amount, description = '' }) {
    const data = await this._request('POST', '/qris/create', {
      order_id: orderId,
      amount: Math.round(Number(amount)),
      id_merchant: String(this.merchantId),
      keterangan: description,
    });
    const d = data.data ?? {};
    return {
      orderId: d.order_id ?? orderId,
      amount: d.amount ?? null,
      totalAmount: d.total_amount ?? null,
      status: d.status ?? 'PENDING',
      qrUrl: d.qris_url ?? null,
      qrImage: d.qris_image ?? null,
      expiredAt: d.expired_at ?? null,
      signature: d.signature ?? null,
    };
  }

  /**
   * Check payment status.
   * @returns {Promise<{orderId:string, status:string, paidAt:string|null, raw:object}>}
   */
  async checkStatus(orderId) {
    const data = await this._request('GET', `/qris/status/${encodeURIComponent(orderId)}`);
    const d = data.data ?? {};
    return {
      orderId: d.order_id ?? orderId,
      status: d.status ?? 'UNKNOWN',
      paidAt: d.paid_at ?? null,
      raw: d,
    };
  }
}

/**
 * Poll a QRIS order until a terminal status or timeout.
 * KlikQRIS statuses: PENDING → PAID / EXPIRED / (FAILED).
 * @returns {Promise<{status:string}>}
 */
export async function pollUntilSettled(klikqris, orderId, { intervalMs = 10000, timeoutMs = 15 * 60_000 } = {}) {
  const start = Date.now();
  const terminal = new Set(['PAID', 'EXPIRED', 'FAILED']);
  while (Date.now() - start < timeoutMs) {
    const { status } = await klikqris.checkStatus(orderId);
    if (terminal.has(status)) return { status };
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { status: 'TIMEOUT' };
}
