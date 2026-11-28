# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/). Versi aplikasi = `APP_VERSION` di `index.html`.
Tingkat verifikasi mengikuti `AGENTS.md` (L1–L5); hanya level yang benar-benar dijalankan yang dicantumkan.

## [Belum dirilis] — 2026-11-27 (audit UI/UX + perapian repo; `APP_VERSION` masih v15.42; cache `rdi-stok-v110`)

### Diperbaiki
- **Tombol "Simpan Transaksi" tidak pernah tampil.** Bar memakai kelas `u-hide` (`display:none!important`) yang mengalahkan `style.display`. Aturan CSS kecil kini membiarkan `display` inline menang; ikut terbuka: peringatan "Stok Rendah", pagination riwayat, daftar riwayat/vendor di detail item.
- **Qty desimal terpotong.** Pratinjau memakai `parseFloat` tetapi pengiriman `parseInt` (2,5 tersimpan 2). Kini `parseQty` dipakai di Transaksi, Pindah Rak, impor Foto SJ, dan stepper; 0,5 diterima. Pembacaan saldo/stok minimum di daftar, alert, dan dashboard juga tidak lagi membuang desimal.
- **Overlay "Mencari data…" muncul permanen.** Blok token CSS `--btn-icon-*` tertulis di luar `:root` sehingga aturan di bawahnya dibuang parser; `.show` juga kalah oleh `!important`.
- **Pindah Rak:** viewfinder scan tampil di dalam sheet (sebelumnya di tab Transaksi yang tidak aktif, ukuran 0×0); pesan gagal tampil sebagai toast (sebelumnya ditulis ke elemen tersembunyi); detail riwayat menamai transaksi PINDAH sebagai "Pindah Rak" (sebelumnya "Barang Keluar").
- **Detail item di HP:** header disusun vertikal (spesifikasi tidak lagi pecah per huruf); footer 2 baris dengan label yang membungkus (tidak keluar dari tombol di 360px / huruf diperbesar).
- **Alert Stok & Pengaturan Stok Minimum** menjadi kartu bertumpuk di HP (kolom MIN, input, dan tombol tidak lagi tersembunyi di balik scroll).
- **Tabel Stok Item** muat di laptop 1280/1366px (kolom Aksi tidak lagi tersembunyi); **Cetak Kartu** daftar lebih lega (baris 78→64px, bar atas lebih ringkas).
- Indikator tab aktif di bottom-nav HP (garis kiri gaya sidebar → pill); sidebar desktop (`--sp-8` tidak terdefinisi, ikon pencarian menimpa placeholder); sheet tertutup tidak lagi bisa difokus dan bayangannya tidak bocor; bar Simpan tidak lagi menimpa sidebar desktop; input tanggal sheet Filter tidak meluber di 360px; font input ≥16px di layar sentuh (cegah zoom otomatis iOS); area sentuh tombol Cetak/PDF dan tombol kecil di modal ≥44px; empat `<select>` kini punya `aria-label`.
- **Cache service worker basi:** `js/format.js` lama bertahan di HP karena nama `CACHE` tidak dinaikkan setelah terpasang → naik ke v109, precache memakai `cache:'reload'`, dan banner penjaga punya tombol **Perbarui sekarang** (hapus SW + Cache Storage, tidak menyentuh `localStorage`/antrean).

### Dirapikan (repo & kode)
- **Vendor QR dipindah ke `js/`:** `jsQR.min.js` dan `qrcode.min.js` kini di `js/jsQR.min.js` dan `js/qrcode.min.js`, satu tempat dengan vendor lain. `index.html`, `scanner.html`, `sw.js`, tes, `AGENTS.md`, dan konfigurasi `.opencode/` disesuaikan. **Path berubah → nama cache naik ke v110.**
- **`Backup/` dihapus** (snapshot `index.html` v14.98, 584 KB; riwayat git tetap menyimpannya). Tes `version_consistency` tidak lagi membandingkan dengan snapshot itu; variabel `backup` yang tidak terpakai di `r2_contract_leak` dihapus.
- **Seret-untuk-tutup bottom sheet** (sebelumnya tiga salinan identik: detail item, detail aset, detail unit aset) digabung menjadi satu fungsi `bindSheetDragToClose`; perilaku tidak berubah. Baseline `dup_check` diperbarui.
- `js/format.js`: blok helper baru (`parseQty`, `stockGuard`, `anomalyStats`, `fmtNum`, ...) disusun ulang multi-baris dengan komentar per fungsi (perilaku identik; fungsi lama tidak disentuh). Tiga teks rusak (mojibake) di komentar `sw.js` diperbaiki.

### Ditambahkan
- **Cek stok KELUAR di klien** (`stockGuard`, cermin aturan `Code.gs`): Simpan dinonaktifkan dengan alasan jelas sebelum ke server. Server tetap otoritas akhir.
- **Tombol Back perangkat:** menutup sheet/modal teratas, kembali dari sub-halaman, ke Stok dari tab lain; di Stok perlu dua kali dalam 2 detik untuk keluar.
- **Koreksi transaksi** di detail riwayat: entri lawan (Masuk↔Keluar) dengan qty/rak sama dan alasan wajib; ledger tetap append-only.
- **Peringatan anomali per jenis** (minimal 5 transaksi; anomali bila > 3× rata-rata dan > semua riwayat).
- **Format angka Indonesia untuk tampilan** (`fmtNum`: `12.500,5`); input dan payload tetap mentah.
- **Penjaga integritas** `js/format.js` (banner merah bila fungsi hilang) dan tes `repo_layout` (tata letak repo, referensi berkas, sinkron versi).
- `.editorconfig`; izin minimum (`contents: read`) pada workflow CI.

### Diubah
- Istilah seragam: Master Item → **Stok Item**, Min Stock/Batas minimum → **Stok Minimum**, Refresh → **Muat Ulang**, Sort → **Urutkan**, History → **Riwayat**, Lokasi RAK → **Lokasi Rak**. Nama kolom ekspor CSV `Min Stock` sengaja tidak diubah (format data).
- Layar hasil transaksi direset menjadi form baru bila tab Transaksi dibuka lagi setelah > 60 detik.
- `package.json` `version` disinkronkan ke 15.42.0 dan `license: UNLICENSED`.
- README: struktur proyek diperbarui, ditambah checklist rilis dan pemecahan masalah.

### Tes
- 10 suite L1 baru: `qty_stock_guard_exec`, `anomaly_stats_exec`, `number_format_exec`, `koreksi_flow_exec`, `back_navigation_exec`, `format_contract_exec`, `ui_pindah_scan_slot_exec`, `ui_uhide_inline_display_exec`, `sheet_drag_exec`, `repo_layout` (+ pembaruan `alert_lowstock` dan `perf_pass_v1534` untuk redaksi/label baru).
- **Verifikasi:** L1 PASS; sapuan E2E headless dengan backend GAS di-mock (HP 390/360px, tablet 768px, desktop 1280px). **L3 (GAS asli) dan L4 (HP fisik): NOT TESTED.**

### Belum dikerjakan (menunggu keputusan)
- Identitas operator per orang (daftar/PIN), kode `field` dari server untuk penyorotan error, dialog `confirm()` kustom untuk aksi berbahaya.
