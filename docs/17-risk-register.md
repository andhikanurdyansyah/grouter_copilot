# Risk Register — gRouter Copilot

| ID | Risk | Likelihood | Impact | Mitigation | Trigger |
|---|---|---:|---:|---|---|
| R-01 | Key gRouter bocor ke browser | Medium | Critical | server-only, bundle scan test | key di bundle |
| R-02 | Prompt injection via data app | High | High | untrusted data, skill allowlist, read-only | eval failure |
| R-03 | Skill baca data berlebih | High | High | developer-defined + limit + lint | scope leak |
| R-04 | Auto-scan disalahpahami "baca semua" | Medium | High | helper only, butuh approval | auto-expose tanpa izin |
| R-05 | gRouter down / limit | Medium | Medium | adapter error + retry terbatas | upstream unavailable |
| R-06 | Adopsi rendah (install sulit) | High | High | init command + docs + sample | abandonment |
| R-07 | Mutating skill terlalu dini | Medium | High | gate + confirmation + audit | write tanpa izin |
| R-08 | Protokol skill tidak portabel | Medium | Medium | extract core sebelum multi-bahasa | drift antar bahasa |
| R-09 | Overpromise "baca seluruh data" | High | High | positioning skill layer terkontrol | objection keamanan |
| R-10 | Backend Copilot ditambah prematur | Low | Medium | tunda sampai dibutuhkan | complexity creep |
