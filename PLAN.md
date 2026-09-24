# RDI Scanner PWA — Development Plan

| Field | Value |
|-------|--------|
| Document | `PLAN.md` (kanonik untuk pengembangan) |
| Version | 1.1 |
| Date | 2026-09-24 |
| Repo HEAD | `2696ebb` |
| App version | `v15.6` / SW `rdi-stok-v14` / GAS deployment `@41` |
| Mode | Option A — tanpa install ECC baru |
| Governance | `AGENTS.md` (protected files, L1–L5, approval) |

---

## 0. Ringkasan eksekutif

Empat tujuan pengembangan disetujui sebagai arah kerja:

| ID | Tujuan | Definition of Done (DoD) singkat |
|----|--------|----------------------------------|
| **T1** | App siap dipakai orang (gudang) | L4 device matrix selesai / waiver + L5 checklist terisi + blocker habis |
| **T2** | Kode sehat & maintainable | Suite di repo + `npm test` L1 + rencana split monolit dieksekusi bertahap (atau waiver) |
| **T3** | Fitur product prioritas | Backlog P0–P1 selesai atau di-defer eksplisit; tiap fitur gate L1/L2 |
| **T4** | Selesai & stop | Exit criteria E1–E6 dipenuhi + sign-off tertulis pemilik |

**Urutan resmi:** F0 → F1 (T1) ↔ F2 (T2 min.) → C1 → F3 (T3) → F4 (T2b split) → F5 (T4).

**Prinsip:** lapor jujur level verifikasi (L1–L5); report-first → approval → fix; tanpa klaim “production ready”.

---

## 1. Konteks & baseline

### 1.1 Arsitektur

```
Browser PWA (index.html, scanner.html, sw.js, manifest)
        │  HTTP GET/POST
Google Apps Script Web App (Code.gs)
        │
Google Sheets (Master_Item, Transaksi_Log, Stok_Saldo, Stok_Per_Rak, …)
```

### 1.2 Posisi saat ini (F0 snapshot — 2026-09-24)

| Item | Nilai | Status verif |
|------|-------|--------------|
| Git HEAD | `2696ebb` | — |
| Working tree | bersih (sebelum PLAN.md) | — |
| `APP_VERSION` | `v15.6` (source of truth + title/apple/css/js labels sinkron setelah fix VER-01) | L1 PASS |
| `APP_BUILD_DATE` | `2026-09-24` | L1 |
| SW `CACHE` | `rdi-stok-v14` (`sw.js:1`) | L1 |
| `index.html` lines | ~4141 | L1 |
| Suite L1 in-repo | `tests/l1/` 13 suite · `npm run test:l1` | **L1 PASS 211/0** (2026-09-24) |
| GAS deployment | `@41` (prod exec URL) | L3 historical / UNVERIFIED if not re-probed |
| Suites di Temp | 37 file `.js` | inventory |
| Suite terakhir label | 48 PASS / 0 FAIL / 3 NOT TESTED | L1+L2 |
| Suite terakhir browser | 32 PASS / 0 FAIL | L2 |
| L4 device | belum dijalankan | **NOT TESTED** / DEVICE-DEPENDENT |
| L5 operational | belum | **NOT TESTED** |

### 1.3 Yang sudah selesai (sesi sebelumnya)

- Full-stack audit + plan fase 0–7  
- Fix batch phase 1–6 → commit `09deda9`, GAS @41  
- LBL-01 (QR `rak undefined`) → commit `2696ebb`, push  
- `/harness-audit` → 3/39 (bias rubric Claude-centric; `.opencode` rdi tidak dinilai)  
- `/project-init` dry-run → Option A (nol install ECC)

### 1.4 Temuan terbuka (backlog master)

| ID | Sev | Ringkasan | Target tujuan |
|----|-----|-----------|---------------|
| LBL-01 | MEDIUM | QR payload `rak undefined` | **DONE** `2696ebb` |
| VER-01 | MEDIUM | Label versi statis title/apple/css/js/topbar `v15.5` vs `APP_VERSION=v15.6` | **DONE** (sesi PLAN F2; L1 13/13) |
| LBL-02 | LOW–MED | QR via external `api.qrserver.com` (offline/privasi) | T1 keputusan |
| LBL-03 | INFO | Page math 25 label NOT TESTED (IIFE harness) | T1 / T2 |
| LBL-04 | INFO | Print/PDF device-dependent | T1 L4 |
| MONO-01 | INFO | Monolit `index.html` ±4k baris; IIFE sulit test | T2 F4 |
| TEST-01 | MED | Suite di Temp, bukan `tests/` repo | **DONE** F2 wave-1 |
| HARNESS-01 | INFO | Score 3/39; expect `.claude/` vs `.opencode` rdi | documented |

