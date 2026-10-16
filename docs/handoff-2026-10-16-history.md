# Handoff 2026-10-16 — Companion + bounded conversation history

## Status

- Base release before this slice: `6c158d2`.
- Companion mode was already implemented and documented.
- This slice adds bounded multi-turn history and gateway policy hardening.
- No production data, payment, or provider configuration was changed.

## Implemented

- Widget sends the last local conversation messages as optional `history`.
- Runtime accepts only `user`/`assistant` history roles; client `system` turns are ignored.
- History is redacted for credentials, bounded by turns and UTF-8 bytes, and newest-first retained under pressure.
- System policy remains first; history cannot replace policy.
- General, skill-grounded, gateway payload, and local stream paths receive equivalent bounded history behavior.
- Context byte accounting includes history and reports `partial` when context was truncated.
- Widget retry does not duplicate the failed current prompt in history.
- Gateway rejects multiple system messages or non-leading system messages.
- Gateway preserves trusted `partial` response status and idempotent replay status.

## Verification

- Root suite: 122/122.
- Server suite: 120/120.
- Focused history/runtime/context tests: pass.
- TypeScript: clean.
- Frontend build: pass.
- ESLint: 0 errors, 10 existing warnings.
- Node syntax checks: pass.
- `git diff --check`: pass.

## Remaining

- Commit and push the verified slice.
- Deploy the frontend bundle because the widget changed.
- Run clean-room installer, customer journey, isolated browser E2E, SPA probe, and read-only production smoke after deployment.
- Natural-language intent routing remains the next product slice after this release.
- Gateway streaming remains future scope until a real backend streaming contract is defined.
