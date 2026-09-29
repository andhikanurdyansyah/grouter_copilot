# Product Charter

## 1. Product thesis

Businesses already have valuable data in CRM, POS, HRIS, ERP, and internal systems, but users cannot easily turn that data into decisions. gRouter Copilot is an embedded AI platform that gives each application a context-aware assistant without forcing the application owner to build model routing, retrieval, skill execution, permission propagation, streaming UI, or AI governance from scratch.

## 2. Product definition

**gRouter Copilot is not a feature of the existing gRouter.** It is a separate product, codebase, deployment, tenant system, and commercial offering. It consumes an approved AI API/token contract from the existing gRouter as an upstream model service.

## 3. Problem statement

Application vendors need an AI capability that:

- installs into different technology stacks;
- understands application-specific data and terminology;
- respects the logged-in user's permissions;
- supports summaries, search, analysis, and recommendations;
- can be governed, audited, and disabled;
- does not lock the vendor to one LLM provider;
- can launch with low integration effort.

## 4. Strategic wedge

The wedge is not “a generic chatbot.” The wedge is **trusted, application-embedded intelligence with an integration contract**. The defensible asset is the combination of connector protocol, permission-aware context, reusable domain skills, evaluation data, and low-friction deployment.

## 5. Product boundaries

### In scope

- Independent Copilot control plane and runtime.
- SDKs, REST protocol, web components, and plugin system.
- Connectors for customer APIs, events, documents, and approved read-only data sources.
- Read-only skills: search, summary, analytics, recommendation, document Q&A.
- Tenant, project, environment, user, role, scope, audit, usage, and credential management.
- Adapter to the existing gRouter AI API/token service.
- Embedded chat, headless API, and framework-neutral integration.

### Explicitly out of scope for MVP

- Modifying or embedding code into the existing gRouter.
- Automatic unrestricted database discovery.
- Autonomous agents with broad action authority.
- Payroll, payment, refund, deletion, or other high-impact mutations.
- Fine-tuning as a prerequisite.
- Supporting every programming language with a native SDK on day one.
- Replacing a customer's system of record.
- Making business decisions without human review.

## 6. Product principles

- **Trust before magic:** visible sources, freshness, and scope beat impressive but unverifiable answers.
- **Least privilege:** retrieve only what the user and skill need.
- **Progressive capability:** read first, propose second, act only with explicit controls.
- **Protocol over implementation:** SDKs are adapters; the protocol is canonical.
- **Failure honesty:** stale, partial, unavailable, and inferred states are explicit.
- **Reversible rollout:** every connector and skill can be disabled independently.
- **No silent cross-tenant context:** tenant identity is mandatory on every request.

## 7. Success thesis

A successful first release lets an application vendor install Copilot, define a safe data scope, enable two useful read-only skills, and get a trustworthy answer in production without exposing provider credentials or changing the vendor's source-of-truth database.
