/* importexcel.js — v5.27 IMPOR EXCEL (mode MERGE idempotent)
 * Membaca file "Tools & Spare Part Inventory ....xlsx" (format kartu stok per-batch: 1 baris = 1 batch
 * kedatangan, kolom tanggal = qty KELUAR, kolom terakhir "Stok Akhir") lalu mengubahnya jadi:
 *   items   : identitas barang (hanya yang BELUM ada di Master_Item yang akan dibuat — item lama tidak ditimpa)
 *   entries : transaksi MASUK/KELUAR unik + jumlah kembar (n), dipakai backend untuk merge idempotent.
 * Bagian PARSER murni (tanpa DOM) supaya bisa dites di Node. Bagian UI hanya jalan di browser.
 * Aturan yang disetujui user: rak kosong -> "-", tanggal terima kosong -> tanggal kolom pertama yang terisi.
 * Kolom tanggal yang mencurigakan (header tak terbaca / di masa depan / urutan mundur) DILEWATI dan dilaporkan,
 * bukan ditebak — perbaiki di Excel lalu upload ulang (merge idempotent, jadi aman diulang). */
(function (root) {
  'use strict';

  var MS_DAY = 86400000;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  function validYMD(y, m, d) {
    if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
    var dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }
  /* -> 'yyyy-MM-dd' atau null. Serial Excel dihitung aritmetika murni (tanpa zona waktu). */
  function parseDate(v) {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return isNaN(v) ? null : ymd(v.getFullYear(), v.getMonth() + 1, v.getDate());
    if (typeof v === 'number') {
      if (v > 20000 && v < 80000) {
        var dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * MS_DAY);
        return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
      }
      return null;
    }
    var s = String(v).trim(), m;
    if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) return validYMD(+m[3], +m[2], +m[1]) ? ymd(+m[3], +m[2], +m[1]) : null;
    if ((m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/.exec(s))) return validYMD(+m[1], +m[2], +m[3]) ? ymd(+m[1], +m[2], +m[3]) : null;
    return null;
  }
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (v === null || v === undefined) return null;
    var s = String(v).trim().replace(',', '.');
    return /^-?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : null;
  }
  function txt(v) { return v === null || v === undefined ? '' : String(v).trim(); }
  function norm(h) { return txt(h).replace(/\s+/g, ' ').toLowerCase(); }
  function colLetter(j) { var s = ''; j++; while (j > 0) { var r = (j - 1) % 26; s = String.fromCharCode(65 + r) + s; j = Math.floor((j - 1) / 26); } return s; }
  function r3(q) { return Math.round(q * 1000) / 1000; }
  /* Kunci idempotensi — HARUS identik dengan importKey_ di Code.gs. KELUAR tidak memakai no referensi. */
  function entryKey(e) { return e.id + '|' + e.j + '|' + e.d + '|' + r3(e.q) + '|' + (e.j === 'MASUK' ? txt(e.ref).replace(/^'/, '').toUpperCase() : ''); }

  var HDR = {
    'material code': 'code', 'material name': 'name', 'material specification': 'spec',
    'no. invoice': 'ref', 'invoice no.': 'ref', 'invoice no': 'ref', 'nomor po / packing list': 'ref',
    'received date': 'date', 'indate': 'date', 'rak': 'rak', 'qty in': 'qin', 'unit': 'unit',
    'user': 'user', 'bc/non bc': 'bc', 'vendor': 'vendor', 'stok akhir': 'last'
  };
  var KAT = { 'tools': 'Tools', 'spare part': 'Spare Part', 'sparepart': 'Spare Part', 'indirect': 'Indirect', 'consumable': 'Consumable' };

  function processSheet(sh, today, acc) {
    var rows = sh.rows || [];
    if (!rows.length) return;
    var H = rows[0] || [], cm = {};
    H.forEach(function (h, j) { var k = HDR[norm(h)]; if (k && cm[k] === undefined) cm[k] = j; });
    if (cm.code === undefined || cm.name === undefined || cm.qin === undefined) return; // bukan sheet transaksi (mis. Master Code)
    var endCol = cm.last !== undefined ? cm.last : H.length;
    var firstDate = (cm.unit !== undefined ? cm.unit : cm.qin) + 1;
    var kategori = KAT[norm(sh.name)] || txt(sh.name);
    var rep = { name: sh.name, rows: 0, masuk: 0, keluar: 0, fallbackDate: 0, rakDefault: 0, skippedCols: [], skippedRows: 0, mismatch: [], badCells: 0, keluarSebelumMasuk: 0 };

    // 1) klasifikasi kolom tanggal
    var cols = [], prev = null;
    for (var j = firstDate; j < endCol; j++) {
      var raw = H[j], d = parseDate(raw), reason = '';
      if (d === null) reason = 'header tanggal tidak terbaca';
      else if (d > today) reason = 'tanggal di masa depan';
      else if (prev && d < prev) reason = 'urutan tanggal mundur';
      var cells = 0;
      for (var i = 1; i < rows.length; i++) { var cv = rows[i] && rows[i][j]; if (cv !== null && cv !== undefined && cv !== '') cells++; }
      if (reason) { if (cells > 0) rep.skippedCols.push({ col: colLetter(j), header: txt(raw), cells: cells, reason: reason }); continue; }
      prev = d;
      cols.push({ j: j, d: d });
    }
    var earliest = cols.length ? cols[0].d : today;
    cols.forEach(function (c) { if (c.d < earliest) earliest = c.d; });
    var skipIdx = {}; // kolom dilewati -> untuk menghitung dampaknya ke Stok Akhir
    for (var jj = firstDate; jj < endCol; jj++) skipIdx[jj] = true;
    cols.forEach(function (c) { delete skipIdx[c.j]; });

    // 2) baris batch
    for (var i2 = 1; i2 < rows.length; i2++) {
      var r = rows[i2] || [];
      var code = txt(r[cm.code]).toUpperCase(), name = txt(r[cm.name]);
      if (!code && !name) continue;
      if (!code) { rep.skippedRows++; acc.warnings.push(sh.name + ' baris ' + (i2 + 1) + ': kode material kosong, dilewati'); continue; }
      var qin = num(r[cm.qin]);
      if (!(qin > 0)) { rep.skippedRows++; acc.warnings.push(sh.name + ' baris ' + (i2 + 1) + ' (' + code + '): Qty In tidak valid, dilewati'); continue; }
      rep.rows++;
      var outs = [], sumOut = 0;
      cols.forEach(function (c) {
        var v = r[c.j];
        if (v === null || v === undefined || v === '') return;
        var n = num(v);
        if (n === null || n <= 0) { rep.badCells++; return; }
        outs.push({ d: c.d, q: n }); sumOut += n;
      });
      var skipOut = 0;
      Object.keys(skipIdx).forEach(function (k) { var n = num(r[+k]); if (n !== null && n > 0) skipOut += n; });
      var recv = cm.date !== undefined ? parseDate(r[cm.date]) : null;
      if (!recv) { recv = outs.length ? outs[0].d : earliest; rep.fallbackDate++; }
      var rak = cm.rak !== undefined ? txt(r[cm.rak]).toUpperCase() : '';
      if (!rak) { rak = '-'; rep.rakDefault++; }
      var ref = cm.ref !== undefined ? txt(r[cm.ref]) : '';
      var ven = cm.vendor !== undefined ? txt(r[cm.vendor]) : '';
      var ket = 'IMPOR-EXCEL ' + sh.name;
      if (!acc.items[code]) {
        acc.items[code] = {
          id: code, nama: name || code, spec: cm.spec !== undefined ? txt(r[cm.spec]) : '',
          unit: cm.unit !== undefined ? txt(r[cm.unit]) : '', user: cm.user !== undefined ? txt(r[cm.user]) : '',
          bc: cm.bc !== undefined ? txt(r[cm.bc]) : '', kategori: kategori
        };
      }
      acc.raw.push({ id: code, j: 'MASUK', d: recv, q: qin, ref: ref, rak: rak, ven: ven, ket: ket }); rep.masuk++;
      outs.forEach(function (o) {
        if (o.d < recv) rep.keluarSebelumMasuk++;
        acc.raw.push({ id: code, j: 'KELUAR', d: o.d, q: o.q, ref: '', rak: rak, ven: ven, ket: ket }); rep.keluar++;
      });
      var akhir = cm.last !== undefined ? num(r[cm.last]) : null;
      if (akhir !== null && Math.abs(qin - sumOut - akhir) > 1e-9) {
        rep.mismatch.push({ row: i2 + 1, code: code, qin: qin, keluar: sumOut, akhir: akhir, kolomDilewati: skipOut > 0 });
      }
    }
    acc.sheets.push(rep);
  }

  /* sheets: [{name, rows:[[...]]}] ; opts.today 'yyyy-MM-dd' (default hari ini lokal +1 hari) */
  function parseSheets(sheets, opts) {
    var today = (opts && opts.today) || (function () { var t = new Date(Date.now() + MS_DAY); return ymd(t.getFullYear(), t.getMonth() + 1, t.getDate()); })();
    var acc = { items: {}, raw: [], sheets: [], warnings: [] };
    sheets.forEach(function (sh) { processSheet(sh, today, acc); });
    var map = {}, entries = [];
    acc.raw.forEach(function (e) {
      var k = entryKey(e);
      if (map[k]) map[k].n++; else { e.n = 1; map[k] = e; entries.push(e); }
    });
    var tot = { masuk: 0, keluar: 0, rows: 0, mismatch: 0, skippedCols: 0 };
    acc.sheets.forEach(function (s) { tot.masuk += s.masuk; tot.keluar += s.keluar; tot.rows += s.rows; tot.mismatch += s.mismatch.length; tot.skippedCols += s.skippedCols.length; });
    return { items: Object.keys(acc.items).map(function (k) { return acc.items[k]; }), entries: entries, report: { sheets: acc.sheets, warnings: acc.warnings, totals: tot, uniqueEntries: entries.length } };
  }

  function parseWorkbook(XLSX, wb, opts) {
    var sheets = wb.SheetNames.map(function (n) {
      return { name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }) };
    });
    return parseSheets(sheets, opts);
  }

  var api = { parseDate: parseDate, entryKey: entryKey, parseSheets: parseSheets, parseWorkbook: parseWorkbook };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.RdiImportParser = api;

  /* ===================== UI (hanya browser) ===================== */
  if (typeof document === 'undefined') return;
  var CHUNK = 400, state = null;
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function box() { return document.getElementById('import-xl-box'); }
  function setBox(html) { var b = box(); if (b) b.innerHTML = html; }
  function msg(kind, text) {
    var col = kind === 'err' ? 'var(--red-text,#ff6b6b)' : kind === 'ok' ? 'var(--green-text,#2ecc71)' : 'var(--text2)';
    return '<div style="font-size:12px;color:' + col + ';margin:6px 0">' + esc(text) + '</div>';
  }
  function pick() { var f = document.getElementById('import-xl-file'); if (f) { f.value = ''; f.click(); } }
  function onFile(input) {
    var file = input && input.files && input.files[0];
    if (!file) return;
    if (typeof root.XLSX === 'undefined') { setBox(msg('err', 'Library Excel belum termuat (butuh internet sekali). Coba lagi sebentar.')); return; }
    if (typeof root.gasPost !== 'function') { setBox(msg('err', 'Aplikasi belum siap. Muat ulang halaman.')); return; }
    setBox(msg('info', 'Membaca ' + file.name + '…'));
    var fr = new FileReader();
    fr.onerror = function () { setBox(msg('err', 'Gagal membaca file.')); };
    fr.onload = function () {
      var parsed;
      try { parsed = parseWorkbook(root.XLSX, root.XLSX.read(new Uint8Array(fr.result), { type: 'array' })); }
      catch (e) { setBox(msg('err', 'File bukan Excel yang valid: ' + (e && e.message ? e.message : e))); return; }
      if (!parsed.entries.length) { setBox(msg('err', 'Tidak ada baris transaksi yang terbaca. Pastikan format kolom sesuai (Material code, Material name, Qty In, tanggal…, Stok Akhir).')); return; }
      state = { file: file.name, parsed: parsed };
      setBox(msg('info', 'Memeriksa ke server (belum ada data yang diubah)…'));
      root.gasPost({ action: 'importExcel', mode: 'dry', items: parsed.items, entries: parsed.entries }).then(function (res) {
        if (!res || res.status !== 'ok') { setBox(msg('err', (res && res.message) || 'Pemeriksaan gagal.')); return; }
        state.dry = res; renderPreview();
      }).catch(function (e) { setBox(msg('err', 'Gagal menghubungi server: ' + (e && e.message ? e.message : 'network'))); });
    };
    fr.readAsArrayBuffer(file);
  }
  function renderPreview() {
    var p = state.parsed, rep = p.report, d = state.dry, h = '';
    h += '<div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:6px">Pratinjau: ' + esc(state.file) + '</div>';
    h += '<div style="font-size:12px;line-height:1.7;border:1px solid var(--border);border-radius:var(--br-9);padding:8px 10px">';
    h += 'Baris batch terbaca: <b>' + rep.totals.rows + '</b> · Transaksi unik: <b>' + rep.uniqueEntries + '</b><br>';
    h += 'Item baru dibuat: <b>' + d.itemsNew + '</b> · Item sudah ada: <b>' + d.itemsExisting + '</b><br>';
    h += 'Akan ditambah: <b>' + d.masukAdd + '</b> MASUK + <b>' + d.keluarAdd + '</b> KELUAR · Sudah ada (dilewati): <b>' + d.alreadyExist + '</b>';
    h += '</div>';
    var warn = [];
    rep.sheets.forEach(function (s) {
      if (s.fallbackDate) warn.push(s.name + ': ' + s.fallbackDate + ' baris tanpa tanggal terima (diisi tanggal kolom pertama yang terisi)');
      if (s.rakDefault) warn.push(s.name + ': ' + s.rakDefault + ' baris tanpa RAK (diisi "-")');
      s.skippedCols.forEach(function (c) { warn.push(s.name + ' kolom ' + c.col + ' "' + c.header + '" (' + c.cells + ' sel) DILEWATI: ' + c.reason); });
      if (s.mismatch.length) warn.push(s.name + ': ' + s.mismatch.length + ' baris Qty In − keluar ≠ Stok Akhir (contoh baris ' + s.mismatch.slice(0, 5).map(function (m) { return m.row; }).join(', ') + ')');
      if (s.keluarSebelumMasuk) warn.push(s.name + ': ' + s.keluarSebelumMasuk + ' KELUAR bertanggal sebelum tanggal terima batch-nya');
      if (s.badCells) warn.push(s.name + ': ' + s.badCells + ' sel qty keluar tidak valid (dilewati)');
    });
    rep.warnings.slice(0, 20).forEach(function (w) { warn.push(w); });
    if (d.dupNameSpec && d.dupNameSpec.length) warn.push(d.dupNameSpec.length + '+ item baru punya Nama+Spesifikasi sama dengan item lama ber-ID lain (contoh: ' + d.dupNameSpec.slice(0, 3).map(function (x) { return x.id + '≈' + x.existingId; }).join(', ') + ') — cek kemungkinan duplikat');
    if (d.unknownIds && d.unknownIds.length) warn.push('Transaksi untuk item tak dikenal dilewati: ' + d.unknownIds.slice(0, 5).join(', '));
    if (warn.length) h += '<div style="font-size:11px;color:var(--text3);margin:8px 0;max-height:180px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--br-9);padding:8px 10px">' + warn.map(function (w) { return '<div style="margin-bottom:4px">⚠ ' + esc(w) + '</div>'; }).join('') + '</div>';
    var nothing = !d.itemsNew && !d.masukAdd && !d.keluarAdd;
    if (nothing) h += msg('ok', 'Tidak ada yang perlu ditambah — data aplikasi sudah sesuai Excel.');
    else h += '<button class="btn btn-sm" id="import-xl-apply" onclick="importXlApply(this)">Terapkan Import</button>';
    setBox(h);
  }
  function apply(btn) {
    if (!state || !state.dry) return;
    var d = state.dry;
    if (!confirm('Tambahkan ' + d.itemsNew + ' item baru, ' + d.masukAdd + ' MASUK dan ' + d.keluarAdd + ' KELUAR ke spreadsheet? Backup Transaksi_Log dibuat otomatis. Jangan scan transaksi selama proses berjalan.')) return;
    btn.disabled = true;
    var entries = state.parsed.entries, items = state.parsed.items, total = Math.max(1, Math.ceil(entries.length / CHUNK)), k = 0, sum = { masuk: 0, keluar: 0, items: 0, skip: 0 };
    function step() {
      setBox(msg('info', 'Mengimpor bagian ' + (k + 1) + ' dari ' + total + '…'));
      var body = { action: 'importExcel', mode: 'commit', entries: entries.slice(k * CHUNK, (k + 1) * CHUNK), items: k === 0 ? items : [], backup: k === 0, final: k === total - 1 };
      root.gasPost(body).then(function (res) {
        if (!res || res.status !== 'ok') { setBox(msg('err', 'Berhenti di bagian ' + (k + 1) + '/' + total + ': ' + ((res && res.message) || 'error') + '. Aman diulang — data yang sudah masuk tidak akan digandakan.')); return; }
        sum.masuk += res.masukAdd; sum.keluar += res.keluarAdd; sum.items += res.itemsNew; sum.skip += res.alreadyExist;
        k++;
        if (k < total) { step(); return; }
        setBox(msg('ok', 'Selesai: ' + sum.items + ' item baru, ' + sum.masuk + ' MASUK, ' + sum.keluar + ' KELUAR ditambahkan; ' + sum.skip + ' sudah ada. Saldo sudah dihitung ulang' + (res.backupSheet ? ' · backup: ' + res.backupSheet : '') + '.'));
        if (typeof root.loadData === 'function') { try { root.loadData(); } catch (e) {} }
      }).catch(function (e) { setBox(msg('err', 'Gagal di bagian ' + (k + 1) + '/' + total + ': ' + (e && e.message ? e.message : 'network') + '. Aman diulang.')); });
    }
    step();
  }
  root.RdiImport = { pick: pick, onFile: onFile, apply: apply };
  /* Pembungkus global bernama — dipanggil dari atribut onclick/onchange di index.html (pemeriksa handler L1 mencari `function nama(`). */
  function importXlPick() { return pick(); }
  function importXlOnFile(input) { return onFile(input); }
  function importXlApply(btn) { return apply(btn); }
  root.importXlPick = importXlPick; root.importXlOnFile = importXlOnFile; root.importXlApply = importXlApply;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
