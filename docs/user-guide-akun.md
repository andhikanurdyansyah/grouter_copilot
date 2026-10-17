# Panduan Akun gRouter Copilot

*Panduan ini untuk Anda, pengguna gRouter Copilot. Semua langkah bisa Anda lakukan sendiri lewat browser.*

---

## 1. Membuat Akun Baru

1. Buka **https://copilot.grouter.id** lalu klik tombol **Get Started**.
2. Anda akan dibawa ke halaman masuk. Di bagian bawah, klik **Sign up**.
3. Masukkan **alamat email** Anda, lalu tekan Enter (atau klik panah →).
4. Buat **password** — minimal 8 karakter. Pakai kombinasi yang sulit ditebak.
   - Kalau password Anda pernah bocor di internet, sistem akan menolak dan meminta Anda membuat yang baru. Itu untuk keamanan akun Anda.
5. Ketik ulang password untuk konfirmasi, lalu tekan Enter.
6. Selesai! Akun Anda langsung aktif dan Anda otomatis dibawa ke halaman akun Anda.

> Catatan: saat ini pendaftaran hanya lewat email. Tidak perlu mengisi nama lengkap — nama akun otomatis diambil dari email Anda.

---

## 2. Masuk ke Akun

1. Buka **https://copilot.grouter.id/login**.
2. Masukkan email dan password Anda.
3. Klik **Sign In**.
4. Berhasil — Anda dibawa ke halaman akun Anda.

**Lupa password?** Klik **Forgot password?** di bawah kolom password — lihat bagian 4 di bawah.

**Salah password?** Akan muncul pesan *"Invalid email or password"*. Cek lagi ejaan email dan password Anda. Perhatikan juga huruf besar/kecil (Caps Lock).

---

## 3. Halaman Akun Anda

Setelah masuk, di halaman akun Anda Anda bisa melihat:

- **Data akun** — nama dan email Anda.
- **Lisensi** — lisensi yang Anda beli beserta masa berlakunya.
- **Riwayat pemakaian** — pemakaian Copilot di aplikasi Anda.
- **Pemberitahuan** — klik ikon lonceng (🔔) di kanan atas: riwayat kejadian akun Anda (pembayaran diterima, lisensi diterbitkan, lisensi segera berakhir, kuota hampir habis). Angka pada lonceng = jumlah pemberitahuan belum dibaca; klik satu pemberitahuan untuk membacanya dan membuka halaman terkait, atau "Tandai semua dibaca".

Di menu akun (bagian bawah menu samping/sidebar, klik nama akun Anda) Anda bisa:

- **Akun & Profil** — kelola data akun Anda.
- **Ubah password** — ganti password kapan saja (lihat bagian 5).
- **Keluar (Sign out)** — akhiri sesi. Selalu keluar kalau Anda memakai komputer bersama.

---

## 4. Lupa Password

1. Di halaman masuk, klik **Forgot password?** (di sebelah kanan kolom password).
2. Masukkan **email akun Anda**, lalu klik **Send reset link**.
3. Muncul pesan *"If the account exists, we've sent a reset link"*. Pesan ini selalu sama, apa pun hasilnya — jadi orang lain tidak bisa memakai halaman ini untuk menebak email siapa yang terdaftar.
4. Cek kotak masuk email Anda dan klik tautan di dalamnya. (Saat ini tautan reset tercatat di log server — lihat catatan di bawah.)
5. Di halaman yang terbuka, buat **password baru** dan ketik ulang untuk konfirmasi, lalu klik **Reset password**.
6. Berhasil! Password lama tidak berlaku lagi, semua perangkat yang masih login otomatis dikeluarkan, dan Anda bisa masuk dengan password baru.

**Tautan tidak berfungsi?** Tautan reset hanya berlaku **1 jam** dan hanya sekali pakai. Kalau sudah lewat, ulangi langkah 1–2 untuk minta tautan baru.

**Catatan penting:** sampai layanan pengiriman email diaktifkan, tautan reset tidak benar-benar dikirim ke email — Anda perlu menghubungi tim gRouter untuk mendapatkan tautannya. Kami sedang menyiapkan pengiriman email otomatis.

---

## 5. Ganti Password (saat masih ingat yang lama)

1. Masuk ke akun Anda.
2. Di menu samping (sidebar), klik **nama akun Anda** di bagian paling bawah.
3. Pilih **Ubah password**.
4. Masukkan **password saat ini**, lalu **password baru** (minimal 8 karakter) dan ketik ulang untuk konfirmasi.
5. Klik **Simpan**. Selesai — gunakan password baru saat masuk berikutnya.

Lupa password saat ini? Gunakan alur **Forgot password?** di bagian 4.

> Catatan: mengganti password lewat menu ini TIDAK mengeluarkan perangkat lain yang sedang masuk.
> Kalau Anda curiga ada orang lain yang tahu password Anda, gunakan **Forgot password?** (alur bagian 4)
> karena cara itu otomatis mengeluarkan semua perangkat.

---

## 6. Keamanan Akun Anda

Hal-hal yang sudah dilakukan sistem untuk melindungi Anda:

- **Password Anda tidak pernah disimpan apa adanya** — yang disimpan hanya bentuk teracak yang tidak bisa dibaca siapa pun.
- **Password yang pernah bocor ditolak** — sistem memeriksa daftar kebocoran data dunia.
- **Tidak ada petunjuk akun** — halaman lupa password tidak membocorkan email siapa yang terdaftar.
- **Reset password mengeluarkan semua perangkat** — kalau ada orang lain yang masih memakai sesi Anda, aksesnya otomatis gugur.
- **Sesi login berakhir otomatis** setelah 7 hari; setelah itu Anda diminta masuk lagi.
- **Sambungan terenkripsi** (HTTPS) ke seluruh situs.

