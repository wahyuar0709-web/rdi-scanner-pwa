---
description: Run a READ-ONLY RDI project audit using rdi-auditor (structure, tests, security posture, verification levels) without modifying source, deploying, committing, pushing, or mutating production.
---

# /audit — RDI Project Audit

Run an RDI Scanner PWA audit with agent **`rdi-auditor`** (delegate to **`rdi-security`** for security depth). This command is **READ-ONLY**.

## Invocation intent

User: `/audit` (optional focus: structure, security, tests, release, or a path)

## Procedure

1. **Inspect current project state**
   - Root listing, git status (read-only), presence of `AGENTS.md` and `.opencode/`
   - Note protected files; do not edit them

2. **Inspect protected application files (read-only)**
   - `index.html`, `scanner.html`, `sw.js`, `manifest.json`, `Code.gs`, `jsQR.min.js`, icons, `Backup/**`
   - Record structure/version signals only as evidence, not change requests executed in-session

3. **Inspect test inventory**
   - Look for in-project tests first (likely absent)
   - Map known external temp suites via `rdi-testing` skill levels
   - Missing script or unrun suite → `NOT TESTED`, not `PASS`

4. **Inspect security posture**
   - Delegate or apply `rdi-security` skill checklist
   - Prefer existing tests (`sec_classify`, `sec_scan`, `xss_audit`, authz sims, `sec11_probe` if L3 desired)
   - Live GAS only as read-only probes; never mutations

5. **Classify verification levels**
   - Per `AGENTS.md`: L1–L5, allowed statuses only
   - State highest level actually executed
   - Simulation PASS reported as L1 only

6. **Report findings**
   - Each finding: ID, Severity, Location, Evidence, Impact, Reproduction, Recommendation, Verification status
   - Do not silently fix during `/audit`

## Hard rules

- **NOT** modify application source or protected files
- **NOT** deploy
- **NOT** git commit
- **NOT** git push
- **NOT** mutate production (API or Spreadsheet)
- **NOT** install dependencies
- **NOT** modify global OpenCode configuration

## Test preference

Favor existing test scripts and prior result artifacts over inventing new tests. New tests only if the user explicitly expands scope into a test-authoring task (separate from `/audit`).
