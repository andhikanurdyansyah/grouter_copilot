# Product Decisions and Approval Gates

## Purpose

This document prevents attractive ideas from becoming accidental commitments. A feature may be technically possible and still be rejected because it weakens trust, economics, or adoption.

## Locked decisions

### PD-001 — Copilot is a separate product
It has a separate repository, deployment, owner, credentials, data stores, release cycle, and incident boundary. Existing gRouter at port 20128 is an external supplier only.

### PD-002 — The product is governed embedded intelligence
“Plugin” describes installation. “Chatbot” describes one interface. The product capability is permission-aware intelligence over application data.

### PD-003 — Protocol first
REST/JSON with optional SSE is canonical. Native SDKs may improve ergonomics but cannot create divergent semantics.

### PD-004 — Read-only first
MVP can search, summarize, analyze, recommend, and answer documents. It cannot silently change application records.

### PD-005 — Customer application remains source of truth
Copilot may cache or index approved data, but it never becomes the system of record.

### PD-006 — Explicit scope before retrieval
Authorization is not a prompt. It is an enforced connector/runtime policy.

## Approval gates before coding

### Gate A — Customer and wedge
Must answer:

- Which application vendor pays first?
- Which painful job is valuable enough to integrate?
- What does the host application already do poorly?
- Why is Copilot better than a generic API wrapper or a built-in report?
- What is the measurable first-value event?

### Gate B — Identity and permission
Must approve:

- trusted subject exchange;
- role source of truth;
- tenant/project/environment relationship;
- record-level and field-level scope model;
- behavior when identity is missing, stale, or revoked.

### Gate C — Supplier contract
Must approve:

- exact external gRouter endpoint contract;
- authentication ownership and rotation;
- model/catalog naming safe for Copilot;
- timeout, quota, streaming, usage, and error semantics;
- behavior during supplier outage.

### Gate D — Data and privacy
Must approve:

- data classes allowed in MVP;
- retention defaults;
- deletion propagation target;
- whether chat content is stored;
- indexing opt-in and residency claims.

### Gate E — Economics
Must approve:

- included usage unit;
- maximum cost per successful task;
- customer quota behavior;
- noisy-neighbor controls;
- support cost assumptions.

### Gate F — UX trust
Must approve:

- answer/source/freshness presentation;
- partial/stale/blocked states;
- embedded placement and escape hatch;
- admin configuration path;
- language and accessibility baseline.

## Rejection rules

Reject or defer a feature if it:

- requires broad access without a scope story;
- makes the model the source of truth;
- cannot be disabled safely;
- has no evaluation fixture;
- exposes supplier internals to customers;
- adds a native SDK before protocol parity;
- relies on “the model will know not to do that”; or
- increases autonomy without a corresponding authorization and audit design.

## Decision status vocabulary

- **Locked:** may be implemented against.
- **Approved for discovery:** may be prototyped, not productionized.
- **Proposed:** requires owner decision.
- **Blocked:** cannot proceed without evidence or decision.
- **Rejected:** explicitly out of scope.
