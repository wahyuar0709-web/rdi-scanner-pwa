---
name: rdi-security
description: RDI Scanner PWA security audit methodology — checklist, SEC classification, auth/authz, XSS, GAS read-only probes, unauthenticated GET rules, verification levels, and evidence requirements. Use when performing or reviewing security findings on this project.
---

# rdi-security — RDI Security Methodology

Codified security methodology for RDI Scanner PWA (PWA + Google Apps Script + stock data). Guides future audits; does not replace `AGENTS.md`.

## Principles

1. **READ-ONLY by default** — report; do not fix unless the session is explicitly in fix scope.
2. **No production mutations** — never invoke create/update/delete transaction, master edits, or settings changes during security work.
3. **No invented vulnerabilities** — every finding needs code or probe evidence from this repo or the deployed read-only surface.
4. **Honest verification level** — static/simulation ≠ browser ≠ live GAS ≠ device ≠ production.

## Security checklist

### Authentication
- [ ] Login path establishes session/token only on success
- [ ] Failed auth does not leak password hashes or internal detail
- [ ] Token payload shape is not trusted client-side for privilege
- [ ] Session TTL / expiry enforced server-side
- [ ] Logout revokes or invalidates server-visible session

### Authorization
- [ ] Every mutating backend action runs behind a server-side editor (or equivalent) check
- [ ] Viewer tokens cannot execute write actions
- [ ] Unauthenticated requests fail closed (not fail open)
- [ ] UI hiding of buttons is never treated as authorization

### Token / session lifecycle
- [ ] Expiry handled without silent privilege extension
- [ ] passwordVersion (or equivalent) bump invalidates old sessions
- [ ] Denylist / revocation list respected when present

### passwordVersion / revocation
- [ ] Password change invalidates prior tokens
- [ ] Revoked sessions cannot continue mutating

### XSS
- [ ] API `message` and other remote strings rendered safely (text, not raw HTML) in UI paths
- [ ] Export / download filenames cannot inject markup or path escape
- [ ] QR / scanned content not injected as HTML
- [ ] Escape helpers (`ex`, `xe`, equivalent) used at sinks; check for missing call sites
- [ ] No `innerHTML` with untrusted data without encoding

### API contract
- [ ] Unauthenticated responses classified: shell-only vs data-bearing
- [ ] Error messages do not disclose stack traces, sheet names, or secret config
- [ ] Contract keys (`status`, `message`, `needLogin`) consistent with documented behavior

### Viewer / editor boundaries
- [ ] Boundary enforced in GAS, not only in frontend mode
- [ ] READ vs WRITE action lists not client-overridable

### Unauthenticated endpoints
- [ ] GET surface enumerated
- [ ] Each endpoint classified: returns data vs returns only auth error shell
- [ ] Any data-bearing unauth GET = finding (unless intentionally public and documented)

### GAS security
- [ ] Entry points validate session before dispatch
- [ ] Action names constrained server-side
- [ ] No secret keys in client bundle or README pastes used by client

### Production data exposure
- [ ] Probes and logs do not dump row data in audit mode
- [ ] Automated tests never write rows

### Rate limiting
- [ ] Login / auth failure paths rate-limited or locked out (or accepted limitation documented)

### Request forgery / mutation exposure
- [ ] No state-changing GET endpoints
- [ ] Mutations require authenticated POST (or approved pattern) with authorization

## SEC finding classification

Use stable IDs (`SEC-01` … or existing inventory IDs when continuing a prior audit). Do not renumber existing accepted findings without reason.

Severity:
- **CRITICAL** — unauthenticated or viewer → full write / full data read
- **HIGH** — authz bypass, stored XSS with session impact, unauth data-bearing GET
- **MEDIUM** — weak expiry, partial contract leak, missing rate limit with abuse path
- **LOW** — informational leak, defense-in-depth gap
- **INFO** — accepted design, environment-only difference, hardening note

Each finding must include: ID, Severity, Location, Evidence, Impact, Reproduction, Recommendation, Verification status.

## Auth / authz checklist (compact)

1. Who can call it? (anon / viewer / editor)
2. Enforced where? (Code.gs check before action body)
3. What does anon see? (error shell only vs fields)
4. What does viewer see vs do? (read-only vs write)
5. Can logout / password change cut a live session?

## XSS checklist (compact)

1. Locate sink (`innerHTML`, `document.write`, dynamic `href`, filename, message toast).
2. Locate source (API message, user input, QR payload, storage).
3. Confirm encoding/escaping on the path.
4. If simulation only → L1. If confirmed in browser DOM → L2.

## GAS read-only probe rules

- Prefer GET / non-mutating classification only.
- Never send mutation `action` values during audit.
- Record exact request class, response shape, and whether body contains data vs `needLogin` shell.
- Mark deployed-only behavior `ENVIRONMENT-DEPENDENT` when local cannot reproduce.
- Version string may remain `UNVERIFIED` if auth blocks reading app version from production.

## Unauthenticated GET classification

For each unauth GET endpoint:

| Result | Classification |
|--------|----------------|
| Only `status` / `message` / `needLogin` style error shell | Shell-only (acceptable if intentional) |
| Any stock, user, config, or history field | Data exposure → finding |
| Redirect / auth gate before body | GATED |
| Not exercised | NOT TESTED |

LOCAL vs DEPLOYED message-path difference with equal gate outcome = **INFO**, not a vulnerability by itself.

## Verification-level rules

| Level | Security example |
|-------|------------------|
| L1 | `sec_classify`, static XSS scan, `sim_authz_matrix`, contract string analysis |
| L2 | Browser/CDP login + API matrix, DOM sink confirmation |
| L3 | Live GAS read probes (`sec11_probe`, `gas_readonly_parity`, `r2_gas_redirect`) |
| L4 | Physical device session / scanner / offline |
| L5 | Production operational sign-off |

Rules:
- L1 PASS ≠ L2 PASS ≠ L3 PASS ≠ L4 PASS ≠ L5 PASS.
- Simulation security PASS is **L1 only**.
- If live GAS auth or network unavailable → state it; status `ENVIRONMENT-DEPENDENT` or `UNVERIFIED`.
- Never: `NOT TESTED` → `PASS`; `UNVERIFIED` → `PASS`; L1 → L5.

Allowed statuses: `PASS`, `FAIL`, `NOT TESTED`, `ENVIRONMENT-DEPENDENT`, `DEVICE-DEPENDENT`, `UNVERIFIED`, `ACCEPTED LIMITATION`.

## Evidence requirements

Every finding or cleared area must be supportable by:

- File + line or structural path, **or**
- Exact script name + result counts, **or**
- Probe description (method, auth state, redacted response shape)

Do not mark an area `PASS` without at least one evidence reference and the verification level that produced it.
