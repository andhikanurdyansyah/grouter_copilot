# Restore drill — gRouter Copilot (WS4)

- **Date:** 2026-10-13 (UTC)
- **Host:** single dev+prod host `/home/ubuntu/grouter_copilot`
- **Result:** **PASS**
- **Script:** `/home/ubuntu/grouter_copilot/server/scripts/restore-drill.sh` (mode 700, executable)

## Command run

Primary (latest-backup auto-pick, the documented default):

```
cd /home/ubuntu/grouter_copilot && bash server/scripts/restore-drill.sh
```

Reproducibility re-run with an explicit backup:

```
cd /home/ubuntu/grouter_copilot && \
  bash server/scripts/restore-drill.sh --backup /home/ubuntu/backups/copilot-20261013T040849Z
```

Both runs exited 0 and printed `result : PASS`.

## Backup used

- Source dir: `/home/ubuntu/backups/copilot-20261013T040849Z` (latest `copilot-*` dir holding both artifacts)
- Contents: `auth.sqlite` (331776 B), `store.json` (212314 B), `env.bak`
- Restored into a fresh isolated scratch dir `restore-drill-<stamp>` (mode 700) under
  `/root/.hermes/profiles/copilot-grouter/cache/scratch/`, with copies chmod 600.

## Row counts — restored vs backup source (ALL MATCH)

store.json:

| collection | backup | restored | match |
|------------|-------:|---------:|:-----:|
| accounts   | 20     | 20       | yes   |
| orders     | 16     | 16       | yes   |
| licenses   | 20     | 20       | yes   |

auth.sqlite (every table compared):

| table        | backup | restored | match |
|--------------|-------:|---------:|:-----:|
| account      | 200    | 200      | yes   |
| invitation   | 0      | 0        | yes   |
| member       | 0      | 0        | yes   |
| organization | 0      | 0        | yes   |
| session      | 184    | 184      | yes   |
| user         | 200    | 200      | yes   |
| verification | 3      | 3        | yes   |

`mismatches: []`.

## Health check

Isolated backend booted on port 4691 with `DATA_FILE` / `AUTH_DB_FILE` pointing at the
restored copies (credentials seeded from `server/.env` via `loadEnv`; no secret values printed).

```
GET http://127.0.0.1:4691/api/health -> HTTP 200
body: {"status":"ok","contractVersion":1,"checks":{"licenseService":true,"providerConfigured":true,"paymentConfigured":true}}
```

## Cleanup / production safety

- Isolated backend stopped by PID resolved from `ss -ltnp` (never `pkill -f`); port 4691 free afterwards.
- Scratch dir removed on exit; no `restore-drill-*` dirs left under the scratch root.
- Production untouched: `copilot-backend` (:4600) and `copilot-frontend` (:4601) both still
  `online` in pm2 (pids 2603049 / 2604258, uptime unchanged); no writes to `server/data/`;
  no pm2 restart.

## Limitations

- Integrity check is **row-count / parse-level**, not a byte-for-byte or content diff: it proves
  the restored DB opens and every table's cardinality matches the backup, and that `store.json`
  parses with matching `accounts`/`orders`/`licenses` counts. It does not compare individual row
  contents or checksums.
- Health probe asserts the isolated instance answers `/api/health` with 200 + `status:"ok"`; it does
  not exercise license issuance, auth flows, or payment against the restored data.
- `env.bak` in the backup was not restored (only `auth.sqlite` + `store.json` are in scope); the
  drill relies on the live `server/.env` for the isolated boot's credentials.
- The drill verifies restoration into an isolated instance only — it does not perform or test an
  in-place production failover.
