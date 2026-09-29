# Protocol Deep Specification

## Design goal

One stable contract must work for REST, Node/Next, Java/Spring, Web Component, future languages, and a private connector agent. Client convenience must never change authorization or answer semantics.

## Request context

Required server-resolved context:

- `organizationId`;
- `projectId`;
- `environmentId`;
- `requestId`;
- `sessionId`;
- external subject namespace and ID;
- trusted roles/attributes;
- locale/timezone;
- client SDK version;
- protocol version.

The host application may submit a signed identity assertion. Copilot verifies issuer, audience, expiry, nonce/replay protection, and project binding. Unsigned role claims are informational only.

## Query plan boundary

The model never sends arbitrary SQL, URL, or connector code. Runtime produces a validated query plan from a skill definition:

```json
{
  "resource": "orders",
  "fields": ["id", "status", "total", "createdAt"],
  "filters": [{"field": "createdAt", "operator": "between", "value": "validated-range"}],
  "scope": "subject-policy",
  "limit": 100,
  "sort": [{"field": "createdAt", "direction": "desc"}]
}
```

The connector revalidates resource, field, filter operator, limit, sort, and subject scope. Any mismatch fails closed.

## Context envelope

Context contains typed data plus provenance:

- source resource label;
- retrieval timestamp;
- source record timestamp if available;
- completeness/partial flag;
- redaction status;
- row/byte count;
- data classification;
- scope policy version.

It does not contain credentials, hidden policies, unnecessary fields, or raw internal database identifiers unless explicitly allowlisted for the skill.

## Answer semantics

`complete` means the declared plan completed, not that the answer is correct. `partial` means at least one declared source failed or was truncated. `stale` means freshness exceeded the skill threshold. `blocked` means policy prevented execution. `error` means no safe answer was produced.

## Retry and idempotency

- Chat reads may retry only before model generation begins or with a request idempotency key.
- Webhook ingestion requires event ID deduplication.
- Connector mutations are not MVP and must not be hidden behind read retry logic.
- Client reconnect may resume stream by request ID but must deduplicate deltas.

## Error response

Every error includes stable code, request ID, retryable boolean, safe message, and optional operator reference. It never includes stack traces, credentials, raw supplier errors, SQL, or cross-tenant existence signals.

## Supplier adapter boundary

The adapter translates only canonical fields: model catalog identifier, messages/context, limits, stream events, usage, status, and safe errors. It must not expose provider, connection, fallback, or internal routing concepts to Copilot clients.

## Contract tests

For every public version, test old client against new server, new client against supported old server, unknown fields, malformed enums, stream disconnect, cancellation, supplier outage, and duplicate event delivery.
