# Domain Model — gRouter Copilot

## Core entities

- **Skill:** developer-defined function dengan `name`, `description`, `parameters` (JSON Schema), `readOnly`, `run()`.
- **SkillRegistry:** koleksi skill terdaftar, validasi + resolve.
- **Config:** `copilot.config.js` — skills, model, prompt, limits, opsi gRouter.
- **ChatRequest:** `{ message, userId, sessionId, skillHint?, locale? }`.
- **ChatResponse:** `{ answer, status, sources?, usage?, requestId }`.
- **SkillRun:** satu eksekusi skill → return data yang jadi context.
- **gRouterClient (adapter):** wrapper panggilan ke gRouter (complete + stream).
- **Session:** percakapan berkelanjutan (optional, in-memory/local).

## Invariants

- Setiap skill punya `name` unique dan `readOnly` boolean.
- `run()` hanya menerima arg tervalidasi + `user` context.
- Data hanya masuk context lewat `run()` return value.
- Key gRouter hanya di `gRouterClient` (server).
- Skill tidak bisa memanggil skill lain secara langsung kecuali diizinkan config.
- `readOnly: true` dijamin tidak mengubah data (enforced by convention + review; runtime tidak bisa fully guarantee, jadi mutating skills = gate terpisah).

## Skill lifecycle

```text
defined → validated (boot) → registered → resolvable → run → (readOnly) return context
```

## Error taxonomy

`SKILL_NOT_FOUND`, `SKILL_INVALID_ARGS`, `SKILL_FAILED`, `SCOPE_DENIED`, `UPSTREAM_UNAVAILABLE`, `TIMEOUT`, `CLIENT_CANCELLED`, `INVALID_REQUEST`, `RATE_LIMITED`.

## Statelessness

v1 plugin **stateless** terhadap data aplikasi: tidak menyimpan data customer di manapun. Session history (bila ada) lokal ke app. Tidak ada database Copilot.
