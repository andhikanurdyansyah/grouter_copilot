# gRouter Copilot

> Drop-in AI copilot untuk aplikasi yang sudah ada. Install lewat satu command, expose data lewat skills, chatbot-nya menjawab pakai AI gRouter.

**gRouter Copilot adalah plugin/module berlisensi (bukan open-source).** Dia di-install ke dalam aplikasi customer (CRM, POS, HRIS, dan seterusnya), menambahkan chatbot + skills yang membaca data aplikasi itu sendiri, dan AI-nya berjalan di atas **API key gRouter**. Runtime menolak jalan tanpa license valid, dan hanya menerima API key gRouter.

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

## Lisensi (lock)

Customer flow:

```text
Landing (copilot.grouter.id) → Register → Dashboard → Purchase license (quota) → LICENSE KEY → install
```

```text
npx @grouter/copilot install
  --license <license-key>   ← satu-satunya credential customer (BUKAN api key)
```

- License = Ed25519-signed token, diverifikasi offline (public key di plugin, private key di license server).
- Tanpa license valid, runtime menolak (`SCOPE_DENIED`).
- **Api key gRouter di-resolve server-side dari license** (key handoff), tidak pernah di-embed di token, tidak pernah diketik manual oleh customer.
- Terkunci ke gRouter: hanya menerima base-url + API key gRouter.
- Backend Copilot (license server + admin dashboard) terpisah dari gRouter; gRouter (port 20128) TIDAK disentuh.
- **Auto-provisioning api key DEFERRED** — admin map license → api key manual sampai flow jelas.

Lihat `docs/22-customer-flow.md`, `docs/21-licensing-distribution.md`, dan `docs/15-decision-log.md`.

## Copilot backend (license server + admin dashboard)

Terpisah dari gRouter (port 20128 TIDAK disentuh). Jalankan:

```bash
cd server
node src/index.js          # http://localhost:4600  (admin dashboard)
```

```text
GET  /api/admin/stats           → total license, active, install
GET  /api/admin/licenses        → daftar license (tanpa raw token)
POST /api/admin/licenses        → issue license (kembalikan token SEKALI)
POST /api/admin/licenses/:id/revoke
POST /api/heartbeat       → plugin phone-home (counting + revoke)
```

Lihat `server/README.md` untuk detail.

## Quickstart (Node.js / Next.js)

```bash
# 1. install
npm install @grouter/copilot

# 2. scaffold
npx grouter-copilot init

# 3. isi key gRouter (server-only)
#    edit .env → GROUTER_API_KEY=sk-...

# 4. mount widget di UI Anda
#    import { CopilotChat } from "@grouter/copilot/widget";
#    <CopilotChat userId={user.id} />

# 5. definisikan skill (baca data app)
#    edit skills/example.js → expose data lewat run()
```

### API (non-React / headless)

```js
import { createCopilot } from '@grouter/copilot';

const { runtime } = await createCopilot({ configPath: './copilot.config.js' });
const result = await runtime.chat({ message: 'ringkas sales', userId: 'u42', args: { period: '7d' } });
console.log(result.answer);
```

## Pengembangan (repo ini)

```bash
npm test          # node --test, tanpa dependency install
```

Struktur:

```text
src/index.js            → public API (createCopilot)
src/config.js           → config loader
src/skills/             → registry + validator
src/runtime/            → chat orchestrator + context builder
src/adapter/grouter.js  → gRouter adapter + FakeSupplier (test)
src/widget/CopilotChat.jsx → React widget
bin/grouter-copilot.js  → CLI init
examples/crm/           → sample skill
```
