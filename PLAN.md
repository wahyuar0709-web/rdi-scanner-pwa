# RDI Scanner PWA — Development Plan

| Field | Value |
|-------|--------|
| Document | `PLAN.md` (kanonik untuk pengembangan) |
| Version | 1.15 |
| Date | 2026-09-25 |
| Repo HEAD | `9e64c49` (F-06a) |
| App version | `v15.17` / SW `rdi-stok-v25` / GAS deployment `@41` |
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
| Git HEAD | `9e64c49` (F-06a) | — |
| Working tree | clean | — |
| `APP_VERSION` | `v15.17` (source of truth + title/apple/css/js/topbar sinkron) | L1 PASS |
| `APP_BUILD_DATE` | `2026-09-24` | L1 |
| SW `CACHE` | `rdi-stok-v25` (`sw.js:1`) + precache `./js/util.js` + `./js/cetak.js` + `./js/outbox.js` + `./js/format.js` | L1+L2 |
| `index.html` lines | ~4300 (F-06b: 26 aria-label input + `_overlayCloseMap`/`closeTopOverlay`) | L1 |
| Suite L1 in-repo | `tests/l1/` **20** suite · `npm run test:l1` | **L1 PASS 402/0** (2026-09-25) |
| Suite L2 in-repo | `tests/l2/` 2 suite · `npm run test:l2` | **L2 PASS 81/0** (2026-09-25) |
| GAS deployment | `@41` (prod exec URL) | L3 historical / UNVERIFIED if not re-probed |
| Suites di Temp | 37 file `.js` | inventory (L2 sudah di-copy ke repo) |
| Suite terakhir label | 49 PASS / 0 FAIL (+3 NOT TESTED INFO) | **L2 PASS** |
| Suite terakhir browser | 32 PASS / 0 FAIL | **L2 PASS** |
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
| LBL-02 | LOW–MED | QR via external `api.qrserver.com` (offline/privasi) | **DONE** v15.8 lokal `qrcode.min.js` |
| LBL-03 | INFO | Page math 25 label NOT TESTED (IIFE harness) | **DONE** `label_pagemath.js` L1 18/0 |
| LBL-04 | INFO | Print/PDF device-dependent | T1 L4 |
| MONO-01 | INFO | Monolit `index.html` ±4k baris; IIFE sulit test | T2 F4 |
| TEST-01 | MED | Suite di Temp, bukan `tests/` repo | **DONE** F2 wave-1 |
| F-01 | MED | Multi-copy cetak (n label/item) | **DONE** v15.7 `cetak-copies` |
| F-02 | MED | Template label (4×6 vs lain) | **DONE** v15.13 `label-tpl` |
| F-03 | MED | Filter cetak per rak/kategori | **DONE** v15.14 `_activeRak` |
| F-04 | MED | Alert low stock (min_stock) | **DONE** pre-existing; locked `alert_lowstock.js` |
| F-05 | LOW | Export QR massal | **DONE** v15.15 `exportQRMassal`/`doExportQR` (spesi §5.1.3) |
| UI-01 | HIGH | Fokus modal → helper `modalFocusOpen`/`modalFocusClose` (4 pasang open/close) | **DONE** v15.16 `modalFocusOpen` (F-06a) |
| UI-02 | HIGH | 17/17 `.sbar` `role`/`aria-live`; 4 `.s-err` `role="alert"` | **DONE** v15.16 (F-06a) |
| UI-03 | HIGH | ≥28 input placeholder-only tanpa label/`aria-label` | **DONE** v15.17 (F-06b) |
| UI-04 | MED | Escape hanya 7/20 overlay; backdrop modal tak bisa diklik | **DONE** v15.17 (F-06b) |
| UI-05 | MED | 9 `<th th-sortable>` onclick tanpa role/tabindex (tak keyboard) | F-06c (spesi §5.1.4) |
| UI-06 | MED | Tombol ikon `&times;`/`▾`/`↻`/`✕`/🔦 tanpa accessible name | F-06c (spesi §5.1.4) |
| UI-07 | MED | 43 rule font <12px (min 8px) di label esensial | F-06d (spesi §5.1.4) |
| UI-08 | MED | `--text3` 4.18:1 di atas `--bg` (gagal AA); hex amber hardcoded | F-06d (spesi §5.1.4) |
| UI-09 | MED | `100vh` ×4 tanpa fallback `100dvh` (index.html) | F-06e (spesi §5.1.4) |
| UI-10 | LOW | `modal-filter`/`modal-sort` tanpa `role="dialog"`/`aria-modal` | F-06e (spesi §5.1.4) |
| UI-11 | LOW | `<h2>Masuk</h2>` L263 sebelum `<h1>` L412 (urutan heading) | F-06f (spesi §5.1.4) |
| UI-12 | LOW | `.sheet-close`/`.ilc3-fab` 30px < 44px target sentuh | F-06f (spesi §5.1.4) |
| UI-13 | LOW | Deep linking tak ada (tab tak tercermin di URL/hash) | F-06f (spesi §5.1.4) |
| UI-14 | LOW | `prefers-color-scheme` tak dipakai (tema manual `rdi_theme`) | F-06f (spesi §5.1.4) |
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
| T1.B | LBL-02 QR external | L1–L2 | **DONE** v15.8 | QR lokal `qrcode.min.js` |
| T1.C | LBL-03 label 25 | L1 | NOT TESTED | Build harness / fix jika daily |
| T1.D | LBL-04 print device | L4 | DEVICE-DEPENDENT | masuk D8 |
| T1.E | Regression L1+L2 | L1–L2 | last green | `/regression` sequential |
| T1.F | L3 read-only smoke | L3 | optional | hanya bila minta network |
| T1.G | **L4 device matrix** | L4 | **NOT TESTED** | §3.3 |
| T1.H | **L5 sign-off** | L5 | **NOT TESTED** | §3.4 setelah T1.G |

