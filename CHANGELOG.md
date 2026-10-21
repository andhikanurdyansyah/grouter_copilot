# Changelog

Semua perubahan yang layak dicatat untuk paket `@grouter/copilot`.
Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.1.0/),
versi mengikuti [SemVer](https://semver.org/lang/id/).

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
