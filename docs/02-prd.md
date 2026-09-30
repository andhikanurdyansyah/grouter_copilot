# Product Requirements Document — gRouter Copilot

## 1. Goal

Bangun plugin npm `@grouter/copilot` (Node.js/Next.js) yang menambah AI copilot ke aplikasi yang sudah ada, self-contained, dengan developer-defined skills dan AI dari gRouter.

## 2. Personas

- **Developer/integrator:** install plugin, tulis skills, konfigurasi.
- **End user aplikasi:** chat, terima jawaban dari data yang diizinkan.
- **App owner:** memutuskan key gRouter, model, dan scope skills.

## 3. MVP user journeys

### Journey A: install
1. Developer jalankan `npx @grouter/copilot init`.
2. Plugin detect framework (Next.js App Router / Express / etc), bahasa (TS/JS), package manager.
3. Plugin generate: `copilot.config.js`, `.env` (placeholder `GROUTER_API_KEY`), `skills/`, API route, widget mount.
4. Developer isi `GROUTER_API_KEY`.
5. Developer jalankan app → widget muncul.

### Journey B: definisikan skill
1. Developer buat `skills/<name>.js` dengan `name`, `description`, `parameters`, `readOnly`, `run()`.
2. Skill diregistrasi di `copilot.config.js`.
3. Plugin validasi schema skill saat boot.

### Journey C: end user chat
1. User bertanya di widget.
2. Widget POST ke `/api/copilot/chat` (app sendiri).
3. Runtime resolve skill, jalankan `run({...args, user})`.
4. Runtime bangun context + panggil gRouter.
5. Jawaban stream ke widget + source/status.

## 4. Capability requirements

| ID | Capability | Acceptance |
|---|---|---|
| PR-01 | `init` command | generate scaffold benar sesuai framework |
| PR-02 | Skill registry | skill valid, terdaftar, bisa dipanggil |
| PR-03 | Skill execution | `run()` dipanggil dengan arg + user context |
| PR-04 | Chat route | request valid, error jelas |
| PR-05 | gRouter adapter | stream, timeout, error, usage terdefinisi |
| PR-06 | Key isolation | key tidak ada di bundle browser |
| PR-07 | Read-only | v1 skill tidak bisa mutasi |
| PR-08 | Widget | streaming, loading/error/empty state |
| PR-09 | Config | skill, model, prompt, limits bisa diset |
| PR-10 | Source display | jawaban tampilkan sumber/freshness bila ada |

## 5. Skill contract (inti produk)

```js
export default {
  name: "sales-summary",            // unique
  description: "Ringkas penjualan", // untuk pemilihan skill
  parameters: {                     // JSON Schema
    type: "object",
    properties: { period: { type: "string", enum: ["7d", "30d"] } },
    required: ["period"]
  },
  readOnly: true,                   // v1 wajib true
  async run({ period, user }) {     // developer-defined data access
    return summarizeOrders(period, user.id);
  }
};
```

`run()` return value jadi context untuk model. Data yang tidak diekspos skill tidak bisa dibaca chatbot.

## 6. Safety requirements

- Key gRouter hanya di server env, tidak di client.
- Skill adalah satu-satunya pintu akses data; tidak ada auto-SQL.
- Input user tidak bisa memanggil skill di luar registry.
- `readOnly` skill tidak boleh mengubah data.
- Data aplikasi dianggap untrusted content (tidak mengubah policy).
- Error tidak mengekspos key/stack/provider internals.

## 7. Out of scope

Auto-scan seluruh DB, mutating skills, fine-tuning, backend Copilot, multi-bahasa (Java/Python), marketplace publik.

## 8. Metrics

- time-to-first-install (init → widget muncul);
- time-to-first-useful-answer;
- jumlah skill aktif per app;
- error rate chat;
- key leakage test pass;
- p95 first-token latency;
- retensi pemakaian mingguan.
