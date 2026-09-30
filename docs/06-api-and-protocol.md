# API & Protocol — gRouter Copilot

## 1. Dua kontrak

### Kontrak A: UI → Runtime (internal app)

```text
POST /api/copilot/chat
{ "message": "ringkas order bulan ini", "userId": "u42", "sessionId": "s1" }

→ SSE stream:
  run.started
  retrieval.status   (skill mana, sumber)
  answer.delta
  source.added
  run.completed | run.blocked | run.failed | run.cancelled
  usage.final
```

### Kontrak B: Runtime → gRouter (adapter)

```text
adapter.complete({ model, messages, stream, limits })
→ { answer, usage, status }

adapter.stream({ model, messages, limits }, onDelta)
→ stream events + final usage
```

## 2. Chat response envelope

```json
{
  "requestId": "req_123",
  "status": "complete",
  "answer": "...",
  "sources": [{"label": "Sales (7d)", "retrievedAt": "..."}],
  "usage": {"inputTokens": 0, "outputTokens": 0}
}
```

`complete` = plan selesai, bukan jaminan jawaban benar. `partial`/`stale`/`blocked`/`error` punya arti eksplisit.

## 3. Skill call contract

Skill dipanggil dengan:

```js
run({ ...validatedArgs, user }, context)
```

return value jadi context model. Skill tidak menerima raw prompt/instruction dari user sebagai logic.

## 4. gRouter adapter boundary

Adapter expose HANYA:

- model catalog identifier;
- messages/context;
- stream events;
- usage;
- status;
- safe error.

Adapter **tidak** expose: provider, connection, combo, fallback, raw upstream model ID, atau internal routing gRouter.

## 5. Versioning

- Skill contract dan chat protocol pakai semver.
- Adapter men-target satu versi public gRouter API; perubahan = major bump adapter.
- Additive response field = minor; remove/change meaning = major.

## 6. Error handling

Error selalu: stable code + requestId + retryable + safe message. Tidak ada stack trace, key, raw supplier error, atau SQL.

## 7. Contract tests

Test parity: skill contract sama di semua bahasa (saat multi-bahasa). Test stream disconnect, cancel, timeout, gRouter down, duplicate event.
