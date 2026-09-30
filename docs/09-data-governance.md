# Data Governance — gRouter Copilot

## 1. Source-of-truth rule

Aplikasi customer adalah source of truth. gRouter Copilot **stateless** terhadap data aplikasi: tidak menyimpan, meng-cache central, atau meng-index data customer.

## 2. Where data lives

| Data | Lokasi | Ket. |
|---|---|---|
| Key gRouter | `.env` customer | server-only |
| Config | `copilot.config.js` customer | di repo app |
| Skills | `skills/` customer | di repo app |
| Data aplikasi | DB/service customer | tidak disentuh Copilot |
| Session history | (optional) lokal app | bila diaktifkan developer |
| Usage log | (optional) lokal app | bila diaktifkan |

## 3. Data in flight

Saat chat, data mengalir:

```text
DB app → skill.run() → context → gRouter API → jawaban → widget
```

Data hanya lewat di memori/proses; tidak di-persist oleh Copilot.

## 4. Minimization

- `run()` harus return hanya field yang diperlukan.
- Plugin enforce limit row/byte/token pada context.
- Sediakan lint helper untuk deteksi restricted field.

## 5. Retention & deletion

- Tidak ada retention Copilot (stateless).
- Session/usage (bila ada) mengikuti policy aplikasi customer, bukan Copilot.
- Menghapus plugin = menghapus seluruh artefak (config, skills, route, widget).

## 6. Freshness

Bila skill return timestamp/freshness, ditampilkan sebagai source metadata. Jawaban tidak boleh mengklaim "real-time" tanpa bukti timestamp dari skill.

## 7. Residency

Self-contained → data tidak keluar dari infrastruktur customer kecuali ke gRouter API (untuk model). Adapter mencatat endpoint gRouter. Tidak ada klaim residency region di v1.
