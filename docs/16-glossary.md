# Glossary — gRouter Copilot

- **Copilot:** plugin/module `@grouter/copilot` + backend-nya; produk customer-facing (identitas, license, plan, entitlement, quota, usage).
- **gRouter:** AI infrastructure/provider gateway (`https://prod.grouter.web.id`) — model, routing, fallback, provider credentials, infra usage. Supplier Copilot, bukan bagian dari Copilot.
- **Service credential (D-021):** SATU `GROUTER_API_KEY` milik Copilot backend untuk mengakses gRouter; akses infrastructure, BUKAN identitas customer; hanya server-side.
- **Copilot quota:** batas pemakaian CUSTOMER per license/plan (dimensi Copilot). Tidak sama dengan infra usage gRouter.
- **Infra usage:** pemakaian gRouter per service credential (token/request/biaya provider) — dibaca read-only via `/check-usage`; mencakup trafik seluruh customer.
- **Usage ledger:** catatan pemakaian per license di Copilot (licenseId, requestId, model, usage, status) — dimensi customer (implementasi: GAP audit).
- **Skill:** developer-defined function yang mengekspos akses data.
- **Skill registry:** koleksi skill terdaftar + validator.
- **Runtime:** komponen server yang jalankan skill + panggil adapter (target D-021: runtime memanggil Copilot backend, bukan gRouter langsung dengan kredensial).
- **Widget:** chat UI client-side (tanpa key).
- **Adapter:** wrapper panggilan ke gRouter API (di Copilot backend; kredensial hanya di backend).
- **readOnly:** skill tidak mengubah data.
- **Context:** data dari `run()` + system prompt yang dikirim ke model.
- **Source:** label provenance (sumber/freshness) untuk jawaban.
- **Self-contained:** data aplikasi tetap di app customer (D-002); TIDAK berarti kredensial provider ikut di app customer (D-021).
- **init command:** `npx @grouter/copilot init` yang generate scaffold.
