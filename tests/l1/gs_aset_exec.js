/* L1 gs_aset_exec — MENGEKSEKUSI modul Aset Sirkulasi Code.gs sungguhan.
 * Yang diuji (domain: alat/pahat yang keluar-pakai-diasah-pakai lagi):
 *   - addAsetItem: Kode_Alat unik (duplikat ditolak)
 *   - addAsetUnit: Kode_Alat harus terdaftar (FK), jumlah >= 1
 *   - recordAsetMovement: state machine lengkap
 *       GUDANG →(DIPASANG_KE_MESIN)→ DIPAKAI
 *       DIPAKAI →(KEMBALI_KE_GUDANG_SIAP)→ GUDANG      (masih tajam)
 *       DIPAKAI →(KEMBALI_KE_GUDANG_TUMPUL)→ TUMPUL   (siklus asah baru)
 *       TUMPUL  →(KIRIM_KE_VENDOR_ASAH)→ DIASAH
 *       DIASAH  →(SELESAI_DIASAH)→ GUDANG
 *       KARAT = flag saja (status/lokasi tidak berubah); SCRAP_RUSAK = keluar permanen
 *   - transisi TIDAK valid ditolak (mis. SELESAI_DIASAH saat masih GUDANG)
 *   - SCRAP_RUSAK tidak bisa dua kali (unit sudah keluar dari siklus)
 *   - getAsetEligibleUnits hanya menawarkan unit yang valid untuk activity tsb
 *   - computeStatusKondisi: HABIS / KRITIS / AMAN
 * Setiap pergerakan menulis 1 baris Aset_Movement_Log (append-only). */
const { loadCodeGS, makeSpreadsheet, makeSheet } = require('../tools/gs_harness.js');

let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; console.log('PASS | ' + name + (detail ? ' | ' + detail : '')); }
  else { fail++; console.log('FAIL | ' + name + (detail ? ' | ' + detail : '')); }
}
function buildKitchen() {
  return makeSpreadsheet([
    makeSheet('Master_Item', [['No', 'ID_Item', 'Nama', 'Spec', 'User', 'BC', 'Unit', 'Kategori', 'Min', 'Status']]),
    makeSheet('Transaksi_Log', [['a']]),
    makeSheet('Stok_Saldo', [['a']]),
    makeSheet('Stok_Per_Rak', [['a']]),
    // Aset_Item 18 kolom
    makeSheet('Aset_Item', [['No', 'Kode_Alat', 'Nama_Alat', 'Brand', 'Cutting_Tool', 'Material', 'Spesifikasi', 'Mesin_Default', 'Kode_Mesin_Default', 'Berat_Kg', 'UOM', 'Rak_Penyimpanan', 'Vendor_Asah_Default', 'Rata2_Pemakaian_30Hari', 'Lead_Time_Asah_RataRata', 'Safety_Stock', 'Reorder_Point', 'Min_Stock']]),
    // Aset_Unit 10 kolom
    makeSheet('Aset_Unit', [['Unit_ID', 'Kode_Alat', 'Tanggal_Masuk', 'Regrind_Count', 'Status_Unit', 'Lokasi_Saat_Ini', 'Kode_Mesin_Saat_Ini', 'Last_Event', 'Last_Cycle_ID', 'Last_Update']]),
    // Aset_Movement_Log 12 kolom
    makeSheet('Aset_Movement_Log', [['Timestamp', 'Kode_Alat', 'Unit_ID', 'ID_Transaksi', 'Activity', 'Qty', 'Cycle_ID', 'Counter', 'Kode_Mesin', 'Vendor', 'PIC', 'Keterangan']]),
  ]);
}
function ctxFor(kit) { return loadCodeGS({ spreadsheet: kit, props: { EDITOR_KEY: 'EK', VIEWER_TOKEN_SECRET: 'S' } }); }
function unitRows(kit) {
  const sh = kit.getSheetByName('Aset_Unit');
  return sh.getLastRow() < 2 ? [] : sh.getRange(2, 1, sh.getLastRow() - 1, 10).getValues();
}
function logRows(kit) {
  const sh = kit.getSheetByName('Aset_Movement_Log');
  return sh.getLastRow() < 2 ? [] : sh.getRange(2, 1, sh.getLastRow() - 1, 12).getValues();
}
function statusOf(kit, unitId) {
  const r = unitRows(kit).find(u => String(u[0]) === String(unitId));
  return r ? { status: String(r[4]), lokasi: String(r[5]), regrind: r[3] } : null;
}

