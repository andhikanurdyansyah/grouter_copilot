# gRouter Copilot — Project Memory (terpisah dari gRouter)

> Memory ini hidup DI DALAM workspace Copilot (`/home/ubuntu/grouter_copilot/`), terisolasi dari
> memory gRouter (profile grouter-dev). Fakta gRouter TIDAK boleh tercampur ke sini,
> dan fakta Copilot TIDAK boleh masuk ke memory gRouter.

## START DI SINI

- **Terminologi landing terkunci:** “intro page” berarti `server/public/intro.html`, yaitu halaman pembuka yang sebelumnya berasal dari `comingsoon`. “Landing” berarti halaman produk utama Commandlayer di `https://copilot.grouter.id/copilot`; secara product-flow ini adalah root landing, sedangkan `/` tanpa query menyajikan intro terlebih dahulu. Intro scroll sampai bawah lalu same-origin `location.replace()` menuju `/copilot`.

- **Baca `docs/handoff-2026-10-09.md` DULU** (terbaru: D-021 AI gateway + Linux = source of truth dev & production).
  Baseline lama: `docs/handoff-2026-10-02.md` (UI v3), `docs/handoff-2026-10-01.md` (safety rules + gotcha §8 masih berlaku).
- Docs = source of truth. Beberapa doc MASIH STALE — lihat @section "Docs stale" di bawah.
- **Landing = SCRUB CUT (2026-10-03 malam, commit `fce6aff`):** sequence video 300 frame (ezgif, 1920×1080, asal `Downloads/landing-bot`, copy project root + served di `server/public/assets/landing-bot/`) di-scrub canvas ala Apple mengikuti scroll. `landing.html` + `landing.css` + `landing.js` (cache-buster `?v=g1`): journey 4 babak (hero/produk/ask/arch, class `.jch`) mengambang di atas canvas + komponen GROUND (bento fitur 5 kartu, chat panel, pricing 3 kartu dari `/api/plans`, final CTA giant) di atas frame 300 ambient. Kalibrasi terukur: `data-frame` 5/95/195/295 = posisi copy-center tiap babak (progres dihitung dari journey-only, ground membekukan frame). Preseden versi lama: backup stage-cut v3 di `server/public/_backup-landing-stagecut-f3/` (belum commit), scroll-world v6 superseded. Gotcha baru: (1) `display:grid` class mengalahkan atribut `hidden` → guard `[hidden]{display:none!important}` WAJIB; (2) flex-item dengan max-width BISA menyusut di bawah max-width oleh flex-shrink → `flex:none;width:100%` di `.jch .arch-copy` (flow 5 node wrap 2 baris tanpa itu); (3) kalibrasi frame: ukur `copyCenterAbs` aktual dulu, jangan tebak; (4) `data-frame` hanya dokumentasi QA — frame aktual dari progress scroll.
- **Landing v2 = CINEMATIC GLASS (2026-10-03, commit `e8efcbf`, feedback Jie: storytelling kurang jelas / feel scroll belum sempurna / component belum menyatu dengan color):** re-tint penuh midnight teal + ice-cyan `#7ed6f3` (selaras warna sequence, bukan hitam asing); headline serif editorial (Iowan/Palatino stack) dengan kata aksen `.orb` italic + ring orbit; scrim gradasi KIRI di `.scrub-vignette` (copy kontras, visual kanan bernafas — ganti panel glass per babak); 4 babak bernomor (`.ch-meta` 01–04 + `.ch-cap` caption sinematik italic); pagination babak fixed 01–04 + garis ice-cyan (klik lompat babak) + `.v-tags` vertical + `.scroll-hint`, semuanya auto-fade via `body.jch-ui-off` (toggle di updateTarget saat p≥0.985); tombol pill (primary ice / white / glass / outline); bento+chat+pricing teal glass; `.ground::before` fade bridge. Hero = tepat 100vh (metrics utuh di viewport pertama, caption hero absolut kiri-bawah). Cache-buster `?v=g2`.
- **Landing v3 = 3D CARDS + NO GIANT (2026-10-03, commit `7caf9bd`, polish Jie):** giant outline word DIHAPUS PO (hero + final — jangan reintroduce); final CTA = `.halo` cyan radial + ellipse; headline gradient ice (`background-clip:text` putih→`#bfe2f2`); `.orb` inline-block fill ice; muted/faint dinaikkan kontras ke tone teal. `.card3d` di SEMUA kartu termasuk plan hasil fetch — **event delegation** (pointerover/move/out + closest), konten melayang translateZ per-layer, tilt 9° + scale 1.015 + sheen `--sx/--sy`; entrance kartu tanpa blur (filter mem-flatten preserve-3d — non-card saja yang blur→sharp). Premium scroll = canvas breathing (kamera push-in per babak 1.03→1.08 + drift ±3.2%, lerp 0.06). Cache-buster `?v=g3`. QA harness: tab mati random → `ensure_real_tab()` + `new_tab()` ulang; screenshot mid-scroll = "overlap" palsu di bawah nav fixed transparan (ukur navBottom vs elemen sebelum panik).
- **Landing v4 = KINETIC (2026-10-04, commit `49b41cf` — CURRENT):** smooth scroll physics Lenis-style tanpa library (virtual wheel + lerp eksponensial; `scrollBehavior:auto` = virt aktif), kinetic title card `.kine` antar babak (kata `.kw` menyala progresif ala film title), babak 02 flip (copy kanan + `.ch-bignum` kiri = rhythm kiri-kanan), bignum parallax depth cue semua babak. Cache-buster `?v=g5`. Gotcha alpha berlapis: stroke `rgba(...,.16)` × opacity `.5` (override mobile) = alpha efektif ~.08 → tenggelam di frame gyroscope; fix `.85` ≈ desktop. CDP wheel TIDAK menggerakkan virtual scroll — pakai `dispatchEvent(new WheelEvent("wheel",{deltaY}))`; bukti lerp gradual butuh frame pumping via screenshot berulang (rAF tab QA ter-throttle saat hidden).
- **Landing IGLOO = DRAFT terpisah (2026-10-04, commit `0410056`), rute `/landing-igloo` — MENUNGGU REVIEW JIE, bukan landing utama:** estetika igloo.inc (inspeksi live: arctic monokrom, iglo balok-es glow dari dalam, HUD monospace 4 sudut, salju/fog). Engine `landing-igloo.js` + three.js vendored: kubah = CylinderGeometry sector per balok (pintu = skip balok dasar theta≈PI/2), bloom murah = 2 sprite additive (core putih + halo luas) + PointLight dalam, kamera orbit-ikut-scroll (p=progress dokumen), reduced-motion = render statis on scroll. **Route `/landing-igloo` di frontendServer.js BELUM ter-commit** (file itu juga memuat perubahan sesi sibling — jangan commit campur). Kalau Jie OK jadi landing utama: hapus draft-chip, pindahkan route `/` , commit route bersama.
- **Landing SAAS = DRAFT terpisah (2026-10-04, commit `403009a`), rute `/landing-saas` — MENUNGGU REVIEW JIE:** bahasa desain terukur dari linear.app (bg #08090a, surface #0f1011, border #23252a — elevasi via border bukan shadow; fg #f7f8f8/#8a8f98; SATU aksen #22d3ee; headline 600 tracking-tight; mono Fira Code; anti-pattern: tanpa gradient purple-pink, tanpa tilt card, tanpa shadow). Hero 3D starfield + core icosa dengan **BLOOM SUNGGUHAN** — three-addons r164 vendored di `assets/vendor/three-addons/` (EffectComposer+UnrealBloomPass+OutputPass, import 'three' di-rewrite ke path vendored; 0.164.0 HARUS match dengan three.module.min.js r164). Pola dari skill `threejs/*` (diinstal dari CloudAI-X/threejs-skills ke profil skills/threejs/). Render hero-only via IO gate; glow per section = .glow-sect.lit via IO. **Route `/landing-saas` juga BELUM ter-commit** (satu file frontendServer.js dengan sibling changes). Jika jadi landing utama: hapus draft-chip, route `/`, commit route.
- **Landing STORY = DRAFT aeronet-style (2026-10-04, commit `2e83688` + tema AI `4cbf323` + depth `cbdcfe7`), rute `/landing-story` — MENUNGGU REVIEW JIE:** arsitektur PERSIS aeronet.id hasil recon live — SATU canvas WebGL fixed persisten + layer copy fixed crossfade per babak + spacer track kosong (7× sp-0..sp-6) = sumber progress; kamera 7 STOPS di-lerp kontinyu oleh scrollY. Bloom sungguhan (three-addons vendored). **Tema objek AI/automation (feedback Jie "tema dengan product belum pas"): chip AI di papan sirkuit (die+pin+jejak+pulsa) → kepala bot (mata kedip, beacon) → orb asisten + bot mini companion + waveform + aliran Q/A → rak server + padlock.** **Depth & realism (feedback "lebih deep, real, 3D"): env map procedural PMREMGenerator (refleksi PBR), lantai receiveShadow + GridHelper perspektif, shadow PCFSoft + sun directional ikut kamera per frame, roundedBoxGeo() bevel (chip/bot/visor-clearcoat/rack/padlock — solid tanpa wireframe edges), objek diturunkan ke lantai (FLOOR_Y=-2.1) ter-anchor bayangan kontak, 18 drifter bevel parallax, mouse parallax desktop (lerp .04).** Mobile: kamera mundur +1.6 + look.y +1.45 (objek di sepertiga bawah, bebas kartu). Gotcha: metalness tinggi + rim light = klaster sparkle membloom; sisi cermin formula vektor WAJIB dinégasi; mobile look TIDAK digeser = objek terpotong FOV sempit. QA: intro 7/10, semua babak PASS desktop+mobile. **Route `/landing-story` di frontendServer.js BELUM ter-commit** (satu file dengan sibling changes). Jika jadi landing utama: hapus draft-chip, route `/`, commit route.

## Identitas & boundary

- gRouter Copilot = product BARU, terpisah total dari gRouter existing (port 20128).
- gRouter existing = supplier AI (API key + model). HANYA read-only (consume `/api/check-usage`).
- Repo: `https://github.com/andhikanurdyansyah/grouter_copilot` (branch `main`).
- Workspace: `/home/ubuntu/grouter_copilot/`. Memory ini file manual (`MEMORY.md`), TIDAK auto-load.

## Keputusan kunci (lihat docs/15-decision-log.md)

- Plugin, bukan platform SaaS (D-001). License-based, NOT open-source (D-008).
- 1 credential customer = LICENSE KEY; api key gRouter di-resolve server-side (D-014).
- Api key TIDAK di-embed di token license (D-015). Auto-provisioning DEFERRED (D-016).
- 1 akun = banyak license (D-017). Payment = KlikQRIS (D-018). Google OAuth (D-019).
- **D-020 — Runtime config SSOT: `DEFAULT_SETTINGS <- env seeds <- store.settings`.**
  Env = seed saja; admin panel menulis ke store. **Tidak boleh hardcode configurable value.**
  Cost-integrity: harga order WAJIB resolve server-side dari plan, jangan percaya `body.amount`.

## Arsitektur (AKTUAL — SINGLE origin)

- **Frontend** port 4601 → `copilot.grouter.id` (landing, register, user, admin; proxy `/api/*`).
- **Backend** port 4600 (TIDAK publik) — auth Better Auth, `/api/me`, orders, webhook, admin.
- `be.grouter.id` **SUDAH TIDAK DIPAKAI**. pm2: `copilot-backend` + `copilot-frontend`.
- Boot: Startup folder `.vbs` → `pm2 resurrect`.

```text
Plugin (in-process) → skill → data app → gRouter adapter → gRouter (read-only)
                 → license gate (offline Ed25519) + heartbeat (best-effort)
Copilot backend  → license server (mint/revoke/resolve/handoff)
                 → usage resolver (/check-usage) → admin + landing + register + user + settings
```

## Settings SSOT

- `server/src/settings.js`: `DEFAULT_SETTINGS`, `resolveSettings()`, `validateSettings()`, `maskSettings()`, `publicPlans()`, `findPlan()`.
- `store.getSettings()/updateSettings()` → persist di `store.json` (gitignored).
- Endpoint: publik `GET /api/plans`; admin `GET|PATCH /api/admin/settings` (secret di-mask `••••<last4>`).
- **I3 wiring (`92cf9fb`):** klikqris mode/baseUrl (`payment.klikqrisBaseUrl`), usageResolver
  (url+TTL), auth (trustedOrigins/sentinel/minPasswordLength dari settings; `be.grouter.id`
  DIHAPUS dari default), adapter default `https://prod.grouter.web.id` (A4; adapter append
  `/v1/chat/completions` sendiri — base TANPA `/v1`).
- **I4 panel Settings (`61b8e67`):** tab Plans/Branding/Payment/Provider&Limits di `/admin`;
  plans HOT, auth+mode payment butuh restart.

## Kontrak API

- **`docs/29-backend-api-contract.md` = kontrak resmi** (19 route + `/api/auth/*`, di-enumerasi dari kode).

## Cost-integrity (A1 — CLOSED, live sejak 2026-10-01, commit `36c99b1`)

- `POST /api/orders`: HANYA terima `packageKey`. Body dengan `amount`/`description` → **400**.
  Harga + `planName` + `quota` resolve dari plan catalogue (unknown/inactive → 400).
- `paymentService.createOrder({plan, accountId})`; `settlePaid` resolve
  `features`/`expiresInDays`/`quota` dari plan catalogue SAAT SETTLE (A3 closed) —
  fallback ke `license.defaultFeatures`/`defaultExpiresInDays` hanya jika plan sudah dihapus.
- `licenseService.issue()` terima `quota` → masuk token payload + record.
- Order record punya `planName` + `quota`; `/success` + dashboard tampilkan dari situ.
- Browser TIDAK menyimpan harga: dashboard fetch `GET /api/plans` (`loadPlans()`), checkout kirim `packageKey` saja.

## Kontrak gRouter (read-only, verified live 2026-09-30)

- `GET https://prod.grouter.web.id/api/check-usage?key=<gRouter-api-key>`
- Key format: `gRouter-...` (bukan `sk-`). Chat: `POST {baseUrl}/v1/chat/completions` (Bearer).
- baseUrl dari `/check-usage` → `integration.baseUrl` (= `https://prod.grouter.web.id/v1`).

## Design system (docs/24-design-system.md)

- Cyberpunk metallic: cyan `#22d3ee` primary, gunmetal `#07090d`. File: `server/public/assets/grx.css`.
- Halaman: `/landing`, `/register`(+`/login`), `/user`, `/success`, `/` + `/admin`.

## Test & run

- Plugin test: `node --test` (root) → **71 pass**.
- Backend test: `cd server && node --test` → **34 pass** (termasuk `cost-integrity.test.js`). (Windows: JANGAN `node --test test/`.)
- Run backend: `cd server && node src/index.js` (port 4600). Tanpa npm install (zero dependency).
- Instance terisolasi: `DATA_FILE=<tmp> PORT=4690 node src/index.js` (pakai path `$LOCALAPPDATA/Temp`, bukan `/tmp` MSYS).
- Test ber-session: set env auth SEBELUM import `server.js` (dynamic import) + copy `server/data/auth.sqlite` ke tmp lalu clear semua row (`foreign_keys=OFF`) — pola di `server/test/cost-integrity.test.js`.

## Docs stale (SUDAH DIREKONSILIASI I5, 2026-10-01)

- ~~`docs/27`, `docs/28`, `docs/26`, `docs/25`, `docs/22`, `docs/00/01`~~ ✅ semua sudah
  direkonsiliasi ke realita kode. Kontrak resmi: **`docs/29-backend-api-contract.md`**.
- Tetap ingat: `be.grouter.id` TIDAK dipakai (single origin `copilot.grouter.id`).

## Pending / terbuka (ringkas — detail di handoff §4)

- ~~A1~~ ✅ closed (I2). ~~A2~~ ✅ closed. ~~A3~~ ✅ closed. ~~A4~~ ✅ closed (I3).
- ~~I3 wiring config~~ ✅ (`92cf9fb`). ~~I4 panel Settings~~ ✅ (`61b8e67`). ~~I5 rekonsiliasi docs~~ ✅.
- **Ops go-live (butuh keputusan/aksi Jie):** `KLIKQRIS_MODE=production` + kredensial produksi;
  persist license keypair (LICENSE_PRIVATE_KEY_PEM/PUBLIC) sebelum license nyata; isi
  `ADMIN_TOKEN` produksi; checklist lengkap di `docs/28` §Checklist.

## Standing conventions

- Bahasa Indonesia untuk laporan (7-section: Summary/What Works/What's Broken/Risks/Plan/Files/Validation).
- JANGAN sentuh gRouter production (port 20128, source, DB, release, watchdog).
- JANGAN campur fakta ke memory gRouter. Api key gRouter = secret (tak pernah commit/embed/browser).
- Restart prod non-destruktif: `pm2 restart copilot-backend --update-env`.

## Gotcha penting

- **Tool output menyanitasi string mirip-secret** (`body.grouterApiKey` bisa tampil `body.g...iKey`) → BUKAN bug; verifikasi `od -c`/`node -e`/probe runtime dulu.
- **KlikQRIS sandbox tak punya API simulator** — simulasi bayar hanya dari dashboard KlikQRIS (manual 1 klik).
- **KlikQRIS menandai lunas = `SUCCESS`** (bukan `PAID`) → pakai `isPaidStatus()`/`PAID_STATES`.
- **Order prod PAID tapi KlikQRIS EXPIRED** (`ord_muoizb2w_al70`, `ord_muojvlen_5xe3`) = sisa admin-settle, bukan bayar nyata.
- **Custom `assert()` menimpa module `node:assert`** di skrip probe → `assert.deepEqual is not a function`; pakai `JSON.stringify` compare.
- **Fresh/empty auth.sqlite crash** (`SchemaMismatchError`) → selalu copy schema prod lalu DELETE semua row.

## KlikQRIS

- Client: `server/src/klikqris.js` (createQris, checkStatus, pollUntilSettled, isPaidStatus/PAID_STATES/TERMINAL_STATES).
- Base mode-aware: sandbox `https://klikqris.com/api/sandbox`, production `.../api`. Header `x-api-key` + `id_merchant`.
- Kredensial di `server/.env` (gitignored, JANGAN commit). **Mode sekarang: `sandbox`.**
- Kontrak: `docs/26-klikqris-contract.md`.
