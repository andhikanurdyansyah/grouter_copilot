# Decision Log

## D-001 — Separate product and repository
**Status:** accepted. gRouter Copilot is independent from the existing gRouter deployment and port 20128. The existing gRouter is an external AI API/token supplier.

## D-002 — Protocol-first interoperability
**Status:** accepted. REST/JSON plus optional SSE is canonical. SDKs and plugins are adapters, not separate product contracts.

## D-003 — Read-only default
**Status:** accepted. Search, summary, analytics, recommendation, and document Q&A are MVP. Mutations require a later gated design.

## D-004 — Explicit scope before retrieval
**Status:** accepted. Prompt instructions cannot grant access. Scope is enforced at the connector and runtime layers.

## D-005 — API/event connectors before database crawling
**Status:** accepted. Customer API and events provide stronger boundaries and portability. Database connectors are controlled/enterprise capabilities.

## D-006 — First SDK priorities
**Status:** proposed. Node/Next.js, Web Component, and Java/Spring Boot first; add languages based on design-partner demand.

## D-007 — Fine-tuning is not MVP
**Status:** proposed. RAG, tools, policies, and structured context solve the first use cases with fresher data and lower operational burden.

## Unresolved decisions

- exact deployment cloud and regions;
- identity exchange standard;
- control-plane database;
- connector agent packaging;
- supported gRouter public API version;
- retention defaults and legal terms;
- initial pricing unit;
- evaluation quality threshold;
- whether Copilot has separate billing or passes through supplier usage.

Each unresolved item needs an owner, evidence, and decision date before the affected phase gate.
