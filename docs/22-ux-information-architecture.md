# UX and Information Architecture Blueprint

## UX thesis

The primary user does not want an AI product; they want a faster, safer way to complete a business task inside the application they already use. Copilot must be contextual, quiet when unnecessary, and transparent when its answer matters.

## Surfaces

### End-user surface

1. Contextual launcher near the relevant module.
2. Conversation panel with suggested questions based on current screen context.
3. Answer body with structured highlights.
4. Source/freshness disclosure.
5. Follow-up suggestions constrained to the same scope.
6. Feedback and report-problem controls.
7. “Open in application” escape hatch.

### Administrator surface

1. Overview: health, enabled skills, usage, incidents.
2. Installations: environment, version, connection status.
3. Data sources: resources, fields, scope, freshness, last test.
4. Skills: bindings, permissions, budgets, evaluation status.
5. Access: roles, subject mapping, browser origins, credentials.
6. Governance: retention, deletion, audit, data classification.
7. Usage and cost: request volume, tokens, limits, top skills.
8. Audit: filterable events with safe metadata.

## Critical UX states

| State | User message behavior | Admin action |
|---|---|---|
| Retrieving | Show what is being consulted without fake progress | Inspect connector health |
| Complete | Answer plus sources/freshness | View run evidence |
| Partial | Explain missing resource and avoid absolute claims | Repair connector/scope |
| Stale | Show last updated time and qualify recommendation | Refresh or adjust freshness policy |
| Blocked | Explain permission boundary without revealing data | Review policy |
| Unavailable | Offer retry and safe fallback, not fabricated answer | Inspect dependency |
| Over budget | Explain limit and next action | Adjust quota or skill budget |
| Cancelled | Preserve completed portion only if clearly marked | Inspect cancellation rate |

## UX rules

- Never label configuration as “connected” without a verified probe.
- Never hide source scope to make the answer feel magical.
- Never place a dangerous action adjacent to a read-only suggestion without distinct confirmation.
- Never use provider names, raw supplier IDs, connector credentials, or internal trace IDs as customer-facing copy.
- Never use a confidence score unless its calibration is defined and validated; use evidence and limitations first.
- Loading must communicate stage, not invent percentage completion.
- Mobile embedded panels must not trap scroll or cover host navigation.

## Design system requirements

- host theme tokens with safe fallback;
- keyboard and screen-reader support;
- focus restoration after close;
- reduced motion;
- streaming text that does not shift layout excessively;
- escaped markdown/rendered links;
- locale-aware numbers and dates;
- minimum touch target 44px;
- desktop, tablet, and mobile acceptance at 1440, 820, and 390 widths.

## First-value UX

The onboarding success metric is not “installed.” It is:

> A permitted end user receives a useful, source-backed answer from the host application within the first guided session.

The setup wizard must therefore test identity, scope, connector data, skill configuration, and answer rendering—not merely issue a token.
