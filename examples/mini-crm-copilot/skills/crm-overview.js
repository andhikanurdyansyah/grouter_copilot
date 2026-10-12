// Skill: crm-overview — ringkasan overview CRM (read-only).
// Output dipakai Copilot untuk menjawab "ringkasan/overview CRM".
import { loadDb } from './_db.js';

const OVERVIEW_SOURCE = { label: 'CRM database (data/crm.json via lib/db.js)' };

export default {
  name: 'crm-overview',
  description:
    'Ringkasan overview CRM: total customer, customer aktif, deal terbuka, nilai pipeline terbuka, leads per status, deals per stage.',
  parameters: { type: 'object', properties: {} },
  readOnly: true,
  async run() {
    const db = await loadDb();
    const openDeals = db.deals.filter((d) => d.stage === 'discovery' || d.stage === 'proposal' || d.stage === 'negotiation');

    const activeCustomers = db.customers.filter((c) => c.status === 'active').length;
    const leadsByStatus = { new: 0, contacted: 0, qualified: 0, unqualified: 0, lost: 0 };
    for (const l of db.leads) {
      if (leadsByStatus[l.status] !== undefined) leadsByStatus[l.status] += 1;
    }
    const dealsByStage = { discovery: 0, proposal: 0, negotiation: 0, won: 0, lost: 0 };
    for (const d of db.deals) {
      if (dealsByStage[d.stage] !== undefined) dealsByStage[d.stage] += 1;
    }

    return {
      data: {
        totalCustomers: db.customers.length,
        activeCustomers,
        openDeals: openDeals.length,
        openValue: openDeals.reduce((sum, d) => sum + (Number(d.value) || 0), 0),
        leadsByStatus,
        dealsByStage,
      },
      sources: [OVERVIEW_SOURCE],
    };
  },
};