### 3.3 Keputusan wajib sebelum build T1

| # | Keputusan | Opsi | Default rencana (ubah jika Anda beda) |
|---|-----------|------|--------------------------------------|
| 1 | QR offline (LBL-02) | (a) accept limitation (b) QR lokal | **(b) diambil** → QR lokal v15.8 `qrcode.min.js` |
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
| T2.6 | Suite L2 di repo | `tests/l2/` (2 suite) | **DONE** F2 wave-2 |
| T2.6b | Runner L2 sequential + npm script | `tests/run-l2.js`, `package.json` | **DONE** `test:l2` |
| T2.7 | CI GitHub L1 only (opsional) | `.github/workflows/l1.yml` | **DONE** `886cc49` |
| T2.8 | Re-run harness-audit setelah F2 | chat | metrics |

**Aturan F2:** tidak npm-install library baru tanpa alasan; Node bawaan + Chrome CDP yang sudah dipakai.

### 4.2 F4 — Split monolit (setelah C1; incremental)

| Fase | Isi | Gate |
|------|-----|------|
| F4.1 | Peta modul (auth, data, cetak, scanner, outbox, UI) — dokumen saja | **DONE** §4.3 |
| F4.2 | Ekstrak util murni (`ex`/`xe`, format, QR payload) → `js/util.js` | **DONE** L1 229/0 + L2 browser 32/0 + label 49/0 |
| F4.3 | Ekstrak cetak/label → `js/cetak.js` | **DONE** L1 229/0 + L2 browser 32/0 + label 49/0 |
| F4.4 | Ekstrak outbox/API client → `js/outbox.js` | **DONE** L1 229/0 + L2 browser 32/0 + label 49/0 |
| F4.5 | Ekstrak pure format/token/CSV helpers → `js/format.js` | **DONE** L1 229/0 + L2 browser 32/0 + label 49/0 (sisa shell di-defer; stop bila ROI jelek) |

**Strategi:** refactor bertahap + test gate (strangler), **bukan** rewrite big-bang.  
**SW CACHE bump** bila path shell berubah. Approval per file protected.

### 4.3 F4.1 — Peta modul `index.html` (4369 baris, 2026-09-24)

Blok besar: HTML 1–218 · CSS 19–219 · MARKUP 220–2205 · **JS 2206–4182** · boot/trailer 4183–4369.

| Modul | Baris JS (approx) | Isi | Target F4 |
|-------|-------------------|-----|-----------|
| **util / escape** | 2340–2361, 3008, 3037, 2884+3009 | `gasGet/Post`, `xe`/`ex`/`xeJs`, `qrImgSrc` (dup), escapers | **DONE** F4.2 → `js/util.js` |
| **auth / session** | 2231–2248 | login viewer/editor, session | F4.4 (API client) + F4.5 (pure token helpers) |
| **UI chrome** | 2214–2301, 2419–2453, 3316–3320 | tooltip, theme, sort/filter, master lists, config modal, status bar, tab nav, boot splash | shell / F4.5 |
| **data load** | 2454–2470 | `loadData`, pagination `allRows` | F4.4 |
| **inventory table** | 2471–2665 | tabel, min stock, dashboard widgets, alert badge | shell |
| **transaksi** | 2666–2789 | scan mode, draft, lookup, preview, `submitTransaksi`, batch cart 2362–2418 | F4.4 (outbox/API) |
| **riwayat / history** | 2790–2854, 2925–2996 | step load, per-hari, feed, CSV export, detail kartu | shell |
| **rak** | 2855–2924 | grouping, label rak, `buildRakLabelHTML` | **DONE** F4.3 → `js/cetak.js` |
| **cetak / label** | 2997–3261 | `generateOutput`, `buildLabelHTML`, `kartu`, `ex` dup, cetak picker, multi-copy | **DONE** F4.3 → `js/cetak.js` (builders global; orchestration tetap di IIFE) |
| **scanner kamera** | 3262–3315 | `scanFrame` ×4 (transaksi/hist/rak/master) via jsQR | F4.4 / shell |
| **master item form** | 3321–3344 | tambah/edit item sheet | shell |
| **modul aset** | 3353–4181 | aset dashboard, unit, aksi, CP, kontrol asah, vendor | shell (domain tersendiri) |
| **outbox** | (inline di submitTransaksi / sw) | PENDING→SYNCED (L1 `sim_outbox`) | **DONE** F4.4 → `js/outbox.js` |
| **pure helpers** | pad2/date/CSV/fuzzy/token (tersebar) | `pad2`, `parseViewerToken`, `calcTotalPages`, `csvEscapeField`, `fuzzyScore`, `_fmtTglSingkat`, … | **DONE** F4.5 → `js/format.js` |

