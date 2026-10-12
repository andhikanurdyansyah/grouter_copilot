// Skill: draft-followup — customer yang "dingin" + DRAFT email (read-only, tidak mengirim).
// days: default 7. Aktivitas terakhir lebih tua dari N hari dihitung dari waktu sekarang.
import { loadDb } from './_db.js';

const MAX_DRAFTS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export default {
  name: 'draft-followup',
  description:
    'Follow-up draft: temukan customer active/prospect yang aktivitas terakhirnya lebih tua dari N hari (default 7), lalu susun maksimal 5 DRAFT email follow-up. Draft hanya usulan, perlu review manusia, tidak pernah dikirim otomatis.',
  parameters: {
    type: 'object',
    properties: {
      days: { type: 'integer', description: 'Ambang hari sejak aktivitas terakhir (default 7)' },
    },
  },
  readOnly: true,
  async run({ days } = {}) {
    const db = await loadDb();
    const n = Number.parseInt(days ?? 7, 10);
    const thresholdDays = Number.isFinite(n) && n >= 0 ? n : 7;
    const cutoff = Date.now() - thresholdDays * DAY_MS;

    const lastActivityByCustomer = new Map();
    for (const a of db.activities) {
      const prev = lastActivityByCustomer.get(a.customerId);
      const atMs = Date.parse(a.at ?? '');
      if (Number.isNaN(atMs)) continue;
      if (!prev || atMs > prev.atMs) lastActivityByCustomer.set(a.customerId, { ...a, atMs });
    }

    const candidates = db.customers.filter((c) => {
      if (c.status !== 'active' && c.status !== 'prospect') return false;
      const last = lastActivityByCustomer.get(c.id);
      if (!last) return true; // tidak pernah ada aktivitas tercatat -> paling dingin
      return last.atMs < cutoff;
    });

    const drafts = candidates.slice(0, MAX_DRAFTS).map((c) => {
      const last = lastActivityByCustomer.get(c.id) ?? null;
      const firstName = String(c.name ?? '').split(' ')[0] || 'Kak';
      const company = c.company ?? 'perusahaan Anda';
      const body =
        `Halo ${firstName},\n\n` +
        `Sudah ${thresholdDays} hari lebih sejak komunikasi terakhir kami${last ? ` (${last.type}: "${String(last.note ?? '').slice(0, 80)})"` : ''}. ` +
        `Saya ingin menanyakan kabar kebutuhan ${company} dan apakah ada yang bisa kami bantu tindak lanjuti.\n\n` +
        'Terima kasih,\nTim CRM';
      return {
        customerId: c.id,
        name: c.name,
        company: c.company,
        status: c.status,
        lastActivityAt: last?.at ?? null,
        daysSinceLastActivity: last ? Math.floor((Date.now() - last.atMs) / DAY_MS) : null,
        draftEmail: {
          to: c.email,
          subject: `Follow-up: ${company}`,
          body,
        },
        isDraft: true,
        needsHumanReview: true,
      };
    });

    return {
      data: {
        daysThreshold: thresholdDays,
        totalCandidates: candidates.length,
        truncated: candidates.length > MAX_DRAFTS,
        drafts,
        notice: 'Semua entri adalah DRAFT — perlu review manusia sebelum dikirim. Tidak ada email yang dikirim otomatis.',
      },
      sources: [
        { label: 'customers status active/prospect (lib/db.js)' },
        { label: 'activities terakhir per customer (lib/db.js)' },
      ],
    };
  },
};
