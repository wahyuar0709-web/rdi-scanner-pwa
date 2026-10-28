/* exportexcel.js — v5.28 EXPORT EXCEL KARTU STOK (format file acuan "Tools & Spare Part Inventory")
 * Menulis workbook berisi:
 *   1) sheet "Master Code" — diambil dari cache hasil impor Excel terakhir (localStorage); kalau belum
 *      ada impor, dibangun dari Master_Item (header sama, baikannya kosong).
 *   2) satu sheet per kategori (kartu stok per-batch, 1 baris = 1 kedatangan):
 *      kolom No.  = rumus  IF(B{r}<>"",ROW()-1,"")
 *      kolom akhir = rumus  IF(ISNUMBER(K{r}),K{r},0)-SUM(M{r}:{penultimate}{r})   (tanpa kolom tanggal -> tanpa SUM)
 *      tanggal asli Excel (serial + numFmt m/d/yy), hasil rumus ditempel (cached result) supaya
 *      parser impor aplikasi bisa membaca ulang file ini (upload ulang = aman, merge idempoten).
 *  Look & feel mengikuti file acuan: Calibri, header bold putih di biru gelap #44546A, border tipis,
 *  baris belang (banding) abu muda, freeze baris header, autoFilter, lebar kolom serupa.
 *  Wajib window.ExcelJS (js/exceljs.min.js) — didaftarkan di index.html setelah xlsx.full.min.js. */
