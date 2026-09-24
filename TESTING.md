# Testing — RDI Scanner PWA

Level definitions follow `AGENTS.md` and `.opencode/skills/rdi-testing/SKILL.md`.
**L1 PASS ≠ L2 PASS ≠ L3 PASS ≠ L4 PASS ≠ L5 PASS.**

## Run L1 (in repo)

```bash
npm run test:l1
# or
node tests/run-l1.js
```

- Suites live in `tests/l1/*.js`
- Sequential, no Chrome required
- JSON summary: `tests/results/l1_latest.json`
- Exit code `0` = no `FAIL` lines

## Run L2 (in repo, Chrome required)

```bash
npm run test:l2
# or
node tests/run-l2.js
```

- Suites live in `tests/l2/*.js` (`r2_browser_suite`, `r2_label_suite`)
- Sequential only — one Chrome/CDP at a time
- Ports cleaned between suites (8781, 8782, 9338)
- JSON summary: `tests/results/l2_latest.json`
- Timeout per suite: 180s

## Levels

| Level | Where | Command / method |
|-------|-------|------------------|
| L1 static/sim | `tests/l1/` | `npm run test:l1` |
| L2 browser/CDP | `tests/l2/` | `npm run test:l2` |
| L3 GAS read-only | Temp probes | only with user approval; no mutations |
| L4 device | checklist D1–D12 in `PLAN.md` §3.4 | physical phone |
| L5 production | `PLAN.md` §3.5 | operational sign-off |

## Adding an L1 suite

1. Drop a Node script in `tests/l1/`
2. Print lines as `PASS | name`, `FAIL | name | evidence`, or allowed non-fail statuses
3. Exit non-zero only on real failures (runner also scans for `FAIL`)
4. Keep under 120s; no network; no production writes

## Adding an L2 suite

1. Drop a Node script in `tests/l2/`
2. Use unique Chrome profile dirs; sequential only
3. Print `PASS |` / `FAIL |` lines (or `=== NAME: N PASS / M FAIL ===`)
4. Runner kills ports 8781/8782/9338 between suites

## Prohibited

- Claiming L5 from L1/L2 alone
- Mutating production during any suite
- Parallel Chrome/CDP runs (L2)
