## [0.2.1] - 2026-10-22

### Fixed
- `serve --port <n>` diabaikan diam-diam (parseFlags tidak mengenal `--port`,
  `--gateway-url`, `--config`) → selalu memakai 4700 dan bentrok EADDRINUSE
  saat dijalankan dua kali. Ditemukan lewat smoke test install dari registry.

# Changelog

Semua perubahan yang layak dicatat untuk paket `@grouter/copilot`.
Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.1.0/),
versi mengikuti [SemVer](https://semver.org/lang/id/).

## [0.2.0] - 2026-10-22

### Added — Sidecar mode: zero-code embed for ANY stack (Java, PHP, Python, Rails, Go, static HTML)
- `grouter-copilot serve` — standalone sidecar server (node:http, zero deps) exposing
  `POST /api/copilot/chat`, `GET /api/copilot/health`, and a **prebuilt embed widget**
  (`/copilot.js`, `/copilot.css`).
- Framework-agnostic embed widget (vanilla JS, no React/build): floating ✦ bubble,
  first-run setup wizard (health check → remembered in localStorage), chat panel with
  sources + honest errors, ID language, mobile-first dark cyan theme — parity with the
  React widget contract.
- Integration for non-Node hosts = **one `<script>` tag + one `<link>` tag**, zero host
  code changes. Copy-paste snippet printed by `serve`.
- Endpoint defaults follow the script origin (sidecar); override via `data-endpoint` /
  `data-health-endpoint` for same-origin proxies.
- CORS: closed by default; explicit allowlist via `GROUTER_SIDECAR_ALLOWED_ORIGIN`
  (no wildcard on API routes by design).
- `scripts/build-widget.js` (`npm run widget:build`); `dist-widget/` packaged via `files`.
- `test/sidecar.test.js` — 9 tests: health, chat happy/400/502/malformed, CORS default
  closed + allowlist, widget serving, 404 envelope.

### Verified live
- Sidecar demo (`copilot.config.cjs` + example skill) with a real production license:
  health `{license:true,skills:true,provider:true}`, real gateway chat answered in-widget
  (visual QA via headless browser on a plain HTML host page — bubbles, wizard, answer).

## [0.1.2] — 2026-10-22

Tiga cacat yang membuat pemasangan baru tidak bisa dipakai. Ketiganya ditemukan
dengan memasang paket dari npm dan menjalankan widget-nya sungguhan, bukan lewat
test unit.

### Fixed

- **First-run wizard tidak pernah bisa diselesaikan.** `getCopilotHealth()`
  membaca `GROUTER_LICENSE_SERVER`, padahal installer menulis
  `GROUTER_GATEWAY_URL` — variabel yang sama yang dipakai route chat. Akibatnya
  `provider` selalu `false`, widget menampilkan "Tidak tersedia", dan tombol
  "Mulai bertanya" memeriksa ulang health, gagal, lalu melempar pengguna kembali
  ke langkah 2 tanpa penjelasan — berulang. Health kini membaca variabel yang
  sama dengan route: `GROUTER_GATEWAY_URL`, lalu `GROUTER_LICENSE_SERVER`.

- **Error asli ditelan.** Route chat yang di-scaffold mengubah **setiap**
  kegagalan menjadi `UPSTREAM_UNAVAILABLE` / "Unable to reach the Copilot
  gateway". Kegagalan konfigurasi lokal — verifier lisensi belum diset
  (`NOT_CONFIGURED`), body tidak valid (`INVALID_REQUEST`) — dilaporkan seolah
  jaringan yang bermasalah, sehingga operator mengejar penyebab yang salah.
  Envelope kini mempertahankan `code`, `message`, dan `retryable` asli dari
  `CopilotError`; `NOT_CONFIGURED` memetakan ke HTTP 500, bukan 502. Kegagalan
  jaringan asli tetap 502.

- **Wizard berbohong di langkah 3.** Langkah 2 menampilkan Server/Provider
  "Belum", lalu langkah 3 menulis "Semua sistem siap". Langkah 3 kini mengikuti
  hasil pemeriksaan yang sebenarnya.

### Added

- Ketika "Mulai bertanya" ditolak, wizard menyebutkan **pemeriksaan mana** yang
  belum lolos (`Belum bisa mulai — periksa: Server, Provider.`) alih-alih diam
  dan kembali ke langkah 2.

## [0.1.1] — 2026-10-21

### Changed

- Paket kini diterbitkan langsung dari GitHub Actions lewat trusted publishing
  (OIDC) dengan `--provenance`. Setiap rilis membawa attestation provenance yang
  mengikat tarball ke commit dan workflow yang menghasilkannya.
- Rilis tidak lagi berhenti menunggu approval 2FA manual: izin *Allow npm
  publish* pada trusted publisher sudah aktif dan terbukti.

### Catatan

Isi runtime (`bin/`, `src/`) **identik dengan 0.1.0**. Rilis ini tidak mengubah
perilaku apa pun bagi pemakai paket; satu-satunya perbedaan yang bisa
diverifikasi adalah provenance attestation dan nomor versi. Ini disengaja:
0.1.0 diterbitkan lewat staged publishing tanpa provenance, jadi rilis pertama
yang membawa attestation harus punya nomor versi sendiri.

## [0.1.0] — 2026-10-19

Rilis pertama. Plugin copilot berbasis lisensi untuk aplikasi Node.js:
aktivasi lisensi, skill read-only yang dideklarasikan eksplisit, dan widget
in-app.
