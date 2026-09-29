# Domain Model

## Core entities

- **Organization:** billing and security boundary.
- **Project:** one integrated application/product.
- **Environment:** development, staging, or production configuration boundary.
- **Application:** external system connected to a project.
- **Installation:** one SDK/plugin installation with status and version.
- **Credential:** server, client, webhook, or connector credential; secret value is write-only.
- **External subject:** application user identity mapped to Copilot roles.
- **Role:** named set of permissions.
- **Scope policy:** rules limiting resources, records, fields, and time range.
- **Connector:** configured data access capability.
- **Resource schema:** safe description of a connector resource.
- **Skill:** versioned capability with inputs, tools, permissions, and output contract.
- **Skill binding:** skill enabled for a project/environment with mappings and limits.
- **Conversation:** user-visible interaction.
- **Run:** one model/skill execution within a conversation.
- **Source record:** provenance metadata for retrieved context.
- **Usage record:** measured request and cost data.
- **Audit event:** immutable record of security/configuration/runtime activity.
- **Index job:** asynchronous document or structured-data indexing operation.
- **Evaluation case:** expected behavior test for a skill and scope.

## Required invariants

- Every data-plane request has `organizationId`, `projectId`, `environmentId`, and external subject.
- Every connector belongs to exactly one environment.
- Every skill binding resolves to one immutable skill version.
- A revoked credential cannot start a new run.
- A deleted project cannot be addressed by an active client token.
- Audit events cannot be edited through the product API.
- Source records cannot contain raw connector credentials.
- External subject IDs are namespaced by application/project.

## Lifecycle states

### Connector
`draft → testing → enabled → degraded → disabled → deleted`

### Skill binding
`draft → validating → enabled → paused → disabled → deleted`

### Run
`queued → retrieving → generating → completed | partial | blocked | failed | cancelled`

### Credential
`active → expiring → revoked | expired`

## Tenant isolation model

All repository queries require organization and environment predicates. Tests must attempt object-ID substitution, missing tenant headers, role confusion, and revoked credential reuse.
