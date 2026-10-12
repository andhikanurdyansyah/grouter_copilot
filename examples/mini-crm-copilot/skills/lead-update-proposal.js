// Skill: lead-update-proposal — PROPOSAL perubahan status lead (read-only, TANPA mutasi).
// Skill ini TIDAK menulis apa pun. Ia hanya memvalidasi dan mengembalikan objek proposal;
// eksekusi aktual (POST /api/leads/:id/status) dilakukan manusia via tombol konfirmasi
// di panel demo (use case 6 CONTRACT — tidak ada auto-eksekusi).
import { loadDb } from './_db.js';

export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'unqualified', 'lost'];

export default {
  name: 'lead-update-proposal',
  description:
    'Lead update proposal: ajukan PROPOSAL perubahan status lead (leadId + newStatus wajib). Tidak melakukan perubahan apa pun; mengembalikan proposal untuk dikonfirmasi manusia lewat tombol di panel.',
  parameters: {
    type: 'object',
    properties: {
      leadId: { type: 'string', description: 'ID lead, mis. lead_001 (wajib)' },
      newStatus: {
        type: 'string',
        enum: LEAD_STATUSES,
        description: 'Status baru: new|contacted|qualified|unqualified|lost (wajib)',
      },
    },
    required: ['leadId', 'newStatus'],
  },
  readOnly: true,
  async run({ leadId, newStatus }) {
    const db = await loadDb();
    const id = String(leadId ?? '').trim();
    const status = String(newStatus ?? '').trim();

    const lead = db.leads.find((l) => l.id === id);
    if (!lead) {
      return {
        data: { proposal: false, error: `Lead dengan id "${id}" tidak ditemukan.`, leadId: id },
        sources: [{ label: 'leads (lib/db.js)' }],
      };
    }
    if (!LEAD_STATUSES.includes(status)) {
      return {
        data: {
          proposal: false,
          error: `newStatus "${status}" tidak valid. Harus salah satu dari: ${LEAD_STATUSES.join('|')}.`,
          leadId: id,
        },
        sources: [{ label: 'leads (lib/db.js)' }],
      };
    }
    if (lead.status === status) {
      return {
        data: {
          proposal: false,
          info: `Status lead ${id} sudah "${status}" — tidak ada perubahan yang perlu diusulkan.`,
          leadId: id,
          currentStatus: lead.status,
        },
        sources: [{ label: `leads/${id} (lib/db.js)` }],
      };
    }

    return {
      data: {
        proposal: true,
        leadId: lead.id,
        leadName: lead.name,
        leadCompany: lead.company,
        currentStatus: lead.status,
        newStatus: status,
        reason: `Copilot mengusulkan mengubah status lead ${lead.id} (${lead.name} - ${lead.company}) dari "${lead.status}" menjadi "${status}". Tidak ada mutasi yang dilakukan skill ini; perubahan diterapkan hanya setelah konfirmasi manusia via tombol "Terapkan perubahan" di panel demo.`,
        requiresConfirmation: true,
      },
      sources: [{ label: `leads/${lead.id} (lib/db.js)` }],
    };
  },
};
