# Evidence — Clean-room Installer & Journey Verification (2026-10-13)

> **Status: SELESAI (bukan "dalam penerbangan").** Diselamatkan dari scratch worker
> (`/tmp/wc-b/evidence.md`, volatile) ke dalam repo agar bukti tidak hilang.
> Repo HEAD saat capture: `bbb7b40` (line-ref patch) — HEAD bergerak ke `2bf25a0`
> (docs-only) selama sesi; tidak ada baris kode yang berubah.
>
> Diselamatkan + diverifikasi ulang oleh supervisor 2026-10-13 (profil `copilot-grouter`).

**Tarball:** `grouter-copilot-0.1.0.tgz` (`@grouter/copilot@0.1.0`, 17 file, di-pack dari HEAD, 43.919 byte).
**Token:** semua di-redact; file token asli (mode 600) ada di scratch, **tidak** disimpan di repo.

---

## B1 — npm pack + instalasi fresh

| Langkah | Hasil |
|---|---|
| `npm pack` dari HEAD | OK, 17 file, 43.919 byte |
| `esm/`: `npm init -y` + `type=module` + install tarball | OK, 0 vulnerability |
| `cjs/`: `npm init -y` (CommonJS default) + install tarball | OK, 0 vulnerability |
| Isolated license server port 4693 (`createCopilotServer({allowUnauthenticatedAdmin:true})`) | boot; `/api/health` → `{"status":"ok"}` |
| `POST /api/admin/licenses` → mint token | 201, `lic_mv65x5ez_1`, token 315 char |
| `npx grouter-copilot install --license <tok> --license-server http://127.0.0.1:4693` di **cjs** | EXIT 0, membuat `copilot.config.js`, `skills/example.js`, `src/copilot-route.js`, `src/copilot-health.js`, `.env` (4 kunci) |
| Perintah sama di **esm** | output identik, EXIT 0 |

## C — Journey clean-room (ESM project)

### Leg gateway produksi (AI_DISABLED = sesuai kebijakan paket)
- Akun QA dibuat di produksi; signup 200, `/api/me` → `acc_mv66ctbv_56y9`.
- Beli: `POST /api/orders {packageKey:"quota-3b-90d"}` → 201 `ord_mv66g0pg_h43c`; di-settle lewat
  simulator sandbox publik resmi → PAID, license `lic_mv66hcgm_1`; token dipulihkan via
  `GET /api/orders/latest` (327 char) — sekaligus menguji endpoint pemulihan WS-A.
- Chat gateway prod dengan lisensi prod → **HTTP 403 `AI_DISABLED`**
  (`"AI access is not enabled for this package."`). Bukti penegakan kuota/kebijakan bekerja end-to-end.
- Ledger prod: 0 sebelum → 1 sesudah (baris `rejected`, `errorClassification:"ai_disabled"`).

### Leg gateway terisolasi (jalur AI nyata, tanpa stub)
- Lisensi terisolasi `lic_mv68b3so_2` (plan `quota-3b-90d` dengan kebijakan AI aktif hanya di store terisolasi).
- Instalasi ESM fresh → host `host.mjs` di :4695, `node:http` polos.
- `GET /api/copilot/health` → **200 `{"status":"ok","checks":{"license":true,"skills":true,"provider":true}}`**.
- Chat journey (`POST /api/copilot/chat` `{"message":"Halo, apa itu gRouter Copilot?"}`):
  **HTTP 200, `status:"ok"`, usage `{inputTokens:135, outputTokens:101}`** — jawaban model nyata:
  `"Maaf, data yang tersedia tidak cukup untuk menjawab pertanyaan tersebut."`
  (perilaku general-mode jujur: tidak ada data host, menolak mengarang fakta).
  Satu `TIMEOUT` upstream transien (retryable) pada panggilan ke-2, selesai saat retry — tidak dikenai biaya.
- Ledger delta di store terisolasi: 0 → 4 baris; 3 × `ok` (236 token) + 1 × `error` (`TIMEOUT`, 0 token).

## Defect yang terbukti (output persis)