Yang bisa Anda lakukan:

- Pakai password minimal 8 karakter yang tidak dipakai di situs lain.
- Keluar (*Sign out*) setelah selesai di komputer bersama.

---

## 7. Masalah Umum & Solusinya

| Masalah | Artinya | Solusi |
|---|---|---|
| "Invalid email or password" | Email/password salah | Cek ejaan & Caps Lock; kalau lupa, pakai Forgot password |
| "This password has been found in data breaches" | Password Anda pernah bocor di layanan lain | Buat password baru yang unik |
| "This email address appears to be invalid" | Format email salah / domain ditolak | Periksa penulisan email; coba email lain (mis. Gmail) |
| "Too many requests" | Terlalu banyak percobaan dalam waktu singkat | Tunggu ±10 detik lalu coba lagi |
| Tautan reset "invalid or expired" | Tautan sudah lewat 1 jam / sudah dipakai | Minta tautan baru lewat Forgot password |
| Halaman reset bilang link tidak valid | Tautan sudah lewat 1 jam / sudah dipakai | Minta tautan baru lewat Forgot password |
| "Password saat ini salah" (saat ubah password) | Password lama yang Anda masukkan tidak cocok | Cek ejaan; kalau lupa, pakai Forgot password |

---

## 8. Alur Lengkap Sekali Baca

```
Daftar:  Get Started → Sign up → email → password → konfirmasi → akun jadi
Masuk:   /login → email + password → halaman akun
Lupa:    Forgot password? → email → tautan reset → password baru → masuk lagi
Keluar:  ikon akun → Sign out → konfirmasi
```

Halaman resmi yang boleh Anda percaya:

- Masuk: `https://copilot.grouter.id/login`
- Daftar: `https://copilot.grouter.id/login/sign-up`
- Reset password: `https://copilot.grouter.id/reset-password` (selalu diarahkan dari tautan email)

Di luar tiga alamat itu, jangan pernah memasukkan password akun gRouter Anda.

---

## 9. Memasang Copilot ke Aplikasi Anda (Langkah Berikutnya)

Setelah punya lisensi aktif, pemasangan Copilot di aplikasi Anda dilakukan dengan satu
perintah di server aplikasi. Panduan lengkap langkah demi langkah (termasuk contoh output
nyata, cara memasang rute chat, cek kesehatan, dan tabel masalah-masalah saat instalasi)
ada di dokumen terpisah: **`docs/install-guide.md`**.

Ringkasnya:

1. Pasang paket Copilot di aplikasi Anda mengikuti panduan instalasi (distribusi saat ini
   berupa file paket dari tim gRouter — bukan dari npm publik).
2. Jalankan perintah instalasi yang ditampilkan di halaman sukses setelah pembayaran
   (perintah itu sudah berisi token lisensi Anda — salin utuh).
3. Restart aplikasi Anda agar pengaturan baru terbaca, lalu ikuti panduan instalasi
   untuk menghubungkan Copilot ke data aplikasi Anda dan mencoba pertanyaan pertama.

> Penting: yang dipakai perintah instalasi adalah **token lisensi** dari halaman sukses
> pembayaran (teks panjang hasil tanda tangan digital), bukan License ID di tabel lisensi.
> Menukar keduanya membuat instalasi ditolak.

### Kalau token lisensi Anda hilang

Token ditampilkan satu kali setelah pembayaran. Kalau Anda tidak sempat menyalinnya,
token tidak hilang selamanya:

1. Masuk ke dashboard, buka menu **Install**.
2. Klik **"Lihat token lisensi (pemulihan token hilang)"**.
3. Semua lisensi milik akun Anda tampil beserta tombol salin. Tempelkan token itu ke
   perintah instalasi.
4. Lisensi yang sudah dicabut operator tidak menampilkan token (memang tidak bisa dipakai lagi) —
   beli atau perpanjang paket untuk mendapat lisensi baru.

---

## 10. Copilot sebagai teman ngobrol

Copilot tidak hanya menunggu pertanyaan yang persis sama dengan nama skill.
Anda dapat menggunakannya untuk sapaan, brainstorming, penjelasan, dan diskusi umum.

Jika pertanyaan membutuhkan data dari aplikasi, Copilot hanya memakai data yang sengaja
didaftarkan oleh pengembang aplikasi melalui skill baca-saja. Copilot tidak boleh mengarang
angka, nama, status, atau riwayat aplikasi ketika data tersebut tidak tersedia.

Contoh:

- "Bantu brainstorming nama produk" → percakapan umum.
- "Berapa order yang masih pending?" → memakai skill order bila aplikasi menyediakannya.
- "Hapus semua order lama" → ditolak bila skill aplikasi hanya baca-saja.

Jadi Anda tidak perlu menghafal nama skill untuk mengobrol. Skill adalah batas keamanan
data aplikasi, bukan batas untuk percakapan umum.

Percakapan juga mempertahankan beberapa pesan terakhir agar pertanyaan lanjutan tetap
memiliki konteks. Riwayat ini dibatasi ukurannya, hanya berisi pesan pengguna dan Copilot,
dan dibersihkan dari instruksi sistem atau credential sebelum diproses.

Orang lain tidak bisa melihat token Anda: hanya akun pemilik lisensi yang bisa membukanya.

---

*Dokumen ini bagian dari dokumentasi resmi gRouter Copilot (source of truth: `docs/35-auth-flow.md`). Dibuat 2026-10-12.*
