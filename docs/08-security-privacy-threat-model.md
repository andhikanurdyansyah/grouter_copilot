# Security, Privacy, and Threat Model

## Security objectives

1. Prevent cross-tenant data access.
2. Prevent unauthorized scope expansion.
3. Prevent secret exposure to browser, model, logs, and support staff.
4. Make every sensitive operation attributable and revocable.
5. Preserve customer control over retention and deletion.

## Threats and controls

| Threat | Control |
|---|---|
| Tenant ID substitution | derive tenant from credential and server session; enforce repository predicates |
| Prompt injection in CRM notes | treat retrieved text as untrusted; separate policy from data; tool allowlist |
| Role spoofing | signed identity exchange or server-side lookup; never trust browser roles |
| Credential leakage | secret vault/encryption, write-only display, redaction, rotation |
| Over-broad connector | allowlisted resources/fields, bounded query plans, review gate |
| Data exfiltration through answer | output policy, sensitive-field masking, source scope checks |
| Replay webhook | signature, timestamp window, event ID deduplication |
| Malicious plugin | signed manifest, permission review, sandbox/remote isolation, revocation |
| Denial of service | quotas, concurrency limits, body limits, timeouts, circuit breakers |
| Training-data contamination | provenance, versioned indexing, deletion propagation, evaluation |
| Operator overreach | least privilege, audit, break-glass access with reason and expiry |

## Data classification

- Public: documentation intentionally published.
- Internal: configuration and operational metadata.
- Confidential: business records and conversation content.
- Restricted: credentials, access tokens, payroll, health, government IDs, payment details.

Restricted data is disabled by default and requires an explicit enterprise policy and field masking.

## Authorization layers

1. Credential authenticates project/environment.
2. Subject authenticates end user.
3. Role grants skill/resource permission.
4. Scope policy filters records and fields.
5. Skill contract limits tools.
6. Output guard prevents prohibited disclosure.

Authorization must be evaluated before retrieval; prompt instructions are never an authorization mechanism.

## Privacy requirements

- State purpose and data categories at connector setup.
- Minimize retained content.
- Support deletion requests and deletion propagation to indexes/caches.
- Provide export of configuration, audit, and customer-owned content where applicable.
- Record source and retention policy for each index.
- Separate operational metadata from content access.

## Security acceptance tests

- cross-tenant ID substitution fails;
- revoked token fails immediately or within documented cache TTL;
- prompt injection cannot invoke undeclared connector/action;
- secret does not appear in logs, traces, sources, or answer;
- deletion removes content from retrieval path;
- webhook replay is rejected;
- browser bundle contains no server credential;
- support role cannot read content without approved break-glass event.
