# UX & Design Principles — gRouter Copilot

## 1. Product experience

Chatbot harus terasa native di aplikasi host, bukan widget asing. Host app memiliki identity & navigasi; Copilot memiliki conversation, source explanation, dan AI state.

## 2. Widget surface

- launcher/panel embedded;
- panel chat;
- suggested questions (berdasarkan skill description);
- source/freshness disclosure;
- feedback;
- escape hatch ke UI aplikasi.

## 3. Answer states

| State | Behavior |
|---|---|
| loading/retrieving | tampilkan skill yang dikonsultasi (tanpa fake progress) |
| streaming | delta teks, layout stabil |
| complete | jawaban + source/freshness |
| partial | jelaskan data hilang, hindari klaim absolut |
| stale | tampilkan last-updated, kualifikasi |
| blocked | jelaskan batas izin tanpa bocorkan data |
| unavailable | retry + fallback jujur, bukan jawaban palsu |
| error | pesan aman, requestId |

## 4. Trust UX

Setiap jawaban non-trivial harus jelas: periode data, source category, freshness, keterbatasan. Jangan sembunyikan scope untuk terlihat "magic". Confidence score tidak dipakai kecuali terkalibrasi.

## 5. Developer UX (yang paling penting di v1)

`npx @grouter/copilot init` harus menghasilkan output yang jelas:

```text
✔ Detected Next.js (App Router)
✔ Created copilot.config.js
✔ Created skills/example.js
✔ Created app/api/copilot/chat/route.js
✔ Created components/CopilotChat.js
✔ Added widget mount
→ Next: isi GROUTER_API_KEY di .env
```

Error skill saat boot harus jelas: nama skill, file, alasan validasi gagal.

## 6. Design system

- theme-aware (ikuti theme app);
- keyboard + screen reader;
- focus restoration;
- reduced motion;
- markdown/HTML aman;
- locale-aware number/date;
- touch target ≥ 44px;
- responsive: desktop/tablet/mobile.

## 7. UX non-goals

- Jangan ganti navigasi aplikasi dengan AI-only.
- Jangan sembunyikan ketidakpastian.
- Jangan label "connected" tanpa probe nyata ke gRouter.
- Jangan tampilkan provider/model internal gRouter.
