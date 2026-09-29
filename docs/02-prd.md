# Product Requirements Document

## 1. Goal

Build an independent embedded AI platform for business applications. The first product release must prove safe installation, scoped retrieval, useful read-only skills, and reliable consumption of the existing gRouter API.

## 2. Personas

- **Platform owner:** integrates SDK and maintains connector.
- **Organization admin:** configures project, scope, skills, users, retention, and credentials.
- **Application user:** chats and receives answers based on permitted data.
- **Reviewer/auditor:** inspects sources, actions, usage, and access history.
- **Copilot operator:** monitors runtime health without seeing unnecessary customer content.

## 3. MVP user journeys

### Journey A: create project

1. Admin creates organization.
2. Admin creates project and environment.
3. Copilot issues server credential and browser-safe client credential separately.
4. Admin selects integration method.
5. Copilot provides generated configuration and a connection test.

### Journey B: connect application API

1. Admin registers an API base URL or SDK callback.
2. Admin defines authentication handoff; Copilot never asks for a customer's end-user password.
3. Admin declares resource schemas and scope predicates.
4. Copilot performs a non-destructive test with a bounded sample.
5. Admin approves the connector.

### Journey C: ask a scoped question

1. Application sends user identity, project, environment, session, and message.
2. Runtime resolves roles and data scope.
3. Runtime selects an enabled skill.
4. Connector retrieves bounded data.
5. Runtime creates a source manifest.
6. Runtime calls gRouter through the adapter.
7. UI streams answer, citations/source labels, freshness, and limitations.

### Journey D: configure a skill

1. Admin selects a skill template.
2. Admin maps data resources.
3. Admin sets scope, language, tone, token budget, and refresh behavior.
4. Copilot validates configuration.
5. Admin tests with synthetic fixture data or a permitted sample.
6. Skill is enabled only after passing validation.

## 4. MVP capability requirements

| ID | Capability | Acceptance |
|---|---|---|
| PR-01 | Organizations/projects/environments | Requests cannot cross environment or tenant boundaries |
| PR-02 | REST integration | A customer can register and test a bounded connector |
| PR-03 | Node/Next integration | Chat can be embedded without exposing server credential |
| PR-04 | Java integration | Spring Boot can send the same canonical protocol |
| PR-05 | Web Component | Framework-neutral browser integration works |
| PR-06 | Identity propagation | Runtime receives stable external subject and roles |
| PR-07 | Scope enforcement | Unauthorized records are excluded before model context |
| PR-08 | Skills | Search, summary, and recommendation operate read-only |
| PR-09 | Streaming | Partial output, completion, cancellation, and error are defined |
| PR-10 | Sources | Answer exposes source labels and freshness where available |
| PR-11 | Usage | Request, token, latency, status, and project attribution are recorded |
| PR-12 | Audit | Connector, skill, credential, and access events are queryable |
| PR-13 | Kill switches | Admin can disable project, connector, skill, and credential |
| PR-14 | gRouter adapter | Provider internals are not present in Copilot public responses |
| PR-15 | Data deletion | Admin can request deletion of indexed Copilot data |

## 5. Answer contract

Every answer has:

- `answer`: rendered response;
- `status`: `complete`, `partial`, `stale`, `blocked`, or `error`;
- `sources`: safe source labels, not raw secrets or internal IDs;
- `freshness`: retrieval timestamp and source timestamp when available;
- `scope`: human-readable scope label;
- `limitations`: missing data, truncation, or uncertainty;
- `requestId`: opaque trace identifier.

The answer must not claim an exact result when the connector returned partial, stale, or sampled data.

## 6. Safety requirements

- Read-only tools are the only default tools.
- No raw SQL from model output.
- Connector queries use server-generated plans and bounded parameters.
- Input from application data is treated as untrusted content and cannot redefine system policy.
- User-controlled prompts cannot widen scope.
- Credentials are not sent to the model.
- Browser clients never receive server gRouter credentials.

## 7. Out-of-scope requirements

The following are not MVP acceptance blockers: autonomous write actions, fine-tuning, native SDKs for every language, full data warehouse federation, voice, mobile-native UI, and marketplace monetization.

## 8. Product metrics

- time to first successful answer;
- integration completion rate;
- weekly active Copilot users;
- answer acceptance/feedback rate;
- grounded-answer rate from evaluation set;
- unauthorized retrieval test pass rate;
- p95 first-token latency;
- connector failure rate;
- cost per successful answer;
- disable/revoke recovery time.
