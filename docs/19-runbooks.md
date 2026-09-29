# Runbooks

## Connector unavailable

1. Confirm project/environment and connector status.
2. Check health and last successful retrieval timestamp.
3. Stop retries if timeout/circuit breaker is active.
4. Return partial/stale/unavailable status truthfully.
5. Notify project admin with safe diagnostics.
6. Do not request customer credentials again automatically.

## Upstream gRouter unavailable

1. Confirm adapter health and contract status.
2. Stop unbounded retries.
3. Preserve request ID and usage state.
4. Return `UPSTREAM_UNAVAILABLE`.
5. Activate maintenance response or project-specific disable switch if needed.
6. Do not modify the existing gRouter as part of Copilot incident handling.

## Suspected scope leak

1. Immediately disable affected connector/project credential.
2. Preserve redacted audit evidence.
3. Identify tenant, subject, resource, and time window.
4. Prevent further retrieval and index jobs.
5. Notify security owner and affected customer per policy.
6. Run isolation regression before re-enable.

## Credential compromise

1. Revoke credential.
2. Issue replacement only after admin authentication.
3. Invalidate caches.
4. Search redacted logs/traces for exposure.
5. Document blast radius.
6. Require customer confirmation before re-enable.

## Bad skill answer

1. Record request ID and skill version.
2. Check source manifest, scope, freshness, and partial status.
3. Reproduce with fixture data.
4. Determine retrieval, prompt, model, or rendering fault.
5. Disable skill version if systematic.
6. Add regression evaluation before re-release.
