# Security, Privacy & Threat Model — gRouter Copilot

## 1. Security objectives

1. Key gRouter tidak pernah ke browser.
2. Skill adalah satu-satunya pintu akses data.
3. Prompt injection tidak bisa memanggil skill/aksi di luar izin.
4. Data sensitif tidak bocor lewat context/log/error.
5. Developer mengontrol scope data per skill.

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
