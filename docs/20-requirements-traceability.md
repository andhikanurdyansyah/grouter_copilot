# Requirements Traceability — gRouter Copilot

## P0 requirements

| ID | Requirement | Evidence |
|---|---|---|
| R-001 | Plugin install satu command | init command + clean-install test |
| R-002 | Developer-defined skills | skill registry + validator |
| R-003 | Chat dari data aplikasi | skill execution + context |
| R-004 | AI consume key gRouter | adapter + self-contained key |
| R-005 | Key tidak ke browser | bundle scan test |
| R-006 | Read-only default | readOnly enforcement |
| R-007 | Tanpa backend Copilot | in-process runtime |
| R-008 | gRouter = supplier (tidak disentuh) | adapter boundary + no source dep |
| R-009 | Jawaban grounded (source/freshness) | source metadata + display |
| R-010 | Error jelas & aman | error taxonomy + redaction |
| R-011 | Cost terkontrol | limit context + budget |
| R-012 | Semver & protokol stabil | versioning + contract test |

## Exit criteria (development start)

- [ ] Setiap P0 punya acceptance test.
- [ ] Setiap P0 punya failure response.
- [ ] Adapter contract stabil untuk di-fake di CI.
- [ ] Skill contract + chat protocol disetujui.
- [ ] Tidak ada P0 yang bergantung keputusan belum terkunci.
