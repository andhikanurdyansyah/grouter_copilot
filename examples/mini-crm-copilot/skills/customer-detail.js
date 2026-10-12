// Skill: customer-detail — detail satu customer + deals + activities miliknya (read-only).
import { loadDb } from './_db.js';

export default {
  name: 'customer-detail',
  description:
    'Customer detail: lihat detail satu customer berdasarkan customerId — profil, semua deal, dan semua aktivitas milik customer tersebut saja.',
  parameters: {
    type: 'object',
    properties: {
      customerId: { type: 'string', description: 'ID customer, mis. cus_001 (wajib)' },
    },
    required: ['customerId'],
  },
  readOnly: true,
  async run({ customerId }) {
    const db = await loadDb();
    const id = String(customerId ?? '').trim();
    const customer = db.customers.find((c) => c.id === id) ?? null;

    if (!customer) {
      return {
        data: { found: false, customerId: id, message: 'Customer tidak ditemukan.' },
        sources: [{ label: 'customers (lib/db.js)' }],
      };
    }

    const deals = db.deals
      .filter((d) => d.customerId === customer.id)
      .map((d) => ({ id: d.id, title: d.title, value: d.value, stage: d.stage, expectedClose: d.expectedClose }));
    const activities = db.activities
      .filter((a) => a.customerId === customer.id)
      .map((a) => ({ id: a.id, type: a.type, note: a.note, at: a.at, sentiment: a.sentiment }))
      .sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));

    return {
      data: {
        found: true,
        customer: {
          id: customer.id,
          name: customer.name,
          company: customer.company,
          email: customer.email,
          phone: customer.phone,
          segment: customer.segment,
          status: customer.status,
          createdAt: customer.createdAt,
        },
        deals,
        activities,
      },
      sources: [
        { label: `customers/${customer.id} (lib/db.js)` },
        { label: `deals?customerId=${customer.id} (lib/db.js)` },
        { label: `activities?customerId=${customer.id} (lib/db.js)` },
      ],
    };
  },
};