**Temuan:**
- `qrImgSrc` didefinisikan **2×** (≈2884 dan ≈3009) — duplikat; F4.2 DONE: terkonsolidasi ke `js/util.js` (v15.9).
- `ex`/`xe` di util; `kartu`/`buildLabelHTML` bergantung padanya → urutan F4.2 sebelum F4.3.
- IIFE global (bukan ESM) — ekstrak = pindah ke file `<script defer>` + pertahankan global contract (L1 suites cek via `index.html` string → perlu update suite setelah split, atau concat-scan).
- F4.3 DONE: `buildRakLabelHTML`/`buildLabelHTML`/`buildPrintHTML` pindah ke `js/cetak.js` (global, tanpa defer, setelah util.js); marker `// buildLabelHTML/buildPrintHTML moved → js/cetak.js (F4.3)`; suites concat-scan `index.html + js/cetak.js` (label_pagemath, kartu_contract, r2_contract_leak, r2_label_suite, r2_browser_suite).
- F4.4 DONE: `gasGet`/`gasPost`/`checkUrl`/`genRequestId` + outbox queue (`readOutbox`/`writeOutbox`/`pushOutbox`/`removeOutboxByRequestId`/`scheduleOutboxRetry`/`flushOutbox`) pindah ke `js/outbox.js` (global, tanpa defer, setelah cetak.js); config bridge `window.__rdiConfig` (dipilih untuk hindari collision dengan fungsi `__rdiCfg()` — lesson: jangan pakai nama sama untuk objek dan fungsi); marker `// gasGet/gasPost/checkUrl/genRequestId moved → js/outbox.js (F4.4)` + `/* outbox queue/flush moved → js/outbox.js (F4.4) */`; orchestration (`forceReLogin`/`showStatus`/`submitTransaksi`/`checkTransaksiDraft`) tetap di IIFE; suites concat-scan `index.html + js/outbox.js` (r2_contract_leak, dup_check); browser suite assets += `./js/outbox.js`.
- F4.5 DONE: 23 pure helpers pindah ke `js/format.js` (global, tanpa defer, setelah outbox.js): `pad2`, `b64UrlDecode`, `parseViewerToken`, `normalizeNeedLoginMsg`, `_toDateInputVal`, `_isArsip`, `_ddmmyyyy`, `_tglMasukTs`, `batchStatusInfo`, `canRetryBatchItem`, `calcTotalPages`, `_formatHistoryTime`, `_fmtTglSingkat`, `rackHeatColor`, `formatRakBreakdown`, `todayKeyStr`, `csvEscapeField`, `parseDateKey`, `parseTimeOnly`, `formatDayLabel`, `dateKeyDaysAgo`, `fuzzyScore`, `fuzzyMatch`. Marker `/* pure helpers moved → js/format.js (F4.5) */`. **F45-01 fix:** `_fmtTglSingkat`/`_formatHistoryTime` didefinisikan di main IIFE tetapi dipanggil dari ASET IIFE → latent ReferenceError; sekarang global. **Lesson patch:** multi-line body di index.html CRLF → ekstrak dinamis dari file, jangan hardcode `\n`. Suites concat-scan `index.html + js/outbox.js + js/format.js` (r2_contract_leak, dup_check); browser suite assets += `./js/format.js`. Sisa shell (UI chrome/DOM/state tinggi) **di-defer** — stop F4 split di sini (ROI jelek).

**Gate F4.1:** review peta ini; lanjut F4.2 hanya setelah peta disetujui.

---

## 5. T3 — Fitur product (Fase F3)

### 5.1 Backlog prioritas (matrix impact × urgency)

