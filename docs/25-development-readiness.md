# Development Readiness Gate

## Current posture

Documentation is materially stronger than the initial baseline, but development is still blocked until the decisions below are resolved. This is intentional: writing code before these contracts are clear would create rework and unsafe coupling.

## Must be decided before runtime coding

### Product

- [ ] First paying ICP and design partners.
- [ ] First two measurable jobs to be solved.
- [ ] Definition of “useful answer” and acceptable failure.
- [ ] Whether Copilot is multi-tenant SaaS from day one or single-tenant pilot first.

### Identity

- [ ] Identity exchange: signed JWT, server session exchange, or both.
- [ ] Source of roles and attributes.
- [ ] Record-level scope expression supported in MVP.
- [ ] Behavior on role/subject change during an active stream.

### Supplier contract

- [ ] Exact gRouter supplier base URL and public API version.
- [ ] Supplier authentication ownership and rotation runbook.
- [ ] Supported streaming and cancellation semantics.
- [ ] Usage/cost fields and reconciliation behavior.
- [ ] Supplier model catalog and customer-safe naming.
- [ ] Supplier timeout, quota, and error mapping.

### Data

- [ ] Whether chat content is persisted.
- [ ] Initial data classification allowed.
- [ ] Indexing allowed in MVP or live-query only.
- [ ] Retention and deletion SLA.
- [ ] Data residency claims.

### Infrastructure

- [ ] Cloud/deployment target.
- [ ] Primary database, queue, cache, and object store.
- [ ] Secret manager.
- [ ] Observability provider.
- [ ] RPO/RTO.
- [ ] Domain, TLS, WAF, and environment topology.

### Commercial

- [ ] First pricing hypothesis and included usage.
- [ ] Quota exhaustion experience.
- [ ] Who pays: app vendor, enterprise, or end-user pass-through.
- [ ] Supplier cost allocation and margin target.

### UX

- [ ] Embedded mode versus full-page mode priority.
- [ ] Host application identity handoff UX.
- [ ] Source/freshness presentation and terminology.
- [ ] Supported initial locales.
- [ ] Accessibility acceptance level.

## Allowed work while blocked

- protocol fixtures and schema linting;
- fake connector and fake supplier;
- threat-model tests;
- UX prototypes using synthetic data;
- evaluation harness design;
- SDK contract test scaffolding;
- infrastructure diagrams and local development tooling.

## Not allowed while blocked

- production connector access;
- real customer data indexing;
- autonomous actions;
- supplier credential distribution to browser code;
- database migration in a customer application;
- claiming MVP readiness;
- changing existing gRouter source or deployment.

## Go/no-go rule

Development may start only when all “must be decided” items have either a locked decision or an explicitly approved pilot assumption with owner, expiry date, rollback, and evidence plan.
