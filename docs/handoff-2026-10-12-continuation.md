# Handoff — 2026-10-12 continuation (product readiness mandate)

Status: PARTIAL. Workstreams 1–5 are NOT complete. This file records what was
actually executed and exactly what remains. Nothing here is a pass claim unless
listed under "Executed and verified".

## Baseline
- HEAD = origin/main = `50516d39756df7c440509c04c065b5dc75a4ea09`, tree clean at handoff time.
- Earlier commits this session: `73e5cc2` (health readiness), `a8770b9` (KlikQRIS non-2xx + upstream timeout + safety tests), `50516d3` (gateway failure regressions).
- Prod `copilot-backend` :4600 healthy; public `copilot.grouter.id/api/health` 200. KlikQRIS mode = `sandbox` (unchanged).
- Backups: `/home/ubuntu/backups/copilot-20261012T161642Z/` and a second pre-`a8770b9` backup (see Backup section).

## Executed and verified (real output captured)
- Server suite: `cd server && NODE_ENV=test timeout 500 node --test` → 99/99 pass.
- Root suite: `npm test` → 71/71 pass (measured at session start).
- Installer, packed tarball (`grouter-copilot-0.1.0.tgz`, built with `npm pack`):
  - `--help` exit 0; unknown command exit 1.
  - Install with no license → exit 1; unreachable license server → exit 1; no `.env` or scaffold written on failure.
  - Install with valid isolated license → exit 0; `.env` gets GROUTER_* keys; customer `CUSTOMER_DB_URL` and `MY_FLAG` preserved; customer file unchanged; 0 duplicate env keys.
  - Rerun install → skips existing files, no duplicate keys, same key set.
  - Tampered and garbage tokens → exit 1, `.env` left intact.
- Express host from packed tarball (`fresh-express`): `/api/copilot/health` → 200 `{status:ok}`; `/api/copilot/chat` with valid license → 502 `NOT_CONFIGURED` (isolated instance has no provider credential). Honest end state; no fabricated answer.
- Defect found and documented: `/api/resolve` returns `https://copilot.grouter.id/api/copilot/chat` when `branding.publicOrigin` is unset. A non-default license server therefore hands customers the production gateway. Workaround applied on isolated instance by PATCHing `branding.publicOrigin`. Prod has it unset and was NOT changed. Open item: decide whether to derive origin per-deployment (see Remaining).
- Health route is host-local only (license token signature + env). It returns `ok` even when the backend is down. Documented, not changed.

## Not completed (exact remaining steps)
1. **KlikQRIS sandbox E2E settlement (WS1).** Sandbox order `ord_mv5go5w2_4h9k` created earlier, status PENDING. Settlement requires the manual simulator (`simulator_token_missing`). BLOCKED external step. Deterministic webhook/idempotency/forgery tests exist in `server/test/payment-webhook.test.js` and `payment-safety-gaps.test.js` and pass. Cross-account isolation is covered by `orders-ownership.test.js`.
2. **Gateway quota/model/timeout matrix (WS2).** Existing `gateway.test.js` (16) and `gateway-failure-gaps.test.js` (3) pass. Not yet added: explicit disallowed-model, disabled-AI-plan, and invalid-default-model tests.
3. **Mini-CRM integration (WS3).** `examples/mini-crm-copilot` not yet run from the packed artifact; the Express host above is a stand-in. Missing: expired-license and gateway-timeout cases at the host level.
4. **Restore drill (WS4).** No backup/restore script exists in the repo. Latest backup dirs exist in `/home/ubuntu/backups/` but were not restored into an isolated instance. Next: write `server/scripts/restore-drill.sh` (copy → isolated `DATA_FILE`, port 4691, restrictive perms), run it, record result.
5. **Documentation reconciliation (WS5).** `docs/release-evidence-2026-10-06.md` still claims 112 root / 55 backend. Measured: 71 root, 99 server. Discrepancy not yet explained against git history; do not replace numbers without that.

## Scratch artifacts (not in repo)
`/root/.hermes/profiles/copilot-grouter/cache/scratch/`: `pack/grouter-copilot-0.1.0.tgz`, `pack/fresh-existing/`, `pack/fresh-express/`, `iso-keys/` (mode 600, test keys only), `iso2/` (store, token file mode 600). Delete the scratch keys after the drill; they must never be used for production.

## Operational notes
- Do not use `pkill -f <pattern>` on a pattern that appears in your own shell command; it kills the shell (exit -15). Stop servers by PID from `ss -ltnp`.
- Background servers launched with `timeout N` self-expire.

## Blockers needing the owner
- KlikQRIS sandbox simulator: manual dashboard action required to finish the settlement E2E.
- npm publication: explicitly out of scope; remains unpublished.
- Production payment cutover: requires production credentials and provider contract verification (not started).