### D2 — scaffold tidak pernah memuat `.env`
`node host-noenv.mjs` (host tanpa `process.loadEnvFile`) di :4696 →
`GET /api/copilot/health` → **503** `{"status":"unavailable","checks":{"license":false,"skills":true,"provider":false}}`.
Dengan `node --env-file=.env host-noenv.mjs` → **200 ok**. CLI hanya mencetak
`"Restart your app so the new .env values are loaded."` (bin baris 254) tanpa menjelaskan CARA-nya.
Chat tanpa env (probe in-process): `CopilotError INVALID_REQUEST "gatewayUrl is required."`.

### D3 — host CommonJS tidak bisa memuat scaffold
`require('./src/copilot-route.js')` di proyek CommonJS →
```
HOST BOOT FAILURE: SyntaxError Cannot use import statement outside a module
/tmp/wc-b/cjs/src/copilot-route.js:2
import { createCopilot, gatewayChat } from "@grouter/copilot";
```
Scaffold menulis sintaks ESM ke package `"type":"commonjs"`, tetapi `install` keluar 0 dan mengklaim sukses.

### D4 — handler "Node.js (vanilla)" memakai API Express
`host-raw.mjs` memasang `copilotHealthHandler` pada `http.ServerResponse` polos →
```
TypeError: res.status is not a function
    at copilotHealthHandler (src/copilot-health.js:13:16)
curl → status=000 (connection reset)
```
`detectFramework()` mengklasifikasikan semua app non-next/non-express sebagai `node (vanilla)`
tetapi mengeluarkan handler berbentuk Express.

### D5 — gateway tak terjangkau = proses host CRASH (bug baru)
`GROUTER_GATEWAY_URL=http://127.0.0.1:1/...` → **proses host crash**: unhandled
`CopilotError UPSTREAM_UNAVAILABLE` — port tidak lagi listening. `gatewayChat` melempar,
bukan mengembalikan envelope 502; scaffold vanilla tidak punya try/catch.
Catatan: health tetap melaporkan `provider:true` (hanya mengecek keberadaan URL) walau gateway tak terjangkau.

### Defect gateway-URL saat install (sudah terdokumentasi)
Instalasi terisolasi menulis `GROUTER_GATEWAY_URL=https://copilot.grouter.id/api/copilot/chat`
(`/api/resolve` jatuh ke `branding.publicOrigin` produksi bila `publicOrigin` instance terisolasi
belum di-set). Bukan defect baru — kebutuhan konfigurasi per-deployment.

---

## Patch D2–D5 — STATUS (diperbarui 2026-10-13)

> **SUDAH di-apply.** Patch D2/D3/D4/D5 diterapkan ke `bin/grouter-copilot.js`
> (lihat `docs/25-pending-implementations.md` §"Patch D2/D3/D4/D5"), dengan regression
> `test/scaffold-host-compat.test.js` (6/6 hijau: varian CJS + ESM). Bagian "Patch usulan"
> di bawah adalah snapshot saat temuan (line-ref), disimpan sebagai jejak historis.

Line-ref diverifikasi ulang terhadap `bin/grouter-copilot.js`:

- **D3** — `runInit`, baris **292**: `writeIfMissing('copilot.config.js', CONFIG_TEMPLATE)` →
  pilih ekstensi per `type` `package.json` (`.mjs` untuk `module`, `.cjs` untuk `commonjs`, dst.)
- **D4** — komentar baris **224** (`HEALTH_NODE_TEMPLATE`) + shim `res.status/json` bila absen;
  `printNextSteps` (baris ~267) sebutkan "handler jalan di plain `node:http`, tanpa Express".
- **D5** — scaffold route (baris 176–181): bungkus `gatewayChat` dengan try/catch → envelope 502, bukan lempar.
- **D2** — cetak peringatan eksplisit di output installer ATAU scaffold loader env.

## Housekeeping
Satu akun QA produksi dibuat; satu order sandbox PAID + satu lisensi (`lic_mv66hcgm_1`).
Sesuai konvensi: **revoke** (bukan purge) bila diminta bersih.