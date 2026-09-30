# Solution Architecture — gRouter Copilot

## 1. Overview

gRouter Copilot adalah **plugin in-process** di aplikasi customer. Tidak ada service Copilot terpisah. Semua berjalan di dalam aplikasi customer, dan satu-satunya panggilan keluar adalah ke gRouter API.

```text
Aplikasi Customer (Node.js/Next.js)
│
├── Chat UI (widget)  ── client, TANPA key
│        │  POST /api/copilot/chat
│        ▼
├── Runtime (API route) ── server, pegang GROUTER_API_KEY
│        │  1. resolve skill
│        │  2. jalankan skill → data app
│        │  3. bangun context
│        ▼
│   gRouter Adapter ── panggil gRouter API (streaming)
│
└── Skills (developer-defined) ── akses DB/service app
```

## 2. Komponen

### CLI init
`npx @grouter/copilot init` — deteksi framework, generate scaffold.

### Config loader
Baca `copilot.config.js`: daftar skill, model, prompt, limits, opsi gRouter.

### Skill registry
Load + validasi semua skill, expose `resolve(intent)`, `run(name, args, ctx)`.

### Runtime chat route
Endpoint `/api/copilot/chat`: validasi request → resolve skill → jalankan → build context → panggil adapter → stream.

### gRouter adapter
Satu-satunya titik keluar ke gRouter. Terjemahkan model/catalog, stream, timeout, retry, error, usage. Tidak expose provider internals.

### Widget `CopilotChat`
React component embeddable; streaming, loading/error/empty; theme-aware.

## 3. Trust boundaries

1. Browser → runtime app (endpoint chat).
2. Runtime → skills (data app).
3. Runtime → gRouter (supplier AI).

```text
Key gRouter: HANYA boundary 3 (server).
Browser TIDAK pernah menyentuh boundary 3 secara langsung.
```

## 4. Data flow

```text
User message
  → widget POST (userId, sessionId, message)
  → runtime validasi + resolve skill
  → skill.run({ ...args, user }) → data app
  → context = { system, data, sources }
  → adapter.complete(context) → gRouter
  → stream jawaban + source/status → widget
```

## 5. Reliability

- skill failure → error state jelas, bukan jawaban palsu;
- gRouter down → `upstream_unavailable`, retry terbatas;
- timeout/cancel → propagasi;
- skill read-only → tidak ada mutasi;
- no unbounded context → limit row/byte/token.

## 6. Decisions

- In-process plugin, bukan service terpisah.
- Self-contained config di app customer.
- Node.js/Next.js pertama.
- Developer-defined skills sebagai satu-satunya pintu data.
- gRouter adapter = satu-satunya panggilan keluar.
