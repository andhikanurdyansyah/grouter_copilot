# Bukti migrasi upstream gRouter → api.grouter.ai.id (2026-10-25)

- Probe: GET /api/check-usage → HTTP 200 (0.087s), name=CopilotGrouter, status=active, 35 model.
- Probe: POST /v1/chat/completions (glm-5.3-flash) → HTTP 200 (0.802s), body JSON+SSE framing.
- resolveSettings pasca-migrasi: prod & fresh-install → provider.baseUrl=https://api.grouter.ai.id, usage.checkUsageUrl=https://api.grouter.ai.id/api/check-usage (lihat file: URL benar https://api.grouter.ai.id/api/check-usage).
- URL final adapter (fresh): https://api.grouter.ai.id/v1/chat/completions (tunggal /v1).
- Live proses prod pasca pm2 restart: GET /api/admin/usage → 200, usage.status=active, daily.used=1/effectiveLimit=10000 (data real upstream baru).
- Suite: root 189/189 pass, server 249/249 pass, guard 11/11, cli-install 12/12.
- Gotcha D-029: seed .env lama `GROUTER_BASE_URL=…/v1` salah bentuk (adapter append /v1 sendiri); prod selamat karena store override + empty-string reset; fresh install akan 404 /v1/v1.
- Commit: 0993f6e (14 files, 67+/28-). Push ke origin MENUNGGU OK Jie.
- Catatan keamanan: service key gRouter sempat tampil di output tool saat inspeksi .env (grep pola salah) — pertimbangkan rotasi key di sisi gRouter.
