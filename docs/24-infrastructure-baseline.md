# Infrastructure Baseline and Environment Strategy

## Principles

- Copilot infrastructure is independent from existing gRouter infrastructure.
- Development, staging, and production are separate environments and credentials.
- No customer production connector is tested from a developer laptop by default.
- The supplier API is an external dependency with a contract test double.
- Secrets are injected at runtime through a secret manager or protected environment mechanism; never committed.
- Infrastructure code must be reproducible and reviewable.

## Environment model

| Environment | Purpose | Data | Supplier access |
|---|---|---|---|
| Local | protocol/runtime development | fixtures only | fake supplier by default |
| Development | team integration | synthetic/sanitized | dedicated supplier credential |
| Staging | release acceptance | approved sandbox | staging supplier credential |
| Production | customer traffic | governed customer data | production supplier credential |

## Minimum topology

```text
Public edge/WAF
  → API gateway
  → stateless Copilot API
  → runtime workers
  → connector gateway
  → control-plane database
  → cache/queue/index services
  → observability
```

The first deployment may collapse components for simplicity, but the logical boundaries must remain visible so a noisy connector or expensive skill cannot starve control-plane operations.

## Required platform capabilities

- TLS and secure headers;
- request/body/stream limits;
- per-tenant rate and concurrency limits;
- durable control-plane database with encrypted backups;
- queue for asynchronous indexing and deletion;
- cache with tenant-aware keys and bounded TTL;
- secret storage and rotation;
- centralized redacted logs, metrics, and traces;
- health/readiness endpoints that distinguish dependency states;
- feature flags and kill switches;
- deployment rollback and database backup restore rehearsal.

## Network policy

- Control-plane admin endpoints are not exposed as public anonymous APIs.
- Connector outbound access uses explicit allowlists where feasible.
- Supplier outbound access is limited to the approved gRouter endpoint.
- Webhook endpoints validate signatures before enqueueing.
- Internal service-to-service calls authenticate workload identity.
- No direct database access from model-facing code.

## Deployment strategy

1. Build immutable artifact.
2. Run contract, security, evaluation, and smoke suites.
3. Deploy to staging without changing production.
4. Run migration compatibility checks separately from deployment.
5. Canary a bounded tenant cohort.
6. Observe error budget, cost, latency, scope blocks, and connector health.
7. Expand only after gate evidence.
8. Retain previous artifact and configuration for rollback.

## Scaling model

Scale API and runtime independently. Connector concurrency is bounded per tenant and per connector. Indexing is asynchronous and cannot consume all runtime capacity. Supplier rate limits are treated as a capacity constraint, not a reason to create an unbounded queue.

## Backup and recovery targets

Final RPO/RTO requires an infrastructure decision. Before production, define and test:

- control-plane database restore;
- credential/key recovery without exposing values;
- queue replay and deduplication;
- index rebuild from source;
- audit retention recovery;
- project disable during partial outage.

## Infrastructure acceptance checklist

- [ ] Local mode works without real secrets.
- [ ] Staging cannot address production connector data by configuration accident.
- [ ] Production credentials are not present in build artifacts.
- [ ] Readiness reports supplier, database, queue, and connector dependencies separately.
- [ ] Rollback has been rehearsed.
- [ ] Cost and concurrency limits are tested under load.
