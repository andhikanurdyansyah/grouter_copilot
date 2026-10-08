# gRouter × Copilot — Architecture Audit (D-021)

> Tanggal: 2026-10-08 · Auditor: Copilot Agent · Basis bukti: kode + docs di commit
> setelah `b1a8d79`. Audit ini MENGUNCI arsitektur kredensial sebelum real
> `GROUTER_API_KEY` diperkenalkan. Keputusan kanonik: **D-021** di
> `docs/15-decision-log.md`; arsitektur target: `docs/04-solution-architecture.md`.

## 1. Current Architecture (apa yang ADA di repo hari ini)

- **Plugin in-process** (`src/`): runtime chat (`src/runtime/chat.js`) → `GrouterAdapter`
  (`src/adapter/grouter.js`) memanggil **gRouter langsung dari host app customer** memakai
  `GROUTER_API_KEY` dari env host app. License gate offline Ed25519 (`src/license/gate.js`).
- **Copilot backend** (`server/`): Better Auth, order + KlikQRIS webhook (A1-safe), license
  mint/revoke, admin API, `UsageResolver` (read-only `/check-usage` per api key ter-bound),
  `/api/resolve` key-handoff (mengembalikan provider key ke installer — pola lama).
- **Installer** (`bin/grouter-copilot.js`): menukar license di `/api/resolve`, menulis
  `GROUTER_API_KEY=<resolved>` ke `.env` host app customer.
- **Docs**: mencampur dua model — sebagian sudah benar (docs/08, 22, 29, 21), sebagian masih
  pra-D-014 ("developer isi GROUTER_API_KEY", charter/BRD/prd/master-plan) — **semua sudah
  diperbaiki di audit ini**.

## 2. Target Architecture (D-021)

```text
CUSTOMER → COPILOT (host app runtime, tanpa kredensial)
              → Copilot backend (license + quota + usage ledger + SATU GROUTER_API_KEY)
                  → gRouter → OpenAI/Anthropic/Gemini/…
```

Satu service credential server-side; bukan key per customer; identitas customer internal
Copilot; Copilot quota ≠ gRouter infra usage; payment tanpa provisioning gRouter. Lengkap di
`docs/04-solution-architecture.md` (§2–§10).

## 3. Gaps

| ID | Problem | File | Current | Desired | Severity | Jenis |
|---|---|---|---|---|---|---|
| GAP-001 | Chat path memanggil gRouter dari host app dengan kredensial provider | `src/index.js` (`createCopilot` → `GrouterAdapter`), `src/adapter/grouter.js` | adapter + key hidup di host app | pemanggilan gRouter terpusat di Copilot backend; host app memanggil backend dengan license token | HIGH | implementation-required |
| GAP-002 | Tidak ada usage ledger Copilot (pemakaian per license tidak terekam; `requestId` hanya di respons) | `server/src/store.js`, `src/runtime/chat.js` | usage hilang setelah respons | ledger per license: requestId, licenseId, model, tokens, status, timestamp | HIGH | implementation-required |
| GAP-003 | Tidak ada enforcement quota Copilot (gate hanya validasi signature/revocation; `plan.quota` = teks deskriptif) | `src/license/gate.js`, `src/runtime/chat.js`, `server/src/settings.js` | tidak ada limit numerik | quota check sebelum panggil provider; unit jelas (token-based disarankan; request-based = simplifikasi MVP) | HIGH | implementation-required |
| GAP-004 | `/api/resolve` masih mengembalikan provider key; installer menulisnya ke `.env` customer | `server/src/server.js` (route resolve), `bin/grouter-copilot.js` (baris `GROUTER_API_KEY=`) | key keluar dari backend | resolve hanya `baseUrl` + `licensePublicKey`; hapus penulisan key di installer | HIGH (security-arch) | implementation-required |
| GAP-005 | Field legacy per-license `grouterApiKey` + admin bind/issue + form admin | `server/src/licenseService.js`, `server/src/server.js`, `server/public/dashboard.html` | masih aktif (transisi) | deprecate bertahap; key tidak pernah dikembalikan ke browser (sanitize sudah benar) | MEDIUM | doc-updated; keputusan removal menyusul |
| GAP-006 | `/api/admin/usage` menyajikan `/check-usage` seolah usage customer | `server/src/usageResolver.js`, `server/src/server.js` | label per license | label eksplisit "infra usage per service credential (semua customer)" | MEDIUM | implementation-required (semantik/label) |
| GAP-007 | Unit quota belum ditetapkan (request vs token vs credit); biaya provider sebanding token | `server/src/settings.js` (plans) | teks bebas | tetapkan unit + migration path (token/credit) saat membangun GAP-002/003 | MEDIUM | doc-updated; implementation menyusul |
| GAP-008 | `.env.example` stale (be.grouter.id) + `GROUTER_API_KEY`/`GROUTER_BASE_URL` tidak terdokumentasi | `server/.env.example` | — | — | LOW | **FIXED di audit ini** |
| GAP-009 | Kontradiksi pra-D-014 di charter/BRD/PRD/master-plan/UX ("key di .env customer") | docs/00, 01, 02, 03, 10 | — | — | MEDIUM | **FIXED di audit ini** |
| GAP-010 | docs kanonik belum membedakan dua dimensi usage & arsitektur service-credential | docs/04, 15, 21, 23, 25, 29, 16, 08 | — | — | MEDIUM | **FIXED di audit ini (D-021 tersebar di 11 doc)** |

