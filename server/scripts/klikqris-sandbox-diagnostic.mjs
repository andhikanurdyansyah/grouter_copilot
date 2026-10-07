#!/usr/bin/env node
/**
 * Safe, opt-in KlikQRIS sandbox diagnostic.
 *
 * This performs one sandbox create request and (unless --no-status) one status
 * request. It never accepts production mode, prints credentials, or claims a
 * payment was made. Sandbox checkout completion still requires the merchant
 * dashboard's manual simulator.
 */
import { KlikQris } from '../src/klikqris.js';

function usage() {
  console.log('Usage: set the KlikQRIS API-key and merchant-id environment variables, then run node scripts/klikqris-sandbox-diagnostic.mjs [--order-id ID] [--amount N] [--no-status]');
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exitCode = 2;
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) { usage(); process.exit(0); }
if (process.env.KLIKQRIS_MODE && process.env.KLIKQRIS_MODE !== 'sandbox') {
  fail('refusing to run: KLIKQRIS_MODE must be sandbox');
} else if (!process.env.KLIKQRIS_API_KEY || !process.env.KLIKQRIS_MERCHANT_ID) {
  fail('KLIKQRIS_API_KEY and KLIKQRIS_MERCHANT_ID are required (values are never printed)');
} else {
  const orderId = args[args.indexOf('--order-id') + 1] || `sandbox-diagnostic-${Date.now()}`;
  const amountArg = args[args.indexOf('--amount') + 1];
  const amount = amountArg === undefined ? 10000 : Number(amountArg);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    fail('--amount must be a positive integer');
  } else {
    const client = new KlikQris({ mode: 'sandbox' });
    try {
      const created = await client.createQris({ orderId, amount, description: 'gRouter sandbox diagnostic' });
      console.log(JSON.stringify({
        ok: true,
        mode: 'sandbox',
        endpoint: `${client.baseUrl}/qris/create`,
        create: { orderId: created.orderId, amount: created.amount, totalAmount: created.totalAmount, status: created.status, hasQrUrl: Boolean(created.qrUrl), hasQrImage: Boolean(created.qrImage), hasSignature: Boolean(created.signature) },
        note: 'No payment was simulated. Complete sandbox payment only via the KlikQRIS merchant dashboard.',
      }));
      if (!args.includes('--no-status')) {
        const status = await client.checkStatus(created.orderId);
        console.log(JSON.stringify({ ok: true, endpoint: `${client.baseUrl}/qris/status/{order_id}`, status: status.status, orderId: status.orderId }));
      }
    } catch (error) {
      console.error(JSON.stringify({ ok: false, code: error.code || 'KLIKQRIS_ERROR', message: error.message }));
      process.exitCode = 1;
    }
  }
}
