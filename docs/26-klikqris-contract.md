# KlikQRIS API Contract

> Payment provider for gRouter Copilot. Verified against sandbox on 2026-09-30.

## Credentials

- `KLIKQRIS_API_KEY` — API key from dashboard.
- `KLIKQRIS_MERCHANT_ID` — merchant ID.
- `KLIKQRIS_MODE` — `sandbox` or `production`.

## Base URL

```
https://klikqris.com
```

(Note: the reference repo's `api.klikqris.com` does NOT resolve; the live base is `https://klikqris.com`. The working path is `/api/qris/...`.)

## Auth headers (all requests)

```
x-api-key: <api_key>
id_merchant: <merchant_id>
Content-Type: application/json
```

## Endpoints

### Create QRIS

```
POST /api/qris/create
{ "order_id": "...", "amount": 10000, "id_merchant": "...", "keterangan": "..." }
```

Response:
```json
{ "status": true, "data": { "order_id": "...", "amount": 10000, "qris_image": "...", "qris_data": "...", "expired_at": "..." } }
```

### Check status

```
GET /api/qris/status/{order_id}
```

Response:
```json
{ "status": true, "data": { "payment_status": "paid" } }
```

`payment_status`: `pending` | `paid` | `expired` | `failed`.

## Error envelope

```json
{ "status": false, "message": "..." }
```

Common error: `"Unauthorized: Invalid API Key or Account Inactive"` (HTTP 401) — means the sandbox/production key is not yet activated in the dashboard, or the account is inactive.

## Webhook signature

HMAC-SHA256 over the sorted JSON payload using the API key (verify against official docs at activation).

## Flow

```text
customer pilih paket
  → create_qris(order_id, amount) → QR
  → customer scan bayar
  → poll check_status (10s) or webhook
  → payment_status "paid" → issue license
  → expired/failed → cancel order
```

## Safety

- API key NEVER in frontend, never committed (`.env`, gitignored).
- Poll lightly (avoid aggressive auto-poll to prevent key blocking).
- Prefer webhook when available; poll as fallback.
