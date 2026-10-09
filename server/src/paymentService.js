/**
 * Payment/order flow — tie KlikQRIS payment to license issuance.
 *
 * Flow:
 *   createOrder({ plan, accountId }) → KlikQRIS.createQris → order PENDING (QR shown)
 *   customer pays → KlikQRIS webhook OR poll → settlePaid → license issued
 *
 * COST INTEGRITY (A1, D-020): the caller (the /api/orders route) resolves the
 * plan from the server-side settings catalogue — the request body never
 * provides the amount. This module takes the resolved plan object
 * (key/name/amount/quota/features/expiresInDays) as input; no client-supplied
 * price exists anywhere in the order path.
 *
 * This module depends on KlikQris (client) + LicenseService. It is additive:
 * the existing issue/bind/resolve flows are untouched.
 */

import { KlikQris } from './klikqris.js';
import { resolveSettings } from './settings.js';

export class PaymentService {
  constructor({ klikqris, licenseService, store, resolveSettings: resolveSettingsFn } = {}) {
    this.klikqris = klikqris;
    this.licenseService = licenseService;
    this.store = store;
    // Injectable for tests; defaults to the settings module's resolver.
    this.resolveSettings = resolveSettingsFn || resolveSettings;
  }

  /**
   * Create a payment order for a server-resolved plan.
   * @param {{key:string, name:string, amount:number, quota?:string, features?:string[], expiresInDays?:number}} plan
   * @param {string} accountId  owning account (from the authenticated session)
   * @returns {Promise<object>} { order, qr }
   */
  async createOrder({ plan, accountId }) {
    if (!plan || typeof plan.amount !== 'number' || !Number.isFinite(plan.amount)) {
      throw new Error('plan with a numeric amount is required');
    }
    if (!accountId) throw new Error('accountId is required');

    const orderId = `ord_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
    const amount = Math.round(plan.amount);
    const qr = await this.klikqris.createQris({
      orderId,
      amount,
      description: `gRouter Copilot ${plan.name || plan.key}`,
    });

    const order = {
      id: orderId,
      accountId,
      packageKey: plan.key,
      planName: plan.name ?? plan.key,
      quota: plan.quota ?? null,
      amount,
      status: 'PENDING',
      qrUrl: qr.qrUrl,
      qrImage: qr.qrImage,
      signature: qr.signature,
      expiredAt: qr.expiredAt,
      createdAt: Date.now(),
      paidAt: null,
    };
    this.store.addOrder(order);
    return { order, qr };
  }

  /**
   * Mark an order paid and issue a license (idempotent: only first transition issues).
   * Entitlement comes from the plan catalogue at settle time (features/expires/quota),
   * never from hardcoded values (A3). Falls back to license defaults only if the
   * plan was removed/renamed after checkout — never to client input.
   * @returns {Promise<{order:object, license:object|null}>}
   */
  async settlePaid(orderId) {
    const order = this.store.getOrder(orderId);
    if (!order) return { order: null, license: null };
    if (order.status === 'PAID') return { order, license: null }; // idempotent

    order.status = 'PAID';
    order.paidAt = Date.now();
    this.store._save();

    const eff = this.resolveSettings(this.store.getSettings());
    const plan = (eff.plans || []).find((p) => p.key === order.packageKey);
    const features = plan?.features ?? eff.license.defaultFeatures;
    const expiresInDays = plan?.expiresInDays ?? eff.license.defaultExpiresInDays;
    const quota = plan?.quota ?? order.quota ?? null;

    const { record } = this.licenseService.issue({
      customer: order.planName || order.packageKey, // license named after the plan
      accountId: order.accountId,
      planKey: order.packageKey, // entitlement (quotaTokens) resolves from the plan catalogue
      features,
      expiresInDays,
      quota,
    });

    return { order, license: record };
  }
}
