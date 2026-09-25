# Agent Observatory v1 — shared implementation contract

This is the implementation contract, not an additional delivery phase. No online sources or Pi SDK integrations are part of v1. Keep the offline core dependency-free at runtime.

## Ownership and integration

Coordinator: `src/contract.mjs`, `src/store.mjs`, `server.mjs`, `scripts/*`, `package.json`, JSON schema/sample, integration tests, live local snapshot and integration. UI delegate: `index.html`, `styles.css`, `src/render.mjs`, `app.mjs` only. Documentation/test delegate: `README.md`, `test/contract.test.mjs`, `test/store.test.mjs` only, after core interface is available. Independent review is read-only. Never modify the project prompt, commit, push, or touch unrelated files.

Critical path: contract → normalization/server + thin renderer → smoke → full UI + deterministic tests/documentation → central integration → browser/HTTP/security checks. The source and UI layers are separate so a later event adapter can replace polling.

## Wire format

- `schemaVersion`: exactly `"1.0"`; unsupported versions and invalid top-level types are recoverable errors.
- `dataset`: `"sample"` or `"live"`; missing/unrecognized becomes `"unavailable"`, never silently live.
- `observedAt`: ISO timestamp with explicit timezone or null. This is the authoritative snapshot freshness clock. Fetch success never rewrites it.
- All optional scalar/array section values are **measurements**: `{value, source, observedAt, verification}`. Unknown values are null; verification: `verified | self_reported | unverified | unavailable`. Invalid/missing provenance downgrades verified/self_reported to unverified. No model/permission/usage guesses.
- Sections and allowed measurement fields:
  - `identity`: `name`, `provider`, `model`, `modelVersion`, `sessionId`, `startedAt`, `uptimeSeconds`.
  - `assignment`: `goal`, `step`, `state`, `progress`, `startedAt`.
  - `capabilities`: `tools`, `skills`, `subagents`, `browser`, `shell`, `files`, `network`, `images`.
  - `environment`: `cwd`, `repository`, `branch`, `os`, `runtimes`, `executionMode`.
  - `permissions`: `readAreas`, `writeAreas`, `network`, `approvalMode`, `restrictions`, `missingCredentials`.
  - `usage`: `contextWindow`, `contextUsed`, `inputTokens`, `outputTokens`, `cost`, `rateLimits`.
- Values: lists of strings for tools, skills, readAreas, writeAreas, restrictions, missingCredentials, runtimes; nonnegative finite numbers for uptimeSeconds, contextWindow, contextUsed, inputTokens, outputTokens, cost; strings otherwise. Progress is `{completed: nonnegative number, total: positive number, basis: nonempty string}`, completed <= total; UI percentage only from this basis. Cost's unit is documented in its source (no assumed currency).
- Agent states: `idle | working | waiting | blocked | failed | completed`; missing/invalid becomes unavailable.
- `activity`: `[{id, time, category, summary, status, durationMs?, source, verification}]`; required time (valid ISO), category, summary and status (`info | running | passed | failed | warning | unknown`). Invalid entries are excluded with a warning. Activity is descriptive, not a replacement for check evidence.
- `artifacts`: `[{path, change, source, observedAt, verification}]`; change is created/modified/unchanged/unknown.
- `checks`: `[{name, status, evidence?}]`; status `not_run | running | passed | failed | unknown`. Evidence `{command, exitCode, finishedAt, source}`. Passed is retained ONLY with nonempty command/source, integer exitCode 0, valid finishedAt. No evidence means passed becomes unknown with a warning; evidence is reported, not cryptographically attested.
- `issues`: `[{severity, summary, nextAction, source, observedAt, verification}]`; severity info/warning/blocker/error. Missing issues list is unavailable, not 'no issues'.
- Unknown fields tolerated but discarded; never inserted into HTML. Root object and existing section/collection types must be correct; malformed roots/containers reject the snapshot. Individual unavailable measurements remain visibly unavailable. Normalizer adds `warnings: string[]` and `availability: {activity, artifacts, checks, issues}` booleans to distinguish missing lists from empty lists.
- Maximum source 256 KiB, strings 2000 characters, lists 100 entries; truncation generates a visible warning.

## Modules and UI interface

