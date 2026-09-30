// Example: CRM sales summary skill (read-only).
// Demonstrates scoping data per user and returning only what the model needs.
export default {
  name: 'sales-summary',
  description: 'Ringkas total penjualan dalam periode (7d/30d)',
  parameters: {
    type: 'object',
    properties: {
      period: { type: 'string', enum: ['7d', '30d'] },
    },
    required: ['period'],
  },
  readOnly: true,
  async run({ period, user }) {
    // Ganti dengan query DB/service Anda sendiri.
    // Scope per user: hanya data milik user ini.
    const rows = await queryOrders({ period, ownerId: user?.id });
    return {
      period,
      total: rows.reduce((s, r) => s + r.total, 0),
      count: rows.length,
      ownerId: user?.id ?? null,
    };
  },
};

// placeholder — replace with real DB access
async function queryOrders({ period, ownerId }) {
  return [
    { id: 1, total: 120 },
    { id: 2, total: 340 },
  ];
}
