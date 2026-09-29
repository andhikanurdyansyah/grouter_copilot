# Plugin, Connector, and Skill Specification

## Plugin model

A plugin is a versioned package or remote manifest that extends Copilot through declared capabilities. A plugin cannot bypass platform authentication, tenant checks, scope policy, audit, quotas, or data deletion.

Manifest minimum:

```json
{
  "name": "crm-sales-pack",
  "version": "1.0.0",
  "runtime": "remote",
  "protocolVersion": "1.0",
  "permissions": ["customer.read", "deal.read"],
  "connectors": ["crm-api"],
  "skills": ["sales-summary"],
  "dataClasses": ["business"],
  "supports": {"readOnly": true, "actions": false}
}
```

## Connector contract

A connector declares resources and exposes bounded operations:

- `describe()` — schema and capabilities;
- `health()` — connectivity and freshness;
- `query(resource, validatedParameters, subjectContext)` — scoped read;
- `subscribe(eventTypes)` — optional events;
- `close()` — release resources.

Connector requirements:

- server-side parameter validation;
- allowlisted resources and fields;
- pagination and maximum row/byte limits;
- timeout and cancellation;
- source timestamps;
- partial-result semantics;
- no arbitrary model-generated URL or SQL;
- safe error normalization.

## Skill contract

A skill declares:

- name and immutable version;
- purpose and user-facing description;
- required connector resources;
- required permissions;
- input and output JSON schema;
- read/write classification;
- maximum context and execution budget;
- evaluation suite;
- refusal conditions;
- freshness requirement.

A skill planner may select a skill, but it may not invent permissions. If required permission is missing, the run is blocked with a safe explanation.

## Action skill policy

Actions are not MVP-default. Future action skills require:

- separate permission namespace;
- explicit confirmation showing target and effect;
- idempotency key;
- server-side revalidation immediately before mutation;
- audit event before and after;
- result readback from source of truth;
- compensation or rollback story;
- rate limit and abuse protection.

## Marketplace policy

Do not launch a public marketplace before plugin signing, permission review, provenance, version pinning, revocation, malware scanning, data classification, and support ownership exist. Initial plugins are first-party or manually reviewed.
