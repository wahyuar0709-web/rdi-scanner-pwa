# AGENTS.md — RDI Scanner PWA

Highest-level project instruction file for OpenCode agents working in this repository.

## A. Project Identity

RDI Scanner PWA:
- Frontend progressive web app (HTML/CSS/JS, no package manager)
- Backend: Google Apps Script (Code.gs) deployed as a web app
- Domain: stock / inventory (kartu stok) application
- QR code scanner (jsQR, local decode)
- Offline / outbox behavior (service worker `sw.js`, pending → synced transactions)

Primary artifacts:
- `index.html` — main application
- `scanner.html` — scanner surface
- `sw.js` — service worker / cache
- `manifest.json` — PWA manifest
- `Code.gs` — GAS backend
- `jsQR.min.js` — vendored QR library
- `icon-192.png`, `icon-512.png` — icons
- `Backup/` — historical snapshot (not active)

## B. Protected Files

The following MUST NOT be modified without explicit user approval for that specific change:

- `index.html`
- `scanner.html`
- `sw.js`
- `manifest.json`
- `Code.gs`
- `jsQR.min.js`
- `icon-192.png`
- `icon-512.png`
- `icon-*.png`
- `Backup/**`

`README.md` is documentation; do not modify unless the user requests a documentation update.

This governance layer (`.opencode/**`, `AGENTS.md`) is the only area intended for OpenCode configuration work under normal audit/governance tasks.

## C. Forbidden Operations

Without explicit user approval for that operation:

- deploy (any host, including Apps Script)
- `clasp push` / clasp deploy / GAS publish
- production Spreadsheet mutation
- production API mutation (non-read actions: create/update/delete transaction, edit master, settings, etc.)
- `git commit`
- `git push`
- dependency installation (`npm install`, `yarn`, `pnpm`, etc.)
- modification of global OpenCode configuration
- modification of `C:\Users\lenov\.config\opencode\`
- modification of `C:\Users\lenov\.opencode\`
- modification of `C:\Users\lenov\.agents\`

Read-only network probes against the deployed GAS URL are allowed only for non-mutating GET/read classification, never for action execution.

## D. Testing Truth — Verification Levels

Verification levels are distinct. A pass at one level never implies a pass at a higher level.

| Level | Name | Meaning |
|-------|------|---------|
| L1 | STATIC / SIMULATION | Static analysis, structural checks, in-memory simulation, contract string checks |
| L2 | BROWSER RUNTIME | Real browser or CDP-driven run (Chrome headless, service worker, DOM, local UI flows) |
| L3 | REAL GAS RUNTIME | Live Google Apps Script backend execution (read-only probes allowed; mutations require explicit approval) |
| L4 | PHYSICAL DEVICE | Real phone/tablet/hardware (camera, install, offline toggle on device) |
| L5 | PRODUCTION OPERATIONAL VERIFICATION | Full production workflow sign-off after L1–L4 where applicable |

Rules:

- L1 PASS does not imply L2 PASS.
- L2 PASS does not imply L3 PASS.
- L3 PASS does not imply L4 PASS.
- L4 PASS does not imply L5 PASS.

An agent may only claim the highest level actually executed in the current run.

### Allowed statuses

- `PASS`
- `FAIL`
- `NOT TESTED`
- `ENVIRONMENT-DEPENDENT`
- `DEVICE-DEPENDENT`
- `UNVERIFIED`
- `ACCEPTED LIMITATION`

### Never convert

- `NOT TESTED` → `PASS`
- `UNVERIFIED` → `PASS`
- Simulation / L1 PASS → production / L5 PASS

If a level could not be reached, report the lower achieved level and mark higher levels `NOT TESTED` or `UNVERIFIED`.

## E. GAS Safety

- Production GAS probes are read-only unless the user explicitly approves otherwise.
- Never send mutation actions during audit, security review, or regression runs.
- GAS version parity may be `UNVERIFIED` if authentication is unavailable.
- Do not treat unauthenticated error messages as proof that a higher-privilege path is safe beyond what was probed.
- Deployed backend URL is reached only via non-mutating requests during automated checks.

## F. Stock Integrity

Never assume stock correctness merely because UI tests pass.

Important invariants (must be reasoned about explicitly, not waved through):

- saldo consistency across item / rack views
- lock / concurrency behavior under overlapping writes
- requestId / idempotency for outbox and transaction submission
- duplicate transaction protection
- partial / ambiguous result handling (client must not invent success)
- outbox synchronization (PENDING → SYNCED, retry, offline recovery)

Simulation stock tests are L1 only; they do not prove production ledger correctness.

## G. Security

Project security areas:

- authentication
- authorization (viewer vs editor vs unauthenticated)
- token / session lifecycle (issue, TTL, expiry)
- passwordVersion / password-change invalidation
- denylist / revocation (logout, password change)
- XSS (all injection sinks that render remote or user-influenced data, including export filenames and API messages)
- API contract exposure (status, needLogin, field classes)
- viewer/editor separation on the backend
- unauthenticated GET exposure (must be shell-only unless intentionally public)
- session expiry behavior
- rate limiting

Security findings follow the output discipline below. A simulation security pass is L1 only; state explicitly when live GAS verification (L3) is unavailable.

## H. Output Discipline

Every audit finding must contain:

1. **ID** — stable identifier (e.g. `OI-01`, `SEC-11`)
2. **Severity** — CRITICAL / HIGH / MEDIUM / LOW / INFO
3. **Location** — file and line or structural path
4. **Evidence** — command output, probe result, or code snippet
5. **Impact** — what an attacker or failure mode can achieve
6. **Reproduction** — minimal steps or script name
7. **Recommendation** — concrete fix or accepted-limitation statement
8. **Verification status** — one of the allowed statuses plus the highest level actually executed

Do not silently fix findings during a read-only audit. Report first; apply fixes only when the user has moved the session into an explicit fix/edit scope.
