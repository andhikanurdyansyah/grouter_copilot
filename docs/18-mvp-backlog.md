# MVP Backlog — gRouter Copilot (v0.1)

## EPIC-1 Install & scaffold

- [ ] CLI `init` command.
- [ ] Framework detection (Next.js App Router, Pages Router, Express, plain Node).
- [ ] Generate `copilot.config.js`, `.env`, `skills/`, API route, widget mount.
- [ ] Install di clean project → widget muncul.

## EPIC-2 Skill system

- [ ] Skill registry + validator (name, description, parameters, readOnly, run).
- [ ] Skill resolution (skillHint + intent match).
- [ ] Skill execution dengan arg tervalidasi + user context.
- [ ] Invalid skill → warn + exclude (tidak crash app).

## EPIC-3 Runtime chat

- [ ] `/api/copilot/chat` route.
- [ ] Request validation (message, userId, sessionId).
- [ ] Context builder (system + data + sources, limit row/byte/token).
- [ ] Error taxonomy.

## EPIC-4 gRouter adapter

- [ ] `complete()` + `stream()`.
- [ ] Timeout, retry terbatas, cancel.
- [ ] Usage (token, latency).
- [ ] Fake supplier untuk test.

## EPIC-5 Widget

- [ ] `CopilotChat` React component.
- [ ] Streaming, loading/error/empty.
- [ ] Source/freshness display.
- [ ] Theme-aware.

## EPIC-6 Config & safety

- [ ] `copilot.config.js` (skills, model, prompt, limits).
- [ ] Key server-only + bundle scan test.
- [ ] Read-only enforcement + mutating gate stub.

## EPIC-7 Docs & sample

- [ ] README + quickstart.
- [ ] Sample CRM (orders summary).
- [ ] Sample POS (sales summary).
- [ ] Skill authoring guide + template.

## Prioritization rule

Install → skill → chat → adapter → widget → quality → Next.js polish → observability. Fitur yang menambah autonomi tanpa authorization/audit = prioritas rendah.
