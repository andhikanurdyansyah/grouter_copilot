# Business Requirements Document

## 1. Executive summary

gRouter Copilot is a B2B platform sold to software vendors and enterprises that want embedded AI in their existing applications. It is a separate product from the existing gRouter. The existing gRouter supplies model access; Copilot supplies the integration, governance, and user experience.

## 2. Stakeholders

| Stakeholder | Need | Risk if ignored |
|---|---|---|
| Application vendor | Fast, stable integration | Long sales cycle and failed adoption |
| Enterprise admin | Scope, SSO/RBAC, audit | Security rejection |
| Application end user | Useful, fast, understandable answers | Low usage |
| Data owner | Data minimization and deletion | Compliance exposure |
| Support/operator | Diagnostics without customer data leakage | Slow incident resolution |
| gRouter supplier | Predictable API consumption | Cost and dependency instability |

## 3. Ideal customer profile

Primary ICP: B2B SaaS vendors with an API, authenticated users, structured business data, and a need to differentiate their product with AI.

Secondary ICP: mid-market enterprises with multiple internal systems and a platform engineering team.

Poor initial fit: applications with no stable API, no permission model, unstructured legacy data only, or a requirement for autonomous financial/HR actions at launch.

## 4. Jobs to be done

- “Let my users ask questions about the data they already have access to.”
- “Give managers a reliable summary without exporting spreadsheets.”
- “Suggest next steps, but do not take action without approval.”
- “Add AI without building an LLM platform team.”
- “Keep provider credentials and model switching out of my product code.”

## 5. Business outcomes

- Reduce time for a customer to launch an AI feature.
- Increase application stickiness and premium conversion.
- Create recurring Copilot platform revenue.
- Establish reusable vertical skills and connectors.
- Generate measurable, governed AI usage rather than uncontrolled API calls.

## 6. Business model hypothesis

Start with platform subscription plus metered AI usage. Avoid pricing solely by seats because summaries and analytics vary by data volume. Proposed dimensions:

- platform/project fee;
- included monthly AI credits;
- overage by normalized AI usage;
- enterprise add-ons for private connector agent, SSO, residency, and audit retention.

Pricing is a hypothesis and must be validated with design partners before commitment.

## 7. Business requirements

| ID | Requirement | Priority |
|---|---|---|
| BR-01 | A customer can create an organization and project without accessing the existing gRouter dashboard | P0 |
| BR-02 | A customer can connect an application through REST/webhook/SDK | P0 |
| BR-03 | A customer can define data scope and enable skills | P0 |
| BR-04 | End users receive answers constrained by identity and scope | P0 |
| BR-05 | Customer admins can inspect usage, audit events, and failures | P0 |
| BR-06 | Copilot consumes the existing gRouter through a versioned adapter | P0 |
| BR-07 | Customers can disable a connector, skill, project, or credential | P0 |
| BR-08 | A customer can export and delete Copilot data subject to retention policy | P1 |
| BR-09 | SDKs are additive and do not require customer database migrations | P0 |
| BR-10 | The product can operate with more than one application domain | P1 |

## 8. Business non-functional requirements

- No dependency on internal implementation of existing gRouter.
- Clear tenant isolation.
- Contract versioning and backward compatibility.
- Predictable cost controls.
- Supportable failure modes.
- Evidence-based product analytics.

## 9. Business acceptance

The business pilot is successful when two different application types, such as CRM and POS, can independently onboard, configure separate scopes, use the same Copilot runtime, and demonstrate useful read-only answers without cross-tenant leakage.