---

## 2. Prinsip kerja

1. **Option A** — tanpa install ECC; pakai `/audit`, `/regression`, skill `rdi-*`, `AGENTS.md`.  
2. **Verification levels** — L1 ≠ L2 ≠ L3 ≠ L4 ≠ L5; status hanya:  
   `PASS` | `FAIL` | `NOT TESTED` | `ENVIRONMENT-DEPENDENT` | `DEVICE-DEPENDENT` | `UNVERIFIED` | `ACCEPTED LIMITATION`  
3. **Report first** — temuan format `AGENTS.md` §H; fix hanya di scope eksplisit.  
4. **File protected** (`index.html`, `scanner.html`, `sw.js`, `manifest.json`, `Code.gs`, `jsQR.min.js`, icons, `Backup/**`) — ubah = approval per perubahan.  
5. **Forbidden tanpa approval** — deploy, clasp, git commit/push, mutasi prod, install deps global, sentuh `~/.opencode`.  
6. **Basis referensi** (riset):  
   - MVP prioritization matrix (impact × urgency) — MVP.dev / NN/g  
   - Definition of Done checklist — Agile DoD  
   - PWA testing: MDN best practices, web.dev PWA checklist, device offline/SW update matrix  
   - Monolit → modular: strangler / incremental refactor + test gate (bukan big-bang rewrite)

---

## 3. T1 — Siap dipakai orang (Fase F1)

### 3.1 DoD T1

- [ ] L4 device matrix D1–D12: semua `PASS` / `FAIL` ditindak / waiver tertulis  
- [ ] L5 checklist §3.4 terisi (bukan klaim “ready” tanpa angka)  
- [ ] Temuan blocker open: `FIXED` atau `ACCEPTED LIMITATION`  
- [ ] L1+L2 regression hijau di commit yang sama dengan build yang diuji device  

### 3.2 Work breakdown

| ID | Item | Level | Default status | Aksi |
|----|------|-------|----------------|------|
| T1.A | Refresh inventory temuan open | L1 | perlu | Klasifikasi blocker vs nice |
| T1.B | LBL-02 QR external | L1–L2 | OPEN | **Keputusan** §3.3 |
| T1.C | LBL-03 label 25 | L1 | NOT TESTED | Build harness / fix jika daily |
| T1.D | LBL-04 print device | L4 | DEVICE-DEPENDENT | masuk D8 |
| T1.E | Regression L1+L2 | L1–L2 | last green | `/regression` sequential |
| T1.F | L3 read-only smoke | L3 | optional | hanya bila minta network |
| T1.G | **L4 device matrix** | L4 | **NOT TESTED** | §3.3 |
| T1.H | **L5 sign-off** | L5 | **NOT TESTED** | §3.4 setelah T1.G |

### 3.3 Keputusan wajib sebelum build T1

| # | Keputusan | Opsi | Default rencana (ubah jika Anda beda) |
|---|-----------|------|--------------------------------------|
| 1 | QR offline (LBL-02) | (a) accept limitation (b) QR lokal | **(a) ACCEPTED LIMITATION dulu** → promote ke P0 hanya jika operasi gudang butuh cetak offline penuh |
| 2 | Label 25 page (LBL-03) | (a) accept (b) fix + harness | **(b) masuk T2/T1** karena cetak = alur kerja |
| 3 | Device scope | n device × OS | **min. 1 Android** operator gudang; iOS jika ada |

### 3.4 L4 Device Checklist (operasional — Anda di HP)

