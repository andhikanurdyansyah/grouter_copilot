# Setup: KlikQRIS + Google OAuth

Panduan setup eksternal untuk gRouter Copilot. Semua nilai masuk ke `server/.env`.

---

## 1. KlikQRIS (dashboard merchant)

### Callback / Webhook URL

```
https://be.grouter.id/api/payment/klikqris/webhook
```

**Kenapa `be.grouter.id` (bukan `copilot.grouter.id`)?** Webhook itu server-to-server: KlikQRIS memanggil backend langsung. Backend ada di port 4600 → domain `be.grouter.id`. Frontend (`copilot.grouter.id`, port 4601) hanya untuk browser.

> Alternatif: frontend juga mem-proxy `/api/*` ke backend, jadi `https://copilot.grouter.id/api/payment/klikqris/webhook` juga sampai. Tapi pakai `be.grouter.id` saja — lebih langsung dan tidak bergantung pada frontend hidup.

### Redirect URL

```
https://copilot.grouter.id/user
```

**Kenapa `copilot.grouter.id`?** Redirect itu browser user (setelah bayar), jadi harus ke origin yang user lihat = frontend.

### Security (penting)

Server TIDAK mempercayai `status:"PAID"` dari body webhook. Setiap webhook `PAID` diverifikasi ulang lewat `GET {base}/qris/status/{order_id}` ke KlikQRIS; license hanya terbit kalau KlikQRIS mengonfirmasi `PAID`. Jadi webhook palsu tidak bisa menerbitkan license.

### Perubahan dari setup lama

Webhook URL lama masih memakai `be.grouter.id` → **tidak berubah**, tetap valid. Yang perlu dipastikan cuma dua nilai di atas sudah terisi.

---

## 2. Google OAuth (Google Cloud Console)

Login memakai Google hanya aktif kalau `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` terisi. Selama kosong, tombol Google otomatis disembunyikan di halaman register/login.

### Langkah

1. <https://console.cloud.google.com/> → buat/pilih project.
2. **APIs & Services → OAuth consent screen**: pilih *External*, isi nama app + email support. Tambahkan scope `.../auth/userinfo.email` + `.../auth/userinfo.profile`. Selama app belum diverifikasi Google, tambahkan akun lo sebagai **Test user**.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**
   - Name: `gRouter Copilot`
   - **Authorized JavaScript origins**
     ```
     https://copilot.grouter.id
     https://be.grouter.id
     http://localhost:4601
     ```
   - **Authorized redirect URIs** (Better Auth callback, server-side):
     ```
     https://be.grouter.id/api/auth/callback/google
     http://localhost:4600/api/auth/callback/google
     ```
4. Copy **Client ID** + **Client Secret** ke `.env`:
   ```
   GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-xxxx
   ```
5. Restart: `pm2 restart copilot-backend --update-env`
6. Cek: `curl https://be.grouter.id/api/config` → harus `{"providers":{"google":true}}`.
7. Buttons: halaman register/login akan otomatis menampilkan tombol "Lanjut dengan Google".

### Verifikasi cepat

```bash
# provider aktif?
curl -s https://be.grouter.id/api/config
# alur social sign-in menghasilkan URL OAuth Google?
curl -s -X POST https://be.grouter.id/api/auth/sign-in/social \
  -H 'content-type: application/json' -H 'Origin: https://copilot.grouter.id' \
  -d '{"provider":"google","callbackURL":"https://copilot.grouter.id/user"}'
# -> { "url": "https://accounts.google.com/o/oauth2/v2/auth?...", "redirect": false }
```

---

## 3. Better Auth Infrastructure (dash + sentinel) — SUDAH AKTIF

`BETTER_AUTH_API_KEY` mengaktifkan dua plugin dari `@better-auth/infra`:

| Plugin | Fungsi | Terverifikasi |
|---|---|---|
| `dash()` | Dashboard/analytics, user & session management, audit logs, activity tracking (`lastActiveAt`) | ✅ signup/signin tercatat |
| `sentinel()` | Security: credential stuffing, impossible travel, compromised password, **email validation (disposable block)**, bot/IP blocking | ✅ password bocor ditolak, email disposable ditolak |

Juga aktif: **`organization()`** (multi-tenant: organization, member, invitation, roles) — terverifikasi create org + owner member.

### Env vars (PENTING)

```ini
BETTER_AUTH_API_KEY=ba_...
BETTER_AUTH_API_URL=https://dash.better-auth.com
BETTER_AUTH_KV_URL=https://kv.better-auth.com
BETTER_AUTH_CLIENT_IP_HEADER=cf-connecting-ip
```

⚠️ **`BETTER_AUTH_KV_URL` WAJIB base URL `https://kv.better-auth.com`** — BUKAN URL project (`https://kv.better-auth.com/projects/<id>`).

URL `/projects/<id>` itu **halaman settings dashboard**, bukan API base. Plugin meng-append path ke `kvUrl` sendiri (`kvUrl` + `/email/validate`), jadi kalau diisi URL project, request jadi `.../projects/<id>/email/validate` → **404**, dan email validation diam-diam gagal (fallback "allow"). Gejala di log: `[Dash] Email validation unavailable ... 404`.

Project ID lo (`Yf8dlZvR6FClZZvhOm2iXk2dtAo1uUSj`) dipakai plugin dari **API key**, bukan dari URL — jadi cukup base URL.

### Verifikasi

```bash
# email validation (harus 200)
curl -s -X POST https://kv.better-auth.com/email/validate \
  -H 'content-type: application/json' -H "x-api-key: $BETTER_AUTH_API_KEY" \
  -d '{"email":"test@mailinator.com","strictness":"medium"}'
# -> {"valid":false,"disposable":true,...}
```

### Migration

Plugin dash (activity tracking) + organization menambah schema. Jalankan (idempotent, API built-in — tanpa `npx`):

```bash
node --input-type=module -e "
process.loadEnvFile?.('.env');
const { getMigrations } = await import('better-auth/db/migration');
const { auth } = await import('./src/auth.js');
await (await getMigrations(auth.options)).runMigrations();
"
```

Menambah: tabel `organization`/`member`/`invitation`, kolom `user.lastActiveAt`, `session.activeOrganizationId`.

---

## 4. Better Auth dashboard (better-auth.com)

Dashboard web ada di <https://dash.better-auth.com> (analytics, user/session management, org overview, audit logs). Project lo: `kv.better-auth.com/projects/Yf8dlZvR6FClZZvhOm2iXk2dtAo1uUSj` (settings page).

> `dashClient()` (plugin client-side) **tidak dipakai** di sini — frontend gRouter Copilot adalah reverse-proxy statis (`server/src/frontend.js`), bukan SPA React, jadi tidak ada auth-client JS. Sisi server (`dash()`/`sentinel()`) sudah meliput analytics + security.

---

## Checklist sebelum production

- [ ] `ADMIN_TOKEN` diisi (`openssl rand -hex 24`) — admin console sekarang menolak tanpa Bearer token.
- [ ] `KLIKQRIS_MODE=production` + key/mode produksi (sekarang `sandbox`).
- [ ] Webhook + Redirect URL di dashboard KlikQRIS sesuai di atas.
- [ ] `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` terisi + redirect URI terdaftar.
- [ ] `BETTER_AUTH_TRUSTED_ORIGINS` memuat `https://copilot.grouter.id`.
- [ ] `BETTER_AUTH_URL=https://be.grouter.id`.
- [ ] `curl https://be.grouter.id/api/config` → `providers.google: true` (kalau pakai Google).