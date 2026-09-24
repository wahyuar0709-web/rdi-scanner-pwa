---
description: Run the known RDI regression suite sequentially with Chrome/CDP safety, classify every result by verification level L1–L5, and never claim production readiness from regression alone.
---

# /regression — RDI Regression Suite

Run the known RDI Scanner PWA regression families, classify results by verification level, and report honestly.

Delegate inventory/level mapping to the **`rdi-testing`** skill. Use **`rdi-auditor`** for result reporting structure when a subagent is appropriate.

## Hard rules

- **No production mutations** (no transaction/master/settings writes, no Spreadsheet writes)
- **No deploy**, **no clasp push**, **no git commit/push** unless separately approved outside this command
- **Do not modify application source** as part of a pure regression run
- **Do not claim production readiness** merely because regression passes

## Chrome / CDP safety

1. Run browser/CDP suites **strictly sequentially** (one at a time).
2. Use a **unique temporary** `--user-data-dir` profile per run.
3. Avoid profile collisions; do not share a locked profile across parallel spawns.
4. Kill stale Chrome **only when necessary** (after a failed/orphaned run), not indiscriminately mid-suite.
5. Prefer dedicated ports; if CDP times out, stop, clean profile, retry once — do not fan out parallel Chrome.

## Suite ordering (when present)

Run in rough order, skipping any missing script as `NOT TESTED`:

**L1 static/simulation**
1. `version_consistency.js`
2. `verify_fix.js` / `verify_watch.js` / `oi_audit.js` (if used for fix gates)
3. `kartu_contract.js`
4. `r2_contract_leak.js`
5. `sec_classify.js`
6. `sec_scan.js` / `xss_audit.js` (if part of security regression)
7. `sim_auth_fix.js`
8. `sim_authz_matrix.js`
9. `sim_outbox.js`
10. `sim_stock.js`
11. `r2_qr_decoder.js`

**L2 browser/CDP** (sequential, unique profiles)
12. `switchtab_runtime.js`
13. `chrome_dom.js`
14. `chrome_scanner.js`
15. `chrome_smoke.js`
16. `r2_browser_suite.js`

**L3 real GAS read-only** (optional unless user asked for network)
17. `r2_gas_redirect.js`
18. `gas_readonly_parity.js`
19. `sec11_probe.js`

**L4** — physical device suites: only if explicitly provided; otherwise `DEVICE-DEPENDENT` / `NOT TESTED`.

## Classification requirements

For every family report:

- Verification level (L1–L5)
- Status: `PASS` | `FAIL` | `NOT TESTED` | `ENVIRONMENT-DEPENDENT` | `DEVICE-DEPENDENT` | `UNVERIFIED` | `ACCEPTED LIMITATION`
- Counts or evidence pointer (result JSON path when available)
- Highest level executed in this run

Report PASS / FAIL / NOT TESTED / ENVIRONMENT-DEPENDENT **separately** — do not collapse into a single “green.”

## Prohibited conclusions

- “Regression passed → production ready / L5”
- “sim_stock PASS → production saldo correct”
- “sec11 shell-only → all production authz L5-verified”
- “Local version match → deployed version PASS” when deployed version was not observed (`UNVERIFIED`)
