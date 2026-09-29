# MVP Backlog

## EPIC-1 Foundation

- Define protocol schemas and version policy.
- Create independent service skeleton and CI.
- Define external gRouter adapter interface.
- Add fake supplier for tests.

## EPIC-2 Tenancy and identity

- Organizations/projects/environments.
- Server and browser credential separation.
- Signed subject exchange.
- RBAC and scope policy evaluator.
- Revocation and kill switches.

## EPIC-3 Connector platform

- REST connector manifest.
- Schema/resource registration.
- Bounded query planner.
- Health/freshness/partial semantics.
- Signed event ingestion.

## EPIC-4 Runtime

- Chat request validation.
- Skill selection and permission check.
- Retrieval and source manifest.
- gRouter adapter call.
- Streaming/cancellation/error handling.
- Usage and audit emission.

## EPIC-5 Client integrations

- Node/Next SDK.
- Web Component.
- Java/Spring sample and SDK.
- OpenAPI documentation.

## EPIC-6 Skills

- Generic search.
- Generic summary.
- Time-bounded analytics.
- Recommendation with explicit limitations.
- CRM starter pack.
- POS starter pack.

## EPIC-7 Operations and launch

- SLO dashboards.
- Quotas and budget controls.
- Security/evaluation suite.
- Deletion workflow.
- Runbooks.
- Design-partner pilot.

## Prioritization rule

A feature that increases autonomy but does not have a proven authorization, audit, rollback, and evaluation story is lower priority than a feature that increases trust and integration reliability.
