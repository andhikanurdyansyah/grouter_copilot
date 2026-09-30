# Plugin/Skill Review Checklist

- [ ] Skill `name` unik.
- [ ] `description` jelas untuk intent.
- [ ] `parameters` valid JSON Schema.
- [ ] `readOnly` akurat.
- [ ] `run()` tidak return secret/key/PII sensitif.
- [ ] `run()` scope per user.
- [ ] Tidak ada auto-SQL/URL dari model.
- [ ] Error aman (tanpa stack/key/provider).
- [ ] Limit row/byte/token diterapkan.
- [ ] Bundle browser tidak mengandung key.
- [ ] Mutating skill (jika ada) punya confirmation + audit + idempotency.
- [ ] Test adversarial & scope pass.
