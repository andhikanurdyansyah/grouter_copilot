# Solution Architecture

## 1. Logical architecture

```text
[CRM/POS/HRIS/ERP]
   ├─ SDK / Web Component / REST client
   └─ Connector API or event adapter
            ↓
[Copilot Edge/API]
   auth · tenant · rate limit · request validation
            ↓
[Copilot Runtime]
   session · policy · skill planner · retrieval planner
            ↓
[Connector Gateway] → customer application data
            ↓
[Context and Source Builder]
            ↓
[gRouter Adapter] → existing gRouter API/token supplier
            ↓
[Answer Guard / Stream Gateway]
            ↓
[Embedded UI / API client]
```

## 2. Planes

### Control plane
Configuration and governance: organizations, projects, environments, credentials, connectors, skills, roles, policies, retention, audit queries, usage dashboards.

### Data plane
Live chat, retrieval, skill execution, context assembly, model request, streaming, answer guard, usage recording.

### Integration plane
SDKs, Web Component, REST/OpenAPI, webhooks, connector callbacks, and event ingestion.

### Operations plane
Metrics, logs, traces, queues, quotas, incident controls, kill switches, evaluation runs.

## 3. Trust boundaries

1. Browser/application user to customer application.
2. Customer application to Copilot.
3. Copilot to customer data source.
4. Copilot to gRouter supplier.
5. Copilot operators to customer metadata.

Never treat customer data as trusted instructions. Never forward connector credentials to gRouter or the model.

## 4. Deployment shapes

- **SaaS control plane + SaaS runtime:** default MVP.
- **SaaS control plane + customer-side connector agent:** enterprise option.
- **Private runtime:** future option for residency or regulated customers.

The protocol must not encode deployment-specific assumptions.

## 5. Data flow rules

- Identity and authorization are resolved before retrieval.
- Scope filters are applied at the connector boundary, not only in prompts.
- Context is bounded by rows, bytes, tokens, and time.
- Source metadata is retained separately from model prose.
- Model output is not written into the customer source of truth by default.

## 6. Reliability patterns

- bounded retries only for idempotent reads;
- circuit breakers per connector and per gRouter adapter;
- cancellation propagation from client to connector and model request;
- backpressure on streams;
- dead-letter queue for asynchronous indexing;
- stale snapshot with visible freshness rather than fabricated live data;
- per-tenant quotas and concurrency limits.

## 7. Architecture decisions

The canonical protocol is HTTP/JSON with optional SSE streaming. SDKs wrap the protocol. Webhooks are signed and replay-protected. Internal services may use another transport, but it must not leak into the customer contract.
