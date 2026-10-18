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

- Suites live in `tests/l2/*.js` (`r2_browser_suite`, `r2_label_suite`, `r2_feature_smoke`, `r2_hp_cetak_fit`, `r2_login_unified`, `r2_menu_visual_suite`, `r2_outbox_app`, `r2_session_idle`, `r2_ui_quality_gate`, `r2_viewport_mode_suite`, `r2_ux_measured`, `r2_ux_states`, `r2_arsip_search`, `r2_qty0_last`, `r2_perf_pass`)
- Sequential only — one Chrome/CDP at a time
- Ports cleaned between suites (`TEST_CDP_PORTS` di `tests/run-l2.js`). **Tambah port di sini setiap menambah suite baru** — port yang tidak terdaftar membuat Chrome yatim tidak pernah dibersihkan, lalu suite berikutnya gagal bind dan timeout.
- JSON summary: `tests/results/l2_latest.json`
- Timeout per suite: **1800 s** (`SUITE_TIMEOUT_MS` di `tests/run-l2.js`) — 2026-10-13 dinaikkan 300→900 s, lalu 2026-10-14 dinaikkan lagi 900→1800 s. Alasannya terukur dua kali: `r2_browser_suite` butuh **814 s** saat dijalankan sendiri, jadi cap 900 s hanya memberi margin 10%; di dalam batch runner suite itu dibunuh lalu dilaporkan `FAIL (TIMEOUT)`, padahal 32 PASS / 0 FAIL saat sendirian. `TIMEOUT` = kegagalan harness sampai dibuktikan lain, BUKAN cacat produk. Tidak ada assertion yang diturunkan untuk mengejar cap.

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
4. Daftarkan port CDP + port HTTP mock-mu di `TEST_CDP_PORTS` dan `killL2Ports()` di `tests/run-l2.js`; kalau tidak, suite-mu meninggalkan Chrome yatim yang menahan port

## Prohibited

- Claiming L5 from L1/L2 alone
- Mutating production during any suite
- Parallel Chrome/CDP runs (L2)
