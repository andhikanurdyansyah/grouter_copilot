# Skill & Connector Specification — gRouter Copilot

> Ini dokumen inti produk. Skill adalah cara plugin membaca data aplikasi.

## 1. Skill definition

```js
// skills/sales.js
export default {
  name: "sales-summary",
  description: "Ringkas total penjualan dalam periode (7d/30d)",
  parameters: {
    type: "object",
    properties: {
      period: { type: "string", enum: ["7d", "30d"] }
    },
    required: ["period"]
  },
  readOnly: true,
  async run({ period, user }, ctx) {
    // developer-defined: baca DB/service sendiri
    const rows = await db.orders.aggregate({ period, ownerId: user.id });
    return { period, total: rows.total, count: rows.count };
  }
};
```

## 2. Skill fields

| Field | Wajib | Arti |
|---|---|---|
| `name` | ✅ | unique identifier |
| `description` | ✅ | untuk pemilihan skill (intent) |
| `parameters` | ✅ | JSON Schema input |
| `readOnly` | ✅ | `true` di v1; mutasi = gate terpisah |
| `run(args, ctx)` | ✅ | akses data, return context |

Optional: `sources`, `freshness`, `maxRows`, `requiresConfirmation`.

## 3. Skill execution rules

- `run()` hanya dipanggil dengan arg tervalidasi dari `parameters`.
- `user` context diteruskan agar data di-scope per user.
- return value jadi context; tidak ada akses data di luar `run()`.
- skill read-only tidak boleh mengubah data.
- skill tidak menerima instruksi model sebagai kode/query.

## 4. Connector model (data access)

Skill adalah satu-satunya connector di v1. Developer menulis akses data di dalam `run()`. Tidak ada auto-refleksi DB di v1.

### Auto-discovery terbatas (helper, opsional/phase lanjut)

Sebagai **helper** (bukan default): plugin bisa scan model/route/DB untuk **menyarankan** skill stub yang kemudian developer lengkapi & approve. Auto-discovery tidak boleh otomatis mengekspos data ke model tanpa persetujuan developer.

## 5. Skill selection

Runtime memilih skill berdasarkan:

1. `skillHint` eksplisit dari request (bila ada);
2. intent matching dari `description` (embedding/keyword/heuristic);
3. fallback: minta klarifikasi bila ambigu.

Model boleh menyarankan skill, tapi hanya skill terdaftar yang bisa dipanggil.

## 6. Advanced (gated): mutating skills

Mutating skill (`readOnly: false`) membutuhkan:

- permission terpisah;
- `requiresConfirmation` + tampilan efek;
- idempotency key;
- audit log lokal;
- revalidation sebelum mutasi;
- readback dari source.

v0.1 **tidak** mendukung mutating skills.

## 7. Validation at boot

Saat app start, plugin validasi:

- `name` unik;
- `parameters` valid JSON Schema;
- `readOnly` boolean;
- `run` adalah function.

Skill invalid → warn + exclude (bukan crash seluruh app).

## 8. Template

Lihat `docs/templates/skill-template.md`.