| Prio | ID | Fitur | Impact | Urgency | Syarat masuk |
|------|-----|-------|--------|---------|--------------|
| P0 | F-00 | QR lokal (jika keputusan §3.3 #1 = b) | H | H (offline) | **DONE** v15.8 `qrcode.min.js` + `qrImgSrc` |
| P0 | F-00b | Fix label 25 (LBL-03) | H | H | **DONE** `label_pagemath.js` |
| P1 | F-01 | Multi-copy cetak (n label/item) | H | M | **DONE** v15.7 `cetak-copies` input + expand |
| P1 | F-02 | Template label (4×6 vs lain) | M | M | **DONE** v15.13 `label-tpl` (spesi §5.1.1) |
| P1 | F-03 | Filter cetak per rak/kategori | M | M | **DONE** v15.14 `_activeRak` (spesi §5.1.2) |
| P2 | F-04 | Alert low stock (min_stock) | M | L | **DONE** (pre-existing; locked `alert_lowstock.js` 53/0) |
| P2 | F-05 | Export QR massal | M | L | **DONE** v15.15 `exportQRMassal`/`doExportQR` (spesi §5.1.3) |
| P2 | F-06 | Paket perbaikan UI/UX aksesibilitas (14 temuan audit) | H | M | **spesi §5.1.4**; gelombang F-06a→f, maks 2 temuan/siklus — **F-06a+b DONE** v15.16/15.17 |
| P3 | F-07+ | ide lain | — | — | antrian |

### 5.1.1 Spesi F-02 — Template label (4×6 vs lain)

| Field | Isi |
|-------|-----|
| **User** | Operator gudang cetak label barang A4 |
| **Pain** | Grid label terkunci 4×6 (24/hal). Butuh label lebih besar (2×7) untuk material nama panjang / lokasi outdoor, atau 3×8 (lebih lebar) untuk kolom sempit. |
| **Scope in** | Select template di tab **Label Barang**: **4×6** (default), **3×8** (24/hal), **2×7** (14/hal). Page math + grid CSS + QR size ikut template. Paper-size tetap tersembunyi di label mode. Kartu stok tidak berubah. |
| **Scope out** | F-03 filter cetak; template custom user; non-A4; dry-run print (L4 D8). |
| **Done = ?** | UI `#label-tpl-wrap` + `#label-tpl`; `buildLabelHTML(items,mode,tplId)` default **4×6 identik output lama**; `updateCetakCount` + `generateOutput` baca template; L1 `label_template.js` GREEN; regression L1+L2 hijau; bump shell. |
| **Acceptance** | 25 item @4×6 → 2 hal; 15 item @2×7 → 2 hal; 24 item @3×8 → 1 hal; unknown tpl → fallback 4×6; kartu mode: wrap label tersembunyi; label mode: wrap tampil, paper-size `display:none`. |

### 5.1.2 Spesi F-03 — Filter cetak per rak/kategori

| Field | Isi |
|-------|-----|
| **User** | Operator gudang pilih item cetak label/kartu per lokasi rak |
| **Pain** | Sheet filter sudah punya **Kategori** (`_activeCat`) + tanggal + arsip, tapi **rak hanya match substring lewat search** (`Cari nama, ID, RAK…`) — tidak bisa "cetak semua item rak A1" dalam satu klik tanpa risiko ketik sebagian (mis. `A1` match `A10`). |
| **Scope in** | Chip **Rak** di `#modal-filter` (serupa `#cat-filter-bar`): **Semua** (default) + daftar rak unik dari `allRows` + count. State `_activeRak`. Diterapkan di **`renderCetakList`**, **`cetakSelectAll`**, dan **`_doFilter`** (master list) dengan **exact match** `(r.rak\|\|'').trim()`. Badge/chip aktif di `_updateFilterUI`. Reset bersihkan `_activeRak`. |
| **Scope out** | Filter multi-rak (OR); rak multi per item di UI cetak baru; ubah skema data; dry-run print (L4). |
| **Done = ?** | UI `#rak-filter-bar`; `renderRakFilter`/`setRakFilter`; `_activeRak` di 3 jalur filter + reset + badge; L1 `cetak_filter.js` GREEN; regression L1+L2 hijau; bump shell. |
| **Acceptance** | `Cari A1` (substring) ≠ filter rak: `_activeRak='A1'` hanya tampilkan rak exact `A1` (bukan `A10`); kombinasi kategori+rak+dari-sampai tetap AND; `cetakSelectAll` hanya select baris lolos filter; Reset → semua baris; badge naik 1 saat rak aktif. |

### 5.1.3 Spesi F-05 — Export QR massal

| Field | Isi |
|-------|-----|
| **User** | Admin gundang butuh file QR semua/terpilih item untuk print mandiri atau import sistem lain |
| **Pain** | QR hanya muncul di dalam label/kartu cetak — tidak ada cara unduh kumpulan QR sebagai file terpisah tanpa print per halaman A4 |
| **Scope in** | Tombol **Export QR Massal** di More drawer. Modal pilih **scope** (Semua / Hasil filter / Item terpilih) + **format** (`html` sheet print-ready default, `png` unduh per item via canvas). Payload QR = `buildQrPayload(id,nama,rak)` → `id\|nama\|rak` (identik label). Filename `QR-RDI_YYYY-MM-DD.*`. Escape `xe`/`ex`. Empty guard. |
| **Scope out** | ZIP (tanpa dep baru); QR rak; edit payload; GAS-side generate; dry-run print (L4). |
| **Done = ?** | `#btn-export-qr` + `#modal-export-qr` + `exportQRMassal()`/`doExportQR()`; L1 `export_qr.js` GREEN; regression L1+L2 hijau; bump shell. |
| **Acceptance** | Scope kosong → alert; html → popup sheet berisi N QR payload benar + ID/nama; png → trigger download per item (id-based filename); xe/ex escape; `buildQrPayload` dipakai ulang; L1 static + sim payload. |

### 5.1.4 Spesi F-06 — Paket perbaikan UI/UX aksesibilitas (audit)

| Field | Isi |
|-------|-----|
| **User** | Operator gudang (HP, scanner) + pengguna keyboard/screen reader + admin desktop |
| **Pain** | Audit UI/UX detail keseluruhan (2026-09-24, inspeksi statis L1, skill `ui-ux-pro-max`) menemukan 14 temuan: pesan error tak diumumkan, modal tanpa manajemen fokus/Escape, input tanpa label, sort tabel tak bisa keyboard, font <12px, kontras caption 4.18:1. |
| **Scope in** | Perbaikan bertahap **UI-01…UI-14** per gelombang (anti-creep: maks 2 temuan/siklus): **F-06a** UI-01+UI-02 · **F-06b** UI-03+UI-04 · **F-06c** UI-05+UI-06 · **F-06d** UI-07+UI-08 · **F-06e** UI-09+UI-10 · **F-06f** UI-11…UI-14 (batch LOW). Tiap gelombang: RED test (assert statis aria/escape/label di `tests/l1/`) → implement → GREEN → gate L1+L2 → bump shell bila `index.html`/`scanner.html` berubah. Helper sentral `openModal(id,trigger)`/`closeModal(id)` dipakai ulang lintas modal. |
| **Scope out** | Redesign visual/layout; ganti framework/component lib; rework tema gelap penuh; perubahan GAS/Sheet; L4 device (tetap track F1); keputusan produk di luar 14 temuan (= antrian F-07+). |
| **Done = ?** | Tiap gelombang gate hijau (L1+L2); seluruh UI-01…UI-14 di §1.4 berstatus **FIXED** atau **ACCEPTED LIMITATION** (alasan tertulis); tidak ada regresi suite label/cetak. |
| **Acceptance** | UI-01: fokus pindah ke modal saat open & kembali ke pemicu saat close (semua modal yang dikelola helper). UI-02: 17/17 `.sbar` punya `aria-live`/`role="status"`, `.s-err` = `role="alert"`. UI-03: 0 input utama placeholder-only (label/`aria-label` ada). UI-04: Escape menutup overlay teratas; klik backdrop tertutup. UI-05: sort kolom jalan dari keyboard. UI-06: 0 tombol ikon tanpa `aria-label`. UI-07: 0 font <12px untuk info esensial. UI-08: pasangan teks utama ≥4.5:1. UI-09: fallback `100dvh`. UI-10–14: atribut/urutan/hash/theme sesuai rekomendasi. |

**Temuan audit (read-only; status = hasil inspeksi statis L1, belum diperbaiki):**

| ID | Sev | Lokasi | Evidence / rekomendasi | Status |
|----|-----|--------|------------------------|--------|
| UI-01 | HIGH | `index.html` `openExportQRModal` L2686, `openExportExcelModal` L2663, `showUserModal` L2460, `showConfig` L2437 | open hanya `classList.add('show')`; hanya 6 `.focus()` di app (qty/search/scan/add/edit); tak ada restore fokus ke pemicu → helper `openModal(id,trigger)` fokuskan kontrol pertama + kembalikan saat close | UNVERIFIED |
| UI-02 | HIGH | 14 `.sbar` MUTE: L748, L998, L1756, L1881, L1887, L1924–1925, L1970, L2043, L2049, L2112, L2183, L4252, L4278 (live hanya L478/L624/L874); `role="alert"` = 0 | hasil lookup/error visual-only (guideline *Error Messages*) → `role="status"` utk info, `role="alert"` utk `.s-err` | UNVERIFIED |
| UI-03 | HIGH | ≥28 input: `login-username` L266, `login-password` L269, `search-box` L471, `noref-input` L852, `rak-search-box` L1430, `cetak-search` L1497, `idd-min-input` L1723, field aset L1874–1922; global `aria-describedby`=0, `aria-invalid`=0 | placeholder-only; hilang saat mengetik → `<label class="sr-only" for>`/`aria-label` + kaitkan error | NOT TESTED |
| UI-04 | MEDIUM | handler Escape global hanya 7 id (item-detail, edit, add, rak-label, config, user, more-drawer); 13 `.modal-overlay` tanpa `onclick` backdrop; `closest('.modal-overlay')` = 0 | `modal-filter`, `modal-sort`, `modal-hist-card-detail`, 5× aset, `modal-admin-tools`, `modal-export-excel`, `modal-export-qr` tak tertutup via Escape/backdrop → handler terpusat (overlay teratas) + klik backdrop = tutup | NOT TESTED |
| UI-05 | MEDIUM | `<th class="th-sortable" onclick>` L597–605 (9 kolom) | `th` bukan fokus, tanpa role/tabindex/onkeydown → bungkus `<button type="button">` di dalam `th` | NOT TESTED |
| UI-06 | MEDIUM | `&times;` L4247 & L4262 (tanpa `aria-label`; sheet-close lain L1869–2078 sudah), `▾` L666/L1302/L1321, `↻` L1007, `✕` L1015, `scanner.html` L101 🔦 | teks 1 karakter → `aria-label` ("Tutup dialog", "Refresh", "Obor", …) | NOT TESTED |
| UI-07 | MEDIUM | 43 rule font-size 8–11px: `8px` `.ilc2-low`; `9px` `.trx-progress-lbl`, `.hdr-saldo-lbl`, `.idd-hist-saldo-lbl`, `.item-detail-stok-badge`, `.hamburger-badge`, `.ilc2-tgl-corner`; `10px` `.item-detail-id`, `.ftbadge`, `.ilc2-rak`, `.ilc3-rak`, `.ilc2-btn-trx` | label saldo/rak/badge tak terbaca di kondisi gudang → naikkan ≥12px (`--text-caption`) utk info esensial | DEVICE-DEPENDENT |
| UI-08 | MEDIUM | `--text3` #78716c di atas `--bg` #f3efe6 = **4.18:1**; hardcoded `#f59e0b` teks di `showRakDetail` L2934 | caption/placeholder gagal AA 4.5:1 (guideline *Color Contrast*) → gelapkan `--text3` utk bg / pakai `--text2`; ganti hex hardcoded | UNVERIFIED |
| UI-09 | MEDIUM | `index.html` L28, L32, L69 (`height:100vh`), L1506 (`calc(100vh - 320px)`); `100dvh` = 0 (`scanner.html` sudah 1) | overlap toolbar iOS Safari → fallback `100dvh` setelah `100vh` | DEVICE-DEPENDENT |
| UI-10 | LOW | `modal-filter`, `modal-sort` (2-satunya `.modal-overlay` tanpa atribut; 13 lain lengkap) | tambah `role="dialog" aria-modal="true" aria-label` | UNVERIFIED |
| UI-11 | LOW | `<h2>Masuk</h2>` L263 sebelum `<h1>` L412 | urutan heading logis AT → login gate `<h1>` atau geser setelah h1 app | UNVERIFIED |
| UI-12 | LOW | `.sheet-close` `height:30px`, `.ilc3-fab` `height:30px` (`.btn` lain 48px) | target sentuh <44px → `min-height:44px`/padding area sentuh | DEVICE-DEPENDENT |
| UI-13 | LOW | `switchTab` — URL/hash tak berubah | deep link/tab state → update `location.hash` saat ganti tab (guideline *Deep Linking*) | UNVERIFIED |
| UI-14 | LOW | tema hanya `localStorage rdi_theme` + `body.light`; `prefers-color-scheme` = 0 | auto-detect sistem saat pertama kali (default tetap gelap bila user pilih) | UNVERIFIED |

**Referensi guideline** (skill `ui-ux-pro-max`, domain `ux`): query `keyboard navigation focus visible modal`, `destructive action confirmation delete`, `color contrast accessibility`, `navigation tab active state aria`; query `dark mode toggle theme switching` → 0 hasil DB (UI-14 memakai praktik umum). *Catatan:* rekap hitungan benar = **3 HIGH / 6 MEDIUM / 5 LOW** (koreksi dari ringkasan lisan sesi).

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
- [x] Commit `27e805b` (approval sesi)  

### F2 wave-2 + F3 — T2/T3 batch (2026-09-24)
- [x] Copy L2 suites → `tests/l2/` (`r2_browser_suite`, `r2_label_suite`)  
- [x] `tests/run-l2.js` + `npm run test:l2`  
- [x] L1 suite `label_pagemath.js` (LBL-03: 25→2 halaman, grid 24, F-01 expand)  
- [x] F-01 multi-copy: input `cetak-copies` + `generateOutput` expand + `updateCetakCount` total  
- [x] Version bump shell: `APP_VERSION=v15.7`, SW `rdi-stok-v15`  
- [x] L2 suite SW assert → dynamic read dari `sw.js` (tidak hardcode)  
- [x] **L1 run:** `PASS | suites=14 | assertPass=229 | assertFail=0`  
- [x] **L2 run:** `PASS | suites=2 | assertPass=80 | assertFail=0`  
- [x] Commit T2/T3 batch → `8c00d15`  
- [x] T2.7 CI `.github/workflows/l1.yml` + portable ROOT → `886cc49`  

### LBL-02 — QR lokal (2026-09-24)
- [x] Vendored `qrcode.min.js` (qrcode-generator@1.4.4)  
- [x] index.html: helper `qrImgSrc`/`qrSrc`, 3 img `api.qrserver` → lokal + `data-qr`, script tag, version bump `v15.8`  
- [x] sw.js: `rdi-stok-v16` + precache `./qrcode.min.js`  
- [x] package.json: `15.8.0`  
- [x] L1 `kartu_contract` assert QR lokal → **L1 PASS 229/0**  
- [x] L2 label suite asersi QR lokal → **L2 PASS 49/0** (label) + 32/0 (browser)  
- [ ] Commit LBL-02 batch  

### F1 — T1 (butuh Anda untuk L4)
- [x] Keputusan §3.3 (QR lokal DONE; label 25 DONE; device 1 Android)  
- [ ] Distribusi checklist D1–D12  
- [ ] Jalankan L4 → laporkan  
- [ ] L5 checklist  

### F3 — T3 (setelah C1/C2)
- [x] Pilih P0/P1 pertama → F-02 (P1; P0 semua DONE)  
- [x] Pipeline §5.2 → F-02 spesi §5.1.1 · RED 15F · implement `LABEL_TPL`/`label-tpl`/`tplId` · GREEN · gate L1 258/0 + L2 32/0 + label 49/0 · v15.13 / sw v21  
- [x] Pipeline §5.2 → F-03 spesi §5.1.2 · RED 13F · implement `_activeRak`/`rak-filter-bar` · GREEN 19/0 · gate L1 277/0 + L2 32/0 + label 49/0 · v15.14 / sw v22  
- [x] Pipeline §5.2 → F-04: feature pre-existing (`loadAlert`/`section-alert`/`badge`/`dash-widget`/`saveMinStock`); locked by `alert_lowstock.js` 53/0 · L1 330/0 (17 suite) · tanpa shell change / tanpa bump  
- [x] Pipeline §5.2 → F-05 spesi §5.1.3 · RED `export_qr.js` 10F · implement `exportQRMassal`/`doExportQR`/`#modal-export-qr` · GREEN 27/0 · gate L1 357/0 (18 suite) + L2 32/0 + label 49/0 · v15.15 / sw v23  
- [x] Audit UI/UX detail keseluruhan (read-only, statis L1, skill `ui-ux-pro-max`) → 14 temuan UI-01…UI-14 → backlog §1.4 + spesi §5.1.4 (tanpa fix, report first)  
- [x] Pipeline §5.2 → F-06a (UI-01 + UI-02) · RED `ui06a_focus_sbar.js` 15F · implement `modalFocusOpen`/`modalFocusClose` (4 pasang) + 14 sbar `role`/`aria-live` · GREEN 25/0 · gate L1 383/0 (19 suite) + L2 browser 32/0 (1 retry) + label 49/0 · v15.16 / sw v24  
- [x] Pipeline §5.2 → F-06b (UI-03 + UI-04) · RED `ui06b_label_escape.js` 5P/14F (31 input miss) · implement 26 `aria-label` + `for` exp-date ×2 + template min-stock/cetak-cb + `_overlayCloseMap` (13 overlay) + `closeTopOverlay()` (z-index tertinggi) + delegate klik backdrop + Escape → `closeTopOverlay()` · GREEN 19/0 · gate L1 402/0 (20 suite) + L2 81/0 · v15.17 / sw v25  
- [ ] Pipeline §5.2 → F-06c…F-06f (maks 2 temuan/siklus)  
- [ ] F-06+ (P3 antrian)  

### F4 / F5
- [x] F4.1 Peta modul → §4.3 (2026-09-24)  
- [x] F4.2 Ekstrak util → `js/util.js` (2026-09-24; v15.9, sw v17; L1 229/0 + L2 32/0 + label 49/0)  
- [x] F4.3 Ekstrak cetak/label → `js/cetak.js` (2026-09-24; v15.10, sw v18; L1 229/0 + L2 32/0 + label 49/0)  
- [x] F4.4 Ekstrak outbox/API client → `js/outbox.js` (2026-09-24; v15.11, sw v19; L1 229/0 + L2 32/0 + label 49/0)  
- [x] F4.5 Ekstrak pure format/token/CSV helpers → `js/format.js` (2026-09-24; v15.12, sw v20; L1 229/0 + L2 32/0 + label 49/0; F45-01 fix; sisa shell di-defer)  
- [x] Exit E1–E6 note: F4 stop setelah F4.5 (ROI sisa shell jelek)  
- [ ] Exit E1–E6 formal sign-off

---

## 11. Log keputusan

| Tanggal | Keputusan | Alasan | Ref |
|---------|-----------|--------|-----|
| 2026-09-24 | Option A — tanpa install ECC | fokus app; harness score bias | session |
| 2026-09-24 | Empat tujuan T1–T4 + fase F0–F5 | arah pengembangan terdocument | PLAN.md v1.0 |
| 2026-09-24 | LBL-01 fixed | QR rak undefined | `2696ebb` |
| 2026-09-24 | Default LBL-02 = ACCEPTED LIMITATION | friction rendah; promote P0 jika offline cetak wajib | §3.3 |
| 2026-09-24 | LBL-02 promote ke opsi (b) QR lokal | user: LAKUKAN SEMUA SESUAI URUTAN; offline gudang | §3.3 rev |
| 2026-09-24 | LBL-03 masuk track T1/T2 | cetak = daily driver gudang | §3.3 |
| 2026-09-24 | F2 wave-1 dieksekusi | user: plan → execute → test → revise | §10 |
| 2026-09-24 | VER-01: sinkron label versi statis ke v15.6 | L1 `version_consistency` 5 FAIL | run #1→#2 |
| 2026-09-24 | L1 hijau 211/0 di-repo | gate C2 terpenuhi | `tests/results/l1_latest.json` |
| 2026-09-24 | T2/T3 batch: L2 ke repo, LBL-03 test, F-01 multi-copy, v15.7 | user: LANJUTKAN SEMUA | PLAN.md v1.2 |
| 2026-09-24 | L1 229/0 + L2 80/0 hijau | F2 wave-2 + F3 gate | `tests/results/*_latest.json` |
| 2026-09-24 | T2.7 CI L1 workflow in-repo | user: LAKUKAN SEMUA SESUAI URUTAN | `886cc49` |
| 2026-09-24 | LBL-02 QR lokal: qrcode.min.js + qrImgSrc, v15.8, sw v16 | offline/privasi; user: LAKUKAN SEMUA SESUAI URUTAN | PLAN.md v1.3 |
| 2026-09-24 | LBL-02 gate: L1 229/0 + L2 81/0 (32+49) | QR lokal verified | `tests/results/*_latest.json` |
| 2026-09-24 | MONO-01 F4.1 peta modul ditulis | review gate sebelum F4.2 | PLAN.md §4.3 |
| 2026-09-24 | F4.2 util → `js/util.js`, v15.9, sw `rdi-stok-v17` | escape/QR util terpusat; script tanpa `defer` (hindari `xe` ReferenceError saat boot); gate L1 229/0 + L2 browser 32/0 + label 49/0 | PLAN.md v1.5 |
| 2026-09-24 | F4.3 builders cetak → `js/cetak.js` (global, tanpa defer), v15.10, sw `rdi-stok-v18` | strangler F4.2 lanjutan; `buildRakLabelHTML`/`buildLabelHTML`/`buildPrintHTML` keluar dari IIFE; marker `// buildLabelHTML/buildPrintHTML moved`; suites concat-scan `index.html + js/cetak.js`; gate L1 229/0 + L2 browser 32/0 + label 49/0 | PLAN.md v1.6 |
| 2026-09-24 | F4.4 gasGet/outbox → `js/outbox.js` (global, tanpa defer), v15.11, sw `rdi-stok-v19` | strangler F4.3 lanjutan; API client + outbox queue keluar dari IIFE; config bridge `window.__rdiConfig` (hindari collision `__rdiCfg`); orchestration tetap di IIFE; suites concat-scan `index.html + js/outbox.js` (r2_contract_leak, dup_check) + browser assets += outbox; gate L1 229/0 + L2 browser 32/0 + label 49/0 | PLAN.md v1.7 |
| 2026-09-24 | F4.5 pure helpers → `js/format.js` (global, tanpa defer), v15.12, sw `rdi-stok-v20` | strangler F4.4 lanjutan; 23 pure helpers (date/CSV/fuzzy/token/pad2) keluar dari IIFE; F45-01 fix `_fmtTglSingkat`/`_formatHistoryTime` cross-IIFE; patch script ekstrak dinamis CRLF (lesson: jangan hardcode `\n`); suites concat-scan + browser assets += format; sisa shell di-defer → **stop F4 split**; gate L1 229/0 + L2 browser 32/0 + label 49/0 | PLAN.md v1.8 |
| 2026-09-24 | F-02 Template label: `LABEL_TPL` 4x6/3x8/2x7 di `js/cetak.js`, UI `#label-tpl`, `buildLabelHTML(...,tplId)`, `labelPerPage()` page math, v15.13, sw `rdi-stok-v21` | fitur product P1 pertama F3; pipeline §5.2 spesi §5.1.1 → RED `label_template.js` 15F → GREEN 29/0 → gate L1 258/0 + L2 browser 32/0 + label 49/0; asersi lama di-relax ke fallback default 4x6 | PLAN.md v1.9 |
| 2026-09-24 | F-03 Filter rak: `_activeRak` + `#rak-filter-bar` + `renderRakFilter`/`setRakFilter`, exact match di `renderCetakList`/`cetakSelectAll`/`_doFilter`, badge/chip/reset, v15.14, sw `rdi-stok-v22` | fitur product P1 kedua F3; spesi §5.1.2 → RED `cetak_filter.js` 13F → GREEN 19/0 → gate L1 277/0 (16 suite) + L2 browser 32/0 + label 49/0; kategori `_activeCat` tetap | PLAN.md v1.10 |
| 2026-09-24 | F-04 Alert low stock: feature pre-existing (`loadAlert`, `section-alert`, `updateAlertBadge`, `renderDashAlertWidget`, `saveMinStock`, HABIS/RENDAH); locked by new L1 `alert_lowstock.js` 53/0 | no shell change, no bump; L1 330/0 (17 suite); sim: min=0 never alerts, boundary qty==min alerts, HABIS only when saldo==0 | PLAN.md v1.11 |
| 2026-09-24 | F-05 Export QR massal: `exportQRMassal`/`doExportQR` + `#modal-export-qr` + More drawer button; scope all/filtered/selected + format html/png; payload `buildQrPayload(id,nama,rak)`; v15.15, sw `rdi-stok-v23` | fitur product P2 pertama F3; spesi §5.1.3 → RED `export_qr.js` 10F → GREEN 27/0 → gate L1 357/0 (18 suite) + L2 browser 32/0 + label 49/0 | PLAN.md v1.12 |
| 2026-09-24 | Audit UI/UX detail keseluruhan: 14 temuan UI-01…UI-14 (3 HIGH / 6 MEDIUM / 5 LOW) → backlog F-06 gelombang a–f, spesi §5.1.4; read-only tanpa fix (report first); tool: skill `ui-ux-pro-max` + audit script statis | user pilih opsi A (tulis ke backlog) | PLAN.md v1.13 |
| 2026-09-25 | F-06a UI-01+UI-02: helper `modalFocusOpen`/`modalFocusClose` (stack + restore ke pemicu) di 4 pasang modal (export QR/Excel, user, config) + 14 `.sbar` dapat `role="status" aria-live`, 4 `.s-err` `role="alert"`; v15.16, sw `rdi-stok-v24` | approval menyeluruh user (berbasis bukti/audit); spesi §5.1.4 → RED `ui06a_focus_sbar.js` 15F → GREEN 25/0 → gate L1 383/0 (19 suite) + L2 browser 32/0 (retry 1, timeout flaky) + label 49/0 | PLAN.md v1.14 |
| 2026-09-25 | F-06b UI-03+UI-04: 26 input statis `aria-label` + `for` label exp-date ×2 + template `min-stock-input`/`cetak-item-cb` dinamis; `_overlayCloseMap` (13 `.modal-overlay` → close fn exported) + `closeTopOverlay()` dipanggil handler Escape & delegate klik backdrop; v15.17, sw `rdi-stok-v25` | approval menyeluruh user (berbasis bukti/audit); spesi §5.1.4 → RED `ui06b_label_escape.js` 14F → GREEN 19/0 → gate L1 402/0 (20 suite) + L2 81/0 (browser 32/0 tanpa retry) | PLAN.md v1.15 |
| _isian sesi_ | | | |

---

## 12. Lampiran

### 12.1 Suite map → level (`rdi-testing`)

| Level | Lokasi suite |
|-------|--------------|
| L1 | **`tests/l1/`** (in-repo, `npm run test:l1`) — `version_consistency`, `label_pagemath`, `kartu_contract`, `r2_contract_leak`, `sec_classify`, `sim_*`, `r2_qr_decoder`, `xss_audit`, … |
| L2 | **`tests/l2/`** (in-repo, `npm run test:l2`) — `r2_browser_suite`, `r2_label_suite` |
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
| 1.2 | 2026-09-24 | T2/T3 batch: L2 in-repo, F-01 multi-copy, label_pagemath, dynamic SW assert; L1 229/0 + L2 80/0 |
| 1.3 | 2026-09-24 | T2.7 CI + LBL-02 QR lokal v15.8 / sw `rdi-stok-v16`; L1 229/0 + L2 81/0; §1.2, §1.4, §4.1, §5.1, §10, §11 |
| 1.4 | 2026-09-24 | F4.1 peta modul `index.html` §4.3; HEAD `c76d10b` LBL-02 pushed; §10, §11 |
| 1.5 | 2026-09-24 | F4.2 util → `js/util.js` (v15.9, sw v17); suites update; gate L1 229/0 + L2 browser 32/0 + label 49/0; §1.2, §4.2, §10, §11 |
| 1.6 | 2026-09-24 | F4.3 builders cetak → `js/cetak.js` (v15.10, sw `rdi-stok-v18`); suites concat-scan; gate L1 229/0 + L2 browser 32/0 + label 49/0; §1.2, §4.2, §4.3, §10, §11, §13 |
| 1.7 | 2026-09-24 | F4.4 gasGet/outbox → `js/outbox.js` (v15.11, sw `rdi-stok-v19`); config bridge `__rdiConfig`; suites concat-scan; gate L1 229/0 + L2 browser 32/0 + label 49/0; §1.2, §4.2, §4.3, §10, §11, §13 |
| 1.8 | 2026-09-24 | F4.5 pure format/token/CSV helpers → `js/format.js` (v15.12, sw `rdi-stok-v20`); F45-01 fix; sisa shell di-defer (stop F4); suites concat-scan; gate L1 229/0 + L2 browser 32/0 + label 49/0; §1.2, §4.2, §4.3, §10, §11, §13 |
| 1.9 | 2026-09-24 | F-02 Template label `LABEL_TPL`/`label-tpl`/`tplId` (v15.13, sw `rdi-stok-v21`); spesi §5.1.1; L1 suite baru `label_template.js` (15 suite, 258/0); gate L1 258/0 + L2 browser 32/0 + label 49/0; §1.2, §1.4, §5.1, §10, §11, §13 |
| 1.10 | 2026-09-24 | F-03 Filter rak `_activeRak`/`rak-filter-bar` (v15.14, sw `rdi-stok-v22`); spesi §5.1.2; L1 suite baru `cetak_filter.js` (16 suite, 277/0); gate L1 277/0 + L2 browser 32/0 + label 49/0; §1.2, §1.4, §5.1, §10, §11, §13 |
| 1.11 | 2026-09-24 | F-04 Alert low stock pre-existing locked by `alert_lowstock.js` (17 suite, L1 330/0); no shell change / no bump; §5.1, §10, §11, §13 |
| 1.12 | 2026-09-24 | F-05 Export QR massal `exportQRMassal`/`doExportQR` (v15.15, sw `rdi-stok-v23`); spesi §5.1.3; L1 suite baru `export_qr.js` (18 suite, 357/0); gate L1 357/0 + L2 browser 32/0 + label 49/0; §1.2, §1.4, §5.1, §10, §11, §13 |
| 1.13 | 2026-09-24 | Audit UI/UX detail: 14 temuan UI-01…UI-14 (3 HIGH / 6 MED / 5 LOW) → backlog §1.4 + spesi F-06 §5.1.4 (gelombang F-06a…f); P2 baris F-06, antrian F-07+; §1.4, §5.1, §10, §11, §13 |
| 1.14 | 2026-09-25 | F-06a DONE: UI-01 `modalFocusOpen`/`modalFocusClose` + UI-02 sbar aria (v15.16, sw `rdi-stok-v24`); L1 suite baru `ui06a_focus_sbar.js` (19 suite, 383/0); gate L1 383/0 + L2 browser 32/0 + label 49/0; §1.2, §1.4, §5.1, §10, §11, §13 |
| 1.15 | 2026-09-25 | F-06b DONE: UI-03 26 aria-label + for exp-date + template dinamis; UI-04 `_overlayCloseMap`/`closeTopOverlay`/Escape+backdrop delegate (v15.17, sw `rdi-stok-v25`); suite baru `ui06b_label_escape.js` (20 suite, 402/0); gate L1 402/0 + L2 81/0; §1.2, §1.4, §5.1, §10, §11, §13 |

**Aturan revisi:** setiap test run / keputusan besar → update §10 + §11; jangan hapus history log.
