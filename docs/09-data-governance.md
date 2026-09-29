# Data Governance

## Source-of-truth rule

Customer application data remains authoritative. Copilot stores only the minimum required configuration, transient context, audit metadata, usage metadata, and optional indexes explicitly enabled by the customer.

## Storage categories

| Category | Default treatment |
|---|---|
| Configuration | Durable, encrypted where sensitive |
| Credentials | Vault/encrypted, write-only, rotatable |
| Chat content | Configurable retention; off by default for long-term storage |
| Retrieval context | Ephemeral unless indexing is enabled |
| Structured index | Opt-in, versioned, deletable |
| Audit metadata | Durable, immutable, redacted |
| Usage | Durable aggregate and detailed retention policy |
| Logs/traces | Redacted, short retention |

## Freshness

Every connector reports freshness. Skills must declare acceptable freshness. If data is stale beyond the skill threshold, the answer says so and may block recommendations that require current data.

## Indexing policy

Index only approved resources and fields. Index jobs are bounded, resumable, observable, and cancellable. Deletion and scope changes create invalidation jobs. A stale index must not silently replace live source data where exactness matters.

## Retention defaults

Initial hypothesis, subject to customer contract:

- transient retrieval context: minutes;
- chat content: customer-configurable, default short retention;
- operational logs: short retention;
- audit and billing metadata: longer retention with redaction;
- indexes: until disabled/deleted or policy expiration.

Do not hard-code compliance retention before legal/customer requirements are confirmed.

## Data export and deletion

Deletion workflow:

1. authenticate authorized admin;
2. create deletion request with scope;
3. freeze new indexing for target;
4. delete primary Copilot records;
5. invalidate cache and search index;
6. verify absence from retrieval;
7. emit completion audit event;
8. retain only legally required minimal audit evidence.

## Data residency

Residency is a deployment and contract concern. The protocol must carry data location metadata, while the MVP should not promise residency regions that the infrastructure cannot prove.
