# Glossary — gRouter Copilot

- **Copilot:** plugin/module `@grouter/copilot`.
- **gRouter (existing):** supplier AI; menyediakan API key + model. Tidak bagian dari Copilot.
- **Skill:** developer-defined function yang mengekspos akses data.
- **Skill registry:** koleksi skill terdaftar + validator.
- **Runtime:** komponen server yang jalankan skill + panggil gRouter.
- **Widget:** chat UI client-side (tanpa key).
- **Adapter:** wrapper panggilan ke gRouter API.
- **readOnly:** skill tidak mengubah data.
- **Context:** data dari `run()` + system prompt yang dikirim ke model.
- **Source:** label provenance (sumber/freshness) untuk jawaban.
- **Self-contained:** key & config di app customer, tanpa backend Copilot.
- **init command:** `npx @grouter/copilot init` yang generate scaffold.
