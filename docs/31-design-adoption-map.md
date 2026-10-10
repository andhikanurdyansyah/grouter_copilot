# Design-to-Production Mapping — Google AI Studio Enterprise SaaS → gRouter Copilot

> Sumber: `/home/ubuntu/grouter-copilot-enterprise-saas.zip` (React 19 + TS + Vite + Tailwind 4, 26 file TSX, 6.042 baris).
> Prinsip: **adopsi desain, bukan mock backend.** Semua aksi produksi tetap lewat API + auth produksi.
> Prototype-only behaviors yang DIKECUALIKAN dari produksi: `handleCheckoutQris()` (instant-paid),
> `handleVerifyOrder()` (state lokal), `handleIssueLicense()` (fabrikasi ID), `handleRevokeLicense()` /
> `handleUpdatePackage()` (state lokal), ping infrastruktur timer-simulasi, mock identity/orders/usage,
> demo-mode + viewport emulator + state selector di GlobalHeader, SLA 99.98% fiktif.

## Admin Console

| # | Komponen ZIP | Rute produksi | Komponen produksi | Sumber data (API nyata) | Aksi | Auth | Adopsi & perbaikan |
|---|---|---|---|---|---|---|---|
| A1 | `AdminLayout.tsx` | `/admin/*` | `AppSidebar` + `sidebar-data.ts` | — (nav) + `fetchAdminStats` (badge pending) | navigasi | Bearer admin token | Kelompok nav 4 domain (Operations/Customer Mgmt/AI Governance/Platform), tema **dark slate-950 + teal** untuk admin saja, badge jumlah order pending, mobile drawer |
| A2 | `AdminOverview.tsx` | `/admin` | `features/admin/overview.tsx` | `/api/admin/stats`, `/api/admin/orders`, `/api/admin/licenses`, `/api/health`, `/api/admin/ledger` | verifikasi order → `/api/admin/orders/:id/settle` | Bearer | Health banner **honest** (dari `/api/health`, tanpa SLA fiktif), work queue severity, metrik pendukung |
| A3 | `AdminCustomersLicenses.tsx` | `/admin/licenses` | `features/admin/licenses.tsx` | `/api/admin/licenses`, `POST /api/admin/licenses`, `POST /api/admin/licenses/:id/revoke` | issue, revoke, copy | Bearer | Toolbar search/filter, tabel padat, dialog issue (validasi), revoke dengan konfirmasi ketik **CABUT**, semua via API nyata |
| A4 | `AdminLicenseDetail.tsx` | `/admin/licenses/$licenseId` (**BARU**) | `features/admin/license-detail.tsx` (**BARU**) | `/api/admin/licenses` (find by id), `/api/admin/ledger?licenseId=`, `/api/admin/orders` | revoke, copy, lihat ledger/order terkait | Bearer | Halaman detail dedicated: identitas, status, kuota terpakai, riwayat ledger + order, aksi revoke |
| A5 | `AdminPackagesPolicies.tsx` | `/admin/packages` | `features/admin/packages.tsx` | `GET/PATCH /api/admin/settings` (plans full-catalog) | simpan katalog (selalu daftar lengkap) | Bearer | Kartu per paket: komersial + kebijakan AI (enabled/provider/allowed/default/quota), default model terikat allowlist, unlimited eksplisit |
| A6 | `AdminOrdersReconciliation.tsx` | `/admin/orders` | `features/admin/orders.tsx` | `/api/admin/orders`, `POST /api/admin/orders/:id/settle` | verifikasi & settle (server re-verify upstream) | Bearer | Workspace rekonsiliasi: filter/status chips, detail order + timeline, settle jujur (409 ditampilkan apa adanya) |
| A7 | `AdminAiLedger.tsx` | `/admin/ledger` | `features/admin/ledger.tsx` | `/api/admin/ledger` (server-side pagination) | filter, quick-filter | Bearer | Ledger padat: timestamp jujur, token in/out, label error manusiawi, pagination X–Y dari Z |
| A8 | `AdminProviderUsage.tsx` | `/admin/usage` | `features/admin/usage.tsx` | `/api/admin/usage` | refresh | Bearer | Dimensi infrastruktur ≠ kuota customer; agregat per model; refresh nyata |
| A9 | `AdminInfraHealth.tsx` | `/admin/settings` | `features/admin/settings.tsx` | `/api/health`, `/api/admin/settings` | refresh (health polling) | Bearer | Health service nyata vs konfigurasi read-only; kredensial hanya state terpasang/•••• |

