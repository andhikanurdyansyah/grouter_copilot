# CONTRACT — examples/mini-crm-copilot (mandat demo CRM)

HEAD basis: 8654999. Semua path relatif `examples/mini-crm-copilot/`.

## Stack (LOCKED)
- Node >= 20, Express 4 (satu-satunya dependency runtime tambahan)
- Data: `data/crm.json` (gitignored; `seed.js` men-generate deterministik)
- Port: 4602 (env `DEMO_PORT` override). JANGAN sentuh 4600/4601.
- Frontend: `public/` vanilla JS (tanpa build step), dark-neutral, responsive.

## Data schema (LOCKED — seed.js & lib/db.js share)
- customer: `{ id 'cus_XXX', name, company, email, phone, segment 'retail|smb|enterprise', status 'active|churned|prospect', createdAt }`
- lead: `{ id 'lead_XXX', name, company, source, status 'new|contacted|qualified|unqualified|lost', score 0-100, createdAt }`
- deal: `{ id 'deal_XXX', customerId, title, value (IDR int), stage 'discovery|proposal|negotiation|won|lost', expectedClose ISO, createdAt }`
- activity: `{ id 'act_XXX', customerId, type 'call|email|meeting|note', note, at ISO, sentiment 'positive|neutral|negative' }`
- Jumlah: 42 customers, 26 leads, 14 deals, >=60 activities. Seeded RNG (reproducible).

## API CRM (LOCKED)
- GET /api/customers?q=&status= -> { customers }
- GET /api/customers/:id -> { customer, deals, activities }
- GET /api/leads?status= / GET /api/deals?stage= / GET /api/activities?limit=
- GET /api/overview -> { totalCustomers, activeCustomers, openDeals, openValue, leadsByStatus, dealsByStage }
- POST /api/leads/:id/status { status } -> { lead }  (SATU-SATUNYA write)
- POST /api/reset (dev only, re-seed)
- Static: / public/index.html, /app.js, /styles.css

## Copilot integration (LOCKED)
- copilot.config.js: model 'grouter-default', systemPrompt Indonesia (jawab HANYA dari data), skills list, limits { maxRows:200, maxContextBytes:24000, maxTokens:1200 }
- skills/ (semua readOnly:true): crm-overview.js, find-customer.js, customer-detail.js, pipeline.js, draft-followup.js, lead-update-proposal.js (menghasilkan PROPOSAL, tidak menulis)
- Use case 6: proposal dari Copilot -> tombol konfirmasi di panel -> POST /api/leads/:id/status -> UI update. Tidak ada auto-eksekusi.
- Server route: POST /api/copilot/chat -> gatewayChat({ runtime, gatewayUrl: env.GROUTER_GATEWAY_URL, message, userId: 'demo-user', ...body })
- .env gitignored: GROUTER_LICENSE, GROUTER_LICENSE_SERVER, GROUTER_GATEWAY_URL, GROUTER_LICENSE_PUBLIC_KEY. .env.example tanpa nilai.
- Widget: panel demo `public/copilot-panel.js` (view ringan) memanggil endpoint /api/copilot/chat YANG SAMA dengan widget produk; widget JSX produk tetap untuk Next path (diodokumentasikan). Panel wajib berlabel 'Copilot (demo panel)'.
- Health: GET /api/copilot/health via getCopilotHealth(copilot, env.GROUTER_LICENSE)

## Instalasi lisensi (LOCKED — local-dev, registry belum publish)
`node ../../bin/grouter-copilot.js install --license <TOKEN> --license-server https://copilot.grouter.id`
Dokumentasikan EKSPLISIT: ini mode local-dev; npx @grouter/copilot (registry) belum tersedia. Jangan menyamarkan.

## Testing (LOCKED)
- test/integration.test.js: CRM API contract + skills offline (mock gateway)
- e2e/journey.mjs: playwright Stage A-E + use cases (live AI bila env DEMO_LICENSE ada)
- Reset kapan pun: `node seed.js`