| # | Skenario | Pass criteria | Status |
|---|----------|---------------|--------|
| D1 | Install / A2HS | Icon, buka, standalone | NOT TESTED |
| D2 | Cold start offline | Shell + menu tampil | NOT TESTED |
| D3 | Scan kamera | jsQR decode benar | NOT TESTED |
| D4 | MASUK/KELUAR online | Ledger + toast OK | NOT TESTED |
| D5 | Offline → outbox → online | PENDING→SYNCED, no dup | NOT TESTED |
| D6 | Logout / expired session | Tidak ghost write | NOT TESTED |
| D7 | Viewer vs Editor | Viewer read-only | NOT TESTED |
| D8 | Cetak label print/PDF | Layout benar; rak bukan `undefined` | NOT TESTED |
| D9 | Multi-rak / kartu stok | Saldo konsisten UI | NOT TESTED |
| D10 | SW update | Cache versi terbaru aktif | NOT TESTED |
| D11 | Mid-submit network drop | Tidak invent success | NOT TESTED |
| D12 | Layout 360×640 | Tombol kritis tidak overflow | NOT TESTED |

**Metode:** Anda eksekusi → laporkan per baris → saya root-cause FAIL → fix gate L1/L2 → ulang baris terkait.

### 3.5 L5 Operational Sign-off Checklist

- [ ] Paritas versi prod = repo dicatat (`APP_VERSION` / title / SW)  
- [ ] L4 D1–D12 selesai atau waiver  
- [ ] L1+L2 hijau di commit rilis  
- [ ] L3 (opsional) hasil / ENVIRONMENT-DEPENDENT  
- [ ] Rollback: SW bump + git revert + redeploy GAS @id  
- [ ] Backup Sheet + akses editor terdokumentasi  
- [ ] Known issues: LBL-02 status, device quirk  
- [ ] Runbook 1 halaman operator  
- [ ] Sign-off pemilik: **L4 = …, L5 = …** (angka, bukan “ready”)

---

## 4. T2 — Kode sehat (Fase F2, lalu F4)

### 4.1 F2 — Pagar kualitas (prioritas)

| ID | Aksi | Path | Status rencana |
|----|------|------|----------------|
| T2.1 | Suite L1 di repo | `tests/l1/` (13 file) | **DONE** F2 wave-1 |
| T2.2 | `package.json` scripts | `package.json` | **DONE** `test` / `test:l1` |
| T2.3 | Runner L1 sequential + JSON | `tests/run-l1.js` | **DONE** |
| T2.4 | `.gitignore` secrets/artifacts | `.gitignore` | **DONE** |
| T2.5 | `TESTING.md` level + cara run | `TESTING.md` | **DONE** |
| T2.6 | Suite L2 di repo (opsional copy / pointer) | `tests/l2/` | F2 wave-3 |
| T2.7 | CI GitHub L1 only (opsional) | `.github/workflows/` | deferred |
| T2.8 | Re-run harness-audit setelah F2 | chat | metrics |

**Aturan F2:** tidak npm-install library baru tanpa alasan; Node bawaan + Chrome CDP yang sudah dipakai.

### 4.2 F4 — Split monolit (setelah C1; incremental)

| Fase | Isi | Gate |
|------|-----|------|
| F4.1 | Peta modul (auth, data, cetak, scanner, outbox, UI) — dokumen saja | review |
| F4.2 | Ekstrak util murni (`ex`/`xe`, format, QR payload) → `js/util.js` | L1 contract + L2 smoke |
| F4.3 | Ekstrak cetak/label | `r2_label_suite` hijau |
| F4.4 | Ekstrak outbox/API client | sim_outbox + L2 |
| F4.5 | Sisa shell (opsional; stop bila ROI jelek) | full L1+L2 |

**Strategi:** refactor bertahap + test gate (strangler), **bukan** rewrite big-bang.  
**SW CACHE bump** bila path shell berubah. Approval per file protected.

---

## 5. T3 — Fitur product (Fase F3)

### 5.1 Backlog prioritas (matrix impact × urgency)