## 4. Documentation Changes (audit ini)

| File | Perubahan |
|---|---|
| `docs/04-solution-architecture.md` | Dirombak total: product boundary, credential model D-021, identity model, entitlement, dua dimensi usage, payment lifecycle, AI request lifecycle, security boundary, future evolution |
| `docs/15-decision-log.md` | **D-021 ditambahkan** (satu service credential; per-customer key ditolak; Option A disuperse-kan); catatan supersede pada D-017, Option A, Usage/quota; diagram license model diperbarui |
| `docs/21-licensing-distribution.md` | Option A diberi label SUPERSEDED; install flow target; usage dua dimensi; auto-provisioning REJECTED |
| `docs/23-grouter-api-contract.md` | Catatan D-021; `/check-usage` = infra dimension; mapping licenseId→key = legacy |
| `docs/29-backend-api-contract.md` | `/api/resolve` berlabel LEGACY + target; `/api/admin/usage` semantik infra; `GROUTER_API_KEY` bukan store setting |
| `docs/08-security-privacy-threat-model.md` | §1a Credential boundary (D-021) kanonik |
| `docs/16-glossary.md` | Istilah baru: service credential, Copilot quota, infra usage, usage ledger; koreksi self-contained |
| `docs/25-pending-implementations.md` | P-002 auto-provisioning REJECTED for MVP (D-021); P-005 model tanpa bound key |
| `docs/00-product-charter.md` | "API key di .env customer" → Copilot backend memegang satu service credential |
| `docs/01-brd.md` | BR-05 ditulis ulang (D-021) |
| `docs/02-prd.md` · `docs/03-master-plan.md` · `docs/10-ux-and-design-principles.md` | Journey install tidak lagi menghasilkan/meminta `GROUTER_API_KEY` di app customer |
| `server/.env.example` | `GROUTER_API_KEY` + `GROUTER_BASE_URL` terdokumentasi (tanpa nilai real); sisa `be.grouter.id` dibersihkan |
| `examples/crm/README.md` | "set GROUTER_API_KEY" dihapus |

## 5. Decisions Locked (kanonik sekarang)

1. **Satu service credential gRouter untuk Copilot** — di Copilot backend, server-side saja.
2. **Bukan per-customer gRouter API key untuk MVP** (ditolak; D-016 tetap deferred).
3. **Tidak ada eksposur kredensial gRouter ke customer** (browser/installer/.env app customer/
   respons API/license token/Git/log/diagnostik/error/UI).
