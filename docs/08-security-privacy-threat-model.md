# Security, Privacy & Threat Model — gRouter Copilot

> **D-021 (2026-10-08):** kredensial gRouter kini = **SATU service credential yang hanya hidup
> di Copilot backend**. Ia tidak pernah ada di host app customer, installer, browser, license
> token, respons API, log, diagnostik, error message, atau UI. Bagian di bawah yang masih
> menyebut "key di server env [host app]" merujuk pola lama; batas target dijelaskan di §1a.

## 1. Security objectives

1. Key gRouter tidak pernah ke browser.
2. Skill adalah satu-satunya pintu akses data.
3. Prompt injection tidak bisa memanggil skill/aksi di luar izin.
4. Data sensitif tidak bocor lewat context/log/error.
5. Developer mengontrol scope data per skill.

## 1a. Credential boundary (D-021 — kanonik)

`GROUTER_API_KEY` (satu service credential) BOLEH hanya ada di:

- `server/.env` Copilot backend (gitignored) untuk local dev;
- env/secret store server staging & production (pm2 env / secret manager).

TIDAK BOLEH: dikirim ke browser, ada di frontend JS/bundle, ter-embed installer, disimpan
`.env` aplikasi customer, dikembalikan respons API (`/api/resolve` legacy TIDAK lagi
mengembalikan provider key di arsitektur target), disimpan license token, di-commit, di-log,
dicetak diagnostik, muncul di error, atau tampil di UI admin/customer.

Verifikasi yang sudah ada: `/api/me` & `/api/admin/licenses` meng-sanitize license (tanpa
token raw/grouterApiKey), admin settings menyamarkan secret, adapter fail-closed tanpa key,
error upstream di-redact (`src/adapter/errors.js`). Celah implementasi terbuka dicatat di
audit GAP (usage ledger backend belum ada; enforcement quota backend belum ada).

## 2. Threats & controls

| Threat | Control |
|---|---|
| Key gRouter bocor ke client | key hanya di server env; adapter server-only; test bundle scan |
| Prompt injection dari data aplikasi | data = untrusted content; policy/prompt terpisah; skill allowlist |
| Skill dipanggil di luar izin | registry allowlist; hanya skill terdaftar yang run |
| Data berlebih masuk context | limit row/byte/token; field filtering di `run()` |
| Error bocorkan secret | redaction; error taxonomy aman |
| Skill mutasi tanpa izin | v1 read-only; mutasi = gate + confirmation + audit |
| SSRF / akses DB liar | tidak ada auto-URL/SQL; akses data hanya di `run()` |
| Replay request | session id + request id; (mutasi: idempotency) |

## 3. Data classification (untuk developer)

- **Restricted:** credential, token, key, password, PII sensitif → JANGAN di-return `run()`.
- **Confidential:** business record → boleh, tapi scoped per user.
- **Public/internal:** bebas.

Plugin menyediakan panduan + lint helper agar developer tidak mengekspos restricted field.

## 4. Authorization model

v1 sederhana:

1. `userId` dari request (developer resolve di runtime);
2. skill menerima `user`, developer scope data di `run()`;
3. tidak ada RBAC global — scope adalah tanggung jawab developer + plugin enforce read-only.

Ke depan (gated): role/attribute map, signed identity.

## 5. Privacy

- Copilot stateless; tidak menyimpan data customer central.
- Session history (bila ada) lokal ke app, sesuai policy app.
- Tidak ada telemetry yang mengirim data aplikasi ke Copilot (v1 self-contained).
- Developer bertanggung jawab atas PII masking di `run()`.

## 6. Security acceptance tests

- bundle browser TIDAK mengandung `GROUTER_API_KEY` atau nilainya;
- prompt injection tidak memanggil skill tak terdaftar / tak terotorisasi;
- skill read-only tidak mengubah data;
- error tidak mengekspos key/stack/provider;
- data restricted tidak masuk context;
- request tanpa userId ditolak (bila skill butuh user scope).
