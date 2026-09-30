# KlikQRIS API Contract

> Payment provider for gRouter Copilot. **Verified against LIVE sandbox 2026-10-01.**

## Credentials (env, never committed)

- `KLIKQRIS_API_KEY` — API key.
- `KLIKQRIS_MERCHANT_ID` — merchant ID.
- `KLIKQRIS_MODE` — `sandbox` or `production`.

## Base URL (per mode)

```
sandbox:    https://klikqris.com/api/sandbox
production: https://klikqris.com/api
```

## Auth headers (all requests)

```
x-api-key: <api_key>
id_merchant: <merchant_id>
Content-Type: application/json
```

## Endpoints

### Create QRIS

```
POST {base}/qris/create
{ "order_id": "...", "amount": 10000, "id_merchant": "...", "keterangan": "..." }
```

Response (verified):
```json
{
  "status": true,
  "message": "Transaction Created Successfully",
  "data": {
    "order_id": "copilot-test-001",
    "nama_toko": "GetMarket",
    "amount": "10000.00",
    "amount_uniq": "825.00",
    "total_amount": "10825.00",
    "status": "PENDING",
    "qris_url": "https://klikqris.com/storage/sandbox/sandbox_sample.png",
    "qris_image": "data:image/png;base64,...",
    "expired_at": "2026-10-01 02:55:45",
    "paid_at": null,
    "signature": "SANDBOX_SIG_...",
    "expired_menit": "60"
  }
}
```

### Check status

```
GET {base}/qris/status/{order_id}
```

Response: same envelope; `data.status` = `PENDING` | `PAID` | `EXPIRED` (possibly `FAILED`).

## Webhook

KlikQRIS sends a webhook to a configured **callback URL** on status change.
Expected payload contains `order_id` + `status`. Our endpoint:
`POST /api/payment/klikqris/webhook`.

## Error envelope

```json
{ "status": false, "message": "..." }
```

401 + "Invalid API Key or Account Inactive" = wrong mode base URL, wrong key, or inactive account.

## Flow (implemented)

```text
POST /api/orders {accountId, packageKey, amount}
  → KlikQRIS create → order PENDING (QR returned)
customer pays
  → webhook POST /api/payment/klikqris/webhook {order_id, status: PAID}
  → settlePaid → issue license (bound to accountId)
```

## Notes

- Callback URL must be reachable (Cloudflare Tunnel → localhost:4600).
- Server reads `.env` via `server/src/loadEnv.js` (zero-dependency).
- API key NEVER in frontend, never committed.