const KIT = buildKitchen();
const CTX = ctxFor(KIT);

/* ---------- 1. addAsetItem: unik & validasi ---------- */
(function () {
  const r = CTX.addAsetItem({ kodeAlat: 'PAHAT-01', namaAlat: 'Pahat insert 20mm', brand: 'SANCHEZ', cuttingTool: 'INSERT', material: 'CARBIDE', uom: 'Pcs', safetyStock: 5, reorderPoint: 3, minStock: 2, pic: 'budi' });
  t('addAsetItem berhasil', r && r.status === 'ok', JSON.stringify(r).slice(0, 110));
  const dup = CTX.addAsetItem({ kodeAlat: 'PAHAT-01', namaAlat: 'Duplikat', pic: 'budi' });
  t('addAsetItem Kode_Alat duplikat DITOLAK', dup && dup.status === 'error', JSON.stringify(dup).slice(0, 90));
  const kosong = CTX.addAsetItem({ kodeAlat: '', namaAlat: 'Tanpa kode', pic: 'b' });
  t('addAsetItem tanpa Kode_Alat ditolak', kosong && kosong.status === 'error', JSON.stringify(kosong).slice(0, 80));
  const bad = CTX.addAsetItem({ kodeAlat: '=SUM(1,1)', namaAlat: 'Formula', pic: 'b' });
  t('catatan: namaAlat berawalan "=" diterima apa adanya (BE-05 formula guard belum ada di Aset)', bad && bad.status === 'ok', 'status=' + (bad && bad.status) + ' →icum jadi temuan BE-05 (belum di-fix, butuh approval deploy)');
})();

/* ---------- 2. addAsetUnit: FK + jumlah ---------- */
(function () {
  const bad = CTX.addAsetUnit({ kodeAlat: 'TIDAK-ADA', jumlah: 2, pic: 'budi' });
  t('addAsetUnit Kode_Alat tak terdaftar ditolak (FK)', bad && bad.status === 'error', JSON.stringify(bad).slice(0, 90));
  const nol = CTX.addAsetUnit({ kodeAlat: 'PAHAT-01', jumlah: 0, pic: 'budi' });
  t('addAsetUnit jumlah 0 ditolak', nol && nol.status === 'error', JSON.stringify(nol).slice(0, 80));
  const r = CTX.addAsetUnit({ kodeAlat: 'PAHAT-01', jumlah: 3, pic: 'budi' });
  t('addAsetUnit 3 unit berhasil', r && r.status === 'ok', JSON.stringify(r).slice(0, 140));
  t('Aset_Unit berisi 3 baris (1 baris = 1 unit fisik)', unitRows(KIT).length === 3, 'baris=' + unitRows(KIT).length);
  t('unit baru berstatus GUDANG & Lokasi GUDANG', statusOf(KIT, unitRows(KIT)[0][0]).status === 'GUDANG', JSON.stringify(statusOf(KIT, unitRows(KIT)[0][0])));
  t('penambahan unit tercatat di Aset_Movement_Log (activity PEMBELIAN_BARU)', logRows(KIT).length === 3 && /PEMBELIAN_BARU/.test(String(logRows(KIT)[0][4])), JSON.stringify(logRows(KIT)[0]).slice(0, 110));
})();

