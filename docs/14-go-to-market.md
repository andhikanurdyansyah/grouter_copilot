# Go-to-Market — gRouter Copilot

## 1. Beachhead

Developer aplikasi bisnis (CRM/POS) yang sudah pakai Node.js/Next.js. Mulai dari 1-2 design partner untuk buktikan nilai.

## 2. Design-partner offer

- guided install;
- 1-2 skills pertama dibantu;
- read-only scope;
- feedback mingguan;
- success criteria disetujui sebelum akses.

## 3. Sales narrative

"Tambahkan AI copilot ke aplikasi kamu dalam satu command, atas data kamu sendiri, tanpa membangun infrastruktur model — pakai key gRouter."

## 4. Adoption funnel

1. dokumentasi + sample;
2. `npx @grouter/copilot init`;
3. widget muncul;
4. skill pertama;
5. jawaban pertama yang berguna;
6. retensi mingguan;
7. upgrade Pro/Enterprise.

## 5. Proof points

- time-to-first-install;
- time-to-first-answer;
- % jawaban bersumber;
- effort (jam developer);
- retensi & feedback;
- zero key leakage.

## 6. Launch risks

Jangan market "baca seluruh data" atau "autonomous agent". Market "skill layer yang developer-kontrol". Overpromise = objection keamanan.


---

## Rekonsiliasi status (2026-10-12)

- Funnel §2-4: `npx @grouter/copilot init` **belum bisa dijalankan customer
  dari registry** — publish npm BLOCKED menunggu kredensial publisher.
  Persiapan selesai (tarball verified, LICENSE, README, E2E clean-install).
- Design-partner offer §2 dapat dijalankan via install tarball/manual oleh
  operator — tidak menunggu publish.
- Beachhead metrics §5: usage ledger + admin ledger sudah tersedia di
  produksi untuk mengukur time-to-first-install dan retensi.
- Launch risks §6 tetap berlaku; positioning "skill layer yang
  developer-kontrol" konsisten dengan PRD §5.
