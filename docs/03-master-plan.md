# Master Plan

## Delivery strategy

Build independent vertical slices. Do not start with a universal autonomous agent. Prove the trust boundary and one useful read-only loop first, then add breadth.

## Phase 0 — Product and contract foundation

**Outcome:** frozen product boundary and testable contracts.

- Create independent repository and CI baseline.
- Define protocol versioning, tenant model, identity envelope, answer envelope, error taxonomy.
- Define gRouter adapter as an external dependency with a mock contract for local tests.
- Establish threat model, data classification, and design-partner agreements.

**Gate:** architecture review and security review approve the boundary; no existing gRouter files changed.

## Phase 1 — Copilot control plane

**Outcome:** organizations, projects, environments, credentials, connector registry, skill registry, audit, and kill switches.

**Gate:** tenant isolation tests, credential rotation/revocation tests, audit completeness, no secret in logs.

## Phase 2 — Runtime read-only loop

**Outcome:** authenticated request enters Copilot, invokes a bounded connector, calls gRouter adapter, and streams an answer.

**Gate:** end-to-end fixture test, cancellation, timeout, partial data, gRouter unavailable, and cross-tenant tests.

## Phase 3 — Integration surface

**Outcome:** REST protocol, Node/Next SDK, Web Component, and Java/Spring SDK sample.

**Gate:** same request and answer contract across all clients; browser credential boundary verified.

## Phase 4 — Skills and vertical starter packs

**Outcome:** search, summary, recommendation, and document Q&A; CRM and POS starter mappings.

**Gate:** evaluation datasets, groundedness threshold, refusal behavior, scope tests, cost budget.

## Phase 5 — Production hardening

**Outcome:** SLO dashboards, quotas, retries, backpressure, deletion workflow, support runbooks, disaster recovery.

**Gate:** load test, failure injection, recovery rehearsal, privacy review, customer-support rehearsal.

## Phase 6 — Design partner launch

**Outcome:** two different application types in controlled production.

**Gate:** signed acceptance, no unresolved P0/P1 security finding, rollback/disable path demonstrated.

## Phase 7 — Commercial expansion

- Python/PHP/.NET/Go SDKs.
- Private connector agent.
- SSO/SCIM.
- enterprise residency and retention.
- governed write actions.
- connector and skill marketplace only after review process exists.

## Dependency order

```text
Boundary → Protocol → Tenant/Auth → Connector → Scope → Runtime → gRouter Adapter → UI SDKs → Skills → Operations → Commercial launch
```

## Release rules

- No production integration with existing gRouter until a separately approved adapter contract exists.
- No schema migration in a customer application.
- No feature is “done” from source existence alone; it needs contract tests and an exercised flow.
- Every phase has a reversible disable path.
