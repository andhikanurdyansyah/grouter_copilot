# Merilis @grouter/copilot ke npm

Dua jalur. Pilih **trusted publishing** untuk rilis rutin; jalur manual hanya
untuk keadaan darurat.

## Kenapa tidak ada lagi `npm publish` dengan token

Sejak changelog GitHub 2026-07-08, token granular dengan bypass-2FA kehilangan
kemampuan publish langsung. Surface-nya tinggal membaca paket privat dan
**staging**. Publish langsung dengan token dihapus penuh sekitar Januari 2027.

Rilis `0.1.0` sendiri lewat staged publishing + approval 2FA manusia. Itu bekerja,
tetapi setiap rilis butuh kehadiran manusia. Trusted publishing menghapus
kebutuhan itu.

## Jalur utama — trusted publishing (OIDC)

### Prasyarat, sekali saja

Di npmjs.com, buka paket `@grouter/copilot` → **Settings** → **Trusted
Publishing** → **Add publisher**, isi persis:

| Field | Nilai |
|-------|-------|
| Owner | `andhikanurdyansyah` |
| Repository | `grouter_copilot` |
| Workflow name | `publish.yml` |
| Environment | `npm-publish` |

Nilainya harus **persis** — npm memverifikasi klaim OIDC terhadap daftar ini. Satu
karakter beda dan publish ditolak.

### Soal checkbox "Allow npm publish"

Konfigurasi trusted publisher yang dibuat **setelah 3 September 2026** otomatis
hanya mengizinkan `npm stage publish`. `npm publish` langsung butuh centang
**Allow npm publish** secara eksplisit, dan `npm dist-tag` butuh centang
**Allow npm dist-tag**. Ketiganya izin terpisah.

Kalau kedua checkbox dibiarkan kosong, itu **tetap sah**: rilis akan di-stage
otomatis, lalu Anda menyetujuinya dengan 2FA. Workflow di repo ini sudah
menyesuaikan diri dengan keadaan itu (`npm stage publish`).

Kalau Anda ingin rilis benar-benar tanpa sentuhan manual, centang
**Allow npm publish**, lalu ubah satu baris di `.github/workflows/publish.yml`:

```yaml
run: npm stage publish . --access public
# menjadi
run: npm publish --access public --provenance
```

### Merilis

1. Bump versi di `package.json` dan commit.
2. Buat GitHub Release (tag `v<versi>`). Workflow `publish.yml` berjalan otomatis.
3. Workflow menjalankan root suite, memverifikasi metadata, memaket, memindai
   kredensial di dalam tarball, lalu `npm publish --provenance`.

Untuk mencoba tanpa menerbitkan, jalankan manual: **Actions → publish → Run
workflow** dengan `dry_run: true`. Itu menjalankan semua gate tanpa publish.

### Kalau gagal

| Gejala | Arti |
|--------|------|
| `403 ... id-token` atau `ENEEDAUTH` | Trusted publisher belum terdaftar, atau field-nya tidak persis sama |
| `403 ... bypass 2fa` | Workflow tidak memakai OIDC; pastikan `id-token: write` ada dan `npm publish` tidak diberi token |
| `E422` versi sudah ada | Versi di `package.json` belum di-bump |
| Gate "metadata" gagal | `package.json` kehilangan `repository`, jadi `private`, atau menambah dependency runtime |

## Jalur darurat — staged publishing manual

Dipakai kalau OIDC belum terdaftar dan rilis tidak bisa menunggu.

```bash
# 1. Stage. Tidak butuh 2FA.
npm stage publish . --access public

# 2. Lihat id-nya.
npm stage list

# 3. Setujui. Ini MEMINTA 2FA dan tidak bisa dibypass token.
npm stage approve <stage-id>
```

Prasyarat: **2FA harus aktif di akun**. Tanpa itu, `approve` menjawab
`404 staged version not found` padahal `GET` untuk id yang sama menjawab `200` —
pesan itu menyesatkan, penyebabnya gerbang 2FA, bukan id yang salah.

Jangan pakai `GET /-/npm/v1/user` untuk memeriksa status 2FA: endpoint itu
menjawab 403 untuk GAT apa pun.

## Verifikasi setelah rilis

Jangan percaya output CLI. Periksa registry:

```bash
curl -s https://registry.npmjs.org/@grouter%2Fcopilot | node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  const d=JSON.parse(s);
  console.log('latest:', d['dist-tags'].latest);
  console.log('shasum:', d.versions[d['dist-tags'].latest].dist.shasum);
});"
```

Lalu buktikan instalasi nyata di direktori kosong:

```bash
cd "$(mktemp -d)" && npm init -y >/dev/null
npm install @grouter/copilot@latest
npx grouter-copilot --version
npx grouter-copilot init
```