| Prio | ID | Fitur | Impact | Urgency | Syarat masuk |
|------|-----|-------|--------|---------|--------------|
| P0 | F-00 | QR lokal (jika keputusan §3.3 #1 = b) | H | H (offline) | keputusan |
| P0 | F-00b | Fix label 25 (LBL-03) | H | H | harness |
| P1 | F-01 | Multi-copy cetak (n label/item) | H | M | suite label |
| P1 | F-02 | Template label (4×6 vs lain) | M | M | setelah F-01 |
| P1 | F-03 | Filter cetak per rak/kategori | M | M | render test |
| P2 | F-04 | Alert low stock (min_stock) | M | L | dashboard |
| P2 | F-05 | Export QR massal | M | L | — |
| P3 | F-06+ | ide lain | — | — | antrian |

### 5.2 Pipeline per fitur (DoD fitur)

1. Spesi 1 halaman (user, pain, done = ?)  
2. Test dulu (L1/L2) → RED  
3. Implement → GREEN (approval file protected)  
4. Subset regression hijau  
5. Version bump bila shell berubah  
6. Commit+push / clasp = approval terpisah  
7. Masuk checklist rilis  

**Anti-creep:** max **1 P0 + 1 P1** per cycle; ide di luar backlog = antrian.

---

## 6. T4 — Selesai & stop (Fase F5)

### 6.1 Exit criteria

| # | Kriteria |
|---|----------|
| E1 | T1: L4+L5 atau waiver tertulis |
| E2 | T2: tests di repo + `npm run test:l1` hijau (F4 boleh waiver) |
| E3 | T3: P0/P1 selesai atau deferred eksplisit ke V2 |
| E4 | Semua temuan: FIXED / ACCEPTED LIMITATION / deferred-ID |
| E5 | Docs: TESTING, rollback, known issues, runbook |
| E6 | Pemilik menyatakan **“cukup”** tertulis |

### 6.2 Artefak stop

1. Status akhir per T1–T4 (angka + level)  
2. Backlog V2  
3. Wontfix + alasan  
4. Runbook operasional 1 halaman  

### 6.3 Definisi stop

- Tidak ada fitur/fix baru kecuali sesi V2 dibuka  
- Maintenance = blocker saja  
- `/audit` / `/regression` saat rilis  

---

## 7. Roadmap & checkpoint

```text
F0 Baseline ──► F1 T1 (device+L5) ──C1──► F3 T3 ──► F4 T2b ──► F5 T4 STOP
      │              ▲                        │
      └──► F2 T2 min (paralel) ──────────────┘
```

| CP | Syarat lanjut | Boleh stop? |
|----|---------------|-------------|
| C0 | PLAN.md ini disetujui / dipakai | ya (plan) |
| C1 | L4+L5 atau waiver | **ya — cukup dipakai** |
| C2 | `npm run test:l1` di repo | ya (sehat min) |
| C3 | P0–P1 turun / deferred | ya |
| C4 | E1–E6 | **stop penuh** |

---

## 8. Approval matrix

| Aksi | Approval |
|------|----------|
| Read-only audit / L3 GET | tidak |
| Tulis `PLAN.md`, `tests/**`, `package.json`, `.gitignore`, `TESTING.md` | **ya** (izin eksekusi sesi ini: user perintah create plan + execute) |
| Edit file protected | **ya per perubahan** |
| `git commit` / `push` | **ya** (belum dieksekusi sampai minta) |
| clasp / deploy | **ya** |
| Mutasi GAS/Sheet | **ya** |
| Sentuh `~/.opencode` / `.opencode/**` rdi | **ya** (hindari) |
| L4 manual | Anda |

---

## 9. Risiko & mitigasi

| Risiko | Dampak | Mitigasi |
|--------|--------|----------|
| L4 tidak pernah jalan | T1 gagal; T3 sia-sia | checklist D1–D12 + jadwal device |
| Scope fitur menumpuk | regresi monolit | gate C1–C2; max 1 P1 |
| Split besar | rusak behavior | F4 incremental + suite gate |
| Suite hilang di Temp | T2 gagal | F2 wave-1 salin/wrapper ke `tests/` |
| QR external mati/privasi | label offline gagal | keputusan §3.3; default accept → P0 jika perlu |
| Satu developer | F4 lambat | F4.1 cukup; F4.2–4.3 saja yang realistis |

---

## 10. Checklist eksekusi (live)

### F0 — Baseline
- [x] Snapshot versi / HEAD / suite inventory (2026-09-24)  
- [x] Backlog temuan §1.4  
- [x] PLAN.md ditulis  

### F2 wave-1 — Tests in repo
- [x] `package.json` + scripts `test` / `test:l1`  
- [x] `tests/l1/` 13 suite L1  
- [x] `tests/run-l1.js`  
- [x] `.gitignore` + `TESTING.md`  
- [x] **Run 1:** 206P / 5F → FAIL `version_consistency` (VER-01)  
- [x] **Fix VER-01:** title/apple/css/js/topbar/sheet `v15.5` → `v15.6` (komentar historis `F4 v15.5` tetap)  
- [x] **Run 2:** `L1 PASS | suites=13 | assertPass=211 | assertFail=0`  
- [ ] Commit (butuh approval terpisah)  

### F1 — T1 (butuh Anda untuk L4)
- [ ] Keputusan §3.3 (default: accept QR; fix label 25; 1 Android)  
- [ ] Distribusi checklist D1–D12  
- [ ] Jalankan L4 → laporkan  
- [ ] L5 checklist  

### F3 — T3 (setelah C1/C2)
- [ ] Pilih P0/P1 pertama  
- [ ] Pipeline §5.2  

### F4 / F5
- [ ] Split bertahap  
- [ ] Exit E1–E6  

---

## 11. Log keputusan

| Tanggal | Keputusan | Alasan | Ref |
|---------|-----------|--------|-----|
| 2026-09-24 | Option A — tanpa install ECC | fokus app; harness score bias | session |
| 2026-09-24 | Empat tujuan T1–T4 + fase F0–F5 | arah pengembangan terdocument | PLAN.md v1.0 |
| 2026-09-24 | LBL-01 fixed | QR rak undefined | `2696ebb` |
| 2026-09-24 | Default LBL-02 = ACCEPTED LIMITATION | friction rendah; promote P0 jika offline cetak wajib | §3.3 |
| 2026-09-24 | LBL-03 masuk track T1/T2 | cetak = daily driver gudang | §3.3 |
| 2026-09-24 | F2 wave-1 dieksekusi | user: plan → execute → test → revise | §10 |
| 2026-09-24 | VER-01: sinkron label versi statis ke v15.6 | L1 `version_consistency` 5 FAIL | run #1→#2 |
| 2026-09-24 | L1 hijau 211/0 di-repo | gate C2 terpenuhi (belum commit) | `tests/results/l1_latest.json` |
| _isian sesi_ | | | |

---

## 12. Lampiran

### 12.1 Suite map → level (`rdi-testing`)

| Level | Lokasi suite |
|-------|--------------|
| L1 | **`tests/l1/`** (in-repo, `npm run test:l1`) — `version_consistency`, `kartu_contract`, `r2_contract_leak`, `sec_classify`, `sim_*`, `r2_qr_decoder`, `xss_audit`, … |
| L2 | Temp: `r2_browser_suite.js`, `r2_label_suite.js`, `switchtab_runtime.js`, `chrome_dom.js`, `chrome_scanner.js` (F2 wave-3: pindah ke `tests/l2/`) |
| L3 | Temp: `sec11_probe.js`, `gas_readonly_parity.js`, `r2_gas_redirect.js` |
| L4 | checklist D1–D12 manual (`PLAN.md` §3.4) |
| L5 | §3.5 operasional |

### 12.2 File kanonik

| File | Peran |
|------|-------|
| `AGENTS.md` | governance, L1–L5, protected, output discipline |
| `PLAN.md` | dokumen ini — dasar pengembangan |
| `.opencode/skills/rdi-testing` | inventory test + level |
| `.opencode/skills/rdi-security` | methodology security |
| `.opencode/commands/audit.md` | `/audit` read-only |
| `.opencode/commands/regression.md` | `/regression` |
| `README.md` | setup end-user / deploy |

### 12.3 Referensi eksternal (riset)

- NN/g — MVP definition & usability  
- MVP.dev — prioritization matrix impact×urgency  
- MDN — PWA best practices (offline, multi-device test)  
- web.dev — PWA getting started / checklist  
- Agile Definition of Done — checklist sebelum “done”  
- Incremental modularization / strangler — split monolit tanpa rewrite  

---

## 13. Perubahan dokumen

| Versi | Tanggal | Perubahan |
|-------|---------|-----------|
| 1.0 | 2026-09-24 | Initial: T1–T4, F0–F5, checklist, referensi riset |
| 1.1 | 2026-09-24 | F2 wave-1 done; VER-01 fixed; L1 **211 PASS / 0 FAIL**; §1.2, §1.4, §4.1, §10, §11 |

**Aturan revisi:** setiap test run / keputusan besar → update §10 + §11; jangan hapus history log.