`src/contract.mjs` exports:
- `SCHEMA_VERSION`, `STATES`, `CHECK_STATES`, `FIELD_LABELS` (section → field → German label).
- `parseStatus(text)` → normalized snapshot, throws human-readable Error on invalid JSON/unsupported version/structural errors.
- `normalizeStatus(object)` → normalized snapshot.
- `redact(value)` → sanitized deep copy; typical secret keys/values removed/redacted. Also applied server-side before the status response, and before any DOM rendering. This is defense-in-depth, not a complete data-loss-prevention system.
- `freshness(observedAt, nowMs, {staleAfterMs, clockSkewMs})` → `{state: 'fresh'|'stale'|'unknown', ageMs: number|null, reason: string}`; allow past dates, reject invalid/missing timestamp or future > tolerance, tolerated future age zero.
- `uptime(identity, nowMs, {clockSkewMs})` → `{seconds: number|null, source: string, verification: string}`. Prefer explicit reported seconds; otherwise valid start time + local clock. Do not invent a start time.

`src/store.mjs` exports `createStore({url='/status.json', fetchFn=fetch, now=Date.now, timeoutMs=5000, onChange=()=>{}})` → `{refresh(), stop(), getState()}`. State is `{snapshot:null|object, fetchedAt:null|ISO, error:null|string, loading:boolean}`. Last valid snapshot and fetch time survive later failures. Single request at a time, timeout, cache:no-store. `refresh()` catches errors and resolves state. UI polls with recursive setTimeout (or guarded interval); `stop()` cancels active request and allows no later mutation. HTTP/protocol errors contain no raw source payload.

`src/render.mjs` exports `renderDashboard(root, state, config, nowMs=Date.now())`. Pure DOM-safe rendering: no innerHTML/outerHTML/insertAdjacentHTML/document.write, even for fixtures. Root is a stable div; repeated render must preserve or restore focused elements, open details and filter selections. UI owns filter state. `config` includes `pollIntervalMs`, `staleAfterMs`, `clockSkewMs`, `timeoutMs` from `/config.json`. Semantic header, skip link, all nine sections, overall summary before fold, sample badge, source/fetch clocks, recoverable errors, visible provenance, activity category/status filters and compact `<details>`. Dark/light toggle and reduced motion. Local metallic/crimson theme, no CDN/images/fonts/analytics.

`app.mjs` loads config, creates store, updates DOM, starts polling and one-second freshness/uptime tick; exported UI doesn't auto-start in Node. User actions use native buttons/selects. Provide explicit reload button. User-facing copy is German, concrete GUI controls are not constrained to the coordinator's persona response headings.

## Local server and configuration

`npm start` → `node server.mjs`, Node >=22, no mandatory install/build. Default http://127.0.0.1:4318. Bind loopback only. Read-only explicit route allowlist, reject traversal, foreign Host/Origin/cross-site fetch, no CORS, no arbitrary workspace files. CSP same-origin only, no remote sources; no control/write endpoint. Optional `--port 0` used by smoke tests. Export `createServer({statusPath?, configPath?})` for tests; start only when direct CLI.

`config.json`: `{pollIntervalMs:3000, staleAfterMs:120000, clockSkewMs:5000, timeoutMs:5000}` with finite bounded validation. `/status.json` serves normalized/redacted `agent-status.json` if present, otherwise explicitly labeled `agent-status.example.json`. An existing corrupt live file must NOT silently fall back to sample. `/config.json` returns only supported validated config fields. Serve no raw status/example files. No network calls besides loopback.

`npm run status:init` creates ignored `agent-status.json` exclusively from sample (never overwrites). Any agent writes a complete snapshot to a unique temp file in the same folder, validates it, renames atomically; README includes precise instructions. No status update API. Missing usage stays unavailable.

## Evidence requirements

Automated core tests: parsing/normalization/missing/unsupported, all freshness cases, uptime, secret fields/value patterns, HTML text safety, progress basis, evidence-gated check states; store refresh/recovery/timeout; server start/page/status/config, no sensitive routes, foreign origin/method, status edits with no rebuild. Browser automation if feasible includes layout/dark/light, focus/keyboard, injection, redaction, filters and stale/error retention. Otherwise explicitly mark unverified. Actual commands/results captured in `VERIFICATION.md` by coordinator. No fabricated passing checks.
