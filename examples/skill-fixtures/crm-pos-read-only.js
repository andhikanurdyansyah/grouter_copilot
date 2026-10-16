// Synthetic CRM/POS fixture skill for authoring and contract tests.
// It has no network/database dependency and never writes. A host supplies ctx.data.crmPos.

const SOURCE = { label: 'synthetic CRM/POS fixture (ctx.data.crmPos)' };

export default {
  name: 'crm-pos-order-summary',
  description:
    'Read-only summary of POS orders for one CRM customer: order count, paid value, and bounded order rows.',
  intent: {
    phrases: ['order summary', 'ringkasan pesanan', 'customer order history'],
    synonyms: ['POS orders', 'pesanan customer'],
  },
  parameters: {
    type: 'object',
    properties: {
      customerId: { type: 'string', description: 'Host-defined customer ID' },
    },
    required: ['customerId'],
  },
  readOnly: true,
  async run({ customerId }, ctx = {}) {
    const records = ctx.data?.crmPos;
    if (!records || typeof records !== 'object' || !Array.isArray(records.orders)) {
      throw new Error('CRM/POS fixture data is not configured.');
    }

    const id = String(customerId).trim();
    const orders = records.orders
      .filter((order) => order && order.customerId === id)
      .slice(0, 20)
      .map((order) => ({
        id: order.id,
        outletId: order.outletId,
        total: order.total,
        status: order.status,
      }));

    return {
      data: {
        customerId: id,
        totalOrders: orders.length,
        paidValue: orders
          .filter((order) => order.status === 'paid')
          .reduce((sum, order) => sum + (Number(order.total) || 0), 0),
        orders,
      },
      sources: [SOURCE],
    };
  },
};