## Customer Console

| # | Komponen ZIP | Rute produksi | Komponen produksi | Sumber data (API nyata) | Aksi | Auth | Adopsi & perbaikan |
|---|---|---|---|---|---|---|---|
| C1 | `CustomerLayout.tsx` | `/user/*` | `AppSidebar` + `sidebar-data.ts` | — (nav) | navigasi | Sesi cookie (`/api/me` 401→login) | Tema **light + sky/primary**, nav 3 grup (MY COPILOT / SUBSCRIPTION / ACCOUNT), CTA "Perpanjang" di header |
| C2 | `CustomerOverview.tsx` | `/user` | `features/customer/overview.tsx` | `/api/me` (account+licenses+usage) | copy license, navigasi | Sesi | State-driven: baru/aktif/kuota-low/habis/pending/expired/revoked — semua turun dari data server, tanpa state selector demo |
| C3 | `CustomerInstallation.tsx` | `/user/install` | `features/customer/install.tsx` | `/api/me`, (verify = sinyal pemakaian nyata via usage) | copy ID | Sesi | Stepper + copy feedback; **tidak klaim terpasang** tanpa sinyal server |
| C4 | `CustomerAiUsage.tsx` | `/user/usage` | `features/customer/usage.tsx` | `/api/me` usage[] | perpanjang | Sesi | Ring/breakdown kuota lifetime; handle 0/null/unlimited tanpa div-by-zero |
| C5 | `CustomerPackagesRenewals.tsx` | `/user/orders` | `features/customer/orders.tsx` | `/api/plans` (harga server truth), `POST /api/orders` (packageKey saja) | beli via QRIS | Sesi | Kartu keputusan paket; harga 0/null = "Harga belum tersedia"/"Hubungi sales"; custom ≠ self-checkout |
| C6 | `CustomerOrders.tsx` | `/user/payments` (**BARU**) | `features/customer/payments.tsx` (**BARU**) | `GET /api/orders` (**BARU**, session-scoped), `GET /api/orders/:id` | lihat riwayat, status | Sesi | Riwayat order + status pembayaran nyata; pending → instruksi QRIS; **tanpa** fabricate paid |
| C7 | `CustomerProfile.tsx` | `/user/account` | `features/customer/account.tsx` | `/api/me`, sign-out Better Auth | sign-out | Sesi | Hanya kemampuan yang didukung auth (identitas + sign-out); tanpa password-change fiktif |

## Keputusan integrasi

1. **Shell & tema di produksi, bukan kopi App.tsx.** Routing produksi (TanStack Router) dipertahankan;
   ZIP hanya menyumbang komposisi + bahasa visual. Tema: admin = `.dark` scoped di layout admin,
   customer = light default. Token produksi (`theme.css`) tetap SSOT.
2. **Rute baru hanya bila fungsinya nyata:** License Detail (data ada di API admin) dan
   `/user/payments` (butuh `GET /api/orders` — ditambahkan sebagai endpoint read-only session-scoped,
   sanitasi sama seperti `/api/orders/latest`, + test).
3. **Rute lama tidak dihapus** (`/user/licenses` tetap ada untuk deep-link), hanya nav yang dirombak.
4. Tanpa dependency baru. Tanpa npm install. `motion`, `@google/genai`, express dari ZIP TIDAK diadopsi.
