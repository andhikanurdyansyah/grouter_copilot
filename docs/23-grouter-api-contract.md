# gRouter API Contract (read-only consumption)

> Verified against production `https://prod.grouter.web.id` on 2026-09-30. This documents what Copilot consumes. Copilot NEVER writes to gRouter.

## Endpoint: Check Usage

```
GET https://prod.grouter.web.id/api/check-usage?key=<gRouter-api-key>
```

No auth header needed — the api key is passed as the `?key=` query param.

## Response contract

| Field | Type | Meaning |
|---|---|---|
| `key` | string | masked key (e.g. `gRouter••••••••••••4a45`) |
| `name` | string | key name (e.g. `commerce-ORD-...`) |
| `status` | `"active"` / `"expired"` / disabled | key state |
| `models` | string[] \| null | allowed catalog model names (buyer-facing only) |
| `modelCatalog` | `{modelId, multiplier, contextWindowTokens}[]` | catalog metadata |
| `integration.baseUrl` | string \| null | e.g. `https://prod.grouter.web.id/v1` |
| `integration.chatCompletionsUrl` | string \| null | `.../v1/chat/completions` |
| `usage.tokens` | number | tokens used this month |
| `usage.limit` | number \| null | monthly token limit |
| `usage.remaining` | number \| null | limit − used |
| `usage.percentage` | number \| null | 0–100 |
| `daily` | `{dateKey, resetAt, used, baseLimit, addOn, effectiveLimit, remaining}` \| null | daily request limit |
| `fairUse` | `{level, actionable, retryAfter?}` \| null | customer-facing fair-use level |
| `subscription` | `{packageName, expiresAt}` \| null | package + expiry |
| `concurrency` | null | not provided yet |
| `byModel` | array | per-model usage |
| `requestLog` | `{items, page, pageSize, total, hasMore}` | paged request log |
| `expiresAt` | string \| null | ISO |
| `requests` | number | request count this month |

## Chat completions (for the plugin adapter)

```
POST {baseUrl}/v1/chat/completions
Authorization: Bearer <gRouter-api-key>
{ model, messages, max_tokens?, stream? }
```

`baseUrl` is obtained from `/check-usage` → `integration.baseUrl` (or configured).

## Key facts

- Api key prefix: `gRouter-...` (not `sk-`). Example shape: `gRouter-<machine>-<id>-<crc>`.
- Key is bound to a package (quota) and a set of allowed catalog models.
- `/check-usage` is public (no auth beyond the key itself).
- The key value is a secret: never log, never expose to browser, never embed in license tokens.

## Notes for Copilot

- Copilot consumes this READ-ONLY for quota display in its dashboard.
- Copilot maps its own `licenseId → gRouter api key` (server-side secret).
- Auto-provisioning (generate api key) is a SEPARATE, not-yet-mapped endpoint — deferred.