4. **Copilot memiliki** customer/license/plan/quota/entitlement/usage.
5. **gRouter memiliki** routing/provider/fallback dan usage infrastructure.
6. **Payment tidak memerlukan provisioning gRouter** untuk MVP.
7. **Kredensial provider-specific tetap di balik gRouter** — Copilot tidak mengenal OpenAI/
   Anthropic/Gemini key.
8. **"Unlimited" infrastructure ≠ customer unlimited** — limit customer = Copilot quota.

## 6. Open Questions (hanya yang tidak bisa dijawab dari repo/kontrak)

1. **Unit quota final** (token vs request vs credit): keputusan produk saat membangun
   GAP-002/003 — repo tidak mengunci; disarankan token-based.
2. **Fitur metadata gRouter**: kontrak chat completions saat ini tidak punya field metadata
   customer → identity tetap internal. Jika gRouter kelak menambah header metadata opsional,
   dokumentasikan sebagai capability terpisah (bukan kebutuhan MVP).

## 7. Recommended Next Implementation Step (sebelum real key di-inject)

Bangun **AI gateway di Copilot backend** (GAP-001/002/003/004) dalam urutan ini:

1. `POST /api/copilot/chat` di Copilot backend: validasi license ONLINE (signature +
   revocation) → quota check → panggil gRouter dengan service credential → tulis usage ledger
   → respons canonical envelope.
2. Hentikan pengiriman provider key oleh `/api/resolve` + hapus penulisan `GROUTER_API_KEY`
   di installer; arahkan runtime host app ke endpoint backend.
3. Usage ledger + quota enforcement (token-based) + admin view berlabel infra-vs-customer.
4. Test: unit quota/ledger, redaction, key-isolation (env→backend only), E2E FakeSupplier
   via backend, regression penuh (`npm test` NODE_ENV=test).

Setelah itu barulah `GROUTER_API_KEY` real di-inject (env produksi backend) dan diverifikasi
dengan real request terkecil.

## 8. Jawaban Pertanyaan Audit (berbasis bukti repo)

1. **Di mana `GROUTER_API_KEY` hidup?** Local: `server/.env` (gitignored). Staging/production:
   env/secret store server backend (pm2 env / secret manager). CI/CD: tidak dibutuhkan
   (test memakai FakeSupplier + dummy key).
2. **Komponen yang memanggil gRouter?** Saat ini: `GrouterAdapter`
   (`src/adapter/grouter.js`) — ter-instantiasi di host app (`src/index.js`). Target:
   hanya Copilot backend. `/check-usage` dipanggil `server/src/usageResolver.js`.
3. **Browser bisa akses kredensial?** Tidak ada jalur langsung (scan frontend bersih;
   `sanitizeLicense` membuang `grouterApiKey`). Pengecualian legacy: form bind admin
   (operator mengetik key di browser admin — transisi GAP-005).
4. **Quota di-enforce di mana?** Belum ada (GAP-003). Gate hanya validasi lisensi.
5. **Usage dicatat di mana?** Belum ada persistensi (GAP-002); usage hanya di respons chat.
6. **Unit quota saat ini?** Tidak terdefinisi — `plan.quota` teks deskriptif (GAP-007).
7. **Skema license cukup?** Identitas cukup (account/license/install); angka quota numerik +
   usage tracking belum ada (GAP-002/003).
8. **gRouter perlu customer_id?** Tidak — kontrak tidak mendukung; identitas internal Copilot.
9. **gRouter perlu license_id?** Tidak — tidak ada field metadata; opsional hanya jika gRouter
   kelak mendukung (open question #2).
10. **Rekonsiliasi usage provider?** Belum bisa per customer — `/check-usage` hanya total per
    credential; gap dicatat (GAP-002), bukan diarikan solusinya.

## 9. Verification

- Sweep kontradiksi: sisa klaim per-customer-key hanya berlabel legacy/D-021.
- `npm test` root **133/133** + server **70/70** (NODE_ENV=test) — lulus setelah perubahan doc.
- Tidak ada real key diminta, dicetak, atau dikonsumsi; `.env` tidak disentuh.
