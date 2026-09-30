# Quality Engineering — gRouter Copilot

## 1. Test layers

### Contract tests
Skill contract (field, schema, readOnly, run), chat protocol, SSE ordering, adapter parity (saat multi-bahasa).

### Unit tests
Skill validator, config loader, intent resolver, adapter error mapping, context builder limits, redaction.

### Integration tests
Fake skill + fake gRouter supplier. Tidak butuh credential real di CI.

### Security tests
- bundle browser tidak mengandung key;
- prompt injection tidak panggil skill tak terdaftar;
- read-only tidak mutasi;
- error tidak bocorkan secret;
- restricted field tidak masuk context.

### Evaluation tests
Setiap skill punya fixtures: expected facts, allowed sources, forbidden disclosure, ambiguity, adversarial, partial data, cost/latency budget.

### Browser tests
Widget di desktop/tablet/mobile; overflow, state, streaming render. Jangan hanya screenshot.

### Load tests
Concurrent stream, timeout, cancel, gRouter limit, context bound.

## 2. Definition of done

- acceptance test pass;
- security suite pass;
- skill contract terupdate;
- error states jelas;
- docs contoh terupdate;
- install → chat bekerja di clean project;
- key tidak bocor;
- semver dipertimbangkan.

## 3. Release gates

1. syntax/lint;
2. unit + contract;
3. security;
4. evaluation;
5. integration smoke (fake supplier);
6. install test di clean project;
7. bundle scan (no key);
8. semver bump.

## 4. Metrics

groundedness, refusal correctness, scope violation rate, error rate, p95 first-token, cost per task.

## 5. CI (local/optional)

- lint + typecheck;
- unit + security test;
- fake-supplier e2e;
- pack + install di clean dir;
- bundle scan.
