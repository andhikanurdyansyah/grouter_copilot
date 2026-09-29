# Commercial Model Hypothesis

## Packaging

### Starter
- one project;
- REST or SDK integration;
- basic embedded chat;
- read-only search and summary;
- bounded usage and standard retention.

### Growth
- multiple environments;
- custom skills;
- recommendation and analytics;
- higher quotas;
- audit and usage dashboards;
- multiple connectors.

### Enterprise
- SSO/SCIM;
- private connector agent;
- residency and retention controls;
- extended audit;
- support SLA;
- controlled action workflows;
- procurement/security package.

## Pricing hypotheses to test

- platform fee plus included AI credits;
- metered usage by normalized tokens or task units;
- connector/index volume add-on;
- enterprise annual contract.

Do not expose raw upstream provider cost as the sole customer price dimension; customers buy capability and governance, not provider internals.

## Unit economics questions

- average connector calls per answer;
- average context size;
- cache hit rate;
- gRouter cost per successful task;
- support cost per integration;
- churn reduction from Copilot;
- gross margin at high-usage tenants.

## Commercial guardrails

- hard quota and soft warning;
- project-level budget;
- rate limit and concurrency cap;
- usage export;
- no surprise provider pass-through;
- clear behavior when quota is exhausted.