(function (root) {
  'use strict';

  var EPOCH = Date.UTC(1899, 11, 30);
  function txt(v) { return v === null || v === undefined ? '' : String(v); }
  /* indeks kolom 1-based -> hurufExcel (A..Z, AA..); SUM range bisa >Z utk sheet dgn banyak kolom tanggal */
  function colLetter(n) { var s = ''; while (n > 0) { var rem = (n - 1) % 26; s = String.fromCharCode(65 + rem) + s; n = Math.floor((n - 1) / 26); } return s; }
  /* 'dd/MM/yyyy' (kilatan backend) -> serial Excel; bukan tanggal -> null */
  function toSerial(dmy) {
    var p = txt(dmy).split('/');
    var d = +p[0], m = +p[1], y = +p[2];
    if (!(y > 2000 && y < 2100 && m > 0 && m < 13 && d > 0 && d < 32)) return null;
    return (Date.UTC(y, m - 1, d) - EPOCH) / 86400000;
  }

  var BASE_HEADERS = ['No.', 'Material code', 'Material name', 'Material Specification', 'User', 'BC/Non BC', 'Vendor', 'Nomor PO / packing List', 'Received Date', 'Rak', 'Qty In', 'Unit'];
  var FILL_HDR = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF44546A' } };
  var FILL_BAND = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF0F6' } };
  var BORDER_THIN = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

  function styleHeader(cell) {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = FILL_HDR;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = BORDER_THIN;
  }
  function styleData(cell, banded, bold) {
    cell.font = { name: 'Calibri', size: bold ? 12 : 11, bold: !!bold, color: { argb: 'FF1F2937' } };
    if (banded) cell.fill = FILL_BAND;
    cell.border = BORDER_THIN;
  }
  /* lebar kolom mengikuti file acuan (kategori 'Indirect'/'Spare Part') */
  function colWidth(i, n) {
    if (i < 12) return [6.5, 15.64, 47, 33, 14.07, 10.36, 31.21, 19.36, 13, 8.07, 8.07, 10][i];
    if (i === n - 1) return 12; /* Stok Akhir */
    return 10; /* kolom tanggal */
  }

  /* ================= Master Code ================= */
  var MC_HEADERS = ['MASTER_SEQUENCE', 'LEVEL', 'CODE', 'CATEGORY_DESCRIPTION', 'SPECIFICATION', 'KATEGORI KODE', 'KATEGORI', 'UNIT', 'CHECK_KEY', 'COMBINED_ITEM'];
  var MC_W = [11.21, 10.21, 15.64, 47.93, 38.64, 19.64, 30.93, 9.64, 65.5, 60];
  var MC_STORE = 'rdi-mastercode-v1';

  function mcLoad() {
    try {
      var o = JSON.parse(root.localStorage.getItem(MC_STORE) || 'null');
      if (o && Array.isArray(o.rows) && o.rows.length) return o;
    } catch (e) { /* cache rusak -> abaikan */ }
    return null;
  }
  function mcSaveFromSheetRows(rows, savedLabel) {
    /* pangkalkan baris sheet Master Code (dari file impor) ke localStorage; gagal kuota -> dilewati */
    try {
      var max = 20000;
      var boxed = rows.slice(0, max);
      var j = JSON.stringify({ from: txt(savedLabel), saved: txt(savedLabel), rows: boxed });
      if (j.length > 4800000) return 'MASTER_CODE terlalu besar utk cache lokal (dilewati)';
      root.localStorage.setItem(MC_STORE, j);
      return null;
    } catch (e) { return 'cache Master Code gagal disimpan: ' + (e && e.message ? e.message : 'quota'); }
  }
  function mcBuildFromItems(allRows) {
    var out = [];
    (allRows || []).forEach(function (r) {
      var code = txt(r && (r.id || r.idItem));
      if (!code) return;
      var nama = txt(r.nama), spec = txt(r.spec);
      var kat = txt(r.kategori);
      out.push([out.length + 1, 'Lv - 3', code, nama, spec, '', kat, txt(r.unit), code + ' | ' + nama + ' | ', nama + ' | ']);
    });
    return out;
  }

  function writeMasterCode(wb, allRows) {
    var cached = mcLoad();
    var rows, asal;
    if (cached) { rows = cached.rows; asal = 'cache impor ' + txt(cached.saved); }
    else { rows = mcBuildFromItems(allRows); asal = 'bangkit dari Master_Item'; }
    var ncol = MC_HEADERS.length;
    var ws = wb.addWorksheet('Master Code', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = MC_HEADERS.map(function (h, i) { return { header: h, width: MC_W[i] }; });
    MC_HEADERS.forEach(function (h, i) { styleHeader(ws.getRow(1).getCell(i + 1)); });
    rows.forEach(function (r, i) {
      var row = ws.getRow(i + 2);
      var vals = [];
      for (var c = 0; c < ncol; c++) { var v = Array.isArray(r) ? r[c] : (r && r[c] != null ? r[c] : ''); vals.push(v === null || v === undefined ? '' : v); }
      row.values = vals;
      row.eachCell(function (cell, col) {
        styleData(cell, i % 2 === 1, false);
        cell.alignment = cell.alignment || {};
        cell.alignment = { vertical: 'middle', wrapText: col >= 4 && col <= 5 };
        /* MASTER_SEQUENCE angka, sisanya teks */
        if (col === 1) cell.numFmt = '0';
      });
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(rows.length + 1, 1), column: ncol } };
    return { asal: asal, count: rows.length };
  }

  /* ================= Kartu stok per kategori ================= */
  function writeKartuStok(wb, sheetData, res) {
    var headers = BASE_HEADERS.concat(sheetData.dateColumns).concat(['Stok Akhir']);
    var ncol = headers.length;
    var penCol = ncol - 1; /* indeks 1-based kolom sebelum Stok Akhir */
    var dateCount = sheetData.dateColumns.length;
    var ws = wb.addWorksheet(String(sheetData.kategori || 'Lainnya').replace(/[:\\\/\?\*\[\]]/g, '').substring(0, 28) || 'Lainnya', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = headers.map(function (h, i) { return { header: h, width: colWidth(i, ncol) }; });
    headers.forEach(function (h, i) { styleHeader(ws.getRow(1).getCell(i + 1)); });

    var mismatchRws = 0;
    sheetData.rows.forEach(function (r, i) {
      var rr = i + 2, banded = i % 2 === 1;
      var row = ws.getRow(rr);
      var sumOut = 0;
      /* kolom fixed: 1..12 */
      row.getCell(1).value = { formula: 'IF(B' + rr + '<>"", ROW()-1, "")', result: String(i + 1) };
      row.getCell(2).value = txt(r.idItem);
      row.getCell(3).value = txt(r.nama);
      row.getCell(4).value = txt(r.spec);
      row.getCell(5).value = txt(r.user);
      row.getCell(6).value = txt(r.bc);
      row.getCell(7).value = txt(r.vendor);
      row.getCell(8).value = txt(r.noReferensi);
      var sv = toSerial(r.receivedDate);
      if (sv !== null) { row.getCell(9).value = sv; row.getCell(9).numFmt = 'm/d/yy'; }
      else row.getCell(9).value = txt(r.receivedDate);
      row.getCell(10).value = txt(r.rak);
      row.getCell(11).value = +r.qtyIn || 0;
      row.getCell(12).value = txt(r.unit);
      sheetData.dateColumns.forEach(function (d, k) {
        var q = r.keluarPerTanggal[d];
        if (q !== undefined && q > 0) { row.getCell(13 + k).value = q; sumOut += q; }
      });
      var kIn = 'K' + rr;
      var fAkhir = dateCount > 0
        ? 'IF(ISNUMBER(' + kIn + '), ' + kIn + ', 0) - SUM(M' + rr + ':' + colLetter(penCol) + rr + ')'
        : 'IF(ISNUMBER(' + kIn + '), ' + kIn + ', 0)';
      row.getCell(ncol).value = { formula: fAkhir, result: (+r.qtyIn || 0) - sumOut };

      for (var cc = 1; cc <= ncol; cc++) {
        var cell = row.getCell(cc);
        var isAkhir = cc === ncol;
        styleData(cell, banded, isAkhir);
        if (isAkhir) cell.alignment = { horizontal: 'center', vertical: 'middle' };
        else if (cc >= 2) cell.alignment = cell.alignment || {};
      }
      if (Math.abs((+r.qtyIn || 0) - sumOut - (+r.stokAkhir || 0)) > 1e-9) mismatchRws++;
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(sheetData.rows.length + 1, 1), column: ncol } };
    res.mismatchRows += mismatchRws;
  }

  function unduh(buf, fname) {
    var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = fname;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }

  /* ================= jalur utama ================= */
  function lengkap(from, to) {
    var sbar = document.getElementById('sbar-export'), btn = document.getElementById('btn-do-export');
    /* UX 2026-10-28 (High guideline "loading indicators"): area aktif ditandai aria-busy
       selama proses export, supaya screen reader tidak membacakan status parsial. */
    var modal = document.getElementById('modal-export-excel');
    function setBusy(on) { if (modal) { if (on) modal.setAttribute('aria-busy', 'true'); else modal.removeAttribute('aria-busy'); } }
    if (!root.ExcelJS) { if (sbar) { sbar.className = 'sbar s-err show'; sbar.innerHTML = 'Library ExcelJS belum termuat (butuh internet sekali). Coba lagi sebentar.'; } return Promise.resolve(); }
    if (typeof root.gasGet !== 'function') { if (sbar) { sbar.className = 'sbar s-err show'; sbar.innerHTML = 'Aplikasi belum siap. Muat ulang halaman.'; } return Promise.resolve(); }
    if (btn) btn.disabled = true;
    setBusy(true);
    if (sbar) { sbar.className = 'sbar s-info show'; sbar.innerHTML = 'Mengambil & menyimulasikan data (FIFO)...'; }
    var params = { action: 'getExportData' };
    if (from) params.dateFrom = from;
    if (to) params.dateTo = to;
    return root.gasGet(params).then(function (res) {
      if (!res || res.status !== 'ok') { throw new Error((res && res.message) || 'Export gagal.'); }
      if (!res.sheets || !res.sheets.length) { throw new Error('Tidak ada data untuk diexport.'); }
      var wb = new root.ExcelJS.Workbook();
      wb.creator = 'RDI Indirect Scanner';
      var info = {};
      try { info = writeMasterCode(wb, root.allRows || []); } catch (e) { info = { asal: 'gagal: ' + (e && e.message), count: 0 }; }
      var total = { mismatchRows: 0, baris: 0 };
      res.sheets.forEach(function (sheetData) { writeKartuStok(wb, sheetData, total); total.baris += sheetData.rows.length; });
      var dateTag = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
      var fname = 'Tools & Spare Part Inventory ' + dateTag + '.xlsx';
      return wb.xlsx.writeBuffer().then(function (buf) {
        unduh(buf, fname);
        var warn = '';
        if (info.count === 0) warn += 'Sheet Master Code kosong — import Excel sekali dulu supaya sheet Master Code ikut teks.';
        else warn += 'Sheet Master Code (' + info.count + ' baris ' + info.asal + ')';
        if (total.mismatchRows) warn += ' · ⚠ ' + total.mismatchRows + ' baris Qty In−Σkeluar ≠ saldo FIFO (data historis nyeleneh)';
        if (sbar) { sbar.className = 'sbar s-ok show'; sbar.innerHTML = 'Export berhasil: ' + fname.replace(/[<>&]/g, '') + ' (' + res.sheets.length + ' sheet kategori · ' + total.baris + ' baris, kolom No. & Stok Akhir pakai rumus) · ' + warn; }
        if (btn) btn.disabled = false;
        setBusy(false);
      });
    }).catch(function (e) {
      if (sbar) { sbar.className = 'sbar s-err show'; sbar.innerHTML = 'Gagal: ' + String((e && e.message) || e).replace(/[<>&]/g, ''); }
      if (btn) btn.disabled = false;
      setBusy(false);
    });
  }

  root.RdiExport = { lengkap: lengkap, mcSaveFromSheetRows: mcSaveFromSheetRows, mcLoad: mcLoad };
  if (typeof module !== 'undefined' && module.exports) module.exports = { lengkap: lengkap, mcSaveFromSheetRows: mcSaveFromSheetRows, mcLoad: mcLoad, toSerial: toSerial, writeMasterCode: writeMasterCode, writeKartuStok: writeKartuStok, MC_HEADERS: MC_HEADERS };
})(typeof window !== 'undefined' ? window : globalThis);
