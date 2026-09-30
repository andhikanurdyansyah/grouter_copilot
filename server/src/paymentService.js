/**
 * Payment/order flow — tie KlikQRIS payment to license issuance.
 *
 * Flow:
 *   createOrder(package) → KlikQRIS.createQris → order pending (QR shown to customer)
 *   customer pays → KlikQRIS webhook OR poll → order.status = PAID
 *   onPaid(order) → issue license (bound to customer) → deliver LICENSE KEY
 *
 * This module depends on KlikQris (client) + LicenseService. It is additive:
 * the existing issue/bind/resolve flows are untouched.
 */

import { KlikQris } from './klikqris.js';

export class PaymentService {
  constructor({ klikqris, licenseService, store }) {
    this.klikqris = klikqris;
    this.licenseService = licenseService;
    this.store = store;
  }

  /**
   * Create a payment order for a package.
   * @param {{accountId:string, packageKey:string, amount:number, description?:string}} opts
   * @returns {Promise<object>} { order, qr }
   */
  async createOrder({ accountId, packageKey, amount, description = '' }) {
    const orderId = `ord_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
    const qr = await this.klikqris.createQris({ orderId, amount, description: description || packageKey });

    const order = {
      id: orderId,
      accountId,
      packageKey,
      amount: Math.round(Number(amount)),
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
   * @returns {Promise<{order:object, license:object|null}>}
   */
  async settlePaid(orderId) {
    const order = this.store.getOrder(orderId);
    if (!order) return { order: null, license: null };
    if (order.status === 'PAID') return { order, license: null }; // idempotent

    order.status = 'PAID';
    order.paidAt = Date.now();
    this.store._save();

    const { record } = this.licenseService.issue({
      customer: order.packageKey, // license named after package; accountId links ownership
      accountId: order.accountId,
      features: ['core'],
    });

    return { order, license: record };
  }
}