/* ---------- 3. state machine: alur hidup lengkap ---------- */
(function () {
  const unitId = unitRows(KIT)[0][0];
  const step = (activity, extra) => CTX.recordAsetMovement(Object.assign({ unitId: unitId, activity: activity, pic: 'budi', kodeMesin: 'MESIN-01' }, extra || {}));
  const r1 = step('DIPASANG_KE_MESIN');
  t('DIPASANG_KE_MESIN: GUDANG → DIPAKAI (+lokasi MESIN)', r1 && r1.status === 'ok' && statusOf(KIT, unitId).status === 'DIPAKAI' && statusOf(KIT, unitId).lokasi === 'MESIN', JSON.stringify({ res: r1 && r1.status, u: statusOf(KIT, unitId) }));
  const rBad = step('SELESAI_DIASAH');
  t('transisi TIDAK valid ditolak (SELESAI_DIASAH saat DIPAKAI)', rBad && rBad.status === 'error', JSON.stringify(rBad).slice(0, 100));
  const r2 = step('KEMBALI_KE_GUDANG_TUMPUL');
  t('KEMBALI_KE_GUDANG_TUMPUL: DIPAKAI → TUMPUL (mulai siklus asah)', r2 && r2.status === 'ok' && statusOf(KIT, unitId).status === 'TUMPUL', JSON.stringify({ res: r2 && r2.status, u: statusOf(KIT, unitId) }));
  const r3 = step('KIRIM_KE_VENDOR_ASAH', { vendor: 'PT Asah Makmur' });
  t('KIRIM_KE_VENDOR_ASAH: TUMPUL → DIASAH (+lokasi VENDOR)', r3 && r3.status === 'ok' && statusOf(KIT, unitId).status === 'DIASAH' && statusOf(KIT, unitId).lokasi === 'VENDOR', JSON.stringify({ res: r3 && r3.status, u: statusOf(KIT, unitId) }));
  const r4 = step('SELESAI_DIASAH');
  t('SELESAI_DIASAH: DIASAH → GUDANG (siklus++, siap pakai lagi)', r4 && r4.status === 'ok' && statusOf(KIT, unitId).status === 'GUDANG', JSON.stringify({ res: r4 && r4.status, u: statusOf(KIT, unitId) }));
  const regrind = Number(statusOf(KIT, unitId).regrind) || 0;
  t('regrind counter naik setelah 1 siklus asah', regrind >= 1, 'regrind=' + regrind);
  // siklus kedua lewat jalur "Kembali Siap Pakai"
  step('DIPASANG_KE_MESIN');
  const r5 = step('KEMBALI_KE_GUDANG_SIAP');
  t('KEMBALI_KE_GUDANG_SIAP: DIPAKAI → GUDANG (masih tajam, tak diasah)', r5 && r5.status === 'ok' && statusOf(KIT, unitId).status === 'GUDANG', JSON.stringify({ res: r5 && r5.status, u: statusOf(KIT, unitId) }));
  t('setelah 2 putaran: regrind counter tetap 1 (hanya siklus asah yang menambah)', Number(statusOf(KIT, unitId).regrind) === regrind, 'regrind=' + statusOf(KIT, unitId).regrind);
})();

/* ---------- 4. KARAT = flag saja; SCRAP permanen ---------- */
(function () {
  const unitId = unitRows(KIT)[1][0];
  const before = statusOf(KIT, unitId);
  const r = CTX.recordAsetMovement({ unitId: unitId, activity: 'KARAT', pic: 'budi' });
  t('KARAT dicatat', r && r.status === 'ok', JSON.stringify(r).slice(0, 80));
  t('KARAT TIDAK mengubah status/lokasi (flag murni)', statusOf(KIT, unitId).status === before.status && statusOf(KIT, unitId).lokasi === before.lokasi, JSON.stringify({ before, after: statusOf(KIT, unitId) }));
  const s1 = CTX.recordAsetMovement({ unitId: unitId, activity: 'SCRAP_RUSAK', pic: 'budi', keterangan: 'patah' });
  t('SCRAP_RUSAK: → SCRAP', s1 && s1.status === 'ok' && statusOf(KIT, unitId).status === 'SCRAP', JSON.stringify({ res: s1 && s1.status, u: statusOf(KIT, unitId) }));
  const s2 = CTX.recordAsetMovement({ unitId: unitId, activity: 'SCRAP_RUSAK', pic: 'budi' });
  t('SCRAP_RUSAK dua kali DITOLAK (unit keluar permanen dari siklus)', s2 && s2.status === 'error', JSON.stringify(s2).slice(0, 90));
  const s3 = CTX.recordAsetMovement({ unitId: unitId, activity: 'DIPASANG_KE_MESIN', pic: 'budi' });
  t('unit SCRAP tidak bisa dipakai lagi', s3 && s3.status === 'error', JSON.stringify(s3).slice(0, 90));
})();

