# Evidence — Final Readiness Gate

- Date: 2026-10-15 UTC
- Starting commit: `4690cbb4c6b71a2e61ed519d1f54585223a91a88`
- Final commit: `9d879f3882d759019493ce419b7be8ed128d1f1c`
- Branch: `main`; local HEAD == `origin/main`; working tree clean after push.

## Internal fixes completed

1. Removed remaining fabricated dashboard overview cards/chart data and replaced them with real ledger-derived values and honest empty/loading states.
2. Removed fabricated admin usage KPIs (`15,1 jt`, `3,3 jt`, `48.920`, `Rp 9,2 jt`) and derive values from the real ledger. Time-range controls now affect the date window.
3. Replaced fabricated recent-sales identities/amounts with recent ledger records.
4. Removed random sidebar skeleton widths; skeleton rendering is deterministic.
5. Fixed mobile signup E2E click interception: the confetti canvas now has the expected pointer-events/z-index utility order. Focused mobile security E2E and full isolated E2E pass.
6. Fixed CI clean-checkout failure in `store-db-isolation.test.js`: the sentinel store is now created in a temporary directory rather than assuming ignored production data exists in CI.

## Fresh verification

- Root suite: **117/117 pass**.
- Server suite: **118/118 pass**.
- Customer journey: **1/1 pass** — register → server-priced order → forged webhook rejected → verified SUCCESS settle → plan entitlement → installer ESM/CJS path → heartbeat → gateway chat with fake provider.
- Isolated browser E2E: **22/22 pass**; production store/auth fingerprints unchanged.
- Focused mobile security E2E: **1/1 pass** after confetti fix.
- SPA probe: **19 routes, 0 CSP violations, 0 page errors, 0 unlabeled inputs**.
- TypeScript: exit 0.
- ESLint: 0 errors, 10 pre-existing/non-blocking warnings.
- Frontend build: successful.
- Clean-room ESM/CJS: PASS.
- Restore drill: PASS.
- Server dependency audit: 0 vulnerabilities.
- Frontend dependency audit: no known vulnerabilities.
- Read-only production smoke: PASS — backend/frontend/public health 200, catalogue 200, admin unauthenticated 401.
- Production guards: `/__e2e/id` 404; `/assets/` 404; production PM2 processes run with `NODE_ENV=production`.
- Served frontend index fingerprint matched `frontend/dist/index.html` after atomic deploy.

## Production findings

- Effective payment mode: **sandbox**, not production.
- Effective public catalogue: 3 plans; AI is disabled for all current plans (`ai.enabled=false`). This is an explicit current package policy, not an unverified implementation failure.
- Admin token: present; admin unauthenticated route returns 401.
- Better Auth API key: present.
- License keypair: present in `server/data/keys/`, both files mode 600; production boot log reports persisted. Private/public values are not included here.
- Resend credential: absent.
- npm publish: not performed and remains prohibited.
- GitHub Actions was independently queried. Run for commit `4690cbb` completed with **failure**: the server suite's `store-db-isolation.test.js` assumed `server/data/store.json` existed in the clean CI checkout. The fix is included in this final commit, but a post-fix remote CI run must still be observed before claiming CI green.

## Data integrity

Production `server/data/store.json` and `server/data/auth.sqlite` were hashed before/after local suites and isolated E2E; hashes remained unchanged during those runs. No production mutation, payment, email, npm publish, credential rotation, or destructive test was performed.

## Blocker classification

- GO-1 KlikQRIS production credentials/activation: **BLOCKED_EXTERNAL** — requires PO decision and real merchant credentials; sandbox remains active.
- GO-2 production keypair: **DONE_VERIFIED** — persisted files exist, mode 600, production boot reports persisted, restart behavior is covered by tests.
- GO-3 production admin token: **DONE_VERIFIED** — present and production admin gate returns 401 without token.
- GO-4 npm publish: **BLOCKED_EXTERNAL / intentionally prohibited** — no publish performed.
- GO-5 AI activation per package: **BLOCKED_EXTERNAL / product policy** — implementation and entitlement enforcement are tested; all current catalogue plans explicitly set AI disabled.
- GO-6 Resend credentials: **BLOCKED_EXTERNAL** — credential absent; reset email delivery cannot be production-runtime verified.
- Remote CI green status: **IMPLEMENTED_NOT_RUNTIME_VERIFIED** for final commit — the previous run failure was diagnosed and fixed locally, but GitHub has not yet run the final commit.
- Remaining OPEN-1..OPEN-9 development items are non-blocking roadmap work unless product scope changes.
