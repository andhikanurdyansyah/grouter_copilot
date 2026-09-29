# API and Protocol

## Compatibility policy

- Public protocol uses semantic versions.
- Additive response fields are allowed.
- Removing or changing field meaning requires a major version.
- Clients must ignore unknown fields.
- Error codes are stable identifiers; messages are not machine contracts.
- Every request returns an opaque `requestId`.

## Canonical chat request

```json
{
  "protocolVersion": "1.0",
  "projectId": "proj_123",
  "environment": "production",
  "sessionId": "sess_123",
  "message": {"role": "user", "content": "Ringkas penjualan minggu ini"},
  "subject": {
    "id": "crm:user:42",
    "roles": ["sales_manager"],
    "attributes": {"branchId": "branch-7"}
  },
  "skillHint": "sales-summary",
  "locale": "id-ID"
}
```

The server must derive authorization from the trusted integration context. Client-supplied roles are never trusted without signature or server-side validation.

## Canonical answer

```json
{
  "requestId": "req_123",
  "status": "complete",
  "answer": "...",
  "sources": [
    {"label": "Sales report", "retrievedAt": "2026-09-29T10:00:00Z", "freshness": "current"}
  ],
  "limitations": [],
  "usage": {"inputTokens": 0, "outputTokens": 0},
  "model": {"catalogId": "grouter-model"}
}
```

Do not return provider identity, internal connection IDs, raw upstream model IDs, connector credentials, raw SQL, or hidden chain-of-thought.

## Endpoint families

- `POST /v1/projects` — create project.
- `POST /v1/environments` — create environment.
- `POST /v1/connectors` — register connector.
- `POST /v1/connectors/{id}/test` — bounded non-mutating test.
- `POST /v1/skills/{id}/validate` — validate binding.
- `POST /v1/chat` — non-streaming chat.
- `POST /v1/chat/stream` — SSE chat.
- `POST /v1/events` — signed application event ingestion.
- `GET /v1/usage` — scoped usage.
- `GET /v1/audit-events` — authorized audit search.
- `POST /v1/credentials/{id}/revoke` — revoke credential.
- `POST /v1/data-deletion-requests` — request deletion.

## Error taxonomy

`AUTH_REQUIRED`, `FORBIDDEN_SCOPE`, `TENANT_MISMATCH`, `CONNECTOR_UNAVAILABLE`, `CONNECTOR_PARTIAL`, `SKILL_DISABLED`, `QUOTA_EXCEEDED`, `UPSTREAM_UNAVAILABLE`, `TIMEOUT`, `CLIENT_CANCELLED`, `POLICY_BLOCKED`, `INVALID_REQUEST`, `INTERNAL_ERROR`.

## Streaming events

SSE event types: `run.started`, `retrieval.status`, `answer.delta`, `source.added`, `run.completed`, `run.blocked`, `run.failed`, `run.cancelled`, `usage.final`.

Events are ordered per request, carry request ID, and are safe to replay only when the client supplies a deduplication key.

## Authentication

Server SDKs use environment-specific server credentials. Browser integrations use short-lived, origin-bound client tokens or a customer-issued session exchange. Never embed the gRouter supplier credential in browser code.
