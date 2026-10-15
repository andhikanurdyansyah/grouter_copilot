# Evidence — Dashboard redesign visual/functional gate

- Date: 2026-10-15 UTC
- Starting commit: `d87e189ac924b29556ced0a3623a93f4d4520a7f`
- Final commit: `a95de051a99a323706ff6a6fdf93abac4695ac47`
- Branch: `main`; local == `origin/main`; working tree clean.

## Design read

Technical customer/admin control plane: restrained dark gunmetal surfaces, cyan operational accent, Space Grotesk headings, Fira Code for identifiers/metrics, hairline structure instead of decorative glow, and real-data-first states.

## Concrete redesign

### Customer overview

- Replaced the previous 3D/glow hero and four equal decorative KPI cards with a status-first workspace header.
- License state, package, expiry, AI entitlement, quota, and next action are now the first hierarchy.
- Install command has an intentional copy action and does not claim client installation state.
- Recent activity is ledger-backed with honest loading/empty states.
- Supplier credential boundary is explained as a quiet security note, not a badge cluster.

### Admin overview

- Replaced the previous large interaction-heavy dashboard with an operational control plane.
- Primary action is real license issuance through the existing `IssueLicenseModal`.
- Operational strip shows measured health and direct configuration/entitlement links.
- Metrics are limited to pending orders, active licenses, ledger requests/tokens, and installs.
- Throughput chart is real ledger-derived bars with 7/30-day control and success/error legend.
- Operator attention links expose pending orders, active licenses, and ledger entries.
- Unsupported revenue/growth/MRR/active-user numbers are absent.

### Shared foundation

- Added `frontend/src/styles/dashboard.css` with semantic dashboard tokens, surface hierarchy, typography, grid, status, chart, control, responsive, and reduced-motion rules.
- Retained existing global CSS and API/business logic.
- Fixed signup gradient canvas hit-testing regression by applying `pointer-events-none` to the decorative background layer.

## Visual QA evidence

Browser automation through the local browser daemon was unavailable because Chromium sandboxing failed. A direct pinned Chromium run was used instead for runtime smoke/screenshot probes:

- User route without session correctly redirected to `/login`; no horizontal overflow (`1440 == scrollWidth`).
- Admin route correctly rendered `/app/admin-gate`; no horizontal overflow; no console errors on gate.
- Screenshots were captured during QA and removed from the commit because the repository's QA screenshots are generated artifacts.

The public SPA probe independently exercised 19 routes after deployment:

- CSP violations: 0
- Page errors: 0
- Unlabeled inputs: 0
- Horizontal route probe: PASS

## Functional/regression evidence

- Root suite: 117/117.
- Server suite: 118/118.
- Isolated browser E2E: 22/22.
- TypeScript: clean.
- ESLint: 0 errors, 11 warnings.
- Frontend build: PASS.
- Read-only production smoke: PASS.
- Frontend build and served `server/public/app/index.html` fingerprints match.
- Public origin after deployment: HTTP 200.
- Existing intro/landing source was not modified.
- Signup mobile security E2E passed after pointer-event fix.

## Design skill decisions

- Better Design: hierarchy, operational clarity, data-first states, and shared semantic surfaces.
- Design Taste: rejected gradient/glass/badge/card overload; chose one accent, hairlines, mono metadata, and asymmetric split layouts.
- UI Layouts: used split control-plane composition and responsive operator density without new dependencies.
- Motion Primitives: retained only state/hover transitions and honored reduced motion; no new animation library.
- Canvas/shader/cursor/trickle references were not used because they would add decoration rather than improve dashboard work.

## Deployment

- Frontend deployed atomically by `scripts/deploy-frontend.sh`.
- Backup: `/home/ubuntu/backups/copilot-fe-20261015T160742Z`.
- `/` and `/app/` returned 200.
- Served bundle matches fresh build.
- No backend restart, database change, secret rotation, payment activation, AI activation, or customer-data mutation.
