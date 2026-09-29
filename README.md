# gRouter Copilot

Product workspace for an independent embedded-AI platform that serves CRM, POS, HRIS, ERP, e-commerce, helpdesk, and internal business applications.

## Product boundary

- This repository is independent from the existing gRouter deployment.
- The existing gRouter at port 20128 is an external AI API/token supplier only.
- No source, database, release artifact, watchdog, dashboard, or deployment file from the existing gRouter is part of this workspace.
- Copilot owns customer application integration, tenant isolation, connectors, skills, permissions, knowledge configuration, embedded UI, audit, and product billing.

## Document map

| Document | Purpose |
|---|---|
| `docs/00-product-charter.md` | Product thesis, boundaries, principles, decisions |
| `docs/01-brd.md` | Business requirements and operating model |
| `docs/02-prd.md` | Product requirements and acceptance criteria |
| `docs/03-master-plan.md` | Phased delivery plan, gates, dependencies |
| `docs/04-solution-architecture.md` | System architecture and trust boundaries |
| `docs/05-domain-model.md` | Entities, lifecycle, tenancy, data ownership |
| `docs/06-api-and-protocol.md` | Public protocol and compatibility rules |
| `docs/07-plugin-connector-skill-spec.md` | Plugin, connector, and skill contracts |
| `docs/08-security-privacy-threat-model.md` | Security, privacy, threat model, controls |
| `docs/09-data-governance.md` | Retention, deletion, residency, indexing, PII |
| `docs/10-ux-and-design-principles.md` | User experience and embedded surfaces |
| `docs/11-quality-engineering.md` | Test strategy and release acceptance |
| `docs/12-sre-and-operations.md` | SLOs, observability, incident response |
| `docs/13-commercial-model.md` | Packaging, pricing hypotheses, unit economics |
| `docs/14-go-to-market.md` | ICP, adoption, onboarding, launch plan |
| `docs/15-decision-log.md` | ADR-style decisions and unresolved choices |
| `docs/16-glossary.md` | Canonical terminology |
| `docs/17-risk-register.md` | Product and delivery risks |
| `docs/18-mvp-backlog.md` | Prioritized epics and user stories |
| `docs/19-runbooks.md` | Operational and customer-support procedures |
| `docs/templates/skill-template.md` | Template for new skills |
| `docs/templates/connector-template.md` | Template for new connectors |
| `docs/templates/plugin-review.md` | Plugin review checklist |

## Current status

Documentation baseline only. No application code, dependency installation, database migration, production integration, or change to the existing gRouter has been performed.

## Non-negotiable product principles

1. Read-only by default.
2. Explicit scope before data access.
3. Customer application remains the source of truth.
4. No unrestricted database crawling or unrestricted SQL.
5. Actions that mutate customer data require separate permissions, confirmation, idempotency, audit, and an approval policy.
6. The model provider is replaceable behind a stable Copilot-to-gRouter adapter.
7. Tenant and user authorization is enforced before retrieval and again before tool execution.
8. Every answer must be explainable by its sources, time range, and freshness.
9. A plugin may extend capability but may not bypass platform security.
10. A green model response is not proof of a correct business answer.

## Phase 0 audit status

The documentation baseline has undergone a critical product/UX/architecture/infrastructure review. Read `docs/26-audit-report-phase-0.md` and `docs/25-development-readiness.md` before coding. The readiness document is a stop/go gate: unresolved contracts must be locked or explicitly approved as time-boxed pilot assumptions.
