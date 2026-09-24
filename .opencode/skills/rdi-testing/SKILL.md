---
name: rdi-testing
description: Map RDI Scanner PWA test scripts to verification levels L1–L5, prohibit verification-level inflation, and classify PASS/FAIL/NOT TESTED/ENVIRONMENT-DEPENDENT/DEVICE-DEPENDENT. Use when running, reporting, or interpreting this project's regression or audit tests.
---

# rdi-testing — RDI Test Inventory and Verification Levels

Maps known test families to verification levels and forbids claiming a level that was not executed.

## Where tests live

**Do not assume test scripts are inside the project.**

- Project tree (`c:\projec\rdi-scanner-pwa`) has **no** `package.json`, **no** `tests/` directory, **no** npm scripts.
- Known suites currently live under the OpenCode **temp test environment**, e.g.:
  - `C:\Users\lenov\AppData\Local\Temp\opencode\`
- Result artifacts (JSON) may sit beside those scripts.
- If a script path is missing on this machine, report `NOT TESTED` for that family — do not invent a pass.

## Verification levels

| Level | Name | Applies to |
|-------|------|------------|
| L1 | STATIC / SIMULATION | Static scans, structural asserts, in-memory simulation |
| L2 | BROWSER RUNTIME | Chrome/CDP, DOM, service worker, switchTab, UI flows |
| L3 | REAL GAS RUNTIME | Live Apps Script read-only probes |
| L4 | PHYSICAL DEVICE | Real phone/tablet, camera, install, on-device offline |
| L5 | PRODUCTION | Operational release verification after applicable L1–L4 |

**Inflation is prohibited:**

- L1 PASS does not imply L2 PASS.
- L2 PASS does not imply L3 PASS.
- L3 PASS does not imply L4 PASS.
- L4 PASS does not imply L5 PASS.

Only claim the **highest level actually executed** in the current run.

## Allowed statuses

- `PASS`
- `FAIL`
- `NOT TESTED`
- `ENVIRONMENT-DEPENDENT`
- `DEVICE-DEPENDENT`
- `UNVERIFIED`
- `ACCEPTED LIMITATION`

Never convert:

- `NOT TESTED` → `PASS`
- `UNVERIFIED` → `PASS`
- Simulation / L1 PASS → Production / L5 PASS

## Known test families → level

### L1 — Static / simulation

| Script | Purpose |
|--------|---------|
| `sim_auth_fix.js` | Token payload, passwordVersion/denylist concepts, TTL/expiry/forgery simulation |
| `sim_authz_matrix.js` | Structural READ/WRITE/VIEWER/EDITOR/REVOKED gates (not live GAS) |
| `sim_outbox.js` | Outbox PENDING/SYNCED, idempotency, partial results, rate-limit style logic |
| `sim_stock.js` | Lock vs lost-update, saldo integrity invariants |
| `sec_classify.js` | SEC finding inventory FIXED/CLASSIFIED/OPEN counts |
| `sec_scan.js` | Static security heuristics |
| `xss_audit.js` | XSS sink/source heuristics |
| `r2_contract_leak.js` | Frontend/backend contract, kartu escaping, leak heuristics |
| `r2_qr_decoder.js` | jsQR encode/decode without camera |
| `version_consistency.js` | APP_VERSION / title / icon title consistency |
| `kartu_contract.js` | `kartu` / escape helper (`ex` ≡ `xe`) contract |
| `verify_fix.js`, `verify_watch.js`, `oi_audit.js` | Targeted fix/regression structural checks |

### L2 — Browser / CDP runtime

| Script | Purpose |
|--------|---------|
| `r2_browser_suite.js` | Auth, API matrix, outbox, SW, offline via CDP |
| `switchtab_runtime.js` | `switchTab` runtime behavior |
| `chrome_dom.js` | Headless DOM/title/body smoke |
| `chrome_scanner.js` | Scanner page runtime smoke |
| `chrome_smoke.js` | General Chrome smoke |

**Chrome/CDP rules:** run suites strictly **one at a time**; use unique `--user-data-dir` profiles; kill stale Chrome only when necessary; avoid profile collisions.

### L3 — Real GAS runtime (read-only)

| Script | Purpose |
|--------|---------|
| `sec11_probe.js` | Unauthenticated GET surface classification (expect gated/shell-only) |
| `gas_readonly_parity.js` | Deployed vs local behavioral probes; parity may be ENVIRONMENT-DEPENDENT |
| `r2_gas_redirect.js` | Deployed GAS reachability / auth redirect |

**Never** send mutation actions in these scripts without explicit user approval.

### L4 — Physical device

- No fully automated suite is assumed.
- Camera path, install prompt, on-device offline toggle → `DEVICE-DEPENDENT` unless actually run on hardware.

### L5 — Production operational

- Not passed by any script above alone.
- Requires explicit operational verification after applicable lower levels.
- Regression green **never** equals production readiness by itself.

## Reporting a run

For each family:

1. Level (L1–L5)
2. Status (allowed tokens only)
3. Counts when available (e.g. PASS/FAIL totals)
4. Location of evidence (script path or `NOT TESTED` if missing)
5. Highest level executed overall for the session summary

When Chrome/CDP or network prevents a run:

- Use `ENVIRONMENT-DEPENDENT` (or `DEVICE-DEPENDENT` for hardware).
- Do not mark the family `PASS`.

## Anti-patterns (forbidden)

- Reporting “regression passed → ready for production” (collapses L1/L2 into L5).
- Listing a temp script as executed when it was not run this session.
- Merging sim_stock results into a claim that production saldo is correct.
- Merging sec11 shell-only probe into a claim that all production authz is L5-verified.
- Upgrading `UNVERIFIED` deployed version parity to `PASS` because local version matches.
