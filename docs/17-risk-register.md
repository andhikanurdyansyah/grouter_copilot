# Risk Register

| ID | Risk | Likelihood | Impact | Mitigation | Trigger |
|---|---|---:|---:|---|---|
| R-01 | Scope leak across tenants | Medium | Critical | layered auth, isolation tests, least privilege | any unauthorized retrieval |
| R-02 | Product becomes generic chatbot with weak value | High | High | vertical starter skills, design partners, source/freshness UX | low repeat usage |
| R-03 | gRouter supplier contract changes | Medium | High | versioned adapter, contract tests, fallback/maintenance response | upstream contract failure |
| R-04 | Integration burden too high | High | High | protocol + SDK + samples, measure time-to-first-answer | onboarding abandonment |
| R-05 | Token cost destroys margin | Medium | High | budgets, caching, bounded context, model policy | cost per task above target |
| R-06 | Prompt injection causes tool misuse | High | Critical | untrusted-data boundary, tool allowlist, no MVP mutations | adversarial eval failure |
| R-07 | Data retention conflicts with customer policy | Medium | High | configurable retention, deletion propagation | deletion audit failure |
| R-08 | Marketplace introduces unsafe plugins | Medium | High | first-party/manual review before marketplace | unreviewed plugin request |
| R-09 | Overpromised accuracy | High | High | evaluation, citations, partial/stale states | unsupported answer feedback |
| R-10 | Scope expands into ERP/autonomous agent too early | High | High | phase gates and explicit non-goals | backlog items without proof |
