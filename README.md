# gRouter Copilot

> Drop-in AI copilot untuk aplikasi yang sudah ada. Install lewat satu command, expose data lewat skills, chatbot-nya menjawab pakai AI gRouter.

**gRouter Copilot adalah plugin/module — bukan platform SaaS.** Dia di-install ke dalam aplikasi customer (CRM, POS, HRIS, dan seterusnya), menambahkan chatbot + skills yang membaca data aplikasi itu sendiri, dan AI-nya berjalan di atas **API key gRouter**.

## Cara kerja dalam satu kalimat

```text
npx @grouter/copilot init
  → detect framework & bahasa
  → generate config + .env + skills + API route + widget
  → chatbot muncul di aplikasi
  → chatbot baca data lewat skills
  → AI consume API key gRouter
```

## Dua sisi plugin

Setiap install menghasilkan dua bagian yang bekerja bersama:

| Sisi | Lokasi | Tugas | Pegang key? |
|---|---|---|---|
| **Runtime** | server-side (API route) | jalankan skills, proxy request ke gRouter | ✅ ya |
| **Chat UI** | client-side (widget) | render chatbot, kirim pesan ke runtime app sendiri | ❌ tidak |

API key gRouter **hanya di server**, tidak pernah dikirim ke browser.

## Skills (developer-defined)

Developer mengekspos data aplikasinya lewat fungsi skill:

```js
// skills/sales.js
export default {
  name: "sales-summary",
  description: "Ringkas penjualan dalam periode tertentu",
  parameters: { type: "object", properties: {
    period: { type: "string", enum: ["7d", "30d"] }
  }, required: ["period"] },
  readOnly: true,
  async run({ period, user }) {
    return summarizeOrders(period, user.id); // baca DB/service sendiri
  }
};
```

Chatbot memanggil skill ini saat user bertanya "ringkas order bulan ini".

## Alur chat

```text
User bertanya (widget)
  → POST ke /api/copilot/chat (runtime app sendiri)
  → runtime resolve skill + jalankan (dapat data app)
  → runtime bangun context (data + prompt)
  → runtime panggil gRouter API (pakai key)
  → stream jawaban balik ke widget
```

## Konfigurasi (self-contained)

Semua disimpan di aplikasi customer, tanpa backend Copilot:

```text
copilot.config.js      → skill, model, prompt, limits
.env                   → GROUTER_API_KEY
skills/                → skill functions
```

## Dokumen

| Dokumen | Isi |
|---|---|
| `docs/00-product-charter.md` | Thesis produk plugin |
| `docs/02-prd.md` | Requirements & acceptance |
| `docs/03-master-plan.md` | Rencana bertahap |
| `docs/04-solution-architecture.md` | Arsitektur runtime + UI + skill engine |
| `docs/07-plugin-connector-skill-spec.md` | **Spesifikasi skill (inti plugin)** |
| `docs/06-api-and-protocol.md` | Kontrak UI↔runtime dan runtime↔gRouter |
| `docs/08-security-privacy-threat-model.md` | Keamanan key, prompt injection, scope |
| `docs/15-decision-log.md` | Keputusan terkunci |
| `docs/18-mvp-backlog.md` | Backlog v0.1 |

## Prinsip non-negotiable

1. Self-contained: key gRouter di `.env` customer, bukan backend Copilot.
2. Read-only default: skill baca data dulu, mutasi belakangan.
3. Developer-defined: scope data eksplisit, bukan auto-baca seluruh DB.
4. Key gRouter tidak pernah sampai ke browser.
5. Aplikasi customer tetap source of truth — Copilot tidak menyimpan data central.
6. gRouter adalah supplier AI, dipanggil lewat adapter yang stabil.
