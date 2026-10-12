// copilot.config.js — konfigurasi gRouter Copilot untuk demo mini-CRM.
// Dimuat oleh routes/copilot.js lewat createCopilot({ configPath }).
// Semua skill read-only; data hanya lewat lib/db.js (lihat skills/_db.js).
import crmOverview from './skills/crm-overview.js';
import findCustomer from './skills/find-customer.js';
import customerDetail from './skills/customer-detail.js';
import pipeline from './skills/pipeline.js';
import draftFollowup from './skills/draft-followup.js';
import leadUpdateProposal from './skills/lead-update-proposal.js';

const config = {
  // model: tanpa override — gateway memakai model default paket (server-side policy).
  // Override hanya bila model itu ada di allowlist paket lisensi Anda.
  model: undefined,
  systemPrompt:
    'Anda asisten CRM internal bernama Copilot. Jawab HANYA dari data yang diberikan. ' +
    'Jangan mengarang record. Jika data tidak cukup, katakan tidak ditemukan. ' +
    'Jika data skill mengandung proposal:true, ringkas dulu lalu TAMPILKAN pula blok kode ```proposal``` ' +
    'berisi JSON persis dari field proposal tersebut (leadId, newStatus, reason) agar tombol konfirmasi muncul.',
  skills: [
    crmOverview,
    findCustomer,
    customerDetail,
    pipeline,
    draftFollowup,
    leadUpdateProposal,
  ],
  limits: {
    maxRows: 200,
    maxContextBytes: 24000,
    maxTokens: 1200,
  },
};

export default config;
