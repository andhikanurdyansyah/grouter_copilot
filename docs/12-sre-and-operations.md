# SRE and Operations

## Initial SLO hypotheses

These are targets to validate with design partners, not promises before measurement:

- API availability: 99.9% monthly for production runtime.
- p95 time to first token: under 3 seconds when connector and upstream are healthy.
- p95 connector retrieval: under 1.5 seconds for bounded reads.
- revoked credential enforcement: within documented cache TTL, target under 60 seconds.
- audit event durability: 99.99% successful enqueue or explicit operational alert.

## Observability

Metrics:

- requests by project/environment/status;
- first-token and completion latency;
- connector success, partial, timeout, and freshness;
- gRouter adapter status and retry count;
- active streams and cancellations;
- token usage and cost;
- scope blocks and policy blocks;
- queue depth and index lag.

Logs must be structured and redacted. Traces use opaque IDs and do not include message content by default.

## Kill switches

- disable project;
- revoke credential;
- disable connector;
- disable skill;
- disable indexing;
- disable a plugin version;
- route project to safe maintenance response.

Kill switches must be available even when the model supplier is unavailable.

## Incident severity

- SEV-1: cross-tenant exposure, credential exposure, widespread outage.
- SEV-2: major tenant outage, incorrect mutation, sustained data corruption risk.
- SEV-3: degraded connector/skill, elevated latency, partial functionality.
- SEV-4: cosmetic or low-impact issue.

## Incident response

1. Detect and declare.
2. Contain with kill switch/revocation.
3. Preserve evidence without copying sensitive content.
4. Determine tenant and scope impact.
5. Communicate status and safe workaround.
6. Recover and verify with readback.
7. Complete root-cause and corrective actions.

## Dependency failure policy

If existing gRouter is unavailable, Copilot must return a truthful `UPSTREAM_UNAVAILABLE` state, preserve no misleading success, and avoid unbounded retries. Copilot must not modify the existing gRouter to compensate.

## Backup and recovery

Back up control-plane configuration, audit metadata according to policy, and encryption key metadata. Test restore in an isolated environment. Customer source data is not backed up by Copilot unless explicitly contracted.
