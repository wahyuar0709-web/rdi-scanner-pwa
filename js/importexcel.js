/* importexcel.js — v5.30 IMPOR EXCEL (mode MERGE idempotent)
 * Membaca file "Tools & Spare Part Inventory ....xlsx" (format kartu stok per-batch: 1 baris = 1 batch
 * kedatangan, kolom tanggal = qty KELUAR, kolom terakhir "Stok Akhir") lalu mengubahnya jadi:
 *   items   : identitas barang (hanya yang BELUM ada di Master_Item yang akan dibuat — item lama tidak ditimpa)
 *   entries : transaksi MASUK/KELUAR unik + jumlah kembar (n), dipakai backend untuk merge idempotent.
 * Bagian PARSER murni (tanpa DOM) supaya bisa dites di Node. Bagian UI hanya jalan di browser.
 * Aturan yang disetujui user: rak kosong -> "-", tanggal terima kosong -> tanggal kolom pertama yang terisi.
 * v5.28 auto-repair (deterministik, selalu dilaporkan di pratinjau, tidak pernah diam-diam):
 *   1) kode material dirapikan — karakter di luar ID_RE dibuang lalu tepi dirapikan; hasil kosong -> dilewati;
 *   2) angka paham format mil "1.000,5" (koma desimal, titik ribuan);
 *   3) header tanggal salah ketik ("25-Agu-252", "19/08/20262", tahun +1..) DITJAHIT dari jangkar tetangga:
 *      dipakai hanya bila KARTU satu-satunya kandidat hari/bulan yang sama masuk interval jangkar kiri–kanan
 *      dan <= hari ini; ambigu / tanpa jangkar -> tetap dilewati;
 *   4) kolom dengan tanggal sah tetapi urutan tidak menaik tetap IKUT (tanggal header sah — urutan kolom bukan data);
 *   5) baris tanpa kode material (tapi punya Nama) -> kode sementara "AUTO-<hash8 dtd Nama|Spesifikasi>":
 *      deterministik, jadi impor ulang file yang sama menghasilkan kode yang sama (idempotent). Saat Excel
 *      memberi kode asli, baris itu menjelma item berkode asli; item AUTO lama tidak ditimpa (backend by
 *      design tidak pernah menimpa item lama).
 * Merge idempotent, aman diulang.
 * v5.30: AUTO MATCH backend (promote/alias) — kode sementara AUTO-* dicocokkan
 *   dengan Nama+Spesifikasi item master; pratinjau menampilkan autoPromote/autoAlias
 *   dan commit butuh konfirmasi khusus untuk promote.
 * v5.29 (hasil uji 10 skema 2026-11-11):
 *   6) kode hasil rapikan yang bertabrakan (2 kode berbeda -> 1 kode) DIKUMPULKAN
 *      dan dilaporkan per kode (collisions) — cegah stok menumpuk diam-diam;
 *   7) header tanggal yang terdeteksi SETELAH kolom "Stok Akhir" dilaporkan
 *      (lateDateCols) — dulu diabaikan seluruhnya tanpa jejak. */
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
    var s = String(v).trim();
    if (!s) return null;
    var c = (s.match(/,/g) || []).length, t = (s.match(/\./g) || []).length;
    if (c > 0 && t > 0) s = s.replace(/\./g, '').replace(/,/g, '.'); // "1.000,5" -> 1000.5
    else if (c === 1) s = s.replace(',', '.');                      // "1,5" -> 1.5
    else if (t > 1) s = s.replace(/\./g, '');                       // "1.000.000" -> 1000000
    return /^-?\d+(\.\d+)?$/.test(s) ? parseFloat(s) : null;
  }
  function txt(v) { return v === null || v === undefined ? '' : String(v).trim(); }
  function norm(h) { return txt(h).replace(/\s+/g, ' ').toLowerCase(); }
  function colLetter(j) { var s = ''; j++; while (j > 0) { var r = (j - 1) % 26; s = String.fromCharCode(65 + r) + s; j = Math.floor((j - 1) / 26); } return s; }
  function r3(q) { return Math.round(q * 1000) / 1000; }
  /* Kunci idempotensi — HARUS identik dengan importKey_ di Code.gs. KELUAR tidak memakai no referensi. */
  function entryKey(e) { return e.id + '|' + e.j + '|' + e.d + '|' + r3(e.q) + '|' + (e.j === 'MASUK' ? txt(e.ref).replace(/^'/, '').toUpperCase() : ''); }

  var ID_RE = /^[A-Z0-9][A-Z0-9\-_.\/ ]{0,39}$/;   // sama dengan idRe di importValidate_ (Code.gs)
  var HDR = {
    'material code': 'code', 'material name': 'name', 'material specification': 'spec',
    'no. invoice': 'ref', 'invoice no.': 'ref', 'invoice no': 'ref', 'nomor po / packing list': 'ref',
    'received date': 'date', 'indate': 'date', 'rak': 'rak', 'qty in': 'qin', 'unit': 'unit',
    'user': 'user', 'bc/non bc': 'bc', 'vendor': 'vendor', 'stok akhir': 'last'
  };
  var KAT = { 'tools': 'Tools', 'spare part': 'Spare Part', 'sparepart': 'Spare Part', 'indirect': 'Indirect', 'consumable': 'Consumable' };

  /* Kode sementara utk baris tanpa kode material. Deterministik dari Nama+Spesifikasi
   * supaya impor ulang menghasilkan kode yang sama (kunci idempotent tidak berubah).
   * "FIXED DRILL" diimpor ulang selalu -> AUTO-<hex8> yang sama. */
  function autoCodeTemp(name, spec) {
    var s = (txt(name) + '|' + txt(spec)).toUpperCase();
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return 'AUTO-' + ('0000000' + h.toString(16).toUpperCase()).slice(-8);
  }

  /* ---------- auto-repair (deterministik) ---------- */

  var MON3 = { jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7, agu: 8, agt: 8, ags: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12 };

  /* Rapikan kode material: karakter di luar ID_RE diganti spasi, tepi & spasi ganda dirapikan.
   * "MRO-01-08-[..]" -> "MRO-01-08". Hasil kosong -> null (dilewati). */
  function repairCode(raw) {
    var s = txt(raw).toUpperCase().replace(/[^A-Z0-9\-_.\/ ]/g, ' ');
    s = s.replace(/[^A-Z0-9]+$/, '').replace(/^[^A-Z0-9]+/, '').replace(/\s+/g, ' ').trim();
    s = s.replace(/[\-_.\/ ]+$/, '').replace(/^[\-_.\/ ]+/, '').trim();
    return (s && ID_RE.test(s)) ? s : null;
  }

  /* Bagian hari/bulan/tahun-selap dari header tanggal. -> {d, m, ys} atau null.
   * Mendukung "25/08/2025", "25/08/20262", "25-Agu-252", "7/10/2026". */
  function headerParts(raw) {
    if (raw === null || raw === undefined) return null;
    var s = String(raw instanceof Date ? ymd(raw.getFullYear(), raw.getMonth() + 1, raw.getDate()) : raw).trim();
    if (!s) return null;
    var m = /^(\d{1,2})[\/\-\. ](\d{1,2})[\/\-\. ](\d{1,5})$/.exec(s);
    if (m) return { d: +m[1], m: +m[2], ys: m[3] };
    m = /^(\d{1,2})[ \-\.][ ]*([A-Za-z]{3,4})[ \-\.][ ]*(\d{1,5})$/.exec(s);
    if (m && MON3[m[2].toLowerCase().slice(0, 3)]) return { d: +m[1], m: MON3[m[2].toLowerCase().slice(0, 3)], ys: m[3] };
    return null;
  }

  /* Kandidat tanggal utk header rusak di antara jangkar tetangga.
   * Hanya dianggap jahit bila kembali TEPAT SATU kandidat: hari-bulan (sama) bernilai sah,
   * <= today, dan masuk interval jangkar kiri (dA) — kanan (dB). Kalau >1 kandidat -> ambigu. */
  function repairCandidates(p, dA, dB, today) {
    if (!p || (dA === null && dB === null)) return [];
    var yMin = dA === null ? null : +dA.slice(0, 4);
    var yMax = dB === null ? null : +dB.slice(0, 4);
    if (yMin !== null && yMax !== null) { if (yMin > yMax) { var q = yMin; yMin = yMax; yMax = q; } }
    else if (yMin === null) { yMin = yMax - 1; }
    else { yMax = Math.min(+today.slice(0, 4), yMin + 1); }
    var yrs = {};
    for (var y = Math.max(2000, yMin); y <= Math.min(2100, yMax); y++) yrs[y] = true;
    var ys = p.ys;
    if (ys) { /* bacaan eksplisit dari string asal (bisa salah ketik) ikut ditawarkan */
      if (ys.length >= 4) yrs[+ys.slice(0, 4)] = true;
      else if (ys.length === 3) { yrs[2000 + +ys.slice(0, 2)] = true; yrs[2000 + +ys.slice(1, 3)] = true; }
      else yrs[2000 + +ys] = true;
    }
    var out = [], seen = {};
    for (var k in yrs) {
      var yy = +k;
      if (yy < 2000 || yy > 2100 || !validYMD(yy, p.m, p.d)) continue;
      var c = ymd(yy, p.m, p.d);
      if (c > today) continue;
      if ((dA !== null && c < dA) || (dB !== null && c > dB)) continue;
      if (!seen[c]) { seen[c] = true; out.push(c); }
    }
    return out;
  }

  function processSheet(sh, today, acc) {
    var rows = sh.rows || [];
    if (!rows.length) return;
    var H = rows[0] || [], cm = {};
    H.forEach(function (h, j) { var k = HDR[norm(h)]; if (k && cm[k] === undefined) cm[k] = j; });
    if (cm.code === undefined || cm.name === undefined || cm.qin === undefined) return; // bukan sheet transaksi (mis. Master Code)
    var endCol = cm.last !== undefined ? cm.last : H.length;
    var firstDate = (cm.unit !== undefined ? cm.unit : cm.qin) + 1;
    var kategori = KAT[norm(sh.name)] || txt(sh.name);
    var rep = { name: sh.name, rows: 0, masuk: 0, keluar: 0, fallbackDate: 0, rakDefault: 0, skippedCols: [], skippedRows: 0, mismatch: [], badCells: 0, keluarSebelumMasuk: 0, fixedDateCols: [], fixedCodeRows: 0, reorderedCols: 0, autoCodeRows: [], collapsedCodes: [], lateDateCols: [] };

    /* v5.29 P3 (IMP-05): header tanggal SETELAH "Stok Akhir" tidak pernah dibaca
       (endCol berhenti di Stok Akhir). Laporkan supaya layout aneh tidak
       membuang data diam-diam. Tidak mengubah semantik data. */
    if (cm.last !== undefined) {
      for (var jx = cm.last + 1; jx < H.length; jx++) {
        if (parseDate(H[jx]) !== null || headerParts(H[jx])) rep.lateDateCols.push({ col: colLetter(jx), header: txt(H[jx]) });
      }
    }

    // 1) klasifikasi kolom tanggal + perbaikan otomatis dengan jangkar tetangga
    var jDate = {}; // kolom -> 'yyyy-MM-dd' (sah / sudah dijahit)
    for (var j = firstDate; j < endCol; j++) {
      var d0 = parseDate(H[j]);
      if (d0 !== null && d0 <= today) jDate[j] = d0;
    }
    var lastOk = null; // tanggal kolom sah terakhir di KIRI (posisi)
    for (j = firstDate; j < endCol; j++) {
      if (jDate[j]) {
        if (lastOk !== null && jDate[j] < lastOk) rep.reorderedCols++; // sah tapi tidak menaik — tetap ikut, dilaporkan
        lastOk = jDate[j];
        continue;
      }
      var d0b = parseDate(H[j]);
      var reason = d0b === null ? 'header tanggal tidak terbaca' : 'tanggal di masa depan';
      var parts = (d0b === null || d0b > today) ? headerParts(H[j]) : null;
      if (parts) {
        var dB = null;
        for (var k = j + 1; k < endCol; k++) if (jDate[k]) { dB = jDate[k]; break; }
        var cands = repairCandidates(parts, lastOk, dB, today);
        if (cands.length === 1) {
          jDate[j] = cands[0];
          rep.fixedDateCols.push({ col: colLetter(j), header: txt(H[j]), ke: cands[0] });
          continue;
        }
      }
      var cells = 0;
      for (var i = 1; i < rows.length; i++) { var cv = rows[i] && rows[i][j]; if (cv !== null && cv !== undefined && cv !== '') cells++; }
      if (cells > 0) rep.skippedCols.push({ col: colLetter(j), header: txt(H[j]), cells: cells, reason: reason });
    }
    var cols = [];
    for (j = firstDate; j < endCol; j++) if (jDate[j]) cols.push({ j: j, d: jDate[j] });
    var earliest = cols.length ? cols[0].d : today;
    cols.forEach(function (c) { if (c.d < earliest) earliest = c.d; });
    var skipIdx = {}; // kolom bermasalah (dilewati) -> untuk menghitung dampaknya ke Stok Akhir
    for (var jj = firstDate; jj < endCol; jj++) skipIdx[jj] = true;
    cols.forEach(function (c) { delete skipIdx[c.j]; });

    // 2) baris batch
    for (var i2 = 1; i2 < rows.length; i2++) {
      var r = rows[i2] || [];
      var code = txt(r[cm.code]).toUpperCase(), name = txt(r[cm.name]);
      if (!code && !name) continue;
      if (!code) {
        /* kode kosong tapi nama ada -> kode sementara AUTO-<hash> (dilaporkan di pratinjau) */
        code = autoCodeTemp(name, cm.spec !== undefined ? txt(r[cm.spec]) : '');
        rep.autoCodeRows.push({ row: i2 + 1, id: code, nama: name });
      }
      if (!ID_RE.test(code)) {
        var fixed = repairCode(code);
        if (fixed) {
          code = fixed; rep.fixedCodeRows++;
          /* v5.29 P2 (IMP-03): raw kode hasil rapikan dikumpulkan per kode hasil —
             dua kode berbeda yang jatuh ke satu kode = sinyal stok menumpuk diam-diam. */
          if (rep.collapsedCodes.length < 50) rep.collapsedCodes.push({ raw: txt(r[cm.code]).trim(), ke: code, nama: name });
        }
        else { rep.skippedRows++; acc.warnings.push(sh.name + ' baris ' + (i2 + 1) + ': kode "' + code.substring(0, 40) + '" tidak valid dan tak bisa dirapikan — dilewati'); continue; }
      }
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
    var tot = { masuk: 0, keluar: 0, rows: 0, mismatch: 0, skippedCols: 0, fixedDateCols: 0, fixedCodeRows: 0, reorderedCols: 0, autoCodeRows: 0, collapsedCodes: 0, lateDateCols: 0 };
    acc.sheets.forEach(function (s) { tot.masuk += s.masuk; tot.keluar += s.keluar; tot.rows += s.rows; tot.mismatch += s.mismatch.length; tot.skippedCols += s.skippedCols.length; tot.fixedDateCols += s.fixedDateCols.length; tot.fixedCodeRows += s.fixedCodeRows; tot.reorderedCols += s.reorderedCols; tot.autoCodeRows += s.autoCodeRows.length; tot.collapsedCodes += s.collapsedCodes.length; tot.lateDateCols += s.lateDateCols.length; });
    return { items: Object.keys(acc.items).map(function (k) { return acc.items[k]; }), entries: entries, report: { sheets: acc.sheets, warnings: acc.warnings, totals: tot, uniqueEntries: entries.length } };
  }

  function parseWorkbook(XLSX, wb, opts) {
    var sheets = wb.SheetNames.map(function (n) {
      return { name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null }) };
    });
    return parseSheets(sheets, opts);
  }

  var api = { parseDate: parseDate, entryKey: entryKey, parseSheets: parseSheets, parseWorkbook: parseWorkbook, repairCode: repairCode, headerParts: headerParts, repairCandidates: repairCandidates, autoCodeTemp: autoCodeTemp };
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
  /* Indikator kerja: ring berputar + (bila ada pct) bar progres tipis.
   * Animasi fungsional (loading), bukan dekorasi; berhenti saat prefers-reduced-motion. */
  function busyMsg(text, pct) {
    var bar = typeof pct === 'number'
      ? '<div style="height:4px;border-radius:999px;background:var(--bg,#F1F4F9);margin-top:6px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:var(--brand-1,#0057C2);border-radius:999px;transition:width 150ms ease"></div></div>'
      : '';
    return '<style>@keyframes rdiImportSpin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.rdi-spin{animation:none}}</style>' +
      '<div role="status" style="display:flex;align-items:center;gap:10px;margin:6px 0">' +
      '<span class="rdi-spin" aria-hidden="true" style="width:18px;height:18px;flex:none;border:2px solid var(--brand-1-dim,#c7d7f5);border-top-color:var(--brand-1,#0057C2);border-radius:999px;display:inline-block;animation:rdiImportSpin .9s linear infinite"></span>' +
      '<div style="flex:1;min-width:0"><div style="font-size:12px;color:var(--text2,#475569)">' + esc(text) + '</div>' + bar + '</div>' +
      '</div>';
  }
  function pick() { var f = document.getElementById('import-xl-file'); if (f) { f.value = ''; f.click(); } }
  /* UX 2026-10-28: modal import ditandai aria-busy selama file diproses/disubmit (High guideline "loading indicators") */
  function setImportBusy(on) { var m = document.getElementById('modal-import-excel'); if (m) { if (on) m.setAttribute('aria-busy', 'true'); else m.removeAttribute('aria-busy'); } }
  function onFile(input) {
    var file = input && input.files && input.files[0];
    if (!file) return;
    setImportBusy(true);
    if (typeof root.XLSX === 'undefined') {
    if (typeof root.loadExcelLib === 'function') {
      setImportBusy(true);
      setBox(busyMsg('Menyiapkan library Excel...'));
      root.loadExcelLib('xlsx').then(function () { setImportBusy(false); onFile(input); }, function () { setImportBusy(false); setBox(msg('err', 'Library Excel gagal dimuat. Periksa koneksi lalu coba lagi.')); });
      return;
    }
    setImportBusy(false); setBox(msg('err', 'Library Excel belum termuat.')); return;
  }
    if (typeof root.gasPost !== 'function') { setImportBusy(false); setBox(msg('err', 'Aplikasi belum siap. Muat ulang halaman.')); return; }
    setBox(busyMsg('Membaca ' + file.name + '...'));
    var fr = new FileReader();
    fr.onerror = function () { setImportBusy(false); setBox(msg('err', 'Gagal membaca file.')); };
    /* Variabel modul */
    function txtToday() { var t = new Date(); return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate()); }
    /* Simpan salinan sheet "Master Code" dari file yang diimpor supaya Export Excel bisa menyertakannya */
    function simpanMasterCode(wb2) {
      if (!root.RdiExport) return;
      var mcName = wb2.SheetNames.filter(function (n) { return norm(n) === 'master code'; })[0];
      if (!mcName) return; /* file tanpa sheet Master Code — abaikan sesempurna */
      var rows = root.XLSX.utils.sheet_to_json(wb2.Sheets[mcName], { header: 1, raw: true, defval: null });
      root.RdiExport.mcSaveFromSheetRows(rows, txtToday());
    }
    fr.onload = function () {
      var parsed, wb2;
      try { wb2 = root.XLSX.read(new Uint8Array(fr.result), { type: 'array' }); parsed = parseWorkbook(root.XLSX, wb2); }
      catch (e) { setImportBusy(false); setBox(msg('err', 'File bukan Excel yang valid: ' + (e && e.message ? e.message : e))); return; }
      if (!parsed.entries.length) { setImportBusy(false); setBox(msg('err', 'Tidak ada baris transaksi yang terbaca. Pastikan format kolom sesuai (Material code, Material name, Qty In, tanggal…, Stok Akhir).')); return; }
      /* CACHE MASTER CODE (dipakai sheet Master Code di Export Excel); bila gagal -> dilewati */
      try { simpanMasterCode(wb2); } catch (e) { /* tetap lanjut */ }
      state = { file: file.name, parsed: parsed };
      setBox(busyMsg('Memeriksa ke server (belum ada data yang diubah)...'));
      root.gasPost({ action: 'importExcel', mode: 'dry', items: parsed.items, entries: parsed.entries }).then(function (res) {
        if (!res || res.status !== 'ok') { setImportBusy(false); setBox(msg('err', (res && res.message) || 'Pemeriksaan gagal.')); return; }
        state.dry = res; renderPreview();
      }).catch(function (e) { setImportBusy(false); setBox(msg('err', 'Gagal menghubungi server: ' + (e && e.message ? e.message : 'network'))); });
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
    var fix = [];
    rep.sheets.forEach(function (s) {
      s.fixedDateCols.forEach(function (c) { fix.push(s.name + ' kolom ' + c.col + ' header "' + c.header + '" dijahit jadi ' + c.ke + ' (dari jangkar tetangga)'); });
      if (s.fixedCodeRows) fix.push(s.name + ': ' + s.fixedCodeRows + ' kode material dirapikan otomatis (karakter tidak sah dibuang)');
      s.autoCodeRows.slice(0, 20).forEach(function (a) { fix.push(s.name + ' baris ' + a.row + ': kode kosong -> sementara ' + a.id + ' ("' + a.nama + '"); isi kode asli di Excel nanti agar item berkode asli terbentuk'); });
      if (s.autoCodeRows.length > 20) fix.push(s.name + ': … dan ' + (s.autoCodeRows.length - 20) + ' baris lain berkode sementara');
      if (s.reorderedCols) fix.push(s.name + ': ' + s.reorderedCols + ' kolom tanggal urutannya tidak menaik — tetap dipakai (tanggal header sah)');
      /* v5.29 IMP-03: kolisi kode hasil rapikan — dimerahkan per kode hasil */
      var colByKe = {};
      s.collapsedCodes.forEach(function (c) { (colByKe[c.ke] = colByKe[c.ke] || []).push(c); });
      Object.keys(colByKe).forEach(function (ke) {
        var raws = colByKe[ke].map(function (c) { return c.raw; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
        fix.push(s.name + ': ' + colByKe[ke].length + ' baris kode "' + raws.join('", "') + '" dirapikan menjadi "' + ke + '" — PASTIKAN itu memang item yang sama (stok bisa menumpuk di satu kode)');
      });
      if (s.lateDateCols.length) warn.push(s.name + ': ' + s.lateDateCols.length + ' kolom tanggal terdeteksi SETELAH "Stok Akhir" dan DILEWATI (' + s.lateDateCols.slice(0, 3).map(function (c) { return c.col + ' "' + c.header + '"'; }).join(', ') + (s.lateDateCols.length > 3 ? ', …' : '') + ') — pastikan "Stok Akhir" di kolom paling kanan');
    });
    rep.sheets.forEach(function (s) {
      if (s.fallbackDate) warn.push(s.name + ': ' + s.fallbackDate + ' baris tanpa tanggal terima (diisi tanggal kolom pertama yang terisi)');
      if (s.rakDefault) warn.push(s.name + ': ' + s.rakDefault + ' baris tanpa RAK (diisi "-")');
      s.skippedCols.forEach(function (c) { warn.push(s.name + ' kolom ' + c.col + ' "' + c.header + '" (' + c.cells + ' sel) DILEWATI: ' + c.reason); });
      if (s.mismatch.length) warn.push(s.name + ': ' + s.mismatch.length + ' baris Qty In − keluar ≠ Stok Akhir (contoh baris ' + s.mismatch.slice(0, 5).map(function (m) { return m.row; }).join(', ') + ')');
      if (s.keluarSebelumMasuk) warn.push(s.name + ': ' + s.keluarSebelumMasuk + ' KELUAR bertanggal sebelum tanggal terima batch-nya');
      if (s.badCells) warn.push(s.name + ': ' + s.badCells + ' sel qty keluar tidak valid (dilewati)');
    });
    rep.warnings.slice(0, 30).forEach(function (w) { warn.push(w); });
    if (fix.length) {
      h += '<div style="font-size:12px;color:var(--green-text,#2ecc71);margin:8px 0;max-height:140px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--br-9);padding:8px 10px">' +
        '<div style="font-weight:700;margin-bottom:4px">Perbaikan otomatis (' + rep.totals.fixedDateCols + ' header tanggal, ' + rep.totals.fixedCodeRows + ' kode dirapikan, ' + rep.totals.autoCodeRows + ' kode sementara):</div>' +
        fix.slice(0, 30).map(function (w) { return '<div style="margin-bottom:4px">' + esc(w) + '</div>'; }).join('') +
        (fix.length > 30 ? '<div>… dan ' + (fix.length - 30) + ' lagi</div>' : '') + '</div>';
    }
    if (d.autoPromote && d.autoPromote.length) fix.push('AUTO MATCH: ' + (d.autoPromoteCount || d.autoPromote.length) + ' item sementara akan DI-UPDATE ke kode aslinya dari Excel (contoh: ' + d.autoPromote.slice(0, 3).map(function (x) { return x.autoId + ' → ' + x.newId; }).join(', ') + ') — riwayat transaksinya ikut pindah ke kode baru, bukan dibuat item baru');
    if (d.autoAlias && d.autoAlias.length) fix.push('AUTO MATCH: ' + (d.autoAliasCount || d.autoAlias.length) + ' kode sementara dialihkan ke item master yang sudah ada (contoh: ' + d.autoAlias.slice(0, 3).map(function (x) { return x.autoId + ' → ' + x.toId; }).join(', ') + ')');
    if (d.dupNameSpec && d.dupNameSpec.length) warn.push((d.dupNameSpecCount || d.dupNameSpec.length) + '+ item baru punya Nama+Spesifikasi sama dengan item lama ber-ID lain (contoh: ' + d.dupNameSpec.slice(0, 3).map(function (x) { return x.id + '≈' + x.existingId; }).join(', ') + ') — cek kemungkinan duplikat');
    if (d.nameMismatch && d.nameMismatch.length) warn.push((d.nameMismatchCount || d.nameMismatch.length) + ' item: NAMA di Excel beda dengan Master_Item untuk ID yang sama (contoh: ' + d.nameMismatch.slice(0, 3).map(function (x) { return x.id + ': "' + String(x.excel).substring(0, 25) + '" ≠ "' + String(x.master).substring(0, 25) + '"'; }).join(' | ') + ') — cek kemungkinan kode dirapikan menabrak item lama');
    if (d.unknownIds && d.unknownIds.length) warn.push('Transaksi untuk item tak dikenal dilewati: ' + (d.unknownCount || d.unknownIds.length) + ' ID (contoh: ' + d.unknownIds.slice(0, 5).join(', ') + ')');
    if (warn.length) h += '<div style="font-size:12px;color:var(--text3);margin:8px 0;max-height:180px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--br-9);padding:8px 10px">' + warn.map(function (w) { return '<div style="margin-bottom:4px">⚠ ' + esc(w) + '</div>'; }).join('') + '</div>';
    var nothing = !d.itemsNew && !d.masukAdd && !d.keluarAdd;
    if (nothing) h += msg('ok', 'Tidak ada yang perlu ditambah — data aplikasi sudah sesuai Excel.');
    else h += '<button class="btn btn-sm" id="import-xl-apply" onclick="importXlApply(this)">Terapkan Import</button>';
    setBox(h);
    setImportBusy(false); /* pratinjau sudah tampil — modal tidak lagi "sibuk" */
  }
  function apply(btn) {
    if (!state || !state.dry) return;
    var d = state.dry;
    if (!confirm('Tambahkan ' + d.itemsNew + ' item baru, ' + d.masukAdd + ' MASUK dan ' + d.keluarAdd + ' KELUAR ke spreadsheet? Backup Transaksi_Log dibuat otomatis. Jangan scan transaksi selama proses berjalan.')) return;
    /* v5.30 IMP-10: promote mengganti ID item lama di master & riwayat — butuh konfirmasi sendiri */
    if (d.autoPromote && d.autoPromote.length) {
      var exP = d.autoPromote.slice(0, 3).map(function (x) { return x.autoId + ' → ' + x.newId; }).join(', ');
      if (!confirm('AUTO MATCH: ' + (d.autoPromoteCount || d.autoPromote.length) + ' item sementara akan DI-UPDATE ke kode aslinya (' + exP + '). ID lama di Master_Item & riwayat transaksi diganti kode baru. Lanjutkan?')) { setImportBusy(false); btn.disabled = false; return; }
    }
    /* v5.29 IMP-04: dupNameSpec kini butuh konfirmasi kedua (dulu hanya peringatan teks) */
    if (d.dupNameSpec && d.dupNameSpec.length) {
      var exDup = d.dupNameSpec.slice(0, 3).map(function (x) { return x.id + ' ≈ ' + x.existingId; }).join(', ');
      if (!confirm('PERINGATAN DOBEL: ' + (d.dupNameSpecCount || d.dupNameSpec.length) + '+ item baru Nama+Spesifikasi sama dengan item lama ber-ID lain (' + exDup + '). Lanjutkan tetap? Item ganda bisa terbentuk.')) { setImportBusy(false); btn.disabled = false; return; }
    }
    setImportBusy(true);
    btn.disabled = true;
    var entries = state.parsed.entries, items = state.parsed.items, total = Math.max(1, Math.ceil(entries.length / CHUNK)), k = 0, sum = { masuk: 0, keluar: 0, items: 0, skip: 0 };
    function step() {
      setBox(busyMsg('Mengimpor bagian ' + (k + 1) + ' dari ' + total + '...', Math.round(k / total * 100)));
      var body = { action: 'importExcel', mode: 'commit', entries: entries.slice(k * CHUNK, (k + 1) * CHUNK), items: k === 0 ? items : [], backup: k === 0, final: k === total - 1 };
      root.gasPost(body).then(function (res) {
        if (!res || res.status !== 'ok') { setImportBusy(false); setBox(msg('err', 'Berhenti di bagian ' + (k + 1) + '/' + total + ': ' + ((res && res.message) || 'error') + '. Aman diulang — data yang sudah masuk tidak akan digandakan.')); return; }
        sum.masuk += res.masukAdd; sum.keluar += res.keluarAdd; sum.items += res.itemsNew; sum.skip += res.alreadyExist;
        k++;
        if (k < total) { step(); return; }
        setBox(msg('ok', 'Selesai: ' + sum.items + ' item baru, ' + sum.masuk + ' MASUK, ' + sum.keluar + ' KELUAR ditambahkan; ' + sum.skip + ' sudah ada. Saldo sudah dihitung ulang' + (res.backupSheet ? ' · backup: ' + res.backupSheet : '') + '.'));
        setImportBusy(false);
        if (typeof root.loadData === 'function') { try { root.loadData(); } catch (e) {} }
      }).catch(function (e) { setImportBusy(false); setBox(msg('err', 'Gagal di bagian ' + (k + 1) + '/' + total + ': ' + (e && e.message ? e.message : 'network') + '. Aman diulang.')); });
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
