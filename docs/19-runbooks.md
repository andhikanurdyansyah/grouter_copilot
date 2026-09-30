# Runbooks — gRouter Copilot

## Install gagal

1. Cek framework detection (Next.js vs Express vs plain Node).
2. Cek package manager & versi Node.
3. Cek output init (file apa yang gagal dibuat).
4. Cek konflik file existing (config/route/widget).
5. Perbaiki scaffold, jangan tumpuk duplikat.

## Skill error saat boot

1. Cek nama skill, file, alasan validasi (name/parameters/readOnly/run).
2. Pastikan `parameters` valid JSON Schema.
3. Pastikan `run` adalah function.
4. Fix → app restart → warn hilang.

## Chat error

1. Cek requestId di log.
2. Klasifikasi: `SKILL_NOT_FOUND` / `SKILL_FAILED` / `UPSTREAM_UNAVAILABLE` / `TIMEOUT`.
3. Skill fail → cek `run()` + data akses.
4. Upstream fail → cek key + endpoint gRouter + retry.

## Key gRouter bocor (suspected)

1. Cek bundle browser (scan `GROUTER_API_KEY`).
2. Pastikan key hanya di server env, bukan `NEXT_PUBLIC_*`.
3. Revoke key di gRouter.
4. Rotate key, update `.env`.
5. Cek log untuk key value; redact.

## gRouter down

1. Konfirmasi adapter status.
2. Stop unbounded retry.
3. Return `upstream_unavailable`.
4. Preserve requestId + usage state.
5. Jangan modifikasi gRouter existing.

## Skill baca data berlebih

1. Audit `run()` return value.
2. Batasi field yang di-return (hanya yang diperlukan).
3. Tambah scope `user` di `run()`.
4. Terapkan limit row/byte/token.
