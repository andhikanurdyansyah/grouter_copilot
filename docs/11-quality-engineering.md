# Quality Engineering Strategy

## Test layers

### Contract tests
Verify protocol schemas, version compatibility, error codes, SSE ordering, and SDK parity.

### Unit tests
Cover scope evaluation, field masking, skill validation, query bounds, freshness classification, redaction, retry policy, and cost calculation.

### Integration tests
Use fake CRM/POS connectors and a fake gRouter adapter. Never require production credentials for CI.

### Security tests
Attempt tenant substitution, role spoofing, credential reuse, prompt injection, webhook replay, plugin permission bypass, and secret leakage.

### Evaluation tests
Each skill has a dataset with:

- expected answer facts;
- allowed sources;
- forbidden disclosures;
- ambiguity cases;
- partial data cases;
- adversarial instructions;
- cost and latency budget.

### Browser tests
Verify Web Component and custom UI at desktop, tablet, and mobile. Measure page overflow and embedded panel containment; do not rely only on screenshots.

### Load tests
Measure concurrent streams, connector saturation, gRouter upstream limits, cancellation, quota enforcement, and noisy-neighbor isolation.

## Definition of done

- acceptance tests pass;
- no P0/P1 security finding;
- API contract updated;
- audit events verified;
- metrics and alerts exist;
- failure and disable path tested;
- documentation updated;
- migration/rollback impact reviewed;
- customer-facing copy reviewed;
- production rollout is reversible.

## Release gates

1. Static/type/syntax checks.
2. Unit and contract tests.
3. Security suite.
4. Evaluation suite.
5. Integration smoke.
6. Load/failure evidence for relevant scope.
7. Deployment dry run.
8. Canary and rollback rehearsal.

## Quality metrics

Track groundedness, refusal correctness, scope violation rate, connector partial rate, p95 latency, error budget consumption, and cost per successful task.
