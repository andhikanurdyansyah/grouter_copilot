# Solution Architecture — gRouter Copilot

## 1. Overview

gRouter Copilot adalah **plugin in-process** di aplikasi customer, dengan **backend Copilot terpisah** untuk license authority.

```text
Aplikasi Customer (Node.js/Next.js)
│
├── Chat UI (widget)  ── client, TANPA key/license
│        │  POST /api/copilot/chat
│        ▼
├── Runtime (API route) ── server, pegang GROUTER_API_KEY + license
│        │  0. license gate (offline verify, wajib)
│        │  1. resolve skill
│        │  2. jalankan skill → data app
│        │  3. bangun context
│        ▼
│   gRouter Adapter ── panggil gRouter API (streaming)  ──► gRouter (20128, READ-ONLY)
│
└── Skills (developer-defined) ── akses DB/service app

        │  (best-effort heartbeat, tidak block)
        ▼
Copilot Backend (BARU, terpisah)
├── License server ── mint/revoke/validate license
├── Heartbeat endpoint ── hitung install, last-seen
└── Admin dashboard ── monitor license + install
```

## 2. Dua sistem terpisah

| Sistem | Peran | Disentuh? |
|---|---|---|
| **gRouter (port 20128)** | supplier AI (API key + model) | TIDAK — read-only |
| **Copilot backend** | license authority + dashboard | YA — ini produk baru |

## 3. License gate (D-008/D-010)

- **Offline:** plugin verifikasi Ed25519 signature terhadap public key embedded. App tetap jalan tanpa network.
- **Online (best-effort):** heartbeat ke license server untuk revocation + counting. Tidak pernah block normal operation (grace period).
- **Lock provider:** hanya menerima base-url + API key gRouter.

## 4. Trust boundaries

1. Browser → runtime app (chat).
2. Runtime → skills (data app).
3. Runtime → gRouter (AI) — server only, key gRouter di sini.
4. Runtime → Copilot backend (heartbeat) — license token, best-effort.

```text
Key gRouter + license: HANYA server-side. Browser tidak pernah menyentuh boundary 3/4.
```

## 5. Data flow

```text
User message
  → widget POST
  → runtime enforce license (offline)
  → resolve + run skill → data app
  → build context (redact + limit)
  → adapter → gRouter → stream jawaban
  → (async, best-effort) heartbeat ke Copilot backend
```

## 6. Reliability

- License offline → app tidak dependen pada license server.
- Heartbeat gagal → diabaikan (best-effort).
- gRouter down → `upstream_unavailable`, retry terbatas.
- Skill fail → error jelas.

## 7. Decisions

- Plugin in-process + backend license authority terpisah.
- Hybrid license validation.
- gRouter adapter = satu-satunya panggilan AI.
- Backend Copilot = JSON store (zero dependency) untuk MVP.
