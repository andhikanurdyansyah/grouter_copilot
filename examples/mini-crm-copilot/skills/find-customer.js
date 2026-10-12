// Skill: find-customer — pencarian customer (read-only, maksimal 8 match).
// Mencari di name, company, dan note aktivitas (case-insensitive).
import { loadDb } from './_db.js';

const MAX_MATCHES = 8;

export default {
  name: 'find-customer',
  description:
    'Find customer: cari dan temukan customer berdasarkan kata kunci pada nama, perusahaan, atau catatan aktivitas. Return maksimal 8 match dengan customerId, nama, company, dan alasan (reason) kecocokan.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Kata kunci pencarian (wajib)' },
    },
    required: ['query'],
  },
  readOnly: true,
  async run({ query }) {
    const db = await loadDb();
    const q = String(query ?? '').trim().toLowerCase();

    const customersById = new Map(db.customers.map((c) => [c.id, c]));
    const matches = new Map(); // customerId -> match

    const pushMatch = (customer, reason) => {
      if (!customer || matches.has(customer.id)) return;
      matches.set(customer.id, {
        customerId: customer.id,
        name: customer.name,
        company: customer.company,
        reason,
      });
    };

    // 1) Kecocokan langsung pada name/company (case-insensitive).
    for (const c of db.customers) {
      if (String(c.name ?? '').toLowerCase().includes(q) || String(c.company ?? '').toLowerCase().includes(q)) {
        pushMatch(c, 'nama/perusahaan mengandung kata kunci');
      }
    }

    // 2) Kecocokan lewat note aktivitas customer.
    // Natural-language: pecah query jadi token (>=4 huruf) dan terima jika SEMUA token ada di note
    // ATAU substring penuh gagal tapi mayoritas token cocok (>= setengah, min 1). Tanpa ini kata
    // filler ("keluhan", "dengan") membuat pencarian kalimat natural selalu 0 hasil.
    // Stopword umum (ID/EN) tidak dihitung — tanpa ini kata sambung membuat query kalimat
    // natural ("customer dengan keluhan keterlambatan pengiriman") gagal semua threshold.
    const STOP = new Set(['yang', 'dengan', 'untuk', 'pada', 'adalah', 'para', 'semua', 'banyak', 'ada', 'dari', 'kecil', 'besar',
      'cari', 'coba', 'tolong', 'please', 'find', 'customer', 'customers', 'data', 'list', 'daftar', 'yang', 'mengalami', 'keluhan']);
    const tokens = [...new Set(q.split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOP.has(t)))];
    const noteHit = (note) => {
      if (!tokens.length) return 0;
      const hit = tokens.filter((t) => note.includes(t)).length;
      // Lulus bila semua token inti ada, ATAU >= 2 token inti cocok (note singkat sering hanya memuat frasa inti).
      return hit === tokens.length || hit >= Math.min(2, tokens.length) ? hit : 0;
    };
    if (matches.size < MAX_MATCHES) {
      for (const a of db.activities) {
        if (matches.size >= MAX_MATCHES) break;
        const note = String(a.note ?? '').toLowerCase();
        if (note.includes(q) || noteHit(note)) {
          pushMatch(customersById.get(a.customerId), `aktivitas: "${String(a.note ?? '').slice(0, 120)}"`);
        }
      }
    }

    return {
      data: {
        query,
        totalMatches: matches.size,
        truncated: matches.size > MAX_MATCHES,
        matches: [...matches.values()].slice(0, MAX_MATCHES),
      },
      sources: [
        { label: 'customers.name/company (lib/db.js)' },
        { label: 'activities.note (lib/db.js)' },
      ],
    };
  },
};