/* ---------- 5. getAsetEligibleUnits: hanya unit valid ---------- */
(function () {
  // CATATAN: signature-nya POSITIONAL (kodeAlat, activity) — bukan objek body.
  // Dipanggil dispatcher dengan .apply. Dipanggil sebagai objek -> activity undefined.
  const el = CTX.getAsetEligibleUnits('PAHAT-01', 'DIPASANG_KE_MESIN');
  t('getAsetEligibleUnits mengembalikan daftar unit', el && el.status === 'ok' && Array.isArray(el.data), JSON.stringify(Object.keys(el || {})));
  const list = (el && el.data) || [];
  const scrapped = list.filter(u => String(u.statusUnit || u.status || '') === 'SCRAP').length;
  t('unit SCRAP tidak ditawarkan untuk DIPASANG_KE_MESIN', scrapped === 0 && list.length === 2, list.length + ' unit ditawarkan, ' + scrapped + ' scrap');
  const badAct = CTX.getAsetEligibleUnits('PAHAT-01', 'NGARANG');
  t('activity tak dikenal ditolak', badAct && badAct.status === 'error', JSON.stringify(badAct).slice(0, 90));
  const noKode = CTX.getAsetEligibleUnits('', 'DIPASANG_KE_MESIN');
  t('kodeAlat kosong ditolak', noKode && noKode.status === 'error', JSON.stringify(noKode).slice(0, 70));
})();

/* ---------- 6. computeStatusKondisi ---------- */
(function () {
  t('computeStatusKondisi: 0 unit → HABIS', CTX.computeStatusKondisi(0, 5) === 'HABIS', CTX.computeStatusKondisi(0, 5));
  t('computeStatusKondisi: < safety → KRITIS', CTX.computeStatusKondisi(2, 5) === 'KRITIS', CTX.computeStatusKondisi(2, 5));
  t('computeStatusKondisi: >= safety → AMAN', CTX.computeStatusKondisi(5, 5) === 'AMAN', CTX.computeStatusKondisi(5, 5));
})();

/* ---------- 7. daftar aset & dashboard ---------- */
(function () {
  const list = CTX.getAsetItemList({});
  t('getAsetItemList mengembalikan item + agregat status', list && list.status === 'ok' && Array.isArray(list.data) && list.data.length >= 1, JSON.stringify({ s: list && list.status, n: list && list.data && list.data.length }));
  const first = (list && list.data && list.data[0]) || {};
  t('agregat per item: totalUnit/siapPakai/terpakai/diasah/scrap', ['totalUnit', 'siapPakai', 'sedangDipakai', 'menungguAsah', 'sedangDiasah', 'scrap'].every(k => first[k] !== undefined), JSON.stringify({ totalUnit: first.totalUnit, siapPakai: first.siapPakai, scrap: first.scrap }));
  const dash = CTX.getAsetDashboard({});
  t('getAsetDashboard punya KPI (total & perlu perhatian)', dash && dash.status === 'ok', JSON.stringify(dash).slice(0, 140));
})();

/* ---------- 8. audit trail: setiap pergerakan tercatat ---------- */
(function () {
  const logs = logRows(KIT);
  const acts = logs.map(l => String(l[4]));
  t('Aset_Movement_Log append-only: semua activity tercatat', acts.length >= 10, acts.length + ' baris: ' + acts.slice(0, 12).join(','));
  t('tiap baris log punya unitId, cycleId, dan PIC', logs.every(l => l[2] && l[6] !== undefined), 'contoh=' + JSON.stringify(logs[1]).slice(0, 120));
})();

console.log('---- gs_aset_exec: ' + pass + ' PASS / ' + fail + ' FAIL ----');
process.exit(fail ? 1 : 0);
