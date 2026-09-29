# Requirements Traceability and Acceptance Matrix

This document is the release gate connecting business intent to product behavior, architecture, tests, and evidence. A requirement is not complete because a screen or endpoint exists; it is complete only when the required behavior is exercised and its failure mode is understood.

## P0 launch requirements

| ID | Requirement | Product evidence | Technical evidence | Failure if absent |
|---|---|---|---|---|
| R-001 | Existing gRouter remains external supplier only | Boundary test and repository separation | No import, network shortcut, shared DB, or source dependency | Product coupling and unsafe rollback |
| R-002 | Tenant isolation | Cross-tenant adversarial test | Auth context and repository predicates | Critical data exposure |
| R-003 | Subject-aware authorization | Same user sees only authorized records | Signed identity exchange and scope evaluator | Permission bypass |
| R-004 | Scoped retrieval before model call | Source manifest excludes forbidden records | Connector enforces allowlist and limits | Prompt-only security |
| R-005 | Read-only default | Every MVP skill cannot mutate source | Tool registry has no mutation capability | Unsafe autonomy |
| R-006 | gRouter adapter boundary | Supplier outage produces truthful state | Versioned adapter contract and fake supplier | Hidden provider coupling |
| R-007 | Browser credential safety | Browser bundle has no server secret | Short-lived origin-bound session token | Credential compromise |
| R-008 | Explainable answer | User sees source category, period, freshness, limitations | Answer envelope and provenance records | Untrusted black-box answer |
| R-009 | Bounded cost | Tenant budget and limits are enforceable | Token/context/row/byte/concurrency caps | Margin and availability failure |
| R-010 | Revocable capability | Admin can disable project/connector/skill/credential | Kill switches independent of supplier | Inability to contain incident |
| R-011 | Honest degraded state | Partial/stale/unavailable is visible | Stable statuses and no fake success | Misleading business decision |
| R-012 | Deletion propagation | Deleted content is not retrievable | Primary/cache/index invalidation evidence | Privacy breach |
| R-013 | Contract compatibility | Node, Java, REST clients behave consistently | Schema and compatibility suite | SDK fragmentation |
| R-014 | Operational supportability | Support can diagnose without content access | Redacted logs, metrics, traces, runbooks | Unrecoverable incidents |

## P1 requirements

- data export and configurable retention;
- enterprise identity integration;
- private connector agent;
- CRM and POS starter packs;
- evaluation dashboard;
- organization-level cost allocation;
- project-level feature flags;
- regional deployment policy.

## Traceability rule

Each implementation issue must reference one requirement ID. Each release candidate must report: implemented, tested, operationally verified, deferred, and rejected requirements. “Not tested” must not be reported as passed.

## Exit criteria for development start

- [ ] Every P0 requirement has an owner and acceptance test.
- [ ] Every P0 requirement has a defined failure response.
- [ ] No P0 requirement depends on a still-unresolved architectural decision.
- [ ] The adapter contract is stable enough to fake in CI.
- [ ] The identity and scope model is approved.
