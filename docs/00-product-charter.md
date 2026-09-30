# Product Charter — gRouter Copilot (Plugin)

## 1. Product thesis

Developer aplikasi bisnis ingin menambah AI ke aplikasi yang sudah jalan tanpa membangun infrastruktur model, retrieval, streaming, atau governance sendiri. gRouter Copilot adalah **plugin/module npm** yang memberi aplikasi itu sebuah AI copilot di atas data-nya sendiri, dengan gRouter sebagai supplier model.

## 2. Product definition

gRouter Copilot adalah **package yang di-install ke aplikasi customer**, bukan platform SaaS. Ia:

- di-install lewat satu command (`npx @grouter/copilot init`);
- menambahkan chatbot UI + runtime;
- membaca data aplikasi lewat **developer-defined skills**;
- memakai **API key gRouter** yang tersimpan di `.env` customer (self-contained);
- tidak menyimpan data aplikasi di server Copilot manapun.

## 3. Problem

Aplikasi bisnis (CRM, POS, HRIS) sudah punya data berharga, tapi user kesulitan mengubahnya jadi jawaban/insight. Vendor aplikasi tidak mau:

- membangun infrastruktur LLM sendiri;
- menyimpan banyak provider API key;
- mengurus streaming, retry, fallback, billing;
- mengekspos data mentah ke model tanpa kontrol.

## 4. Wedge (differentiator)

Wedge bukan "chatbot generik". Wedge adalah **skill layer yang developer-definable**: developer mengekspos data secara eksplisit, chatbot menjawab dari data itu, dengan satu key gRouter sebagai satu-satunya dependency AI.

## 5. Boundaries

### In scope (v0.1)

- npm package `@grouter/copilot` untuk Node.js/Next.js;
- `init` command: deteksi framework, generate config/skills/route/widget;
- developer-defined skills (read-only);
- embedded chatbot UI + runtime route;
- adapter ke gRouter API (streaming, error, usage);
- self-contained: key di `.env`.

### Out of scope (v0.1)

- backend Copilot / control plane / tenant management;
- auto-scan penuh seluruh database;
- mutating skills (tulis/hapus/update data);
- fine-tuning;
- native SDK untuk semua bahasa (Java/Python menyusul setelah protokol stabil);
- marketplace plugin publik.

## 6. Product principles

- **Self-contained:** key & config di app customer.
- **Developer-defined scope:** data diekspos eksplisit, bukan auto-baca.
- **Read-only first:** baca dulu, mutasi belakangan dengan kontrol.
- **Key isolation:** key gRouter server-only.
- **App = source of truth:** Copilot stateless, tidak simpan data central.
- **Protocol over magic:** skill contract jelas, bukan reflection SQL.

## 7. Success thesis

v0.1 sukses ketika seorang developer Node.js/Next.js bisa `npx @grouter/copilot init`, menulis 1 skill, dan mendapatkan jawaban chatbot yang bersumber dari data aplikasinya — tanpa key gRouter bocor ke browser dan tanpa backend Copilot.
