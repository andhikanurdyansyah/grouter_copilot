// Skill: pipeline — semua deal terbuka + aktivitas terakhir per deal (read-only).
import { loadDb } from './_db.js';

const OPEN_STAGES = ['discovery', 'proposal', 'negotiation'];

export default {
  name: 'pipeline',
  description:
    'Pipeline deals: daftar semua deal terbuka (stage discovery/proposal/negotiation) dengan nilai, expectedClose, customer terkait, dan aktivitas terakhir. Dipakai untuk pertanyaan deal mana yang berpotensi closing bulan ini, potensi closing, proyeksi pendapatan deal.',
  parameters: { type: 'object', properties: {} },
  readOnly: true,
  async run() {
    const db = await loadDb();
    const customersById = new Map(db.customers.map((c) => [c.id, c]));

    const lastActivityAtByCustomer = new Map();
    for (const a of db.activities) {
      const prev = lastActivityAtByCustomer.get(a.customerId);
      if (!prev || String(a.at ?? '') > String(prev.at ?? '')) lastActivityAtByCustomer.set(a.customerId, a);
    }

    const openDeals = db.deals
      .filter((d) => OPEN_STAGES.includes(d.stage))
      .map((d) => {
        const customer = customersById.get(d.customerId) ?? null;
        const last = lastActivityAtByCustomer.get(d.customerId) ?? null;
        return {
          dealId: d.id,
          title: d.title,
          stage: d.stage,
          value: d.value,
          expectedClose: d.expectedClose,
          customerId: d.customerId,
          customerName: customer?.name ?? null,
          lastActivity: last
            ? { type: last.type, note: last.note, at: last.at, sentiment: last.sentiment }
            : null,
        };
      })
      .sort((a, b) => String(a.expectedClose ?? '').localeCompare(String(b.expectedClose ?? '')));

    return {
      data: {
        totalOpenDeals: openDeals.length,
        totalOpenValue: openDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0),
        deals: openDeals,
      },
      sources: [
        { label: 'deals stage discovery/proposal/negotiation (lib/db.js)' },
        { label: 'activities terakhir per customer (lib/db.js)' },
      ],
    };
  },
};
