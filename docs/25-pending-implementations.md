# Pending Implementations — gRouter Copilot

> Things explicitly deferred or pending. Each has a reason, a blocker, and what to do when it becomes active.

## P-001 — Google OAuth provider

**Status:** PARTIAL — auth (Better Auth email/password) built; Google OAuth provider PENDING.

**What exists:**
- Better Auth wired (email/password sign-up + sign-in working, tested live).
- Registration page (`/register`) with "Lanjut dengan Google" button.

**What's missing:**
- Google OAuth `clientId` + `clientSecret`.
- `socialProviders.google` config in `server/src/auth.js`.

**Blocker:** needs Google Cloud OAuth client credentials.

**Unblock when:** user provides Google OAuth client ID + secret. Add `socialProviders` to `auth.js` and re-run migration.

---

## P-002 — Auto-provisioning gRouter api key

**Status:** DEFERRED.

**Why:** purchase → auto-generate gRouter api key requires a gRouter provisioning endpoint contract that does not exist yet.

**Current workaround:** admin binds an existing gRouter api key to a license manually (`POST /api/admin/licenses/:id/bind`).

**Unblock when:** gRouter exposes a documented api-key-generation endpoint.

---

## P-003 — KlikQRIS payment integration

**Status:** NOT STARTED (provider locked, integration not built).

**Provider:** KlikQRIS (klikqris.com) — QRIS payment.

**Known API shape (from provider docs / references):**
- Auth via **API Key** + **Merchant ID**.
- Sandbox mode available (test without real money).
- Flow: `create_qris(order_id, amount)` → QR → customer pays → `check_status(order_id)` (poll) or webhook → `paid` → fulfill.
- Env: `KLIKQRIS_API_KEY`, `KLIKQRIS_MERCHANT_ID`, `KLIKQRIS_MODE=sandbox|production`.

**What's missing:**
- Actual KlikQRIS API key + merchant ID (sandbox).
- Payment module (create + status poll + webhook).
- Order model: package → order → payment → license issue.

**Blocker:** needs KlikQRIS sandbox credentials + exact endpoint spec confirmation.

**Unblock when:** user provides KlikQRIS API key + merchant ID (sandbox) + confirms endpoint.

---

## P-004 — Customer dashboard data wiring

**Status:** PARTIAL (static skeleton exists).

**What exists:**
- `/user` dashboard skeleton (stat cards, license key placeholder, usage table).

**What's missing:**
- Auth (session → account).
- `/api/me` → account + licenses (1 account = N licenses, D-017).
- License list + usage per license (consume gRouter `/check-usage` per bound key).

**Blocker:** auth model (P-001) + account/license data model.

---

## P-005 — Account & license data model

**Status:** DECIDED, not built.

**Model (D-017):**
```text
Account (customer)
  └── License 1..N
        └── { id, features, quota, expiresAt, bound gRouter api key, installs }
```

**What's missing:** store schema for `accounts` table + `accountId` on license records.

---

## Payment provider note (KlikQRIS)

- **Sign up free** at klikqris.com, grab API Key + Merchant ID from dashboard.
- Start with `sandbox` mode; switch to `production` only when ready to accept real money.
- Do NOT store API key in frontend; only server-side.
- Webhook (if supported) preferred over polling; verify signature.
