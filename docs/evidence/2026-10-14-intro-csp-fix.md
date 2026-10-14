# Evidence — intro "stuck" (CSP memblokir CDN) & perbaikan

- **Date:** 2026-10-14 (UTC)
- **Host:** single dev+prod `/home/ubuntu/grouter_copilot`
- **Gejala (dilaporkan Jie):** halaman intro (`/`) "stuck" — tidak masuk ke landing.

## 1. Root cause (dibuktikan, bukan diasumsikan)

`server/src/frontendServer.js` mengirim CSP yang **hanya** mengizinkan
`https://cdn.tailwindcss.com` + `https://cdnjs.cloudflare.com` pada `script-src`.
Halaman intro memuat Three.js lewat importmap:

```html
<script type="importmap">
  {"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js"}}
</script>
<script type="module">
  import * as THREE from 'three';   // ← diblokir CSP
  ...
  async function boot() { ...; requestAnimationFrame(() => {
    document.getElementById('loading').classList.add('gone')   // ← tak pernah jalan
  }); }
  boot();
</script>
```

Karena `import * as THREE` diblokir CSP, seluruh modul gagal dieksekusi → `boot()`
tidak pernah dipanggil → overlay `.loading` tidak pernah diberi kelas `gone` →
halaman tampak menggantung/stuck dan transisi ke landing tidak terjadi.

CSP ini masuk lewat commit `0054235` (2026-10-12, "security headers"), **setelah**
intro/landing dibuat — jadi ini regresi yang tidak tertangkap.

## 2. Bukti terukur (Playwright, browser nyata)

| Observasi | Sebelum fix | Sesudah fix |
|---|---|---|
| `window.__ready` di `/` | `false` | **`true`** |
| `.loading` dapat `gone` | tidak | **ya** |
| Canvas WebGL | `300x150` (default, tak dirender) | **`1280x720`** |
| Bisa scroll? | ya (tapi tanpa render) | ya |
| Transisi ke landing | **tidak** | **ya** (`transitioned:true`) |
| CSP violation di `/` | **1** (`cdn.jsdelivr.net`) | **0** |
| Ikon landing render | 0 / 54 | **54 / 54** |
| CSP violation di `/copilot` | **14** | **0** |
| CSP violation di origin publik (`/` & `/copilot`) | ada | **0** |

Diuji juga lewat intercept header: mengganti CSP saja (tanpa mengubah body halaman)
sudah cukup membuat `__ready:true`, loader hilang, dan canvas ter-render — memastikan
CSP adalah satu-satunya penyebab.

## 3. Perbaikan

`server/src/frontendServer.js` — CSP `script-src` + `connect-src` diperluas **presisi**
(hanya origin yang benar-benar dipakai halaman statis):

- `script-src` += `https://cdn.jsdelivr.net` (three.module.js, unicornStudio.umd.js),
  `https://code.iconify.design` (iconify-icon, 55 ikon landing).
- `connect-src` = `'self'` + `https://api.iconify.design` `https://api.simplesvg.com`
  `https://api.unisvg.com` (data ikon) + `https://assets.unicorn.studio` (scene).

Bukan wildcard `https:` — daftar origin eksplisit hasil observasi request nyata.

Tambahan (P2): `script-src` += `https://static.cloudflareinsights.com` — edge
Cloudflare menyuntik beacon Web Analytics ke setiap pageview (bukan kode kita).
Tanpa origin ini, console produksi selalu menampilkan 1 CSP violation yang
menutupi error asli.

## 4. Regression test

`server/test/frontend-static-safety.test.js` diperluas: kini meng-assert
`script-src` memuat `cdn.jsdelivr.net` + `code.iconify.design` dan `connect-src`
memuat `api.iconify.design` + `assets.unicorn.studio`.

- **RED:** dengan header lama (stash fix) → `fail 1` (pesan menyebut origin yang hilang).
- **GREEN:** dengan fix → `pass 1`.

## 5. Verifikasi pasca-deploy

- Live local `/` dan `/copilot`: **0 CSP violation**, intro `ready:true`, transisi
  landing **berhasil**, 54 ikon + canvas `1797x899` dirender.
- CSP publik `https://copilot.grouter.id/` sudah memuat origin baru.
- Suite penuh: server **118/118**, root **117/117**.
- Fingerprint produksi **tidak berubah oleh test** (dibuktikan: hash
  `auth.sqlite` + `store.json` identik sebelum/sesudah suite dijalankan).

> Catatan: `auth.sqlite` pernah terlihat berubah hash di tengah sesi. Itu **bukan**
> kontaminasi test — diverifikasi field-by-field terhadap backup 06:17: perubahannya
> hanya `session.expiresAt`/`user.lastActiveAt` yang maju (aktivitas login nyata),
> dan menjalankan ulang seluruh suite tidak mengubah hash sama sekali.
