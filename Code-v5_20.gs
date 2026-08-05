// ============================================================
//  KARTU STOK v5.0 – Google Apps Script Backend
//  PT Rayard Deli Indonesia
//  PWA Edition: support doGet + doPost + CORS
//
//  CHANGELOG v5.14 (Fix CRITICAL — Audit Final G-01: ID collision):
//   - Ditambah adminTool 'findIdCollisions': deteksi ID_Item yang dipakai >1 baris
//     Master_Item berbeda (2 barang beda ditempel 1 ID yang sama). Untuk tiap ID
//     yang collide, dihitung juga breakdown Nama_Item di Transaksi_Log + flag
//     `splitSafe` (true kalau semua transaksi historisnya bisa dibedakan otomatis
//     berdasarkan Nama_Item persis, false kalau ada yang ambigu/tidak cocok siapa
//     pun -- wajib direview manual dulu).
//   - Ditambah adminTool 'resolveIdCollision' (param: oldId, namaToMove, newId
//     opsional, dryRun opsional): memindahkan SATU barang (dikenali dari Nama
//     Material persis) dari ID lama yang collide ke ID baru -- baris Master_Item
//     + semua baris Transaksi_Log dgn ID+Nama yang cocok ikut dipindah, lalu
//     Stok_Saldo/Stok_Per_Rak di-recalculate PENUH (bukan incremental) supaya
//     kedua ID dijamin sinkron. Fail-safe: ditolak kalau bukan persis 1 baris
//     Master_Item yang cocok (0 = salah nama, >1 = ambigu). Dukung dryRun:true
//     utk preview sebelum eksekusi sungguhan.
//   - runAdminToolAPI() sekarang menerima `body` penuh (bukan cuma `fn`), karena
//     resolveIdCollision butuh parameter tambahan; adminTool lain tidak terpengaruh.
//   - Ini TIDAK mengotomasi keputusan pemisahan itu sendiri -- admin tetap yang
//     menentukan barang mana dapat ID baru, tool ini cuma mengeksekusi perpindahan
//     data dengan aman (fail-safe kalau ambigu) begitu keputusan itu dibuat.
//
//  CHANGELOG v5.17 (Fix LOW — Audit Final F-07: full-scan per item):
//   - getHistory()/getStockLedger() dulu baca getRange(2,1,lastRow-1,13).getValues()
//     -- SELURUH Transaksi_Log, semua 13 kolom, semua baris -- lalu filter per itemId
//     di JS loop. Padahal biasanya cuma sebagian kecil baris yang cocok utk 1 item.
//   - Ditambah helper findMatchingRowNumbers_() (scan HANYA kolom ID_Item, 1 kolom)
//     dan getRowsByNumbers_() (ambil data 13-kolom lengkap CUMA utk baris yang match,
//     lewat getRangeList -- satu panggilan API, bukan N round-trip per baris).
//   - getHistory/getStockLedger sekarang pakai pola ini -- urutan/isi hasil TIDAK
//     berubah (tetap kronologis dari sheet, getHistory tetap reverse ke newest-first
//     di akhir seperti sebelumnya), murni mengurangi volume data yang ditransfer dari
//     Sheets API. Kolom ID tetap harus di-scan penuh sekali (Sheets tidak punya
//     indeks bawaan) -- ini bukan O(1) lookup, tapi tetap perbaikan nyata dibanding
//     baca 13 kolom penuh utk tiap baris yang ternyata tidak cocok.
//
//  CHANGELOG v5.16 (Fix MEDIUM — Audit Final F-04: LockService global):
//   - postTransaksi() dulu memegang LockService.getScriptLock() SELAMA SELURUH
//     proses (append Transaksi_Log + update 2 sheet saldo) -- artinya transaksi
//     ITEM A ikut menunggu transaksi ITEM B selesai walau dua-duanya tidak
//     berkaitan sama sekali. Di volume transaksi tinggi ini jadi bottleneck.
//   - Ditambah acquirePerItemLock_(itemId, timeoutMs): script lock sekarang cuma
//     dipegang SANGAT SINGKAT untuk uji-dan-set flag mutex per itemId di
//     CacheService (TTL 20dtk, self-healing kalau proses macet). Transaksi item
//     BERBEDA sekarang jalan paralel; transaksi item YANG SAMA tetap antre
//     berurutan (tetap wajib, supaya saldo item yang sama tidak race).
//   - Fail-safe dipertahankan: gagal dapat lock dalam 15dtk -> balikin pesan
//     "server sibuk" (sama seperti perilaku lama), bukan diam-diam lanjut tanpa
//     proteksi. Tidak ada perubahan pada urutan validasi/appendRow/update saldo.
//
//  CHANGELOG v5.15 (Fix MEDIUM — Audit Final F-06: magic number kolom):
//   - Ditambah konstanta COL_MASTER/COL_TRX/COL_SALDO/COL_RAK_SALDO/COL_EDITOR_ACC/
//     COL_VIEWER_ACC (0-based, lihat definisi di atas SHEET_*) -- menggantikan
//     ~114 titik akses r[7], row[9], dst yang sebelumnya hardcoded tanpa nama.
//   - SEMUA fungsi yang baca/tulis Master_Item, Transaksi_Log, Stok_Saldo,
//     Stok_Per_Rak, Editor_Accounts, Viewer_Accounts sudah dipetakan ulang ke
//     konstanta ini (getSheetData, getItemById, getDashboard, updateItem,
//     archiveItem, getSaldoFullMap, getRakBreakdown/SummaryMap, getAllHistory,
//     getHistory, getStockLedger, recalculateAllSaldoCore, updateSaldo,
//     updateRakSaldo, findOrphanItemsCore, findDuplicateItemsCore,
//     findIdCollisionsCore, resolveIdCollisionCore, setupMasterListSheetsCore,
//     checkEditorAccountKey_, checkViewerCredentials, migrateAddIDCore,
//     generateID, getAllRakBreakdown, getLastVendorRefMap, getItemUnitMap).
//   - Beberapa getRange() yang dulu baca kolom sempit tidak dari kolom 1 (mis.
//     trx.getRange(2,2,...,2) di findOrphanItemsCore/findIdCollisionsCore)
//     dilebarkan mulai kolom 1 supaya index array-nya konsisten 1:1 dgn
//     COL_TRX -- baca sedikit kolom ekstra yang tidak dipakai, TIDAK mengubah
//     hasil, cuma menghilangkan kasus "index relatif vs absolut" yang beda.
//   - SENGAJA TIDAK disentuh: migrateToMultiRakSchema()/oldData (skema lama 14
//     kolom pra-v5.0), karena ini fungsi migrasi 1x yang sudah dijadwalkan utk
//     dipisah/dihapus terpisah (F-08), bukan bagian dari skema aktif sekarang --
//     memetakannya ke COL_MASTER/COL_TRX yang skema BARU justru akan salah/menyesatkan.
//   - Verifikasi: node --check lolos, jumlah fungsi & keseimbangan kurung kurawal
//     identik sebelum/sesudah (70 fungsi, 500/500 { }). Ini refactor MURNI
//     penamaan -- tidak ada perubahan logika, urutan baca, atau nilai literal.
//
//  CHANGELOG v5.13 (Fix HIGH — Audit Final F-02, F-03, G-02, G-03):
//   - F-02 (password Viewer_Accounts plaintext): sekarang disimpan "salt$hashSHA256".
//     Akun lama otomatis dimigrasi ke hash begitu login sukses sekali (tidak perlu
//     migrasi manual). setupViewerAccountsSheet() bikin akun contoh dengan hash.
//   - F-03 (identitas admin transaksi tidak diverifikasi): sheet baru opsional
//     Editor_Accounts (Nama | EditorKey | Aktif, lihat setupEditorAccountsSheet()).
//     checkEditorKey() sekarang balikin `nama` terverifikasi kalau editorKey cocok
//     salah satu akun di sana; doPost meneruskannya sbg verifiedAdmin, dipakai
//     postTransaksi/addItem menggantikan field admin bebas dari client. Fallback
//     non-breaking: kalau sheet belum disetup, tetap pakai EDITOR_KEY tunggal lama
//     seperti sebelumnya (identitas admin belum terverifikasi di mode ini).
//   - G-02 (item yatim — punya transaksi/saldo tapi tidak ada di Master_Item):
//     postTransaksi() SUDAH lama mewajibkan getItemById() sukses dulu (jalur normal
//     app tidak bisa bikin item yatim baru). Ditambah adminTool baru findOrphanItems
//     utk DETEKSI item yatim dari data lama/migrasi (perbaikannya tetap manual --
//     perlu keputusan nama/spek/kategori barangnya).
//   - G-03 (baris Master_Item kembar): adminTool baru findDuplicateItems, deteksi
//     baris dgn Nama Material+Spesifikasi identik. Deteksi saja, bukan auto-merge --
//     menggabungkan riwayat transaksi 2 ID perlu direview manusia dulu.
//   - F-05 (doGet tanpa try/catch): sekarang dibungkus, balikin JSON error alih-alih
//     halaman HTML error bawaan Apps Script kalau ada exception tak terduga.
//   - G-04/G-05/G-06 (Master_Kategori/Rak/Vendor/UOM basi & penuh duplikat casing):
//     setupMasterListSheets() (dulu HANYA manual dari editor Apps Script) sekarang
//     ada versi API-nya (apiResyncMasterLists, adminTool 'resyncMasterLists') --
//     bisa diklik dari tombol Admin Database di aplikasi. Sekalian nambah dedup
//     case-insensitive ("Acme" & "ACME" jadi 1 entri) yang dulu tidak ada.
//
//  CHANGELOG v5.12 (Fix CRITICAL — Audit Phase 1 finding F-01: silent saldo
//  update failure): updateSaldo()/updateRakSaldo() DULU membungkus isinya
//  dengan try/catch yang HANYA console.log() kalau gagal (tidak throw, tidak
//  lapor balik) -- postTransaksi() tetap appendRow ke Transaksi_Log lalu
//  SELALU balikin status:'ok', walau update Stok_Saldo/Stok_Per_Rak diam-diam
//  gagal. Akibatnya Transaksi_Log & Stok_Saldo bisa divergen tanpa ada yang
//  tahu, sampai seseorang manual jalankan recalculateAllSaldo(). Sekarang:
//   - updateSaldo()/updateRakSaldo() melempar Error kalau gagal (bukan cuma log).
//   - postTransaksi() menangkap kegagalan itu SETELAH appendRow (log transaksi
//     tetap sumber kebenaran, TIDAK di-rollback -- appendRow sudah commit &
//     rollback manual berisiko lebih merusak daripada membiarkan). Kegagalan
//     dicatat ke sheet baru Sync_Errors (bukan cuma console.log yang tak
//     terlihat siapa pun di production) DAN dikirim balik ke frontend lewat
//     field baru saldoSyncOk:false + saldoSyncWarning, dengan message yang
//     eksplisit bilang saldo belum sinkron -- bukan lagi status:'ok' polos.
//   - Non-breaking: field lama (status, saldoSebelum, saldoSesudah, dst) TIDAK
//     berubah; klien lama yang cuma cek status==='ok' berperilaku sama seperti
//     sebelumnya, klien baru bisa opsional cek saldoSyncOk untuk tampilkan
//     warning ke user.
//
//  CHANGELOG v5.0 (Restrukturisasi skema data - standar inventory):
//   - Master_Item DIRAMPINGKAN jadi identitas barang saja:
//     No, ID_Item, Nama Material, Spesifikasi, User/Dept,
//     BC/Non BC, Unit, Kategori, Min_Stock  (9 kolom)
//     -> Vendor, No PO, Tanggal Kedatangan, RAK, Qty DIHAPUS dari sini,
//        karena itu semua data PER KEDATANGAN, bukan identitas permanen barang.
//   - Transaksi_Log DIPERLUAS jadi 13 kolom:
//     Timestamp, ID_Item, Nama_Item, Spesifikasi, Jenis, Qty,
//     RAK, Vendor, No_Referensi, Saldo_Sebelum, Saldo_Sesudah,
//     Keterangan, Admin
//     -> Vendor & No_Referensi (No SJ/PO) kini dicatat PER TRANSAKSI,
//        bukan cuma sekali nempel di item. RAK juga per transaksi,
//        karena 1 barang boleh ada di banyak rak sekaligus.
//   - Sheet BARU: Stok_Per_Rak (ID_Item, RAK, Qty)
//     -> breakdown saldo per lokasi rak, dihitung ulang dari Transaksi_Log
//        sama seperti Stok_Saldo (total), tapi di-filter per rak juga.
//   - Stok_Saldo dirampingkan (RAK & Qty_Awal dihapus, karena RAK kini
//     multi-lokasi dan Qty_Awal sudah tidak relevan -- semua stok,
//     termasuk stok pertama kali, sekarang tercatat sebagai transaksi
//     MASUK di Transaksi_Log, bukan angka statis di Master_Item).
//   - Fungsi migrasi 1x: migrateToMultiRakSchema() -- pindahkan data lama
//     (Vendor/PO/Tanggal/RAK/Qty yang nempel di Master_Item) jadi transaksi
//     MASUK awal per item, baru rampingkan Master_Item ke skema baru.
//
//  CHANGELOG v5.1 (Perbaikan konsistensi backend <-> frontend):
//   - getSheetData() & getItemById() kini juga mengirim: tglMasukTerakhir
//     (tanggal transaksi MASUK paling baru), totalMasuk & totalKeluar
//     (kumulatif riil dari Stok_Saldo). Sebelumnya frontend mencoba
//     membaca field tanggal per-item ("r.date") yang SUDAH TIDAK ADA
//     sejak Master_Item dirampingkan di v5.0 -- akibatnya fitur filter
//     tanggal & kartu cetak di aplikasi menampilkan data kosong/salah.
//
//  CHANGELOG v5.2 (Satukan setup sheet):
//   - setupSheets() dulu HANYA membuat 4 dari 8 sheet yang dipakai
//     aplikasi (Master_Item, Transaksi_Log, Stok_Saldo, Stok_Per_Rak).
//     4 sheet master-list (Master_Kategori, Master_UOM, Master_Vendor,
//     Master_Rak) tidak dibuat di sini -- baru muncul lewat fungsi
//     terpisah (setupMasterListSheets, manual) atau lazy-create dari
//     addMasterValue() (header tanpa styling). Instalasi baru yang
//     cuma jalankan setupSheets() akan dapat dropdown kosong.
//   - Sekarang setupSheets() SATU-SATUNYA fungsi yang perlu dijalankan
//     untuk instalasi baru: membuat semua 8 sheet, termasuk 4 sheet
//     master-list dengan header rapi + default value awal (Kategori,
//     UOM). setupMasterListSheets() tetap ada tapi sekarang jadi tool
//     RESYNC opsional (menyisir ulang vendor/rak dari data transaksi).
//  CHANGELOG v5.3 (Verifikasi kompatibilitas dgn redesain Input Transaksi
//  frontend v13.0–v13.3 — TIDAK ADA perubahan logic backend):
//   - getItemById() sudah mengirim item.saldo & item.rakBreakdown ([{rak,qty}])
//     -> dipakai langsung oleh preview saldo real-time & chip lokasi rak cepat
//        di frontend, tanpa perlu endpoint/kolom baru.
//   - postTransaksi() sudah menerima jenis MASUK/KELUAR apa adanya dari body
//     -> default jenis KELUAR di frontend murni state UI awal, tidak
//        berpengaruh ke validasi/skema backend.
//   - Dicek: tidak ada field baru yang dibutuhkan frontend yang belum
//     tersedia di response manapun. File ini aman dipakai apa adanya
//     sebagai backend utk kartu-stok-pro-x v13.3.
//  CHANGELOG v5.4 (Perbaikan performa — laporan "aplikasi lambat"):
//   - updateSaldo() & updateRakSaldo() DULU scan ULANG SELURUH Transaksi_Log
//     setiap kali ada 1 transaksi baru (postTransaksi) -- artinya makin banyak
//     transaksi menumpuk dari waktu ke waktu, makin lambat SETIAP transaksi
//     berikutnya (O(total transaksi sepanjang masa) per simpan transaksi).
//     Sekarang keduanya update INCREMENTAL (ambil saldo lama + tambah/kurang
//     delta transaksi ini saja) -- O(jumlah item), tidak tumbuh seiring waktu.
//     Ini kemungkinan besar penyebab utama app terasa makin lambat.
//   - getSaldoMap() & getTotalMasukKeluarMap() dulu baca sheet Stok_Saldo
//     SECARA TERPISAH utk data yang sama persis (2x getRange/getValues per
//     getSheetData & getItemById). Digabung jadi getSaldoFullMap(), 1x baca.
//   - getMasterLists() (dipanggil tiap kali app dibuka, isinya jarang berubah)
//     sekarang di-cache 5 menit via CacheService, di-invalidate otomatis
//     tiap kali ada nilai master baru ditambahkan (addMasterValue/resync).
//   - TIDAK ADA perubahan skema sheet. Setelah deploy versi ini, jalankan
//     recalculateAllSaldo() 1x sbg jaga-jaga supaya Stok_Saldo & Stok_Per_Rak
//     pasti sinkron sebelum incremental update mulai jalan dari titik itu.
//  CHANGELOG v5.5 (Mode Viewer -- share ke banyak orang, lihat/filter/cari saja):
//   - Backend TIDAK PERNAH punya proteksi apapun sebelumnya -- siapa saja yang
//     tahu Web App URL bisa POST postTransaksi/addItem/adminTool dll. Sekarang
//     SEMUA aksi di doPost wajib kirim editorKey yang cocok dengan Script
//     Property EDITOR_KEY (lihat checkEditorKey() di bawah utk cara setup).
//   - doGet (getData, getItem, getDashboard, dst) TETAP terbuka tanpa key --
//     itu memang bagian yang dibagikan ke viewer utk lihat/filter/cari stok.
//   - Ditambah route generic 'adminTool' (dipanggil frontend lewat tombol Admin
//     Database) -- SEBELUMNYA TIDAK ADA route ini sama sekali, jadi tombol
//     "Kalkulasi Ulang Stok"/"Isi ID Kosong" di app selalu gagal walau sudah
//     ada UI-nya. migrateAddID() & recalculateAllSaldo() dipisah jadi versi
//     "Core" (tanpa getUi(), dipakai API) + versi asli (pakai getUi(), tetap
//     bisa dijalankan manual dari editor Apps Script seperti biasa).
//  CHANGELOG v5.11 (PP-02, Audit UX v14.70): item Master_Item sebelumnya tidak
//  bisa dihapus/dinonaktifkan sama sekali dari aplikasi -- harus diedit manual
//  di Google Sheets, di luar alur yang diaudit. Ditambah action baru
//  'archiveItem' (arsipkan/aktifkan kembali item, editorKey wajib -- setara
//  "role Editor" karena app cuma kenal Editor vs Viewer). Kolom Status (kolom
//  10) dibuat otomatis di Master_Item saat pertama kali dipakai, tidak perlu
//  migrasi manual. getSheetData()/getItemById() sekarang menyertakan field
//  status ('Aktif'/'Arsip'); postTransaksi() menolak transaksi baru utk item
//  berstatus 'Arsip' (defense-in-depth -- frontend juga sudah menyaring).
//  CHANGELOG v5.10 (Fix P3 dari PHASE 0 Architecture Audit -- duplicate row-lookup
//  logic): updateSaldo, updateRakSaldo, dan getStockLedger masing-masing punya loop
//  "getValues() lalu for cari row yg cocok" yang ditulis ulang terpisah, identik
//  kecuali kolom/jumlah kriteria yang dibandingkan. Diekstrak jadi 1 helper
//  findRowIndex(data, matchers). TIDAK mengubah data apa yang dibaca dari sheet
//  atau kapan (setiap fungsi tetap getRange/getValues persis seperti sebelumnya,
//  jadi karakteristik performa v5.4/v5.9 di atas TIDAK berubah) -- murni
//  menghilangkan duplikasi logic pencariannya. Perilaku & hasil identik.
//  CHANGELOG v5.9 (Fix P1 dari PHASE 0 Architecture Audit -- getAllHistory scan
//  seluruh Transaksi_Log): getAllHistory(limit) dulu SELALU baca seluruh sheet lalu
//  potong ke `limit` di akhir -- cost baca tumbuh terus (O(total transaksi
//  sepanjang masa)) walau yang diminta cuma N transaksi terbaru. Sekarang baca
//  langsung `limit` baris terakhir saja (Transaksi_Log selalu ditulis kronologis
//  via appendRow, jadi N terbaru selalu di N baris paling bawah) -- O(limit)
//  konstan. Hasil (isi/urutan/pembatasan) IDENTIK, tidak ada perubahan API/kontrak.
//  getHistory(itemId) & getStockLedger(itemId) BELUM disentuh di versi ini --
//  keduanya butuh SEMUA transaksi milik 1 item yang posisinya tersebar di seluruh
//  log, jadi tidak bisa dioptimasi dgn trik "baca dari bawah" seperti di atas;
//  solusi sebenarnya (index per-item) berarti menambah struktur data baru, di luar
//  batasan "non-breaking, tidak ubah struktur database" utk revisi PHASE 0 ini.
//  CHANGELOG v5.8 (Fix P0/P1 audit finding F2: postTransaksi sekarang benar-benar
//  dedup berbasis requestId via CacheService -- LockService v5.7 cuma cegah race
//  ANTAR request paralel, tidak cegah retry SEKUENSIAL dgn body identik jadi
//  transaksi dobel. Frontend index.html sudah kirim requestId & mengasumsikan
//  dedup ini ada sejak sebelum v5.7 -- sekarang diimplementasikan. Non-breaking:
//  requestId kosong (klien lama) = perilaku persis sama seperti sebelumnya.)
//  CHANGELOG v5.7 (Fix CRITICAL: LockService di postTransaksi -- cegah race
//  condition saldo saat 2+ transaksi item sama diproses nyaris bersamaan.
//  Sebelumnya updateSaldo/updateRakSaldo pola read-modify-write TANPA lock.)
//  CHANGELOG v5.6 (Login viewer dgn username/password -- TAMPILAN mirip Google
//  Sign-In, TAPI BUKAN OAuth Google asli. Ini shared-secret biasa, cuma dibungkus
//  halaman login supaya viewer harus login dulu, bukan sekadar buka link):
//   - doGet SEKARANG WAJIB otentikasi juga (editorKey ATAU viewerToken valid) --
//     v5.5 sengaja membiarkan doGet terbuka utk siapa saja yg tahu URL; sekarang
//     ditutup total, harus login dulu (baik sbg editor maupun viewer).
//   - Sheet baru "Viewer_Accounts" (Username | Password | Nama | Aktif) --
//     admin (Hendra) kelola akun viewer langsung di situ, tanpa perlu redeploy.
//     Jalankan setupViewerAccountsSheet() sekali dari editor Apps Script utk bikin
//     sheet-nya otomatis + 1 baris contoh.
//   - Action baru 'viewerLogin' (doPost, TIDAK butuh editorKey -- ini justru
//     endpoint utk MENDAPATKAN akses) -- cek Username+Password ke Viewer_Accounts,
//     kalau cocok & Aktif=TRUE, balikin token bertanda-tangan (HMAC) yg berlaku
//     30 hari. Token ini yang dipakai viewer di semua request berikutnya
//     (viewerToken), TANPA perlu kirim ulang password.
// ============================================================

var SHEET_MASTER    = 'Master_Item';
var SHEET_TRANSAKSI = 'Transaksi_Log';
var SHEET_SALDO     = 'Stok_Saldo';
var SHEET_RAK_SALDO = 'Stok_Per_Rak';
var SHEET_KATEGORI  = 'Master_Kategori';
var SHEET_UOM       = 'Master_UOM';
var SHEET_VENDOR    = 'Master_Vendor';
var SHEET_RAK       = 'Master_Rak';
var SHEET_SYNC_ERRORS = 'Sync_Errors'; // v5.12 (fix F-01) — log kegagalan updateSaldo/updateRakSaldo yg dulu hilang di console.log
var SHEET_VIEWER_ACCOUNTS = 'Viewer_Accounts'; // Username | Password | Nama | Aktif

// v5.20 — Modul Aset Sirkulasi (alat yg keluar-pakai-kembali-diasah-pakai lagi,
// bukan barang habis pakai). Lihat desain: "Desain Modul Aset Sirkulasi".
var SHEET_ASET_ITEM = 'Aset_Item'; // jenis alat (mirip Master_Item, tapi utk barang sirkulasi)
var SHEET_ASET_UNIT = 'Aset_Unit'; // satu baris = satu unit fisik alat
var SHEET_ASET_LOG  = 'Aset_Movement_Log'; // satu baris = satu event pergerakan unit (append-only)
// Catatan: "Aset_Kontrol_Asah" (lead time asah per siklus) sengaja TIDAK jadi sheet
// fisik dulu -- akan jadi view terhitung dari Aset_Movement_Log (lihat tahap 5 desain),
// supaya tidak ada data yg bisa desync dari log.

// ============================================================
//  FIX v5.14 (Audit F-06): konstanta indeks kolom, 0-based -- SELALU sesuai
//  urutan array yg dibalikin getValues() ketika range dibaca MULAI DARI KOLOM
//  PALING KIRI sheet ybs (kolom 1). Dipakai menggantikan r[7], row[9], dst yg
//  sebelumnya tersebar ~114 titik tanpa nama, rawan salah baca kalau kolom
//  sheet berubah urutan. Untuk argumen getRange(row, kolom) yg 1-based,
//  pakai COL_X.FIELD + 1.
//  PENTING: kalau suatu getRange() baca range TIDAK mulai dari kolom 1 (mis.
//  cuma 1-2 kolom di tengah sheet), konstanta ini TIDAK langsung berlaku utk
//  index array hasil baca itu -- lihat catatan per fungsi (migrateAddIDCore,
//  generateID, updateItem, archiveItem, findOrphanItemsCore) yg sengaja
//  dibiarkan baca kolom sempit apa adanya, HANYA kolom argumen getRange-nya
//  yg dipetakan ke COL_X.FIELD+1 supaya jelas kolom sheet mana yg dimaksud.
//  TIDAK MENCAKUP migrateToMultiRakSchema()/oldData (skema lama 14 kolom
//  pra-v5.0, fungsi migrasi 1x -- lihat F-08, sengaja dibiarkan apa adanya).
// ============================================================
var COL_MASTER = { NO:0, ID:1, NAMA:2, SPEC:3, USER:4, BC:5, UNIT:6, KATEGORI:7, MIN_STOCK:8, STATUS:9 }; // Master_Item (9 kolom + Status opsional kolom ke-10, PP-02)
var COL_TRX    = { TIMESTAMP:0, ID:1, NAMA:2, SPEC:3, JENIS:4, QTY:5, RAK:6, VENDOR:7, NO_REF:8, SALDO_SEBELUM:9, SALDO_SESUDAH:10, KETERANGAN:11, ADMIN:12 }; // Transaksi_Log (13 kolom)
var COL_SALDO  = { ID:0, NAMA:1, UNIT:2, TOTAL_MASUK:3, TOTAL_KELUAR:4, SALDO_AKHIR:5 }; // Stok_Saldo (6 kolom)
var COL_RAK_SALDO   = { ID:0, RAK:1, QTY:2 }; // Stok_Per_Rak (3 kolom)
var COL_EDITOR_ACC  = { NAMA:0, KEY:1, AKTIF:2 }; // Editor_Accounts (3 kolom)
var COL_VIEWER_ACC  = { USERNAME:0, PASSWORD:1, NAMA:2, AKTIF:3 }; // Viewer_Accounts (4 kolom)

// v5.20 — kolom modul Aset Sirkulasi
var COL_ASET_ITEM = { NO:0, KODE_ALAT:1, NAMA_ALAT:2, BRAND:3, CUTTING_TOOL:4, MATERIAL:5,
  SPESIFIKASI:6, MESIN_DEFAULT:7, KODE_MESIN_DEFAULT:8, BERAT_KG:9, UOM:10, RAK_PENYIMPANAN:11,
  VENDOR_ASAH_DEFAULT:12, RATA2_PEMAKAIAN_30HARI:13, LEAD_TIME_ASAH_RATARATA:14,
  SAFETY_STOCK:15, REORDER_POINT:16, MIN_STOCK:17 }; // Aset_Item (18 kolom)
var COL_ASET_UNIT = { UNIT_ID:0, KODE_ALAT:1, TANGGAL_MASUK:2, REGRIND_COUNT:3, STATUS_UNIT:4,
  LOKASI_SAAT_INI:5, KODE_MESIN_SAAT_INI:6, LAST_EVENT:7, LAST_CYCLE_ID:8, LAST_UPDATE:9 }; // Aset_Unit (10 kolom)
var COL_ASET_LOG = { TIMESTAMP:0, KODE_ALAT:1, UNIT_ID:2, ID_TRANSAKSI:3, ACTIVITY:4, QTY:5,
  CYCLE_ID:6, COUNTER:7, KODE_MESIN:8, VENDOR:9, PIC:10, KETERANGAN:11 }; // Aset_Movement_Log (12 kolom)

// Status_Unit yang sah (state machine, lihat desain §2)
var ASET_STATUS = { GUDANG:'GUDANG', DIPAKAI:'DIPAKAI', TUMPUL:'TUMPUL', DIASAH:'DIASAH', SCRAP:'SCRAP' };

// Activity yang sah utk recordAsetMovement (state machine, lihat desain §2)
var ASET_ACTIVITY = {
  DIPASANG_KE_MESIN:        'DIPASANG_KE_MESIN',
  KEMBALI_KE_GUDANG_SIAP:   'KEMBALI_KE_GUDANG_SIAP',   // balik dari mesin, MASIH TAJAM
  KEMBALI_KE_GUDANG_TUMPUL: 'KEMBALI_KE_GUDANG_TUMPUL', // balik dari mesin, TUMPUL -> mulai siklus asah baru
  KIRIM_KE_VENDOR_ASAH:     'KIRIM_KE_VENDOR_ASAH',
  SELESAI_DIASAH:           'SELESAI_DIASAH',
  SCRAP_RUSAK:              'SCRAP_RUSAK',              // keluar permanen dari siklus
  KARAT:                    'KARAT'                     // flag saja, tidak ubah status/lokasi
};

// Aturan transisi: validFrom=null berarti "cek khusus" (lihat recordAsetMovement),
// toStatus/toLokasi=null berarti "tidak berubah, biarkan nilai lama".
var ASET_TRANSITION_RULES = {
  DIPASANG_KE_MESIN:        { validFrom:[ASET_STATUS.GUDANG], toStatus:ASET_STATUS.DIPAKAI, toLokasi:'MESIN'  },
  KEMBALI_KE_GUDANG_SIAP:   { validFrom:[ASET_STATUS.DIPAKAI], toStatus:ASET_STATUS.GUDANG,  toLokasi:'GUDANG' },
  KEMBALI_KE_GUDANG_TUMPUL: { validFrom:[ASET_STATUS.DIPAKAI], toStatus:ASET_STATUS.TUMPUL,  toLokasi:'GUDANG' },
  KIRIM_KE_VENDOR_ASAH:     { validFrom:[ASET_STATUS.TUMPUL],  toStatus:ASET_STATUS.DIASAH,  toLokasi:'VENDOR' },
  SELESAI_DIASAH:           { validFrom:[ASET_STATUS.DIASAH],  toStatus:ASET_STATUS.GUDANG,  toLokasi:'GUDANG' },
  SCRAP_RUSAK:              { validFrom:null, toStatus:ASET_STATUS.SCRAP, toLokasi:null }, // null lokasi = biarkan lokasi terakhir
  KARAT:                    { validFrom:null, toStatus:null, toLokasi:null } // flag murni, tidak ubah apa pun selain dicatat di log
};

// ── CORS Helper ──────────────────────────────────────────────
function corsOutput(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
//  EDITOR KEY — proteksi utk aksi TULIS (v5.5, diperluas v5.6)
//  Semua aksi di doPost (postTransaksi, addItem, updateItem, addMasterValue,
//  adminTool) WAJIB kirim editorKey yang cocok dgn Script Property EDITOR_KEY.
//  Sejak v5.6, doGet JUGA wajib login (editorKey ATAU viewerToken) -- lihat
//  checkAnyAccess() & viewerLogin di bawah.
//
//  CARA SETUP EDITOR (sekali saja, buat kamu sendiri):
//   1. Apps Script editor -> ikon ⚙ Project Settings (kiri) -> Script Properties
//   2. Add script property: key = EDITOR_KEY, value = kata sandi bebas (acak, panjang)
//   3. Di aplikasi (HTML), buka menu Lainnya -> Pengaturan -> isi "Editor Key"
//      dengan value yang sama persis, di PERANGKAT KAMU SENDIRI saja.
//
//  CARA SETUP AKUN VIEWER (buat orang yg cuma boleh lihat):
//   1. Jalankan setupViewerAccountsSheet() sekali dari editor Apps Script.
//   2. Isi username/password per orang di sheet "Viewer_Accounts" yang terbuat.
//   3. Kasih mereka link app biasa (tanpa parameter apapun) -- mereka akan
//      lihat halaman login, masukkan username/password itu, langsung masuk
//      ke mode lihat-saja. TIDAK bisa edit/simpan data.
//
//  Kalau EDITOR_KEY belum diset di Script Properties sama sekali, semua aksi
//  tulis DITOLAK (fail-closed) -- supaya tidak keliru mengira sudah aman
//  padahal belum sempat disetup.
// ============================================================
function getEditorKey() {
  return PropertiesService.getScriptProperties().getProperty('EDITOR_KEY') || '';
}

// FIX v5.13 (Audit F-03): dulu SATU-SATUNYA cara membuktikan diri sbg editor adalah
// EDITOR_KEY yang dibagikan ke semua orang -- artinya field "admin" di setiap transaksi
// (params.admin / body.admin) HANYA string bebas yang dikirim client apa adanya, TIDAK
// pernah diverifikasi server. Siapa saja yang tahu EDITOR_KEY bisa mengaku jadi siapa saja.
// Sekarang ditambah sheet opsional "Editor_Accounts" (Nama | EditorKey | Aktif) -- kalau
// sheet ini ada & editorKey yang dikirim cocok salah satu barisnya, checkEditorKey()
// balikin `nama` yang SUDAH TERVERIFIKASI dari lookup server, tidak bisa dipalsukan client.
// Kalau sheet belum ada / tidak ada yang cocok, fallback ke EDITOR_KEY tunggal lama
// (non-breaking) -- tapi tanpa `nama` terverifikasi, jadi identitas transaksi masih
// mengandalkan string client seperti sebelumnya sampai akun per-orang disetup.
var SHEET_EDITOR_ACCOUNTS = 'Editor_Accounts'; // Nama | EditorKey | Aktif

function checkEditorAccountKey_(editorKey) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SHEET_EDITOR_ACCOUNTS);
    if (!sh || sh.getLastRow() < 2) return null; // sheet belum disetup -> caller fallback ke EDITOR_KEY lama
    var rows = sh.getRange(2,1,sh.getLastRow()-1,3).getValues(); // Nama, EditorKey, Aktif
    for (var i=0; i<rows.length; i++) {
      if (String(rows[i][COL_EDITOR_ACC.KEY]||'') !== editorKey) continue;
      var aktifRaw = String(rows[i][COL_EDITOR_ACC.AKTIF]).toUpperCase();
      var aktif = rows[i][COL_EDITOR_ACC.AKTIF]===true || aktifRaw==='TRUE' || aktifRaw==='YA' || aktifRaw==='1';
      if (!aktif) return { blocked:true };
      return { nama: String(rows[i][COL_EDITOR_ACC.NAMA]||'').trim() || 'Editor' };
    }
    return null; // tidak cocok baris manapun -> caller fallback ke EDITOR_KEY lama
  } catch(e) { return null; }
}

function checkEditorKey(body) {
  var editorKey = String(body.editorKey||'');

  // 1) Coba cocokkan ke akun editor per-orang dulu (kalau sheet-nya disetup).
  var acc = checkEditorAccountKey_(editorKey);
  if (acc && acc.blocked) {
    return { ok:false, message:'Akun editor ini sudah dinonaktifkan. Hubungi admin.' };
  }
  if (acc) {
    return { ok:true, nama: acc.nama }; // nama TERVERIFIKASI, dipakai override field admin di transaksi
  }

  // 2) Fallback: EDITOR_KEY tunggal lama (mode lama, identitas admin TIDAK terverifikasi).
  var required = getEditorKey();
  if (!required) {
    return { ok:false, message:'EDITOR_KEY belum diset di Script Properties. Lihat komentar checkEditorKey() di Code.gs utk cara setup.' };
  }
  if (editorKey !== required) {
    return { ok:false, message:'Akses ditolak: perangkat ini dalam mode lihat-saja, tidak bisa menyimpan perubahan.' };
  }
  return { ok:true }; // tanpa `nama` -- lihat catatan di doPost/postTransaksi
}

// Jalankan SEKALI dari editor Apps Script (dropdown fungsi -> Run) utk bikin sheet akun editor per-orang.
// Opsional -- kalau tidak dijalankan, app tetap jalan pakai EDITOR_KEY tunggal lama seperti sebelumnya.
function setupEditorAccountsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_EDITOR_ACCOUNTS);
  if (sh) { SpreadsheetApp.getUi().alert('Sheet "'+SHEET_EDITOR_ACCOUNTS+'" sudah ada. Kelola akun langsung di sana (tambah baris = tambah editor, Aktif=FALSE = nonaktifkan tanpa hapus).'); return; }
  sh = ss.insertSheet(SHEET_EDITOR_ACCOUNTS);
  sh.getRange(1,1,1,3).setValues([['Nama','EditorKey','Aktif']])
    .setBackground('#1a3a7a').setFontColor('#ffffff').setFontWeight('bold');
  sh.getRange(2,1,1,3).setValues([['Nama Orangnya', Utilities.getUuid(), true]]);
  sh.setFrozenRows(1);
  sh.setColumnWidths(1,3,180);
  SpreadsheetApp.getUi().alert('✅ Sheet "'+SHEET_EDITOR_ACCOUNTS+'" dibuat.\nGanti Nama di baris 2, generate EditorKey unik per orang (boleh pakai Utilities.getUuid() dari editor ini), lalu isi Editor Key itu di Pengaturan aplikasi masing-masing orang.\nSelama seseorang belum punya baris di sini, dia tetap bisa pakai EDITOR_KEY tunggal lama (Script Properties) -- tapi identitas admin di transaksinya TIDAK terverifikasi.');
}

// ── Token sesi VIEWER (bukan JWT/OAuth Google -- HMAC token buatan sendiri) ──
// Format: base64url(username|nama|expiryMillis) + '.' + base64url(HMAC-SHA256 dari bagian depan)
function getViewerSecret() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('VIEWER_TOKEN_SECRET');
  if (!s) {
    s = Utilities.getUuid() + '-' + Utilities.getUuid(); // auto-generate sekali, simpan permanen
    props.setProperty('VIEWER_TOKEN_SECRET', s);
  }
  return s;
}
function makeViewerToken(username, nama) {
  var expiry = Date.now() + 30*24*60*60*1000; // berlaku 30 hari
  var payloadB64 = Utilities.base64EncodeWebSafe(Utilities.newBlob(username+'|'+nama+'|'+expiry).getBytes());
  var sigB64 = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payloadB64, getViewerSecret()));
  return payloadB64 + '.' + sigB64;
}
function verifyViewerToken(token) {
  try {
    var parts = String(token||'').split('.');
    if (parts.length !== 2) return { ok:false };
    var expectedSig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(parts[0], getViewerSecret()));
    if (parts[1] !== expectedSig) return { ok:false }; // tanda tangan tidak cocok -> dipalsukan/rusak
    var payload = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString();
    var bits = payload.split('|');
    var expiry = parseInt(bits[2], 10);
    if (!expiry || Date.now() > expiry) return { ok:false, expired:true };
    return { ok:true, username:bits[0], nama:bits[1] };
  } catch(e) { return { ok:false }; }
}
// Cek akses utk doGet -- lolos kalau editorKey ATAU viewerToken valid.
function checkAnyAccess(params) {
  var requiredKey = getEditorKey();
  if (requiredKey && String(params.editorKey||'') === requiredKey) return { ok:true, role:'editor' };
  if (params.viewerToken) {
    var v = verifyViewerToken(params.viewerToken);
    if (v.ok) return { ok:true, role:'viewer' };
  }
  return { ok:false, message:'Sesi belum login atau sudah habis. Silakan login ulang.' };
}
// FIX v5.13 (Audit F-02): kolom Password di Viewer_Accounts dulu PLAINTEXT -- siapa saja
// yang buka sheet (atau lihat riwayat versi Sheets) langsung lihat password asli semua
// viewer. Sekarang password disimpan dalam format hash "salt$hashHex" (SHA-256 + salt
// unik per akun via Utilities.computeDigest -- Apps Script tidak punya bcrypt bawaan,
// SHA-256+salt adalah opsi terkuat yang tersedia native di platform ini). MIGRASI
// OTOMATIS & transparan: akun lama yang passwordnya masih plaintext tetap bisa login
// SEKALI TERAKHIR dgn password lama itu, dan begitu cocok langsung ditulis ulang ke
// sheet dalam bentuk hash -- tidak perlu admin migrasi manual satu-satu.
function hashPasswordHex_(password, salt) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + password);
  return bytes.map(function(b){ return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}
function makeSaltedPasswordHash_(password) {
  var salt = Utilities.getUuid();
  return salt + '$' + hashPasswordHex_(password, salt);
}
function isPasswordHashFormat_(stored) {
  var parts = String(stored||'').split('$');
  return parts.length === 2 && parts[1].length === 64; // salt$64-hex-char SHA-256
}
function verifyPasswordHash_(password, stored) {
  var parts = String(stored).split('$');
  return hashPasswordHex_(password, parts[0]) === parts[1];
}

function checkViewerCredentials(username, password) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SHEET_VIEWER_ACCOUNTS);
    if (!sh || sh.getLastRow() < 2) return { ok:false, message:'Belum ada akun viewer terdaftar. Hubungi admin.' };
    var rows = sh.getRange(2,1,sh.getLastRow()-1,4).getValues(); // Username, Password, Nama, Aktif
    var uInput = String(username||'').trim().toLowerCase();
    for (var i=0; i<rows.length; i++) {
      var u = String(rows[i][COL_VIEWER_ACC.USERNAME]||'').trim();
      if (u.toLowerCase() !== uInput) continue;
      var aktifRaw = String(rows[i][COL_VIEWER_ACC.AKTIF]).toUpperCase();
      var aktif = rows[i][COL_VIEWER_ACC.AKTIF]===true || aktifRaw==='TRUE' || aktifRaw==='YA' || aktifRaw==='1';
      if (!aktif) return { ok:false, message:'Akun ini sudah dinonaktifkan. Hubungi admin.' };

      var storedPw = String(rows[i][COL_VIEWER_ACC.PASSWORD]||'');
      if (isPasswordHashFormat_(storedPw)) {
        if (!verifyPasswordHash_(String(password||''), storedPw)) return { ok:false, message:'Password salah.' };
      } else {
        // Akun lama, password masih plaintext -- cek apa adanya, lalu migrasi diam-diam ke hash.
        if (storedPw !== String(password||'')) return { ok:false, message:'Password salah.' };
        try { sh.getRange(i+2, COL_VIEWER_ACC.PASSWORD+1).setValue(makeSaltedPasswordHash_(String(password||''))); } catch(e) { /* login tetap lanjut walau migrasi hash gagal ditulis */ }
      }
      return { ok:true, username:u, nama: String(rows[i][COL_VIEWER_ACC.NAMA]||'') || u };
    }
    return { ok:false, message:'Username tidak ditemukan.' };
  } catch(e) { return { ok:false, message:'checkViewerCredentials: '+e.message }; }
}
function apiViewerLogin(body) {
  var r = checkViewerCredentials(body.username, body.password);
  if (!r.ok) return { status:'error', message: r.message };
  return { status:'ok', token: makeViewerToken(r.username, r.nama), nama: r.nama };
}
// Jalankan SEKALI dari editor Apps Script (dropdown fungsi -> Run) utk bikin sheet akun viewer.
function setupViewerAccountsSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_VIEWER_ACCOUNTS);
  if (sh) { SpreadsheetApp.getUi().alert('Sheet "'+SHEET_VIEWER_ACCOUNTS+'" sudah ada. Kelola akun langsung di sana (tambah baris = tambah akun, Aktif=FALSE = nonaktifkan tanpa hapus).'); return; }
  sh = ss.insertSheet(SHEET_VIEWER_ACCOUNTS);
  sh.getRange(1,1,1,4).setValues([['Username','Password','Nama','Aktif']])
    .setBackground('#1a73e8').setFontColor('#ffffff').setFontWeight('bold');
  sh.getRange(2,1,1,4).setValues([['viewer1', makeSaltedPasswordHash_('GANTI-PASSWORD-INI'), 'Nama Orangnya', true]]);
  sh.setFrozenRows(1);
  sh.setColumnWidths(1,4,150);
  SpreadsheetApp.getUi().alert('✅ Sheet "'+SHEET_VIEWER_ACCOUNTS+'" dibuat.\nGanti username & Nama contoh di baris 2. Kolom Password sekarang berisi HASH (bukan plaintext) dari "GANTI-PASSWORD-INI" -- kasih tahu orangnya password aslinya itu, dia login pakai itu.\nUntuk tambah orang baru: isi Password-nya dgn PLAINTEXT dulu (mis. ketik langsung), sistem akan otomatis ubah jadi hash begitu orang itu login pertama kali.\nAktif=FALSE (tanpa hapus baris) utk cabut akses seseorang kapan saja.');
}

// ============================================================
//  doGet — handle GET requests dari PWA
// ============================================================
function doGet(e) {
  // FIX v5.13 (Audit F-05): dulu tidak ada try/catch di sini -- kalau ada error tak
  // terduga (mis. sheet terhapus, kuota habis), Apps Script balikin halaman HTML error
  // bawaan, bukan JSON -- frontend (yang selalu expect JSON) gagal parse & bingung.
  try {
    var params = (e && e.parameter) ? e.parameter : {};
    var action = params.action || '';
    var id     = params.id || '';

    var auth = checkAnyAccess(params);
    if (!auth.ok) return corsOutput({ status:'error', message: auth.message, needLogin:true });

    if (action === 'getData')     return corsOutput(getSheetData());
    if (action === 'getItem')     return corsOutput(getItemById(id));
    if (action === 'getHistory')  return corsOutput(getHistory(id));
    if (action === 'getAllHistory') return corsOutput(getAllHistory(params.limit));
    if (action === 'generateId')  return corsOutput({ status:'ok', id: generateID() });
    if (action === 'getDashboard') return corsOutput(getDashboard());
    if (action === 'getMasterLists') return corsOutput(getMasterLists());
    if (action === 'getLedger') return corsOutput(getStockLedger(id));
    if (action === 'getRakBreakdownAll') return corsOutput(getAllRakBreakdown());

    // v5.20 — modul Aset Sirkulasi (read-only, tanpa editorKey, konsisten dgn pola di atas)
    if (action === 'getAsetItemList')   return corsOutput(getAsetItemList());
    if (action === 'getAsetUnitList')   return corsOutput(getAsetUnitList(params.kodeAlat));
    if (action === 'getAsetUnitById')   return corsOutput(getAsetUnitById(id));
    if (action === 'getAsetMovementLog') return corsOutput(getAsetMovementLog(id, params.limit));
    if (action === 'getAsetDashboard')  return corsOutput(getAsetDashboard());
    if (action === 'getKontrolAsah')    return corsOutput(getKontrolAsah(params.kodeAlat));
    if (action === 'getAsetPerformaVendor') return corsOutput(getAsetPerformaVendor());
    if (action === 'getAsetEligibleUnits') return corsOutput(getAsetEligibleUnits(params.kodeAlat, params.activity));

    return corsOutput({ status:'ok', message:'RDI Kartu Stok API v5.20' });
  } catch(err) {
    return corsOutput({ status:'error', message:'doGet error: ' + err.message });
  }
}

// ============================================================
//  doPost — handle POST requests dari PWA (transaksi)
// ============================================================
function doPost(e) {
  try {
    var body   = JSON.parse(e.postData.contents);
    var action = body.action || '';

    // viewerLogin JUSTRU endpoint utk MENDAPATKAN akses -- tidak boleh digate editorKey.
    if (action === 'viewerLogin') return corsOutput(apiViewerLogin(body));

    // Semua action lain di sini MENGUBAH data -> wajib editorKey yg valid.
    var auth = checkEditorKey(body);
    if (!auth.ok) return corsOutput({ status:'error', message: auth.message, needLogin:true });
    // FIX v5.13 (F-03): kalau editorKey ini cocok akun per-orang di Editor_Accounts, `auth.nama`
    // adalah identitas yang SUDAH diverifikasi server (bukan string bebas dari client) --
    // teruskan sbg verifiedAdmin, dipakai postTransaksi/addItem menggantikan body.admin biasa.
    if (auth.nama) body.verifiedAdmin = auth.nama;

    if (action === 'postTransaksi') return corsOutput(postTransaksi(body));
    if (action === 'addItem')       return corsOutput(addItem(body));
    if (action === 'updateItem')    return corsOutput(updateItem(body));
    if (action === 'archiveItem')   return corsOutput(archiveItem(body));
    if (action === 'addMasterValue') return corsOutput(addMasterValue(body));
    if (action === 'adminTool')     return corsOutput(runAdminToolAPI(body.fn, body));

    // v5.20 — modul Aset Sirkulasi
    if (action === 'addAsetItem')   return corsOutput(addAsetItem(body));
    if (action === 'addAsetUnit')   return corsOutput(addAsetUnit(body));
    if (action === 'recordAsetMovement') return corsOutput(recordAsetMovement(body));

    return corsOutput({ status:'error', message:'Unknown action: ' + action });
  } catch(err) {
    return corsOutput({ status:'error', message:'doPost error: ' + err.message });
  }
}

// ============================================================
//  GENERATE ID: RDI-YYYY-XXX (ID_Item tetap di KOLOM 2)
// ============================================================
// ============================================================
//  MIGRATE ADD ID — isi ID_Item yang masih kosong di Master_Item
//  dgn ID baru format RDI-YYYY-XXX (lanjut dari nomor tertinggi
//  yg sudah ada, TIDAK menimpa ID yang sudah terisi).
//  JALANKAN MANUAL kapan saja dari Apps Script (aman diulang --
//  baris yg sudah ber-ID dilewati begitu saja).
//  Setelah ini, ID boleh diedit manual lagi di Master_Item kalau perlu.
// ============================================================
function migrateAddIDCore() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_MASTER);
  if (!sheet) return { ok:false, message:'Sheet Master_Item tidak ditemukan.' };

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok:false, message:'Master_Item kosong.' };

  var year   = new Date().getFullYear();
  var prefix = 'RDI-' + year + '-';

  var ids = sheet.getRange(2, COL_MASTER.ID+1, lastRow - 1, 1).getValues(); // kolom ID_Item

  // Cari nomor urut tertinggi yg SUDAH dipakai thn ini, supaya ID baru lanjut, bukan numpuk dari 001
  var maxNum = 0;
  ids.forEach(function(row){
    var m = String(row[0]||'').trim().match(/^RDI-\d{4}-(\d{3,})$/);
    if (m) { var n = parseInt(m[1],10); if (n > maxNum) maxNum = n; }
  });

  var assigned = 0;
  var newIds = ids.map(function(row){
    var current = String(row[0]||'').trim();
    if (current !== '') return [current]; // sudah ada ID -> jangan disentuh
    maxNum++; assigned++;
    return [prefix + String(maxNum).padStart(3,'0')];
  });

  if (assigned === 0) return { ok:true, assigned:0, prefix:prefix };

  sheet.getRange(2, 2, newIds.length, 1).setValues(newIds);
  SpreadsheetApp.flush();

  return { ok:true, assigned:assigned, prefix:prefix };
}

// Dipakai manual dari editor Apps Script (dropdown fungsi -> Run) -- tampilkan alert di Sheets.
function migrateAddID() {
  var r = migrateAddIDCore();
  if (!r.ok) { SpreadsheetApp.getUi().alert('❌ '+r.message); return; }
  if (r.assigned === 0) { SpreadsheetApp.getUi().alert('ℹ️ Semua item sudah punya ID_Item. Tidak ada yang diubah.'); return; }
  SpreadsheetApp.getUi().alert(
    '✅ migrateAddID selesai!\n' + r.assigned + ' item diberi ID baru (' + r.prefix + 'XXX).\n'
    + 'ID yang sudah ada sebelumnya TIDAK diubah.\n'
    + 'Kalau mau ganti ID tertentu, edit langsung di kolom ID_Item Master_Item.\n\n'
    + '⚠️ Setelah ini, jalankan recalculateAllSaldo() kalau item yg baru dpt ID ini sudah punya transaksi di Transaksi_Log dgn ID lama/kosong -- transaksi lama itu TIDAK otomatis ikut ter-link ke ID baru, harus disamakan manual di Transaksi_Log.'
  );
}

// Dipakai dari APLIKASI (tombol Admin Database) lewat action:'adminTool', fn:'migrateAddID' -- return JSON, tanpa getUi().
function apiMigrateAddID() {
  try {
    var r = migrateAddIDCore();
    if (!r.ok) return { status:'error', message: r.message };
    if (r.assigned === 0) return { status:'ok', message:'Semua item sudah punya ID_Item. Tidak ada yang diubah.' };
    return { status:'ok', message: r.assigned+' item diberi ID baru ('+r.prefix+'XXX). Kalau item itu sudah punya transaksi lama, jalankan juga Kalkulasi Ulang Stok.' };
  } catch(err) {
    return { status:'error', message:'apiMigrateAddID: '+err.message };
  }
}

function generateID() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_MASTER);
  var year  = new Date().getFullYear();
  var prefix = 'RDI-' + year + '-';

  if (!sheet) return prefix + '001';
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return prefix + '001';

  var idCol = sheet.getRange(2, COL_MASTER.ID+1, lastRow - 1, 1).getValues();
  var maxNum = 0;
  idCol.forEach(function(row) {
    var match = String(row[0]||'').trim().match(/^RDI-\d{4}-(\d{3,})$/);
    if (match) { var n=parseInt(match[1],10); if(n>maxNum) maxNum=n; }
  });
  return prefix + String(maxNum + 1).padStart(3, '0');
}

// ============================================================
//  GET SHEET DATA
//  Master_Item baru (9 kolom): No, ID_Item, Nama, Spesifikasi,
//  User, BC/Non BC, Unit, Kategori, Min_Stock
//  qty = saldo TOTAL live (dari Stok_Saldo), rakSummary = breakdown
//  per lokasi (dari Stok_Per_Rak), bukan lagi 1 kolom RAK statis.
// ============================================================
// Vendor & No SJ/PO TERAKHIR per item (dari transaksi MASUK paling baru) — dipakai kartu cetak & CSV export,
// karena warehouse tetap butuh info ini sekilas walau sekarang datanya per transaksi, bukan statis di item.
// ============================================================
// AUDIT FIX T-16/T-17 (v5.19): getLastVendorRefMap() dan getDashboard() dulu
// MASING-MASING melakukan full-scan TERPISAH ke seluruh Transaksi_Log (9 kolom
// dan 13 kolom) setiap kali dipanggil -- biaya baca tumbuh O(total transaksi
// sepanjang masa) dan dilakukan DUA KALI (duplikasi kerja) tiap siklus "buka
// app + buka dashboard". Ini adalah item "F3" dari Phase-0 Architecture Audit
// yang sebelumnya berstatus "queued next", belum dituntaskan sampai v5.18.
//
// Fix: satu helper getCachedTrxLogRawRows_() membaca SELURUH Transaksi_Log
// (13 kolom, superset kebutuhan kedua fungsi) SEKALI, di-cache lewat
// CacheService (TTL singkat, 45 detik -- cukup utk menutup 1 sesi "buka app +
// cek dashboard", tapi tidak terlalu lama sampai terasa basi). getLastVendorRefMap
// dan getDashboard sekarang membaca dari cache yang sama, bukan getRange()
// masing-masing. Cache diinvalidasi eksplisit di postTransaksi() setelah
// appendRow sukses (lihat invalidateTrxLogCache_), supaya transaksi baru
// langsung tercermin di request BERIKUTNYA walau masih dalam window TTL.
//
// Kalau data terlalu besar utk CacheService (limit ~100KB/key), cache.put()
// gagal secara aman (try/catch) dan fungsi tetap fallback ke full-scan biasa
// tiap panggilan -- tidak ada resiko korupsi data, cuma kehilangan manfaat
// performa untuk dataset yang sangat besar.
// ============================================================
var TRXLOG_CACHE_KEY = 'trxlog_raw_v1';
var TRXLOG_CACHE_TTL_SEC = 45;

function getCachedTrxLogRawRows_() {
  var cache = CacheService.getScriptCache();
  try {
    var cached = cache.get(TRXLOG_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch(e) {}

  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var trx = ss.getSheetByName(SHEET_TRANSAKSI);
  var rows = [];
  if (trx && trx.getLastRow() >= 2) {
    var raw = trx.getRange(2,1,trx.getLastRow()-1,13).getValues();
    rows = raw.map(function(r){
      return [
        r[COL_TRX.TIMESTAMP] instanceof Date ? r[COL_TRX.TIMESTAMP].getTime() : 0,
        String(r[COL_TRX.ID]||''), String(r[COL_TRX.NAMA]||''), String(r[COL_TRX.SPEC]||''),
        String(r[COL_TRX.JENIS]||''), String(r[COL_TRX.QTY]||''), String(r[COL_TRX.RAK]||''),
        String(r[COL_TRX.VENDOR]||''), String(r[COL_TRX.NO_REF]||''),
        String(r[COL_TRX.SALDO_SEBELUM]||''), String(r[COL_TRX.SALDO_SESUDAH]||''),
        String(r[COL_TRX.KETERANGAN]||''), String(r[COL_TRX.ADMIN]||'')
      ];
    });
  }
  try { cache.put(TRXLOG_CACHE_KEY, JSON.stringify(rows), TRXLOG_CACHE_TTL_SEC); } catch(e) { /* dataset kemungkinan >100KB, fallback tanpa cache */ }
  return rows;
}

// Kolom hasil getCachedTrxLogRawRows_() (0-based, TETAP -- lihat mapping di atas):
var TRXLOG_CACHE_COL = { TS:0, ID:1, NAMA:2, SPEC:3, JENIS:4, QTY:5, RAK:6, VENDOR:7, NO_REF:8, SALDO_SEBELUM:9, SALDO_SESUDAH:10, KETERANGAN:11, ADMIN:12 };

function invalidateTrxLogCache_() {
  try { CacheService.getScriptCache().remove(TRXLOG_CACHE_KEY); } catch(e) {}
}

function getLastVendorRefMap() {
  var map = {}; // id -> {vendor, noReferensi, timestamp}
  try {
    var data = getCachedTrxLogRawRows_();
    var C = TRXLOG_CACHE_COL;
    data.forEach(function(row){
      var jenis = String(row[C.JENIS]||'').toUpperCase();
      if (jenis !== 'MASUK') return; // vendor/PO cuma relevan utk kedatangan barang
      var id = String(row[C.ID]||'').trim().toUpperCase();
      var ts = row[C.TS] || 0; // sudah berupa epoch-ms number dari getCachedTrxLogRawRows_()
      var vendor = String(row[C.VENDOR]||'').trim();
      var noRef  = String(row[C.NO_REF]||'').trim();
      if (!vendor && !noRef) return; // baris tanpa info vendor/PO, lewati
      if (!map[id] || ts >= map[id].ts) {
        map[id] = { vendor:vendor, noReferensi:noRef, ts:ts, tglMasuk: ts ? fmtDate(new Date(ts)) : '' };
      }
    });
  } catch(e) {}
  return map;
}

// (getTotalMasukKeluarMap dihapus di v5.4 -- datanya sekarang datang dari getSaldoFullMap()
// yang dipanggil sekali dan dipakai bareng oleh getSheetData()/getItemById(), lihat di bawah.)


function getSheetData() {
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_MASTER) || ss.getSheets()[0];
    var lastRow = sheet.getLastRow();

    if (lastRow < 2) return { status:'ok', rows:[], total:0 };

    var numCols = Math.max(sheet.getLastColumn(), 10);
    var data = sheet.getRange(1, 1, lastRow, numCols).getValues();
    var rows = [];
    var hasIDCol = String(data[0][COL_MASTER.ID]).trim().toLowerCase() === 'id_item';
    var saldoFullMap = getSaldoFullMap(); // 1x baca Stok_Saldo -> saldo + masuk + keluar sekaligus
    var rakMap   = getRakSummaryMap();  // id -> "A-01: 5, B-02: 3"
    var lastVendorMap = getLastVendorRefMap(); // id -> {vendor, noReferensi, tglMasuk}

    for (var i = 1; i < data.length; i++) {
      var r = data[i];
      var nama = String(r[COL_MASTER.NAMA]||'').trim();
      if (!nama) continue;
      var idVal = hasIDCol ? String(r[COL_MASTER.ID]||'') : '';
      var idKey = idVal.trim().toUpperCase();
      var lv = lastVendorMap[idKey] || {};
      var sf = saldoFullMap[idKey] || { masuk:0, keluar:0, saldo:0 };
      rows.push({
        no: String(r[COL_MASTER.NO]||i),
        id: idVal,
        nama: nama,
        spec: String(r[COL_MASTER.SPEC]||''),
        user: String(r[COL_MASTER.USER]||''),
        bc: String(r[COL_MASTER.BC]||''),
        rak: rakMap[idKey] || '—',          // ringkasan multi-rak, bukan 1 lokasi
        qty: String(sf.saldo),
        unit: String(r[COL_MASTER.UNIT]||''),
        kategori: String(r[COL_MASTER.KATEGORI]||''),
        minStock: String(parseInt(r[COL_MASTER.MIN_STOCK],10)||0),
        status: String(r[COL_MASTER.STATUS]||'').trim() || 'Aktif', // PP-02: kolom 10, default Aktif kalau belum ada/kosong
        vendor: lv.vendor||'',           // vendor MASUK terakhir (bisa beda tiap kedatangan)
        noReferensi: lv.noReferensi||'', // No SJ/PO MASUK terakhir
        tglMasukTerakhir: lv.tglMasuk||'', // tanggal transaksi MASUK terakhir (dd/MM/yyyy), utk filter/sort tanggal
        totalMasuk: sf.masuk,             // kumulatif riil dari Stok_Saldo, bukan saldo akhir yg diduplikasi
        totalKeluar: sf.keluar
      });
    }
    return { status:'ok', rows:rows, total:rows.length, hasIDCol:hasIDCol };
  } catch(err) {
    return { status:'error', message:'getSheetData: ' + err.message };
  }
}

// ============================================================
//  DASHBOARD
// ============================================================
function getDashboard() {
  try {
    var ss   = SpreadsheetApp.getActiveSpreadsheet();
    var master = ss.getSheetByName(SHEET_MASTER);

    // FIX v5.18 (Audit #3): dulu totalItem = master.getLastRow()-1 mentah-mentah -- ikut
    // menghitung baris kosong (nama kosong) DAN item yang sudah berstatus Arsip, padahal
    // getSheetData() (yang mengisi daftar item di halaman utama) sudah skip keduanya.
    // Akibatnya angka "Total Item" di dashboard lebih besar dari jumlah item aktif yang
    // sebenarnya tampil ke user. Sekarang pakai logic penghitungan yang sama: baris tanpa
    // nama dilewati, baris berstatus Arsip tidak dihitung.
    var totalItem = 0;
    if (master && master.getLastRow() >= 2) {
      var numCols = Math.max(master.getLastColumn(), 10);
      var masterRows = master.getRange(2, 1, master.getLastRow()-1, numCols).getValues();
      masterRows.forEach(function(r){
        var nama = String(r[COL_MASTER.NAMA]||'').trim();
        if (!nama) return;
        var status = String(r[COL_MASTER.STATUS]||'').trim() || 'Aktif';
        if (status === 'Arsip') return;
        totalItem++;
      });
    }

    var totalMasuk=0, totalKeluar=0;
    var itemCount={};
    var now = new Date();
    var bulanIni = now.getMonth(); var tahunIni = now.getFullYear();

    // AUDIT FIX T-17 (v5.19): dulu di sini ada getRange(...).getValues() TERPISAH
    // yang scan penuh Transaksi_Log -- duplikasi kerja dgn scan yang sudah dilakukan
    // getLastVendorRefMap() (dipanggil dari getSheetData(), biasanya di request/sesi
    // yang berdekatan). Sekarang pakai getCachedTrxLogRawRows_() yang sama (cache
    // CacheService 45 detik) supaya kedua fungsi berbagi satu hasil baca, bukan
    // masing-masing baca penuh sendiri-sendiri.
    var trxRows = getCachedTrxLogRawRows_();
    var C = TRXLOG_CACHE_COL;
    trxRows.forEach(function(r){
      var tgl = r[C.TS] ? new Date(r[C.TS]) : new Date(0);
      var bulanSama = tgl.getMonth()===bulanIni && tgl.getFullYear()===tahunIni;
      var jenis = String(r[C.JENIS]||'').toUpperCase();
      var qty = parseFloat(r[C.QTY])||0;
      if (bulanSama) {
        if (jenis==='MASUK') totalMasuk+=qty;
        else if (jenis==='KELUAR') totalKeluar+=qty;
      }
      var id = String(r[C.ID]||'').trim();
      var nm = String(r[C.NAMA]||'').trim();
      if (id) { itemCount[id]=(itemCount[id]||{count:0,nama:nm}); itemCount[id].count++; itemCount[id].nama=nm; }
    });

    var top5 = Object.keys(itemCount)
      .map(function(k){ return {id:k, nama:itemCount[k].nama, count:itemCount[k].count}; })
      .sort(function(a,b){ return b.count-a.count; }).slice(0,5);

    return { status:'ok', data:{ totalItem:totalItem, totalMasuk:totalMasuk, totalKeluar:totalKeluar, top5:top5 } };
  } catch(err) {
    return { status:'error', message:'getDashboard: '+err.message };
  }
}

// ============================================================
//  UPDATE ITEM (edit identitas barang saja)
//  Master_Item baru: col3=Nama, col4=Spesifikasi, col5=User,
//  col6=BC, col7=Unit, col8=Kategori, col9=Min_Stock
//  (Vendor/RAK/PO/Tanggal TIDAK LAGI di sini -- itu per transaksi)
// ============================================================
function updateItem(body) {
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_MASTER);
    if (!sheet) return { status:'error', message:'Sheet Master_Item tidak ditemukan' };

    var id = String(body.id||'').trim().toUpperCase();
    if (!id) return { status:'error', message:'ID wajib diisi' };

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { status:'error', message:'Data kosong' };

    var hasIDCol = String(sheet.getRange(1,COL_MASTER.ID+1).getValue()).trim().toLowerCase() === 'id_item';
    if (!hasIDCol) return { status:'error', message:'Sheet tidak memiliki kolom ID_Item' };

    var data = sheet.getRange(2, COL_MASTER.ID+1, lastRow-1, 1).getValues();
    var rowIndex = -1;
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0]||'').trim().toUpperCase() === id) { rowIndex = i + 2; break; }
    }
    if (rowIndex === -1) return { status:'error', message:'Item '+id+' tidak ditemukan' };

    if (body.nama     !== undefined) sheet.getRange(rowIndex, COL_MASTER.NAMA+1).setValue(body.nama);
    if (body.spec     !== undefined) sheet.getRange(rowIndex, COL_MASTER.SPEC+1).setValue(body.spec);
    if (body.user     !== undefined) sheet.getRange(rowIndex, COL_MASTER.USER+1).setValue(body.user);
    if (body.bc       !== undefined) sheet.getRange(rowIndex, COL_MASTER.BC+1).setValue(body.bc);
    if (body.unit     !== undefined) sheet.getRange(rowIndex, COL_MASTER.UNIT+1).setValue(body.unit);
    if (body.kategori !== undefined) sheet.getRange(rowIndex, COL_MASTER.KATEGORI+1).setValue(body.kategori);
    if (body.minStock !== undefined) sheet.getRange(rowIndex, COL_MASTER.MIN_STOCK+1).setValue(parseInt(body.minStock,10)||0);

    SpreadsheetApp.flush();
    return { status:'ok', message:'Item '+id+' berhasil diupdate' };
  } catch(err) {
    return { status:'error', message:'updateItem: ' + err.message };
  }
}

// ============================================================
//  ARCHIVE / UNARCHIVE ITEM (PP-02, Audit UX v14.70)
//  Master_Item TIDAK PUNYA fungsi hapus (by design -- riwayat transaksi
//  harus tetap valid/terhubung). Sebagai gantinya, item bisa diarsipkan:
//  disembunyikan dari Master List & tidak bisa dipakai transaksi baru,
//  TANPA menghapus baris atau riwayatnya. Kolom Status (kolom 10) dibuat
//  otomatis kalau belum ada -- sama seperti pola migrateAddID, supaya
//  tidak perlu edit manual di Sheet dulu sebelum fitur ini bisa dipakai.
//  Wajib editorKey (lihat doPost) -- setara "role Editor" di rekomendasi
//  audit, karena aplikasi ini cuma kenal 2 level akses: Editor vs Viewer.
// ============================================================
function ensureStatusColumn(sheet) {
  var header = String(sheet.getRange(1,COL_MASTER.STATUS+1).getValue()).trim();
  if (header.toLowerCase() === 'status') return;
  sheet.getRange(1,COL_MASTER.STATUS+1).setValue('Status')
    .setBackground('#1a73e8').setFontColor('#ffffff').setFontWeight('bold');
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var existing = sheet.getRange(2,COL_MASTER.STATUS+1,lastRow-1,1).getValues();
    var filled = existing.map(function(v){ return [String(v[0]||'').trim() || 'Aktif']; });
    sheet.getRange(2,COL_MASTER.STATUS+1,lastRow-1,1).setValues(filled);
  }
}
function archiveItem(body) {
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_MASTER);
    if (!sheet) return { status:'error', message:'Sheet Master_Item tidak ditemukan' };

    var id = String(body.id||'').trim().toUpperCase();
    if (!id) return { status:'error', message:'ID wajib diisi' };

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { status:'error', message:'Data kosong' };

    var hasIDCol = String(sheet.getRange(1,COL_MASTER.ID+1).getValue()).trim().toLowerCase() === 'id_item';
    if (!hasIDCol) return { status:'error', message:'Sheet tidak memiliki kolom ID_Item' };

    ensureStatusColumn(sheet);

    var data = sheet.getRange(2, COL_MASTER.ID+1, lastRow-1, 1).getValues();
    var rowIndex = -1;
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0]||'').trim().toUpperCase() === id) { rowIndex = i + 2; break; }
    }
    if (rowIndex === -1) return { status:'error', message:'Item '+id+' tidak ditemukan' };

    var restore = !!body.restore;
    sheet.getRange(rowIndex, COL_MASTER.STATUS+1).setValue(restore ? 'Aktif' : 'Arsip');
    SpreadsheetApp.flush();

    return { status:'ok', message: restore
      ? ('Item '+id+' diaktifkan kembali.')
      : ('Item '+id+' diarsipkan. Item tidak akan muncul di Master List/pencarian transaksi, tapi riwayat transaksinya tetap tersimpan.') };
  } catch(err) {
    return { status:'error', message:'archiveItem: ' + err.message };
  }
}

// ============================================================
//  GET ITEM BY ID — identitas + saldo total + breakdown per rak
// ============================================================
function getItemById(itemId) {
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_MASTER);
    if (!sheet) return { status:'error', message:'Sheet Master_Item tidak ditemukan' };

    itemId = String(itemId||'').trim().toUpperCase();
    if (!itemId) return { status:'error', message:'ID kosong' };

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { status:'error', message:'Data kosong' };

    var data = sheet.getRange(2, 1, lastRow-1, 10).getValues();
    for (var i = 0; i < data.length; i++) {
      var r = data[i];
      if (String(r[COL_MASTER.ID]||'').trim().toUpperCase() === itemId) {
        var sf = getSaldoFullMap()[itemId] || { masuk:0, keluar:0, saldo:0 };
        var rakBreakdown = getRakBreakdown(itemId);
        var lastVendor = getLastVendorRefMap()[itemId] || {};
        return {
          status:'ok',
          item:{
            no:String(r[COL_MASTER.NO]), id:String(r[COL_MASTER.ID]),
            nama:String(r[COL_MASTER.NAMA]), spec:String(r[COL_MASTER.SPEC]),
            user:String(r[COL_MASTER.USER]), bc:String(r[COL_MASTER.BC]),
            unit:String(r[COL_MASTER.UNIT]), kategori:String(r[COL_MASTER.KATEGORI]),
            minStock:String(parseInt(r[COL_MASTER.MIN_STOCK],10)||0),
            status: String(r[COL_MASTER.STATUS]||'').trim() || 'Aktif', // PP-02 -- field ini bersarang di dalam item.*, tidak bentrok dgn status:'ok'/'error' di level atas response
            vendor:lastVendor.vendor||'', noReferensi:lastVendor.noReferensi||'',
            tglMasukTerakhir:lastVendor.tglMasuk||'',
            saldo:sf.saldo,
            totalMasuk:sf.masuk, totalKeluar:sf.keluar, // kumulatif riil, dipakai kartu cetak
            rakBreakdown:rakBreakdown // [{rak, qty}]
          }
        };
      }
    }
    return { status:'error', message:'Item '+itemId+' tidak ditemukan' };
  } catch(err) {
    return { status:'error', message:'getItemById: ' + err.message };
  }
}

// ── Saldo TOTAL + kumulatif Masuk/Keluar (semua rak digabung) — dari Stok_Saldo ──────
// PERF v5.4: dulu getSaldoMap() & getTotalMasukKeluarMap() baca sheet Stok_Saldo TERPISAH
// (2x getRange/getValues utk data yg sama persis). Sekarang 1x baca, dipakai bareng.
function getSaldoFullMap() {
  var map = {}; // id -> {masuk, keluar, saldo}
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var saldo = ss.getSheetByName(SHEET_SALDO);
    if (saldo && saldo.getLastRow() >= 2) {
      var rows = saldo.getRange(2,1,saldo.getLastRow()-1,6).getValues();
      rows.forEach(function(row){
        var key = String(row[COL_SALDO.ID]||'').trim().toUpperCase();
        if (key) map[key] = {
          masuk: parseFloat(row[COL_SALDO.TOTAL_MASUK])||0,
          keluar: parseFloat(row[COL_SALDO.TOTAL_KELUAR])||0,
          saldo: parseFloat(row[COL_SALDO.SALDO_AKHIR])||0
        };
      });
    }
  } catch(e) {}
  return map;
}

function getSaldoMap() {
  var full = getSaldoFullMap();
  var map = {};
  Object.keys(full).forEach(function(k){ map[k] = full[k].saldo; });
  return map;
}

function getSaldoItem(itemId) {
  var map = getSaldoMap();
  return map.hasOwnProperty(itemId) ? map[itemId] : 0;
}

// ── Breakdown saldo PER RAK — dari Stok_Per_Rak ─────────────
function getRakBreakdown(itemId) {
  var out = [];
  try {
    var ss  = SpreadsheetApp.getActiveSpreadsheet();
    var sh  = ss.getSheetByName(SHEET_RAK_SALDO);
    if (sh && sh.getLastRow() >= 2) {
      var rows = sh.getRange(2,1,sh.getLastRow()-1,3).getValues();
      rows.forEach(function(row){
        if (String(row[COL_RAK_SALDO.ID]||'').trim().toUpperCase()===itemId && parseFloat(row[COL_RAK_SALDO.QTY])!==0) {
          out.push({ rak:String(row[COL_RAK_SALDO.RAK]||''), qty:parseFloat(row[COL_RAK_SALDO.QTY])||0 });
        }
      });
    }
  } catch(e) {}
  return out;
}

// Ringkasan semua item sekaligus (dipakai getSheetData, hemat query drpd panggil getRakBreakdown per baris)
function getRakSummaryMap() {
  var map = {}; // id -> array of "RAK: qty"
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SHEET_RAK_SALDO);
    if (sh && sh.getLastRow() >= 2) {
      var rows = sh.getRange(2,1,sh.getLastRow()-1,3).getValues();
      rows.forEach(function(row){
        var id = String(row[COL_RAK_SALDO.ID]||'').trim().toUpperCase();
        var rak = String(row[COL_RAK_SALDO.RAK]||'').trim();
        var qty = parseFloat(row[COL_RAK_SALDO.QTY])||0;
        if (!id || !rak || qty===0) return;
        if (!map[id]) map[id] = [];
        map[id].push(rak+': '+qty);
      });
    }
  } catch(e) {}
  var result = {};
  Object.keys(map).forEach(function(id){ result[id] = map[id].join(', '); });
  return result;
}

// ============================================================
//  POST TRANSAKSI
//  Sekarang WAJIB menyertakan rak (target lokasi transaksi).
//  Validasi KELUAR terhadap saldo RAK tersebut (bukan total item),
//  karena barang bisa ada di lebih dari satu rak.
//  vendor & noReferensi (No SJ/PO) dicatat per transaksi di sini.
// ============================================================
// ============================================================
//  PER-ITEM MUTEX (Audit F-04, Medium) — postTransaksi dulu pakai
//  LockService.getScriptLock() dipegang SELAMA SELURUH proses (append log +
//  update 2 sheet saldo), artinya transaksi ITEM A ikut nunggu transaksi
//  ITEM B selesai walau dua-duanya sama sekali tidak berkaitan -- di volume
//  transaksi tinggi ini jadi bottleneck. Sekarang: script lock cuma dipegang
//  SANGAT SINGKAT (uji-dan-set flag mutex per itemId di CacheService, expected
//  1 round-trip Properties/Cache, bukan seluruh proses transaksi). Transaksi
//  item BERBEDA jalan paralel; transaksi item YANG SAMA tetap antre berurutan
//  (itu memang wajib, supaya saldo item yang sama tidak ke-race). Kalau
//  CacheService/LockService bermasalah, gagal ambil lock dalam timeout ->
//  balikin pesan "server sibuk" (sama seperti perilaku lama), bukan diam-diam
//  lanjut tanpa proteksi.
// ============================================================
function acquirePerItemLock_(itemId, timeoutMs) {
  var deadline = Date.now() + timeoutMs;
  var cache = CacheService.getScriptCache();
  var lockKey = 'item_lock_' + itemId;
  while (Date.now() < deadline) {
    var got = false;
    var slock = LockService.getScriptLock();
    try {
      slock.waitLock(2000); // lock global cuma utk atomic check-and-set flag, bukan utk seluruh transaksi
      if (!cache.get(lockKey)) {
        cache.put(lockKey, '1', 20); // TTL 20dtk jaga2 kalau proses macet -- lock tidak nyangkut selamanya
        got = true;
      }
    } catch (e) {
      // gagal ambil script lock sesaat (jarang) -- coba lagi di iterasi berikutnya sampai deadline
    } finally {
      try { slock.releaseLock(); } catch (e) {}
    }
    if (got) {
      return { ok: true, release: function () { try { cache.remove(lockKey); } catch (e) {} } };
    }
    Utilities.sleep(150 + Math.floor(Math.random() * 150)); // backoff kecil + jitter, hindari thundering herd
  }
  return { ok: false };
}

// ============================================================
//  POST TRANSAKSI
//  Sekarang WAJIB menyertakan rak (target lokasi transaksi).
//  Validasi KELUAR terhadap saldo RAK tersebut (bukan total item),
//  karena barang bisa ada di lebih dari satu rak.
//  vendor & noReferensi (No SJ/PO) dicatat per transaksi di sini.
// ============================================================
function postTransaksi(params) {
  // FIX v5.8 (P0/P1 audit finding F2): frontend (gasPost di index.html) sudah kirim requestId
  // dan meng-klaim di komentarnya bahwa backend dedup lewat CacheService berbasis requestId --
  // tapi implementasinya belum ada. LockService di bawah cuma cegah race condition ANTAR
  // request paralel, TIDAK cegah request retry SEKUENSIAL (mis. koneksi putus pas response
  // balik, frontend retry dgn body identik) dari jadi transaksi dobel. Ini menambal itu,
  // TANPA ubah signature/API/urutan validasi -- kalau requestId kosong (klien lama), perilaku
  // persis sama seperti sebelumnya.
  var requestId = String(params.requestId||'').trim();
  var cache     = requestId ? CacheService.getScriptCache() : null;
  var cacheKey  = requestId ? 'trx_req_' + requestId : null;

  // FAST PATH (di luar lock, murah): kalau requestId ini sudah pernah SUKSES diproses,
  // langsung balikin hasil yang sama -- tidak appendRow lagi, tidak proses ulang saldo.
  if (cache) {
    var cachedFast = cache.get(cacheKey);
    if (cachedFast) {
      try { return JSON.parse(cachedFast); } catch(e) { /* cache korup -> lanjut proses normal */ }
    }
  }

  // FIX v5.16 (F-04): itemId divalidasi & di-uppercase DULU, sebelum ambil lock apa pun --
  // request tanpa itemId gagal cepat tanpa sempat memegang mutex apa pun.
  var itemIdForLock = String(params.itemId||'').trim().toUpperCase();
  if (!itemIdForLock) return { status:'error', message:'ID Item kosong' };

  var lock = acquirePerItemLock_(itemIdForLock, 15000); // tunggu maks 15dtk (sama seperti timeout lama)
  if (!lock.ok) {
    return { status:'error', message:'Server sibuk memproses item ini, banyak transaksi bersamaan. Coba lagi sebentar.' };
  }
  try {
    // DOUBLE-CHECK di dalam lock: cegah 2 retry hampir bersamaan yang sama-sama lolos fast
    // path di atas sebelum salah satu sempat nulis cache -- sekarang exclusive lewat lock,
    // jadi requestId yang sama tidak mungkin diproses appendRow dua kali.
    if (cache) {
      var cachedLocked = cache.get(cacheKey);
      if (cachedLocked) {
        try { return JSON.parse(cachedLocked); } catch(e) {}
      }
    }

    var itemId      = itemIdForLock;
    var jenis       = String(params.jenis||'').toUpperCase();
    var qty         = parseFloat(params.qty)||0;
    var rak         = String(params.rak||'').trim().toUpperCase();
    var vendor      = String(params.vendor||'').trim();
    var noReferensi = String(params.noReferensi||'').trim();
    var keterangan  = String(params.keterangan||'');
    // FIX v5.13 (F-03): kalau verifiedAdmin ada (identitas dari Editor_Accounts, lihat doPost),
    // itu yang dipakai -- TIDAK BISA dipalsukan client karena datang dari lookup server
    // berbasis editorKey yang sudah divalidasi. Kalau tidak ada (masih mode EDITOR_KEY tunggal
    // lama, belum setup akun per-orang), tetap terima string client apa adanya seperti
    // sebelumnya -- itu batas maksimal yang bisa diverifikasi tanpa akun per-orang.
    var admin       = String(params.verifiedAdmin || params.admin || 'Admin');

    if (jenis!=='MASUK'&&jenis!=='KELUAR') return { status:'error', message:'Jenis harus MASUK atau KELUAR' };
    if (qty<=0) return { status:'error', message:'Qty harus lebih dari 0' };
    if (!rak) return { status:'error', message:'RAK/lokasi wajib diisi' };

    var itemResult = getItemById(itemId);
    if (itemResult.status!=='ok') return itemResult;
    var item = itemResult.item;

    // PP-02: item yang sudah diarsipkan tidak boleh ditransaksikan lagi (MASUK maupun KELUAR) --
    // harus diaktifkan kembali dulu dari halaman detail item.
    if (item.status === 'Arsip') {
      return { status:'error', message:'Item '+itemId+' sudah diarsipkan dan tidak bisa ditransaksikan. Aktifkan kembali dulu dari halaman detail item.' };
    }

    var saldoSebelumTotal = item.saldo;
    var saldoSebelumRak = 0;
    item.rakBreakdown.forEach(function(rb){ if(rb.rak===rak) saldoSebelumRak = rb.qty; });

    if (jenis==='KELUAR' && qty>saldoSebelumRak)
      return { status:'error', message:'Stok di rak '+rak+' tidak cukup. Saldo rak ini: '+saldoSebelumRak+' '+item.unit };

    var saldoSesudahTotal = jenis==='MASUK' ? saldoSebelumTotal+qty : saldoSebelumTotal-qty;

    var ss  = SpreadsheetApp.getActiveSpreadsheet();
    var trx = ss.getSheetByName(SHEET_TRANSAKSI);
    if (!trx) return { status:'error', message:'Sheet Transaksi_Log tidak ditemukan' };

    trx.appendRow([
      new Date(), itemId, item.nama, item.spec||'',
      jenis, qty, rak, vendor, noReferensi,
      saldoSebelumTotal, saldoSesudahTotal, keterangan, admin
    ]);
    // AUDIT FIX T-16/T-17 (v5.19): invalidasi cache getCachedTrxLogRawRows_() supaya
    // getLastVendorRefMap()/getDashboard() berikutnya tidak memakai data yg sudah
    // basi (sebelum transaksi baru ini) walau masih dalam window TTL 45 detik.
    invalidateTrxLogCache_();

    // FIX v5.12 (F-01): dulu kedua panggilan ini dianggap SELALU sukses -- kalau salah
    // satu gagal (menelan error via try/catch internal + console.log), postTransaksi
    // tetap lanjut & balikin status:'ok' seolah tidak terjadi apa-apa, padahal
    // Transaksi_Log sudah bertambah tapi Stok_Saldo/Stok_Per_Rak tidak. Sekarang
    // appendRow di atas TETAP dianggap sumber kebenaran (tidak di-rollback -- rollback
    // manual lebih berisiko daripada membiarkan), tapi kegagalan sync saldo ditangkap
    // eksplisit, dicatat ke Sync_Errors, dan dilaporkan ke frontend lewat saldoSyncOk.
    var saldoSyncOk = true;
    var saldoSyncError = '';
    try {
      updateSaldo(itemId, item.nama, item.unit, jenis, qty);
    } catch(e) {
      saldoSyncOk = false;
      saldoSyncError += e.message + '. ';
    }
    try {
      updateRakSaldo(itemId, rak, jenis, qty);
    } catch(e) {
      saldoSyncOk = false;
      saldoSyncError += e.message + '. ';
    }
    if (!saldoSyncOk) logSyncError_('postTransaksi', itemId, saldoSyncError);

    var result = {
      status:'ok',
      message: saldoSyncOk
        ? 'Transaksi berhasil'
        : 'Transaksi tersimpan di Transaksi_Log, TAPI Stok_Saldo/Stok_Per_Rak GAGAL disinkronkan. Hubungi admin utk jalankan Kalkulasi Ulang Stok.',
      saldoSebelum:saldoSebelumTotal, saldoSesudah:saldoSesudahTotal,
      unit:item.unit, namaItem:item.nama, rak:rak,
      saldoSyncOk: saldoSyncOk
    };
    if (!saldoSyncOk) result.saldoSyncWarning = saldoSyncError;

    // Simpan hasil SUKSES ke cache 6 jam (21600dtk = batas maksimum CacheService) supaya
    // retry berikutnya dgn requestId yg sama (mis. response putus di jalan) dapat hasil
    // identik ini, bukan appendRow baru. Error TIDAK di-cache dgn sengaja -- request yang
    // gagal validasi (mis. stok kurang) aman & lebih benar untuk dievaluasi ulang dari data
    // terbaru saat retry, bukan diblok mengulang error lama yang mungkin sudah tidak relevan.
    if (cache) {
      try { cache.put(cacheKey, JSON.stringify(result), 21600); } catch(e) {}
    }

    return result;
  } catch(err) {
    return { status:'error', message:'postTransaksi: ' + err.message };
  } finally {
    lock.release();
  }
}

// ============================================================
//  FIND ROW INDEX (helper — PHASE 0 audit P3: konsolidasi duplicate logic)
//  Dulu pola "getValues() lalu loop for cari row yang cocok" ditulis ulang
//  scara terpisah di updateSaldo, updateRakSaldo, dan getStockLedger --
//  masing-masing identik persis kecuali kolom & jumlah kriteria yang
//  dibandingkan. Diekstrak jadi 1 helper di sini; TIDAK mengubah cara/kapan
//  data dibaca dari sheet (caller tetap yang menentukan range getRange/
//  getValues, jadi karakteristik performa tiap fungsi TIDAK berubah) --
//  murni menghilangkan duplikasi logic pencariannya saja.
//  `data`     : hasil getValues() (array 2D) yang SUDAH dibaca oleh caller.
//  `matchers` : array pasangan [kolomIndex, nilaiPembanding], semua harus
//               cocok (AND). Perbandingan selalu trim+uppercase, konsisten
//               dengan kebiasaan existing code (ID_Item, RAK, dst).
//  Return: index baris di `data` (0-based) yang cocok, atau -1 kalau tidak ketemu.
// ============================================================
function findRowIndex(data, matchers) {
  for (var i=0; i<data.length; i++) {
    var row = data[i];
    var isMatch = true;
    for (var j=0; j<matchers.length; j++) {
      var col = matchers[j][0], val = matchers[j][1];
      if (String(row[col]||'').trim().toUpperCase() !== val) { isMatch = false; break; }
    }
    if (isMatch) return i;
  }
  return -1;
}

// ============================================================
//  ROW LOOKUP BY COLUMN VALUE (Audit F-07, Low) — getHistory/getStockLedger dulu
//  membaca SELURUH Transaksi_Log (semua 13 kolom, semua baris) ke memory Apps
//  Script lalu filter per-item di JS, padahal biasanya cuma sebagian kecil baris
//  yang cocok untuk 1 itemId. Sekarang: scan HANYA kolom ID_Item (1 kolom, bukan
//  13) untuk cari nomor baris yang cocok, baru getRangeList() untuk ambil data
//  LENGKAP cuma baris-baris yang match itu. Kolom ID tetap harus di-scan penuh
//  (Sheets tidak punya indeks bawaan tanpa struktur data tambahan), tapi volume
//  data yang ditransfer dari Sheets API turun drastis (1 kolom + N baris cocok,
//  bukan 13 kolom x seluruh baris) -- makin besar Transaksi_Log, makin terasa.
// ============================================================
function findMatchingRowNumbers_(sheet, colIndex0, lastRow, matchValueUpper) {
  if (lastRow < 2) return [];
  var colVals = sheet.getRange(2, colIndex0+1, lastRow-1, 1).getValues();
  var rowNums = [];
  for (var i=0; i<colVals.length; i++) {
    if (String(colVals[i][0]||'').trim().toUpperCase() === matchValueUpper) rowNums.push(i+2); // nomor baris sheet asli (1-based, +1 utk header)
  }
  return rowNums;
}

function getRowsByNumbers_(sheet, rowNumbers, numCols) {
  if (!rowNumbers.length) return [];
  var lastCol = columnToLetter_(numCols);
  var a1 = rowNumbers.map(function(r){ return 'A'+r+':'+lastCol+r; });
  return sheet.getRangeList(a1).getRanges().map(function(rg){ return rg.getValues()[0]; });
}

function columnToLetter_(colNum) {
  var letter = '';
  while (colNum > 0) {
    var rem = (colNum-1) % 26;
    letter = String.fromCharCode(65+rem) + letter;
    colNum = Math.floor((colNum-1)/26);
  }
  return letter;
}

// ============================================================
//  UPDATE STOK_SALDO (total per item, replay dari Transaksi_Log)
//  Kolom Transaksi_Log: idx1=ID_Item, idx4=Jenis, idx5=Qty (posisi
//  ini sama seperti skema lama, jadi logic replay tidak berubah)
// ============================================================
function updateSaldo(itemId, nama, unit, jenis, qty) {
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var saldo = ss.getSheetByName(SHEET_SALDO);
    if (!saldo) return;

    var masukDelta  = jenis==='MASUK'  ? qty : 0;
    var keluarDelta = jenis==='KELUAR' ? qty : 0;

    var foundRow = -1;
    var curMasuk = 0, curKeluar = 0;
    var lastRow  = saldo.getLastRow();
    if (lastRow >= 2) {
      // PERF v5.4: baris di sini = jumlah ITEM (kecil, stabil), BUKAN jumlah transaksi.
      // Dulu fungsi ini scan ULANG SELURUH Transaksi_Log tiap kali ada 1 transaksi baru --
      // makin banyak transaksi menumpuk, makin lambat tiap kali user simpan transaksi baru
      // (O(total transaksi sepanjang masa) per POST). Sekarang cukup ambil saldo lama +
      // tambah/kurang delta transaksi ini saja -- O(jumlah item), tidak tumbuh seiring waktu.
      var existing = saldo.getRange(2,1,lastRow-1,6).getValues();
      var idx = findRowIndex(existing, [[COL_SALDO.ID, itemId]]);
      if (idx >= 0) {
        foundRow  = idx+2;
        curMasuk  = parseFloat(existing[idx][COL_SALDO.TOTAL_MASUK])||0;
        curKeluar = parseFloat(existing[idx][COL_SALDO.TOTAL_KELUAR])||0;
      }
    }

    var newMasuk  = curMasuk + masukDelta;
    var newKeluar = curKeluar + keluarDelta;
    var rowData = [itemId, nama, unit, newMasuk, newKeluar, newMasuk-newKeluar];
    if (foundRow>0) saldo.getRange(foundRow,1,1,6).setValues([rowData]);
    else saldo.appendRow(rowData);
  } catch(e) {
    // FIX v5.12 (F-01): dulu cuma console.log (tidak ada yang lihat di production,
    // dan postTransaksi() tetap lanjut seolah sukses). Sekarang dilempar balik supaya
    // caller (postTransaksi) tahu update saldo GAGAL dan bisa menangani secara eksplisit.
    throw new Error('updateSaldo gagal utk item ' + itemId + ': ' + e.message);
  }
}

// ============================================================
//  UPDATE STOK_PER_RAK (saldo per lokasi, replay dari Transaksi_Log
//  di-filter itemId DAN rak sekaligus)
// ============================================================
function updateRakSaldo(itemId, rak, jenis, qty) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SHEET_RAK_SALDO);
    if (!sh) return;

    var delta = jenis==='MASUK' ? qty : -qty;

    var foundRow = -1;
    var curQty = 0;
    var lastRow = sh.getLastRow();
    if (lastRow >= 2) {
      // PERF v5.4: baris di sini = kombinasi item x rak (kecil, stabil), bukan jumlah transaksi.
      // Sama seperti updateSaldo -- dulu full replay Transaksi_Log tiap transaksi, sekarang O(1) delta.
      var existing = sh.getRange(2,1,lastRow-1,3).getValues();
      var idx = findRowIndex(existing, [[COL_RAK_SALDO.ID, itemId], [COL_RAK_SALDO.RAK, rak]]);
      if (idx >= 0) {
        foundRow = idx+2;
        curQty = parseFloat(existing[idx][COL_RAK_SALDO.QTY])||0;
      }
    }

    var newQty = curQty + delta;
    var rowData = [itemId, rak, newQty];
    if (foundRow>0) sh.getRange(foundRow,1,1,3).setValues([rowData]);
    else sh.appendRow(rowData);
  } catch(e) {
    // FIX v5.12 (F-01): sama seperti updateSaldo — lempar balik, jangan cuma console.log.
    throw new Error('updateRakSaldo gagal utk item ' + itemId + ' rak ' + rak + ': ' + e.message);
  }
}

// ============================================================
//  LOG SYNC ERROR (baru — v5.12, fix F-01)
//  Dulu kegagalan updateSaldo/updateRakSaldo hanya console.log (hilang,
//  tidak ada yang lihat di production). Sekarang dicatat ke sheet supaya
//  admin bisa lihat & tindak lanjuti (jalankan recalculateAllSaldo utk
//  item yg gagal), sekaligus jadi jejak audit kapan & kenapa gagal.
// ============================================================
function logSyncError_(context, itemId, message) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SHEET_SYNC_ERRORS);
    if (!sh) {
      sh = ss.insertSheet(SHEET_SYNC_ERRORS);
      sh.getRange(1,1,1,4).setValues([['Timestamp','Context','ID_Item','Message']]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
    sh.appendRow([new Date(), context, itemId, message]);
  } catch(e) {
    // Kalaupun logging ini sendiri gagal, jangan sampai bikin postTransaksi ikut crash --
    // console.log tetap dipakai sbg fallback terakhir, bukan sbg mekanisme utama lagi.
    console.log('logSyncError_ gagal: ' + e.message);
  }
}

// ============================================================
//  GET ALL HISTORY / GET HISTORY (Transaksi_Log 13 kolom)
// ============================================================
// Map id -> Unit (kolom 7 Master_Item), dipakai getAllHistory/getHistory supaya
// setiap baris riwayat transaksi tahu satuannya tanpa perlu simpan Unit di Transaksi_Log.
function getItemUnitMap() {
  var map = {};
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_MASTER);
    if (sheet && sheet.getLastRow() >= 2) {
      var data = sheet.getRange(2, 1, sheet.getLastRow()-1, 7).getValues();
      data.forEach(function(r){
        var id = String(r[COL_MASTER.ID]||'').trim().toUpperCase();
        if (id) map[id] = String(r[COL_MASTER.UNIT]||'');
      });
    }
  } catch(e) {}
  return map;
}

function getAllHistory(limit) {
  try {
    var ss  = SpreadsheetApp.getActiveSpreadsheet();
    var trx = ss.getSheetByName(SHEET_TRANSAKSI);
    if (!trx || trx.getLastRow()<2) return { status:'ok', rows:[], total:0 };

    limit = parseInt(limit) || 200;

    // PERF v5.9 (Fix P1 audit finding: getAllHistory scan seluruh sheet): dulu
    // fungsi ini SELALU baca SELURUH Transaksi_Log (getRange dari baris 2 sampai
    // getLastRow()) lalu baru dipotong ke `limit` di akhir -- artinya cost baca
    // tumbuh terus seiring jumlah transaksi sepanjang masa (O(total transaksi)),
    // padahal endpoint ini cuma butuh N transaksi TERBARU. Karena Transaksi_Log
    // selalu ditulis kronologis via appendRow() (lihat postTransaksi), N transaksi
    // terbaru SELALU berada di N baris PALING BAWAH sheet -- jadi cukup baca
    // `limit` baris terakhir saja. Hasil akhir (isi, urutan newest-first, dan
    // pembatasan ke `limit`) IDENTIK dengan sebelumnya, hanya cost baca yang
    // berubah dari O(total transaksi) menjadi O(limit) yang konstan.
    var lastRow        = trx.getLastRow();
    var totalDataRows  = lastRow - 1;
    var rowsToRead      = Math.min(limit, totalDataRows);
    var startRow        = lastRow - rowsToRead + 1;

    var data = trx.getRange(startRow, 1, rowsToRead, 13).getValues();
    var unitMap = getItemUnitMap();
    var rows = [];

    data.forEach(function(row){
      var idKey = String(row[COL_TRX.ID]||'').trim().toUpperCase();
      rows.push({
        timestamp:fmtDateTime(row[COL_TRX.TIMESTAMP]), itemId:String(row[COL_TRX.ID]),
        nama:String(row[COL_TRX.NAMA]), spec:String(row[COL_TRX.SPEC]),
        jenis:String(row[COL_TRX.JENIS]), qty:String(row[COL_TRX.QTY]),
        rak:String(row[COL_TRX.RAK]), vendor:String(row[COL_TRX.VENDOR]), noReferensi:String(row[COL_TRX.NO_REF]),
        saldoSebelum:String(row[COL_TRX.SALDO_SEBELUM]), saldoSesudah:String(row[COL_TRX.SALDO_SESUDAH]),
        keterangan:String(row[COL_TRX.KETERANGAN]), admin:String(row[COL_TRX.ADMIN]),
        unit: unitMap[idKey] || ''
      });
    });

    rows.reverse(); // newest-first, sama seperti perilaku lama

    return { status:'ok', rows:rows, total:rows.length };
  } catch(err) {
    return { status:'error', message:'getAllHistory: ' + err.message };
  }
}

function getHistory(itemId) {
  try {
    var ss  = SpreadsheetApp.getActiveSpreadsheet();
    var trx = ss.getSheetByName(SHEET_TRANSAKSI);
    var lastRow = trx ? trx.getLastRow() : 0;
    if (!trx || lastRow<2) return { status:'ok', rows:[], total:0 };

    itemId = String(itemId||'').trim().toUpperCase();
    // FIX v5.17 (F-07): dulu getRange(2,1,lastRow-1,13).getValues() baca SEMUA baris
    // + SEMUA kolom lalu filter di JS -- sekarang scan kolom ID_Item saja dulu (1 kolom),
    // baru ambil data 13-kolom lengkap UNTUK BARIS YANG COCOK SAJA lewat getRangeList.
    var rowNums = findMatchingRowNumbers_(trx, COL_TRX.ID, lastRow, itemId);
    var data = getRowsByNumbers_(trx, rowNums, 13);
    var unitMap = getItemUnitMap();
    var itemUnit = unitMap[itemId] || '';
    var rows = [];

    data.forEach(function(row){
      // Validasi numerik: kalau sel Saldo_Sebelum/Saldo_Sesudah ternyata berisi teks
      // (biasanya akibat edit manual di sheet yang menggeser kolom), JANGAN tampilkan
      // teks mentah itu seolah itu angka saldo -- tandai jelas sbg data tidak valid.
      var sSebelum = row[COL_TRX.SALDO_SEBELUM], sSesudah = row[COL_TRX.SALDO_SESUDAH];
      var sebelumNum = parseFloat(sSebelum), sesudahNum = parseFloat(sSesudah);
      var sebelumValid = String(sSebelum).trim()==='' || !isNaN(sebelumNum);
      var sesudahValid = String(sSesudah).trim()==='' || !isNaN(sesudahNum);
      rows.push({
        timestamp:fmtDateTime(row[COL_TRX.TIMESTAMP]), itemId:String(row[COL_TRX.ID]),
        nama:String(row[COL_TRX.NAMA]), spec:String(row[COL_TRX.SPEC]),
        jenis:String(row[COL_TRX.JENIS]), qty:String(row[COL_TRX.QTY]),
        rak:String(row[COL_TRX.RAK]), vendor:String(row[COL_TRX.VENDOR]), noReferensi:String(row[COL_TRX.NO_REF]),
        saldoSebelum: sebelumValid ? String(sSebelum) : '⚠ data tidak valid',
        saldoSesudah: sesudahValid ? String(sSesudah) : '⚠ data tidak valid',
        keterangan:String(row[COL_TRX.KETERANGAN]), admin:String(row[COL_TRX.ADMIN]),
        unit: itemUnit
      });
    });

    rows.reverse();
    return { status:'ok', rows:rows, total:rows.length };
  } catch(err) {
    return { status:'error', message:'getHistory: ' + err.message };
  }
}

// ============================================================
//  ADD ITEM
//  Master_Item baru (identitas saja, 9 kolom). Kalau body.qty>0
//  dikirim (stok awal), dicatat sebagai transaksi MASUK pertama
//  -- BUKAN angka statis di Master_Item -- supaya konsisten
//  dgn prinsip "semua stok = transaksi", termasuk yg pertama kali.
// ============================================================
function addItem(body) {
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_MASTER);
    if (!sheet) return { status:'error', message:'Sheet Master_Item tidak ditemukan' };

    // FIX v5.18 (Audit #2): dulu generateID() (baca nomor tertinggi di Master_Item) lalu
    // appendRow() berjalan TANPA lock -- kalau 2 orang tambah item nyaris bersamaan,
    // keduanya bisa baca nomor tertinggi yang SAMA sebelum salah satu sempat appendRow,
    // sehingga dapat ID_Item KEMBAR. Ini sudah kejadian nyata di data produksi (mis.
    // MRO-05-06-007 kepakai untuk 2 barang yang sama sekali berbeda). Sekarang blok
    // generateID()+appendRow dikunci pakai LockService.getScriptLock() -- request addItem
    // lain yang datang bersamaan menunggu giliran, jadi tidak mungkin lagi baca nomor
    // tertinggi yang sama. Lock dilepas SEBELUM postTransaksi (stok awal) di bawah supaya
    // tidak menahan lock global lebih lama dari perlu (postTransaksi punya lock sendiri
    // per-item).
    var newId, newNo;
    var idLock = LockService.getScriptLock();
    try {
      idLock.waitLock(15000);
    } catch(e) {
      return { status:'error', message:'Server sibuk memproses penambahan item lain. Coba lagi sebentar.' };
    }
    try {
      newId = generateID();
      var lastRow = sheet.getLastRow();
      newNo = lastRow < 2 ? 1 : lastRow;

      var rowData = [
        newNo, newId,
        String(body.nama||''), String(body.spec||''),
        String(body.user||''), String(body.bc||''),
        String(body.unit||''), String(body.kategori||''),
        parseInt(body.minStock,10)||0
      ];
      sheet.appendRow(rowData);
      SpreadsheetApp.flush();
    } finally {
      try { idLock.releaseLock(); } catch(e) {}
    }

    // Stok awal (kalau diisi) -> jadi transaksi MASUK pertama, bukan kolom statis
    // AUDIT FIX T-18 (v5.19): dulu hasil postTransaksi() di sini TIDAK ditangkap sama
    // sekali -- kalau gagal (mis. lock timeout saat traffic tinggi), addItem tetap
    // balikin status:'ok' padahal stok awal senyap tidak tersimpan, tanpa user tahu.
    // Sekarang hasilnya diperiksa dan dilaporkan lewat field stokAwalWarning kalau
    // gagal -- item TETAP dibuat (tidak di-rollback, konsisten dgn pola saldoSyncOk
    // yang sudah ada di postTransaksi: appendRow item baru sudah terjadi & valid,
    // rollback manual lebih berisiko daripada membiarkan + melaporkan).
    var qtyAwal = parseFloat(body.qty)||0;
    var stokAwalWarning = '';
    if (qtyAwal > 0) {
      var trxResult = postTransaksi({
        itemId: newId, jenis:'MASUK', qty: qtyAwal,
        rak: body.rak||'BELUM DITENTUKAN',
        vendor: body.vendor||'', noReferensi: body.po||'',
        keterangan: 'Stok awal saat item dibuat',
        verifiedAdmin: body.verifiedAdmin, admin: body.admin || 'Admin'
      });
      if (!trxResult || trxResult.status !== 'ok') {
        stokAwalWarning = 'Item berhasil dibuat, TAPI stok awal (' + qtyAwal + ') GAGAL tersimpan sebagai transaksi: ' +
          (trxResult && trxResult.message ? trxResult.message : 'error tidak diketahui') +
          '. Silakan input transaksi MASUK manual utk stok awal item ini.';
      }
    }

    var res = { status:'ok', message:'Item berhasil ditambahkan', id:newId, no:newNo };
    if (stokAwalWarning) { res.status = 'partial'; res.message = stokAwalWarning; }
    return res;
  } catch(err) {
    return { status:'error', message:'addItem: ' + err.message };
  }
}

// ============================================================
//  SETUP SHEETS (jalankan 1x untuk instalasi baru)
// ============================================================
// Helper: pastikan 1 sheet master-list (Kategori/UOM/Vendor/Rak) ada,
// dengan header rapi (bergaya sama seperti sheet lain) + default value
// kalau sheet itu baru dibuat. Kalau sheet SUDAH ada & sudah berisi data,
// TIDAK disentuh sama sekali (aman dipanggil berulang kali).
function ensureMasterListSheet(name, defaults) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  var isNew = !sh;
  if (isNew) sh = ss.insertSheet(name);

  var header = String(sh.getRange(1,1).getValue()).trim().toLowerCase();
  if (header !== 'nilai') {
    sh.getRange(1,1).setValue('Nilai').setBackground('#5a3a8a').setFontColor('#ffffff').setFontWeight('bold');
    sh.setFrozenRows(1);
  }

  // Isi default HANYA kalau sheet baru dibuat & masih kosong (jangan timpa data yang sudah diisi user)
  if (isNew && defaults && defaults.length && sh.getLastRow() < 2) {
    sh.getRange(2,1,defaults.length,1).setValues(defaults.map(function(v){ return [v]; }));
  }
  return sh;
}

function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var master = ss.getSheetByName(SHEET_MASTER);
  if (!master) master = ss.insertSheet(SHEET_MASTER);
  if (String(master.getRange(1,2).getValue()).trim().toLowerCase() !== 'id_item') {
    master.getRange(1,1,1,9).setValues([[
      'No','ID_Item','Nama Material','Spesifikasi',
      'User','BC/Non BC','Unit','Kategori','Min_Stock'
    ]]).setBackground('#1a3a7a').setFontColor('#ffffff').setFontWeight('bold');
    master.setFrozenRows(1);
    master.setColumnWidth(2,130);
  }

  var trx = ss.getSheetByName(SHEET_TRANSAKSI);
  if (!trx) trx = ss.insertSheet(SHEET_TRANSAKSI);
  if (String(trx.getRange(1,7).getValue()).trim().toLowerCase() !== 'rak') {
    trx.getRange(1,1,1,13).setValues([[
      'Timestamp','ID_Item','Nama_Item','Spesifikasi','Jenis','Qty',
      'RAK','Vendor','No_Referensi','Saldo_Sebelum','Saldo_Sesudah','Keterangan','Admin'
    ]]).setBackground('#1a3a7a').setFontColor('#ffffff').setFontWeight('bold');
    trx.setFrozenRows(1);
  }

  var sld = ss.getSheetByName(SHEET_SALDO);
  if (!sld) sld = ss.insertSheet(SHEET_SALDO);
  if (String(sld.getRange(1,1).getValue()).trim().toLowerCase() !== 'id_item') {
    sld.getRange(1,1,1,6).setValues([[
      'ID_Item','Nama Material','Unit','Total_Masuk','Total_Keluar','Saldo_Akhir'
    ]]).setBackground('#1a7a4a').setFontColor('#ffffff').setFontWeight('bold');
    sld.setFrozenRows(1);
  }

  var rakSld = ss.getSheetByName(SHEET_RAK_SALDO);
  if (!rakSld) rakSld = ss.insertSheet(SHEET_RAK_SALDO);
  if (String(rakSld.getRange(1,1).getValue()).trim().toLowerCase() !== 'id_item') {
    rakSld.getRange(1,1,1,3).setValues([[
      'ID_Item','RAK','Qty'
    ]]).setBackground('#7a5a1a').setFontColor('#ffffff').setFontWeight('bold');
    rakSld.setFrozenRows(1);
  }

  // Sheet master-list (dropdown) — dulu terpisah di setupMasterListSheets(), kini disatukan
  // di sini supaya SATU kali jalan setupSheets() sudah membuat SEMUA sheet yang dipakai aplikasi.
  ensureMasterListSheet(SHEET_KATEGORI, ['Tool','Consumable','Sparepart','Raw Material']);
  ensureMasterListSheet(SHEET_UOM,      ['Pcs','Set','Unit','Box','Kg','Liter']);
  ensureMasterListSheet(SHEET_VENDOR,   []); // tidak ada default universal, diisi manual/otomatis dari transaksi
  ensureMasterListSheet(SHEET_RAK,      []); // tidak ada default universal, diisi manual/otomatis dari transaksi

  // v5.20 — sheet utk modul Aset Sirkulasi (alat keluar-pakai-kembali-diasah-pakai lagi)
  setupAsetSheets();

  SpreadsheetApp.getUi().alert(
    '✅ Setup selesai! 11 sheet siap dipakai:\n'
    + '• ' + SHEET_MASTER + '\n• ' + SHEET_TRANSAKSI + '\n• ' + SHEET_SALDO + '\n• ' + SHEET_RAK_SALDO + '\n'
    + '• ' + SHEET_KATEGORI + '\n• ' + SHEET_UOM + '\n• ' + SHEET_VENDOR + '\n• ' + SHEET_RAK + '\n'
    + '• ' + SHEET_ASET_ITEM + '\n• ' + SHEET_ASET_UNIT + '\n• ' + SHEET_ASET_LOG
  );
}

// ============================================================
//  v5.20 — SETUP SHEET UTK MODUL ASET SIRKULASI
//  Dipanggil dari setupSheets() supaya satu kali klik setup tetap
//  membuat SEMUA sheet (termasuk yang lama) sekaligus.
//  Aman dijalankan berulang: kalau sheet & header sudah sesuai,
//  tidak melakukan apa-apa (tidak menimpa data yang sudah diisi).
// ============================================================
function setupAsetSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- Aset_Item: jenis alat (mirip Master_Item, tapi utk barang sirkulasi) ---
  var item = ss.getSheetByName(SHEET_ASET_ITEM);
  if (!item) item = ss.insertSheet(SHEET_ASET_ITEM);
  if (String(item.getRange(1,2).getValue()).trim().toLowerCase() !== 'kode_alat') {
    item.getRange(1,1,1,18).setValues([[
      'No','Kode_Alat','Nama_Alat','Brand','Cutting_Tool','Material','Spesifikasi',
      'Mesin_Default','Kode_Mesin_Default','Berat_Kg','UOM','Rak_Penyimpanan',
      'Vendor_Asah_Default','Rata2_Pemakaian_30Hari','Lead_Time_Asah_Ratarata',
      'Safety_Stock','Reorder_Point','Min_Stock'
    ]]).setBackground('#1a3a7a').setFontColor('#ffffff').setFontWeight('bold');
    item.setFrozenRows(1);
    item.setColumnWidth(2,130);
  }

  // --- Aset_Unit: satu baris = satu unit fisik alat ---
  var unit = ss.getSheetByName(SHEET_ASET_UNIT);
  if (!unit) unit = ss.insertSheet(SHEET_ASET_UNIT);
  if (String(unit.getRange(1,1).getValue()).trim().toLowerCase() !== 'unit_id') {
    unit.getRange(1,1,1,10).setValues([[
      'Unit_ID','Kode_Alat','Tanggal_Masuk','Regrind_Count','Status_Unit',
      'Lokasi_Saat_Ini','Kode_Mesin_Saat_Ini','Last_Event','Last_Cycle_ID','Last_Update'
    ]]).setBackground('#1a7a4a').setFontColor('#ffffff').setFontWeight('bold');
    unit.setFrozenRows(1);
    unit.setColumnWidth(1,150);
  }

  // --- Aset_Movement_Log: satu baris = satu event pergerakan unit (append-only) ---
  var log = ss.getSheetByName(SHEET_ASET_LOG);
  if (!log) log = ss.insertSheet(SHEET_ASET_LOG);
  if (String(log.getRange(1,2).getValue()).trim().toLowerCase() !== 'kode_alat') {
    log.getRange(1,1,1,12).setValues([[
      'Timestamp','Kode_Alat','Unit_ID','ID_Transaksi','Activity','Qty',
      'Cycle_ID','Counter','Kode_Mesin','Vendor','PIC','Keterangan'
    ]]).setBackground('#7a1a4a').setFontColor('#ffffff').setFontWeight('bold');
    log.setFrozenRows(1);
  }

  return { item: item, unit: unit, log: log };
}

// ============================================================
//  v5.20 — HELPER: generate Unit_ID berikutnya utk satu Kode_Alat
//  Format: {Kode_Alat}-{nomor urut 3 digit}, mis. Hau-SB-02-014
//  Dipanggil DI DALAM lock (lihat addAsetUnit) supaya tidak ada
//  2 request yang dapat nomor urut sama saat bersamaan.
// ============================================================
function generateAsetUnitId_(kodeAlat) {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var sh   = ss.getSheetByName(SHEET_ASET_UNIT);
  var last = sh.getLastRow();
  var maxNum = 0;
  if (last >= 2) {
    var rows = sh.getRange(2, 1, last - 1, 2).getValues(); // Unit_ID, Kode_Alat
    var prefix = String(kodeAlat).trim() + '-';
    rows.forEach(function(r) {
      var unitId = String(r[0] || '').trim();
      var kode   = String(r[1] || '').trim();
      if (kode !== String(kodeAlat).trim()) return;
      if (unitId.indexOf(prefix) !== 0) return;
      var suffix = unitId.slice(prefix.length);
      var n = parseInt(suffix, 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    });
  }
  return String(kodeAlat).trim() + '-' + String(maxNum + 1).padStart(3, '0');
}

// ============================================================
//  v5.20 — HELPER: generate ID_Transaksi berikutnya utk Aset_Movement_Log
//  (nomor urut global, sederhana: lastRow-1 sheet log + 1). Dipanggil
//  DI DALAM lock yang sama dengan appendRow-nya (lihat addAsetUnit /
//  recordAsetMovement nanti) supaya tidak dobel.
// ============================================================
function generateAsetLogTrxId_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_ASET_LOG);
  var last = sh.getLastRow();
  return last < 2 ? 1 : last; // header di baris 1, jadi lastRow==baris data terakhir+1 == qty data + 1
}

// ============================================================
//  v5.20 — ADD ASET ITEM (jenis alat baru, mis. "Hau-SB-02")
//  body: { kodeAlat, namaAlat, brand, cuttingTool, material, spesifikasi,
//          mesinDefault, kodeMesinDefault, beratKg, uom, rakPenyimpanan,
//          vendorAsahDefault, safetyStock, reorderPoint, minStock }
// ============================================================
function addAsetItem(body) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SHEET_ASET_ITEM);
    if (!sh) return { status:'error', message:'Sheet ' + SHEET_ASET_ITEM + ' tidak ditemukan. Jalankan setupAsetSheets() dulu.' };

    var kodeAlat = String(body.kodeAlat || '').trim();
    if (!kodeAlat) return { status:'error', message:'Kode_Alat wajib diisi' };

    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(15000);
    } catch (e) {
      return { status:'error', message:'Server sibuk. Coba lagi sebentar.' };
    }
    try {
      // cek duplikat Kode_Alat
      var last = sh.getLastRow();
      if (last >= 2) {
        var existing = sh.getRange(2, COL_ASET_ITEM.KODE_ALAT + 1, last - 1, 1).getValues();
        for (var i = 0; i < existing.length; i++) {
          if (String(existing[i][0] || '').trim() === kodeAlat) {
            return { status:'error', message:'Kode_Alat "' + kodeAlat + '" sudah ada di ' + SHEET_ASET_ITEM };
          }
        }
      }
      var newNo = last < 2 ? 1 : last;
      var rowData = [
        newNo, kodeAlat,
        String(body.namaAlat || ''), String(body.brand || ''),
        String(body.cuttingTool || ''), String(body.material || ''),
        String(body.spesifikasi || ''), String(body.mesinDefault || ''),
        String(body.kodeMesinDefault || ''), parseFloat(body.beratKg) || 0,
        String(body.uom || 'Pcs'), String(body.rakPenyimpanan || ''),
        String(body.vendorAsahDefault || ''), 0, 0, // Rata2_Pemakaian & Lead_Time_Asah dihitung nanti, bukan diinput manual
        parseFloat(body.safetyStock) || 0, parseFloat(body.reorderPoint) || 0,
        parseFloat(body.minStock) || 0
      ];
      sh.appendRow(rowData);
      SpreadsheetApp.flush();
    } finally {
      try { lock.releaseLock(); } catch (e) {}
    }

    return { status:'ok', kodeAlat: kodeAlat };
  } catch (err) {
    return { status:'error', message:'addAsetItem error: ' + err.message };
  }
}

// ============================================================
//  v5.20 — ADD ASET UNIT (tambah unit fisik baru utk satu Kode_Alat,
//  mis. beli 5 saw blade baru dari jenis yg sudah terdaftar)
//  body: { kodeAlat, jumlah, tanggalMasuk, admin, verifiedAdmin }
//  Efek: N baris baru di Aset_Unit (Status_Unit=GUDANG) + N baris
//  event PEMBELIAN_BARU di Aset_Movement_Log (Counter=1, Cycle_ID=...-01)
// ============================================================
function addAsetUnit(body) {
  try {
    var ss       = SpreadsheetApp.getActiveSpreadsheet();
    var shUnit   = ss.getSheetByName(SHEET_ASET_UNIT);
    var shItem   = ss.getSheetByName(SHEET_ASET_ITEM);
    var shLog    = ss.getSheetByName(SHEET_ASET_LOG);
    if (!shUnit || !shItem || !shLog) {
      return { status:'error', message:'Sheet aset belum lengkap. Jalankan setupAsetSheets() dulu.' };
    }

    var kodeAlat = String(body.kodeAlat || '').trim();
    var jumlah   = parseInt(body.jumlah, 10) || 0;
    if (!kodeAlat) return { status:'error', message:'Kode_Alat wajib diisi' };
    if (jumlah < 1) return { status:'error', message:'Jumlah unit harus minimal 1' };

    // validasi Kode_Alat harus sudah terdaftar di Aset_Item (foreign key check)
    var lastItem = shItem.getLastRow();
    var itemAda = false;
    if (lastItem >= 2) {
      var kodeCol = shItem.getRange(2, COL_ASET_ITEM.KODE_ALAT + 1, lastItem - 1, 1).getValues();
      for (var i = 0; i < kodeCol.length; i++) {
        if (String(kodeCol[i][0] || '').trim() === kodeAlat) { itemAda = true; break; }
      }
    }
    if (!itemAda) return { status:'error', message:'Kode_Alat "' + kodeAlat + '" belum terdaftar di ' + SHEET_ASET_ITEM + '. Tambahkan lewat addAsetItem dulu.' };

    var admin = body.verifiedAdmin || body.admin || 'Admin';
    var tanggalMasuk = body.tanggalMasuk ? new Date(body.tanggalMasuk) : new Date();
    var now = new Date();

    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(15000);
    } catch (e) {
      return { status:'error', message:'Server sibuk memproses penambahan unit lain. Coba lagi sebentar.' };
    }

    var createdUnitIds = [];
    try {
      var unitRows = [];
      var logRows  = [];
      var nextTrxId = generateAsetLogTrxId_();

      for (var n = 0; n < jumlah; n++) {
        var unitId = generateAsetUnitId_(kodeAlat);
        var cycleId = unitId + '-01';

        unitRows.push([
          unitId, kodeAlat, tanggalMasuk, 0, ASET_STATUS.GUDANG,
          'GUDANG', '', 'PEMBELIAN_BARU', cycleId, now
        ]);
        logRows.push([
          now, kodeAlat, unitId, nextTrxId, 'PEMBELIAN_BARU', 1,
          cycleId, 1, '', '', admin, 'Unit baru ditambahkan'
        ]);

        createdUnitIds.push(unitId);
        // penting: appendRow unitRows dulu satu-satu di dalam loop TIDAK kita lakukan --
        // generateAsetUnitId_ scan sheet secara langsung, jadi kalau belum ke-append,
        // unit berikutnya bisa dapat nomor yg sama. Makanya kita append tiap unit
        // SEGERA (bukan batch di akhir loop) supaya scan berikutnya melihatnya.
        shUnit.appendRow(unitRows[unitRows.length - 1]);
        nextTrxId += 1;
      }
      // log ditulis sebagai batch di akhir (append-only, urutan tidak kritikal utk generateAsetUnitId_)
      if (logRows.length) {
        shLog.getRange(shLog.getLastRow() + 1, 1, logRows.length, logRows[0].length).setValues(logRows);
      }
      SpreadsheetApp.flush();
    } finally {
      try { lock.releaseLock(); } catch (e) {}
    }

    return { status:'ok', kodeAlat: kodeAlat, unitIds: createdUnitIds, jumlah: createdUnitIds.length };
  } catch (err) {
    return { status:'error', message:'addAsetUnit error: ' + err.message };
  }
}

// ============================================================
//  v5.20 — HELPER: cari baris unit di Aset_Unit berdasarkan Unit_ID
//  Return null kalau tidak ketemu, atau { rowNumber, values } (rowNumber = 1-based, sesuai sheet)
// ============================================================
function findAsetUnitRow_(unitId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_ASET_UNIT);
  var last = sh.getLastRow();
  if (last < 2) return null;
  var data = sh.getRange(2, 1, last - 1, 10).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][COL_ASET_UNIT.UNIT_ID] || '').trim() === String(unitId).trim()) {
      return { rowNumber: i + 2, values: data[i] };
    }
  }
  return null;
}

// ============================================================
//  v5.20 — HELPER: ambil nomor counter siklus asah dari Cycle_ID
//  mis. "Hau-SB-02-006-02" -> 2. Default 1 kalau format tidak cocok
//  (mis. unit lama/data belum lengkap).
// ============================================================
function parseCounterFromCycleId_(cycleId) {
  var m = String(cycleId || '').match(/-(\d+)$/);
  return m ? parseInt(m[1], 10) : 1;
}

// ============================================================
//  v5.20 — RECORD ASET MOVEMENT (inti logika: validasi state machine
//  + update Aset_Unit + append Aset_Movement_Log)
//  body: { unitId, activity, kodeMesin, vendor, keterangan, admin, verifiedAdmin }
//
//  Aturan lock: pakai LockService.getScriptLock() utk SELURUH fungsi
//  (bukan per-unit) -- konsisten dgn addAsetItem/addAsetUnit, dan
//  frekuensi transaksi aset jauh lebih rendah dari Transaksi_Log utama
//  jadi lock global di sini tidak jadi bottleneck.
// ============================================================
function recordAsetMovement(body) {
  try {
    var ss    = SpreadsheetApp.getActiveSpreadsheet();
    var shUnit = ss.getSheetByName(SHEET_ASET_UNIT);
    var shLog  = ss.getSheetByName(SHEET_ASET_LOG);
    if (!shUnit || !shLog) return { status:'error', message:'Sheet aset belum lengkap. Jalankan setupAsetSheets() dulu.' };

    var unitId   = String(body.unitId || '').trim();
    var activity = String(body.activity || '').trim();
    if (!unitId)   return { status:'error', message:'unitId wajib diisi' };
    if (!activity) return { status:'error', message:'activity wajib diisi' };

    var rule = ASET_TRANSITION_RULES[activity];
    if (!rule) return { status:'error', message:'Activity "' + activity + '" tidak dikenal. Activity yang sah: ' + Object.keys(ASET_TRANSITION_RULES).join(', ') };

    var admin = body.verifiedAdmin || body.admin || 'Admin';

    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(15000);
    } catch (e) {
      return { status:'error', message:'Server sibuk memproses transaksi aset lain. Coba lagi sebentar.' };
    }

    try {
      var found = findAsetUnitRow_(unitId);
      if (!found) return { status:'error', message:'Unit_ID "' + unitId + '" tidak ditemukan di ' + SHEET_ASET_UNIT };

      var row = found.values;
      var currentStatus = String(row[COL_ASET_UNIT.STATUS_UNIT] || '').trim();
      var currentLokasi = String(row[COL_ASET_UNIT.LOKASI_SAAT_INI] || '').trim();
      var currentCycleId = String(row[COL_ASET_UNIT.LAST_CYCLE_ID] || '').trim();
      var currentRegrind = parseInt(row[COL_ASET_UNIT.REGRIND_COUNT], 10) || 0;
      var kodeAlat = String(row[COL_ASET_UNIT.KODE_ALAT] || '').trim();

      // --- validasi transisi state machine ---
      if (activity === ASET_ACTIVITY.SCRAP_RUSAK) {
        if (currentStatus === ASET_STATUS.SCRAP) {
          return { status:'error', message:'Unit ' + unitId + ' sudah berstatus SCRAP sebelumnya.' };
        }
      } else if (activity === ASET_ACTIVITY.KARAT) {
        // selalu valid, hanya flag -- tidak ada pengecekan status
      } else {
        if (rule.validFrom.indexOf(currentStatus) === -1) {
          return { status:'error', message:
            'Tidak bisa melakukan "' + activity + '" pada unit ' + unitId +
            ' karena status saat ini adalah ' + currentStatus +
            ' (butuh salah satu dari: ' + rule.validFrom.join(', ') + ').' };
        }
      }

      // --- tentukan Cycle_ID & Counter baru ---
      var currentCounter = parseCounterFromCycleId_(currentCycleId);
      var newCounter, newCycleId;
      if (activity === ASET_ACTIVITY.KEMBALI_KE_GUDANG_TUMPUL) {
        newCounter = currentCounter + 1; // siklus asah baru dimulai
        newCycleId = unitId + '-' + String(newCounter).padStart(2, '0');
      } else {
        newCounter = currentCounter;
        newCycleId = currentCycleId || (unitId + '-01');
      }

      // --- tentukan status/lokasi/kode mesin baru ---
      var newStatus = rule.toStatus !== null ? rule.toStatus : currentStatus;
      var newLokasi = rule.toLokasi !== null ? rule.toLokasi : currentLokasi;
      var newKodeMesin = (newLokasi === 'MESIN') ? String(body.kodeMesin || '') : '';
      var newRegrind = currentRegrind + (activity === ASET_ACTIVITY.SELESAI_DIASAH ? 1 : 0);
      var now = new Date();

      // --- update baris di Aset_Unit ---
      shUnit.getRange(found.rowNumber, COL_ASET_UNIT.REGRIND_COUNT + 1, 1, 7).setValues([[
        newRegrind, newStatus, newLokasi, newKodeMesin, activity, newCycleId, now
      ]]);

      // --- append baris ke Aset_Movement_Log ---
      var trxId = generateAsetLogTrxId_();
      shLog.appendRow([
        now, kodeAlat, unitId, trxId, activity, 1,
        newCycleId, newCounter, String(body.kodeMesin || ''), String(body.vendor || ''),
        admin, String(body.keterangan || '')
      ]);

      SpreadsheetApp.flush();

      return {
        status:'ok', unitId: unitId, activity: activity,
        statusSebelum: currentStatus, statusSesudah: newStatus,
        lokasiSesudah: newLokasi, cycleId: newCycleId, counter: newCounter
      };
    } finally {
      try { lock.releaseLock(); } catch (e) {}
    }
  } catch (err) {
    return { status:'error', message:'recordAsetMovement error: ' + err.message };
  }
}

// ============================================================
//  v5.20 — HELPER: hitung status kondisi stok (AMAN/KRITIS/HABIS)
//  berdasarkan qty siap pakai vs safety stock. Dihitung on-demand
//  setiap request, TIDAK disimpan sbg kolom statis di sheet manapun,
//  supaya tidak pernah basi (lihat desain §4).
// ============================================================
function computeStatusKondisi(siapPakai, safetyStock) {
  if (siapPakai <= 0) return 'HABIS';
  if (siapPakai < safetyStock) return 'KRITIS';
  return 'AMAN';
}

// ============================================================
//  v5.20 — HELPER: scan Aset_Unit sekali, hasilkan agregat per Kode_Alat
//  { kodeAlat: { total, gudang, dipakai, tumpul, diasah, scrap } }
//  Dipakai bersama oleh getAsetItemList() & getAsetDashboard() supaya
//  tidak scan sheet yang sama 2x dalam 1 request.
// ============================================================
function getAsetUnitAggregates_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_ASET_UNIT);
  var agg = {};
  if (!sh) return agg;
  var last = sh.getLastRow();
  if (last < 2) return agg;

  var rows = sh.getRange(2, 1, last - 1, 10).getValues();
  rows.forEach(function(r) {
    var kodeAlat = String(r[COL_ASET_UNIT.KODE_ALAT] || '').trim();
    if (!kodeAlat) return;
    var status = String(r[COL_ASET_UNIT.STATUS_UNIT] || '').trim();
    if (!agg[kodeAlat]) agg[kodeAlat] = { total:0, gudang:0, dipakai:0, tumpul:0, diasah:0, scrap:0 };
    agg[kodeAlat].total++;
    if (status === ASET_STATUS.GUDANG)  agg[kodeAlat].gudang++;
    else if (status === ASET_STATUS.DIPAKAI) agg[kodeAlat].dipakai++;
    else if (status === ASET_STATUS.TUMPUL)  agg[kodeAlat].tumpul++;
    else if (status === ASET_STATUS.DIASAH)  agg[kodeAlat].diasah++;
    else if (status === ASET_STATUS.SCRAP)   agg[kodeAlat].scrap++;
  });
  return agg;
}

// ============================================================
//  v5.20 — GET ASET ITEM LIST (dashboard per jenis alat + status kondisi)
//  Return: daftar jenis alat, tiap baris sudah dilengkapi agregat
//  qty per status + status kondisi (AMAN/KRITIS/HABIS).
// ============================================================
function getAsetItemList() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SHEET_ASET_ITEM);
    if (!sh) return { status:'error', message:'Sheet ' + SHEET_ASET_ITEM + ' tidak ditemukan.' };

    var last = sh.getLastRow();
    var agg = getAsetUnitAggregates_();
    var list = [];
    if (last >= 2) {
      var rows = sh.getRange(2, 1, last - 1, 18).getValues();
      rows.forEach(function(r) {
        var kodeAlat = String(r[COL_ASET_ITEM.KODE_ALAT] || '').trim();
        if (!kodeAlat) return;
        var a = agg[kodeAlat] || { total:0, gudang:0, dipakai:0, tumpul:0, diasah:0, scrap:0 };
        var safetyStock = parseFloat(r[COL_ASET_ITEM.SAFETY_STOCK]) || 0;
        list.push({
          kodeAlat: kodeAlat,
          namaAlat: String(r[COL_ASET_ITEM.NAMA_ALAT] || ''),
          brand: String(r[COL_ASET_ITEM.BRAND] || ''),
          cuttingTool: String(r[COL_ASET_ITEM.CUTTING_TOOL] || ''),
          material: String(r[COL_ASET_ITEM.MATERIAL] || ''),
          spesifikasi: String(r[COL_ASET_ITEM.SPESIFIKASI] || ''),
          mesinDefault: String(r[COL_ASET_ITEM.MESIN_DEFAULT] || ''),
          rakPenyimpanan: String(r[COL_ASET_ITEM.RAK_PENYIMPANAN] || ''),
          vendorAsahDefault: String(r[COL_ASET_ITEM.VENDOR_ASAH_DEFAULT] || ''),
          safetyStock: safetyStock,
          reorderPoint: parseFloat(r[COL_ASET_ITEM.REORDER_POINT]) || 0,
          totalUnit: a.total,
          siapPakai: a.gudang,
          sedangDipakai: a.dipakai,
          menungguAsah: a.tumpul,
          sedangDiasah: a.diasah,
          scrap: a.scrap,
          statusKondisi: computeStatusKondisi(a.gudang, safetyStock)
        });
      });
    }
    return { status:'ok', data: list };
  } catch (err) {
    return { status:'error', message:'getAsetItemList error: ' + err.message };
  }
}

// ============================================================
//  v5.20 — GET ASET UNIT LIST (semua unit fisik utk satu Kode_Alat)
// ============================================================
function getAsetUnitList(kodeAlat) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SHEET_ASET_UNIT);
    if (!sh) return { status:'error', message:'Sheet ' + SHEET_ASET_UNIT + ' tidak ditemukan.' };

    var kode = String(kodeAlat || '').trim();
    var last = sh.getLastRow();
    var list = [];
    if (last >= 2) {
      var rows = sh.getRange(2, 1, last - 1, 10).getValues();
      rows.forEach(function(r) {
        if (kode && String(r[COL_ASET_UNIT.KODE_ALAT] || '').trim() !== kode) return;
        list.push({
          unitId: String(r[COL_ASET_UNIT.UNIT_ID] || ''),
          kodeAlat: String(r[COL_ASET_UNIT.KODE_ALAT] || ''),
          tanggalMasuk: r[COL_ASET_UNIT.TANGGAL_MASUK],
          regrindCount: parseInt(r[COL_ASET_UNIT.REGRIND_COUNT], 10) || 0,
          statusUnit: String(r[COL_ASET_UNIT.STATUS_UNIT] || ''),
          lokasiSaatIni: String(r[COL_ASET_UNIT.LOKASI_SAAT_INI] || ''),
          kodeMesinSaatIni: String(r[COL_ASET_UNIT.KODE_MESIN_SAAT_INI] || ''),
          lastEvent: String(r[COL_ASET_UNIT.LAST_EVENT] || ''),
          lastCycleId: String(r[COL_ASET_UNIT.LAST_CYCLE_ID] || ''),
          lastUpdate: r[COL_ASET_UNIT.LAST_UPDATE]
        });
      });
    }
    return { status:'ok', data: list };
  } catch (err) {
    return { status:'error', message:'getAsetUnitList error: ' + err.message };
  }
}

// ============================================================
//  v5.20 — GET ASET UNIT BY ID (detail satu unit)
// ============================================================
function getAsetUnitById(unitId) {
  try {
    var found = findAsetUnitRow_(unitId);
    if (!found) return { status:'error', message:'Unit_ID "' + unitId + '" tidak ditemukan.' };
    var r = found.values;
    return { status:'ok', data: {
      unitId: String(r[COL_ASET_UNIT.UNIT_ID] || ''),
      kodeAlat: String(r[COL_ASET_UNIT.KODE_ALAT] || ''),
      tanggalMasuk: r[COL_ASET_UNIT.TANGGAL_MASUK],
      regrindCount: parseInt(r[COL_ASET_UNIT.REGRIND_COUNT], 10) || 0,
      statusUnit: String(r[COL_ASET_UNIT.STATUS_UNIT] || ''),
      lokasiSaatIni: String(r[COL_ASET_UNIT.LOKASI_SAAT_INI] || ''),
      kodeMesinSaatIni: String(r[COL_ASET_UNIT.KODE_MESIN_SAAT_INI] || ''),
      lastEvent: String(r[COL_ASET_UNIT.LAST_EVENT] || ''),
      lastCycleId: String(r[COL_ASET_UNIT.LAST_CYCLE_ID] || ''),
      lastUpdate: r[COL_ASET_UNIT.LAST_UPDATE]
    }};
  } catch (err) {
    return { status:'error', message:'getAsetUnitById error: ' + err.message };
  }
}

// ============================================================
//  v5.20 — GET ASET MOVEMENT LOG (riwayat pergerakan 1 unit, terbaru dulu)
//  limit: opsional, default 50
// ============================================================
function getAsetMovementLog(unitId, limit) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SHEET_ASET_LOG);
    if (!sh) return { status:'error', message:'Sheet ' + SHEET_ASET_LOG + ' tidak ditemukan.' };

    var kode = String(unitId || '').trim();
    var last = sh.getLastRow();
    var list = [];
    if (last >= 2) {
      var rows = sh.getRange(2, 1, last - 1, 12).getValues();
      rows.forEach(function(r) {
        if (kode && String(r[COL_ASET_LOG.UNIT_ID] || '').trim() !== kode) return;
        list.push({
          timestamp: r[COL_ASET_LOG.TIMESTAMP],
          kodeAlat: String(r[COL_ASET_LOG.KODE_ALAT] || ''),
          unitId: String(r[COL_ASET_LOG.UNIT_ID] || ''),
          idTransaksi: r[COL_ASET_LOG.ID_TRANSAKSI],
          activity: String(r[COL_ASET_LOG.ACTIVITY] || ''),
          cycleId: String(r[COL_ASET_LOG.CYCLE_ID] || ''),
          counter: parseInt(r[COL_ASET_LOG.COUNTER], 10) || 0,
          kodeMesin: String(r[COL_ASET_LOG.KODE_MESIN] || ''),
          vendor: String(r[COL_ASET_LOG.VENDOR] || ''),
          pic: String(r[COL_ASET_LOG.PIC] || ''),
          keterangan: String(r[COL_ASET_LOG.KETERANGAN] || '')
        });
      });
    }
    // terbaru dulu
    list.sort(function(a, b) { return new Date(b.timestamp) - new Date(a.timestamp); });
    var lim = parseInt(limit, 10) || 50;
    return { status:'ok', data: list.slice(0, lim) };
  } catch (err) {
    return { status:'error', message:'getAsetMovementLog error: ' + err.message };
  }
}

// ============================================================
//  v5.20 — GET ASET DASHBOARD (KPI global, setara "KPI CUTTING TOOL"
//  di contoh referensi: total, siap pakai, dipakai, tunggu asah,
//  diasah, + jumlah item berstatus kritis/habis)
// ============================================================
function getAsetDashboard() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var shItem = ss.getSheetByName(SHEET_ASET_ITEM);
    if (!shItem) return { status:'error', message:'Sheet ' + SHEET_ASET_ITEM + ' tidak ditemukan.' };

    var agg = getAsetUnitAggregates_();
    var totalUnit=0, siapPakai=0, dipakai=0, tungguAsah=0, diasah=0, scrap=0;
    var jumlahKritisHabis = 0;

    var last = shItem.getLastRow();
    if (last >= 2) {
      var rows = shItem.getRange(2, 1, last - 1, 18).getValues();
      rows.forEach(function(r) {
        var kodeAlat = String(r[COL_ASET_ITEM.KODE_ALAT] || '').trim();
        if (!kodeAlat) return;
        var a = agg[kodeAlat] || { total:0, gudang:0, dipakai:0, tumpul:0, diasah:0, scrap:0 };
        var safetyStock = parseFloat(r[COL_ASET_ITEM.SAFETY_STOCK]) || 0;
        totalUnit += a.total; siapPakai += a.gudang; dipakai += a.dipakai;
        tungguAsah += a.tumpul; diasah += a.diasah; scrap += a.scrap;
        var status = computeStatusKondisi(a.gudang, safetyStock);
        if (status === 'KRITIS' || status === 'HABIS') jumlahKritisHabis++;
      });
    }

    return { status:'ok', data:{
      totalUnit: totalUnit, siapPakai: siapPakai, sedangDipakai: dipakai,
      menungguAsah: tungguAsah, sedangDiasah: diasah, scrap: scrap,
      itemButuhPerhatian: jumlahKritisHabis
    }};
  } catch (err) {
    return { status:'error', message:'getAsetDashboard error: ' + err.message };
  }
}

// ============================================================
//  v5.20 — HELPER: kelompokkan Aset_Movement_Log per Cycle_ID
//  jadi "siklus asah" (view terhitung, TIDAK disimpan sbg sheet
//  fisik -- lihat desain §1.4, supaya tidak ada data yg desync dari log).
//  kodeAlatFilter opsional: kalau diisi, hanya siklus milik Kode_Alat itu.
// ============================================================
function getAsetKontrolAsahCycles_(kodeAlatFilter) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_ASET_LOG);
  var cycles = {}; // Cycle_ID -> { kodeAlat, unitId, tglTumpul, tglKirim, vendor, tglTerima }
  if (!sh) return [];
  var last = sh.getLastRow();
  if (last < 2) return [];

  var kode = String(kodeAlatFilter || '').trim();
  var rows = sh.getRange(2, 1, last - 1, 12).getValues();
  rows.forEach(function(r) {
    var cycleId = String(r[COL_ASET_LOG.CYCLE_ID] || '').trim();
    if (!cycleId) return;
    var kodeAlat = String(r[COL_ASET_LOG.KODE_ALAT] || '').trim();
    if (kode && kodeAlat !== kode) return;

    if (!cycles[cycleId]) {
      cycles[cycleId] = {
        cycleId: cycleId, kodeAlat: kodeAlat, unitId: String(r[COL_ASET_LOG.UNIT_ID] || ''),
        counter: parseInt(r[COL_ASET_LOG.COUNTER], 10) || 0,
        tglTumpul: null, tglKirim: null, vendor: '', tglTerima: null
      };
    }
    var activity = String(r[COL_ASET_LOG.ACTIVITY] || '').trim();
    var ts = r[COL_ASET_LOG.TIMESTAMP] ? new Date(r[COL_ASET_LOG.TIMESTAMP]) : null;

    if (activity === ASET_ACTIVITY.KEMBALI_KE_GUDANG_TUMPUL) {
      cycles[cycleId].tglTumpul = ts;
    } else if (activity === ASET_ACTIVITY.KIRIM_KE_VENDOR_ASAH) {
      cycles[cycleId].tglKirim = ts;
      cycles[cycleId].vendor = String(r[COL_ASET_LOG.VENDOR] || '');
    } else if (activity === ASET_ACTIVITY.SELESAI_DIASAH) {
      cycles[cycleId].tglTerima = ts;
    }
  });

  return Object.keys(cycles).map(function(k) { return cycles[k]; });
}

// ============================================================
//  v5.20 — GET KONTROL ASAH (analitik lead time per siklus asah,
//  setara sheet "Kontrol Asah" di contoh referensi)
//  kodeAlat: opsional, filter satu jenis alat saja.
// ============================================================
function getKontrolAsah(kodeAlat) {
  try {
    var cycles = getAsetKontrolAsahCycles_(kodeAlat);
    var MS_PER_DAY = 1000 * 60 * 60 * 24;

    var list = cycles
      .filter(function(c) { return c.tglTumpul; }) // siklus baru terhitung kalau sudah pernah TUMPUL
      .map(function(c) {
        var leadTimeTunggu = (c.tglKirim && c.tglTumpul)
          ? Math.round(((c.tglKirim - c.tglTumpul) / MS_PER_DAY) * 100) / 100 : null;
        var leadTimeAsah = (c.tglTerima && c.tglKirim)
          ? Math.round(((c.tglTerima - c.tglKirim) / MS_PER_DAY) * 100) / 100 : null;

        var statusAsah;
        if (c.tglTerima) statusAsah = 'SELESAI';
        else if (c.tglKirim) statusAsah = 'PROSES_ASAH';
        else statusAsah = 'MENUNGGU_KIRIM';

        return {
          kodeAlat: c.kodeAlat, unitId: c.unitId, cycleId: c.cycleId, counter: c.counter,
          tglMasukGudangTumpul: c.tglTumpul, tglKirimVendor: c.tglKirim,
          leadTimeTunggu: leadTimeTunggu, vendor: c.vendor,
          tglTerimaAsah: c.tglTerima, leadTimeAsah: leadTimeAsah, statusAsah: statusAsah
        };
      })
      .sort(function(a, b) { return new Date(b.tglMasukGudangTumpul) - new Date(a.tglMasukGudangTumpul); });

    return { status:'ok', data: list };
  } catch (err) {
    return { status:'error', message:'getKontrolAsah error: ' + err.message };
  }
}

// ============================================================
//  v5.20 — GET PERFORMA VENDOR (rata-rata & maksimum lead time asah
//  per vendor, setara sheet "Performa Vendor" di contoh referensi)
// ============================================================
function getAsetPerformaVendor() {
  try {
    var cycles = getAsetKontrolAsahCycles_(null);
    var MS_PER_DAY = 1000 * 60 * 60 * 24;
    var byVendor = {}; // vendor -> { leadTimes: [] }

    cycles.forEach(function(c) {
      if (!c.vendor || !c.tglKirim || !c.tglTerima) return; // hanya siklus yg sudah SELESAI dihitung
      var lt = (c.tglTerima - c.tglKirim) / MS_PER_DAY;
      if (!byVendor[c.vendor]) byVendor[c.vendor] = [];
      byVendor[c.vendor].push(lt);
    });

    var list = Object.keys(byVendor).map(function(vendor) {
      var arr = byVendor[vendor];
      var avg = arr.reduce(function(a, b) { return a + b; }, 0) / arr.length;
      var max = Math.max.apply(null, arr);
      return {
        vendor: vendor, jumlahSiklusSelesai: arr.length,
        leadTimeRataRata: Math.round(avg * 100) / 100,
        leadTimeMaksimum: Math.round(max * 100) / 100,
        selisihTelat: Math.round((max - avg) * 100) / 100
      };
    }).sort(function(a, b) { return b.leadTimeRataRata - a.leadTimeRataRata; });

    return { status:'ok', data: list };
  } catch (err) {
    return { status:'error', message:'getAsetPerformaVendor error: ' + err.message };
  }
}

// ============================================================
//  v5.20 — GET ASET ELIGIBLE UNITS (satu sumber kebenaran utk flow
//  "Catat Pergerakan" di frontend: kasih HANYA unit yang statusnya
//  valid utk aksi tertentu, pakai ASET_TRANSITION_RULES yang SAMA
//  dengan yang dipakai recordAsetMovement() -- supaya aturan tidak
//  pernah ditulis dobel/desync antara frontend & backend.)
//
//  kodeAlat: wajib
//  activity: wajib, salah satu dari ASET_ACTIVITY
// ============================================================
function getAsetEligibleUnits(kodeAlat, activity) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SHEET_ASET_UNIT);
    if (!sh) return { status:'error', message:'Sheet ' + SHEET_ASET_UNIT + ' tidak ditemukan.' };

    var kode = String(kodeAlat || '').trim();
    var act  = String(activity || '').trim();
    if (!kode) return { status:'error', message:'kodeAlat wajib diisi' };
    if (!act)  return { status:'error', message:'activity wajib diisi' };

    var rule = ASET_TRANSITION_RULES[act];
    if (!rule) return { status:'error', message:'Activity "' + act + '" tidak dikenal. Activity yang sah: ' + Object.keys(ASET_TRANSITION_RULES).join(', ') };

    // fungsi cek 1 unit valid utk aksi ini, PERSIS sama aturan yg dipakai recordAsetMovement()
    function isEligible(statusUnit) {
      if (act === ASET_ACTIVITY.SCRAP_RUSAK) return statusUnit !== ASET_STATUS.SCRAP;
      if (act === ASET_ACTIVITY.KARAT) return true; // selalu boleh, flag saja
      return rule.validFrom.indexOf(statusUnit) !== -1;
    }

    var last = sh.getLastRow();
    var list = [];
    if (last >= 2) {
      var rows = sh.getRange(2, 1, last - 1, 10).getValues();
      rows.forEach(function(r) {
        if (String(r[COL_ASET_UNIT.KODE_ALAT] || '').trim() !== kode) return;
        var statusUnit = String(r[COL_ASET_UNIT.STATUS_UNIT] || '').trim();
        if (!isEligible(statusUnit)) return;
        list.push({
          unitId: String(r[COL_ASET_UNIT.UNIT_ID] || ''),
          statusUnit: statusUnit,
          lokasiSaatIni: String(r[COL_ASET_UNIT.LOKASI_SAAT_INI] || ''),
          regrindCount: parseInt(r[COL_ASET_UNIT.REGRIND_COUNT], 10) || 0,
          lastCycleId: String(r[COL_ASET_UNIT.LAST_CYCLE_ID] || ''),
          lastUpdate: r[COL_ASET_UNIT.LAST_UPDATE]
        });
      });
    }

    // unit yg paling lama idle di status itu ditaruh duluan (FIFO) -- lebih adil dipakai duluan
    list.sort(function(a, b) { return new Date(a.lastUpdate) - new Date(b.lastUpdate); });

    return { status:'ok', data: list };
  } catch (err) {
    return { status:'error', message:'getAsetEligibleUnits error: ' + err.message };
  }
}

// ============================================================
//  MIGRASI 1x: skema lama (Vendor/PO/Tanggal/RAK/Qty nempel di
//  Master_Item) -> skema baru (semua itu jadi transaksi MASUK
//  awal di Transaksi_Log, Master_Item dirampingkan jadi identitas).
//
//  JALANKAN SEKALI SAJA. Guard: kalau Master_Item sudah 9 kolom
//  (skema baru), migrasi dibatalkan otomatis (mencegah dobel-jalan).
// ============================================================
function migrateToMultiRakSchema() {
  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var master = ss.getSheetByName(SHEET_MASTER);
  if (!master) { SpreadsheetApp.getUi().alert('❌ Sheet Master_Item tidak ditemukan.'); return; }

  var lastCol = master.getLastColumn();
  var header7 = String(master.getRange(1,7).getValue()).trim().toLowerCase();
  if (lastCol <= 9 && header7 !== 'vendor') {
    SpreadsheetApp.getUi().alert('ℹ️ Master_Item sudah dalam skema baru (9 kolom). Migrasi dibatalkan (mencegah dobel-jalan).');
    return;
  }

  var lastRow = master.getLastRow();
  if (lastRow < 2) { SpreadsheetApp.getUi().alert('ℹ️ Master_Item kosong, tidak ada yang perlu dimigrasikan.'); return; }

  // Header lama (14 kolom): No,ID,Nama,Spec,User,BC,Vendor,PO,Date,RAK,QtyIn,Unit,Kategori,MinStock
  var oldData = master.getRange(2,1,lastRow-1,14).getValues();

  var trx = ss.getSheetByName(SHEET_TRANSAKSI);
  if (!trx) trx = ss.insertSheet(SHEET_TRANSAKSI);
  trx.getRange(1,1,1,13).setValues([[
    'Timestamp','ID_Item','Nama_Item','Spesifikasi','Jenis','Qty',
    'RAK','Vendor','No_Referensi','Saldo_Sebelum','Saldo_Sesudah','Keterangan','Admin'
  ]]).setBackground('#1a3a7a').setFontColor('#ffffff').setFontWeight('bold');
  trx.setFrozenRows(1);

  var newMasterRows = [];
  var trxRowsToAppend = [];
  var migratedCount = 0;

  oldData.forEach(function(r, idx){
    var id = String(r[1]||'').trim();
    var nama = String(r[2]||'').trim();
    if (!id || !nama) return; // lewati baris kosong

    var spec=String(r[3]||''), user=String(r[4]||''), bc=String(r[5]||'');
    var vendor=String(r[6]||''), po=String(r[7]||'');
    var tglDatang = r[8];
    var rak=String(r[9]||'').trim().toUpperCase() || 'BELUM DITENTUKAN';
    var qtyIn=parseFloat(r[10])||0;
    var unit=String(r[11]||''), kategori=String(r[12]||'');
    var minStock=parseInt(r[13],10)||0;

    newMasterRows.push([idx+1, id, nama, spec, user, bc, unit, kategori, minStock]);

    if (qtyIn > 0) {
      var ts = (tglDatang instanceof Date) ? tglDatang : new Date();
      trxRowsToAppend.push([
        ts, id, nama, spec, 'MASUK', qtyIn, rak, vendor, po,
        0, qtyIn, 'Migrasi data awal (skema multi-rak v5.0)', 'System Migration'
      ]);
      migratedCount++;
    }
  });

  // Tulis transaksi migrasi dulu (SEBELUM Master_Item dirampingkan, jaga-jaga kalau gagal di tengah)
  if (trxRowsToAppend.length) {
    trx.getRange(trx.getLastRow()+1, 1, trxRowsToAppend.length, 13).setValues(trxRowsToAppend);
  }

  // Rampingkan Master_Item ke skema baru (9 kolom)
  master.clearContents();
  master.getRange(1,1,1,9).setValues([[
    'No','ID_Item','Nama Material','Spesifikasi','User','BC/Non BC','Unit','Kategori','Min_Stock'
  ]]).setBackground('#1a3a7a').setFontColor('#ffffff').setFontWeight('bold');
  master.setFrozenRows(1);
  if (newMasterRows.length) master.getRange(2,1,newMasterRows.length,9).setValues(newMasterRows);

  SpreadsheetApp.flush();

  // Rebuild Stok_Saldo & Stok_Per_Rak dari Transaksi_Log yang sudah lengkap
  recalculateAllSaldo();

  SpreadsheetApp.getUi().alert(
    '✅ Migrasi ke skema multi-rak selesai!\n• '+newMasterRows.length+' item dirampingkan ke identitas saja\n• '+migratedCount+' transaksi MASUK awal dibuat dari data lama\n• Stok_Saldo & Stok_Per_Rak sudah direbuild\n\nSilakan cek beberapa item di aplikasi utk memastikan saldo & rak tampil benar.'
  );
}

// ============================================================
//  RECALCULATE STOK_SALDO + STOK_PER_RAK (jalankan manual kalau
//  perlu rebuild ulang dari Transaksi_Log, mis. abis migrasi atau
//  kalau curiga data cache korup)
// ============================================================
// v5.4: logic inti dipisah ke recalculateAllSaldoCore() (tanpa getUi(), murni
// baca/tulis sheet + return objek hasil) supaya bisa dipanggil dari 2 tempat:
//  1) recalculateAllSaldo()    -> dijalankan manual dari editor Apps Script, tampilkan alert
//  2) apiRecalculateAllSaldo() -> dipanggil dari APLIKASI lewat tombol, return JSON
// (SpreadsheetApp.getUi() akan ERROR kalau dipanggil dari request web app / API,
// makanya tidak boleh ada di dalam core-nya.)
function recalculateAllSaldoCore() {
  var ss     = SpreadsheetApp.getActiveSpreadsheet();
  var master = ss.getSheetByName(SHEET_MASTER);
  var trx    = ss.getSheetByName(SHEET_TRANSAKSI);
  var saldo  = ss.getSheetByName(SHEET_SALDO);
  var rakSld = ss.getSheetByName(SHEET_RAK_SALDO);
  if (!master) return { ok:false, message:'Sheet Master_Item tidak ditemukan.' };
  if (!saldo) saldo = ss.insertSheet(SHEET_SALDO);
  if (!rakSld) rakSld = ss.insertSheet(SHEET_RAK_SALDO);

  var mLast = master.getLastRow();
  if (mLast < 2) return { ok:false, message:'Master_Item kosong.' };

  var mData = master.getRange(2,1,mLast-1,9).getValues();
  var items = {};
  mData.forEach(function(r){
    var id = String(r[COL_MASTER.ID]||'').trim().toUpperCase();
    if (!id) return;
    items[id] = { nama:String(r[COL_MASTER.NAMA]||''), unit:String(r[COL_MASTER.UNIT]||'') };
  });

  var totals = {};       // id -> {masuk, keluar}
  var rakTotals = {};    // "id|rak" -> {masuk, keluar}
  if (trx && trx.getLastRow() >= 2) {
    var tData = trx.getRange(2,1,trx.getLastRow()-1,7).getValues(); // s/d kolom 7 (RAK)
    tData.forEach(function(row){
      var id    = String(row[COL_TRX.ID]||'').trim().toUpperCase();
      var jenis = String(row[COL_TRX.JENIS]||'').toUpperCase();
      var qty   = parseFloat(row[COL_TRX.QTY])||0;
      var rak   = String(row[COL_TRX.RAK]||'').trim().toUpperCase();
      if (!id) return;
      if (!totals[id]) totals[id] = { masuk:0, keluar:0 };
      if (jenis==='MASUK') totals[id].masuk += qty; else if (jenis==='KELUAR') totals[id].keluar += qty;

      if (rak) {
        var key = id+'|'+rak;
        if (!rakTotals[key]) rakTotals[key] = { id:id, rak:rak, masuk:0, keluar:0 };
        if (jenis==='MASUK') rakTotals[key].masuk += qty; else if (jenis==='KELUAR') rakTotals[key].keluar += qty;
      }
    });
  }

  // Rebuild Stok_Saldo (total per item)
  var out = [];
  Object.keys(items).forEach(function(id){
    var it = items[id];
    var t  = totals[id] || { masuk:0, keluar:0 };
    out.push([id, it.nama, it.unit, t.masuk, t.keluar, t.masuk - t.keluar]);
  });
  saldo.clearContents();
  saldo.getRange(1,1,1,6).setValues([[
    'ID_Item','Nama Material','Unit','Total_Masuk','Total_Keluar','Saldo_Akhir'
  ]]).setBackground('#1a7a4a').setFontColor('#ffffff').setFontWeight('bold');
  saldo.setFrozenRows(1);
  if (out.length) saldo.getRange(2,1,out.length,6).setValues(out);

  // Rebuild Stok_Per_Rak (per lokasi)
  var rakOut = [];
  Object.keys(rakTotals).forEach(function(key){
    var t = rakTotals[key];
    rakOut.push([t.id, t.rak, t.masuk - t.keluar]);
  });
  rakSld.clearContents();
  rakSld.getRange(1,1,1,3).setValues([['ID_Item','RAK','Qty']])
    .setBackground('#7a5a1a').setFontColor('#ffffff').setFontWeight('bold');
  rakSld.setFrozenRows(1);
  if (rakOut.length) rakSld.getRange(2,1,rakOut.length,3).setValues(rakOut);

  SpreadsheetApp.flush();
  return { ok:true, itemCount: out.length, rakCount: rakOut.length };
}

// Dipakai manual dari editor Apps Script (dropdown fungsi -> Run) -- tampilkan alert di Sheets.
function recalculateAllSaldo() {
  var r = recalculateAllSaldoCore();
  if (!r.ok) { SpreadsheetApp.getUi().alert('❌ '+r.message); return; }
  SpreadsheetApp.getUi().alert('✅ Recalculate selesai!\n• '+r.itemCount+' item (Stok_Saldo)\n• '+r.rakCount+' baris rak (Stok_Per_Rak)');
}

// Dipakai dari APLIKASI (tombol Admin Database) lewat action:'adminTool', fn:'recalculateAllSaldo' -- return JSON, tanpa getUi().
function apiRecalculateAllSaldo() {
  try {
    var r = recalculateAllSaldoCore();
    if (!r.ok) return { status:'error', message: r.message };
    return { status:'ok', message:'Recalculate selesai: '+r.itemCount+' item, '+r.rakCount+' baris rak.', itemCount:r.itemCount, rakCount:r.rakCount };
  } catch(err) {
    return { status:'error', message:'apiRecalculateAllSaldo: '+err.message };
  }
}

// ============================================================
//  FIND ORPHAN ITEMS (Audit G-02) — item punya Transaksi_Log/Stok_Saldo
//  tapi TIDAK punya baris di Master_Item -- jadi "hilang" dari UI walau
//  datanya masih ada di sheet lain. Catatan: postTransaksi() sejak lama
//  sudah mewajibkan getItemById() sukses dulu sebelum simpan transaksi
//  baru, jadi jalur normal aplikasi TIDAK BISA membuat item yatim baru --
//  tool ini murni DETEKSI untuk item yatim yang sudah kadung ada dari
//  data lama/migrasi. Perbaikannya (nambah baris Master_Item yang hilang)
//  perlu keputusan manusia (nama/spek/kategori barangnya apa), jadi tetap
//  manual di Sheets -- tool ini cuma menunjukkan ID mana saja yang perlu.
// ============================================================
function findOrphanItemsCore() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var master = ss.getSheetByName(SHEET_MASTER);
  var masterIds = {};
  if (master && master.getLastRow() >= 2) {
    master.getRange(2,COL_MASTER.ID+1,master.getLastRow()-1,1).getValues().forEach(function(r){
      var id = String(r[0]||'').trim().toUpperCase();
      if (id) masterIds[id] = true;
    });
  }
  var orphans = {}; // id -> nama (dari sumber manapun yg nemu duluan)

  var saldo = ss.getSheetByName(SHEET_SALDO);
  if (saldo && saldo.getLastRow() >= 2) {
    saldo.getRange(2,1,saldo.getLastRow()-1,2).getValues().forEach(function(r){
      var id = String(r[COL_SALDO.ID]||'').trim().toUpperCase();
      if (id && !masterIds[id]) orphans[id] = String(r[COL_SALDO.NAMA]||'');
    });
  }
  var trx = ss.getSheetByName(SHEET_TRANSAKSI);
  if (trx && trx.getLastRow() >= 2) {
    // Baca full-width dari kolom 1 (bukan cuma kolom 2-3) supaya index array selalu
    // konsisten dgn COL_TRX (0-based dari kolom 1), sama seperti pembacaan Transaksi_Log lain.
    trx.getRange(2,1,trx.getLastRow()-1,COL_TRX.NAMA+1).getValues().forEach(function(r){
      var id = String(r[COL_TRX.ID]||'').trim().toUpperCase();
      if (id && !masterIds[id] && !orphans[id]) orphans[id] = String(r[COL_TRX.NAMA]||'');
    });
  }

  var list = Object.keys(orphans).sort().map(function(id){ return { id:id, nama:orphans[id] }; });
  return { ok:true, count:list.length, items:list };
}
function apiFindOrphanItems() {
  try {
    var r = findOrphanItemsCore();
    if (!r.count) return { status:'ok', message:'Tidak ada item yatim ditemukan. Semua ID di Stok_Saldo/Transaksi_Log punya baris Master_Item.', count:0, items:[] };
    return {
      status:'ok',
      message: r.count+' item yatim ditemukan (punya transaksi/saldo tapi tidak ada di Master_Item). Tambahkan baris Master_Item untuk ID-ID ini secara manual, atau hubungi admin.',
      count:r.count, items:r.items
    };
  } catch(err) {
    return { status:'error', message:'apiFindOrphanItems: '+err.message };
  }
}

// ============================================================
//  FIND DUPLICATE ITEMS (Audit G-03) — baris Master_Item dgn Nama Material
//  + Spesifikasi identik (trim+uppercase) tapi ID_Item beda-beda. Hanya
//  DETEKSI, bukan auto-merge -- menggabungkan 2 ID jadi 1 berarti harus
//  mindahin/nyatuin riwayat transaksi & saldo mereka juga, itu keputusan
//  yang berisiko kalau diotomasi tanpa direview manusia dulu.
// ============================================================
function findDuplicateItemsCore() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_MASTER);
  if (!sh || sh.getLastRow() < 2) return { ok:true, count:0, groups:[] };

  var data = sh.getRange(2,1,sh.getLastRow()-1,9).getValues();
  var groups = {};
  data.forEach(function(r){
    var id = String(r[COL_MASTER.ID]||'').trim();
    if (!id) return;
    var nama = String(r[COL_MASTER.NAMA]||'').trim();
    var spec = String(r[COL_MASTER.SPEC]||'').trim();
    var key = (nama+'|'+spec).toUpperCase();
    if (!nama) return; // nama kosong -> bukan duplikat yang berarti, skip
    if (!groups[key]) groups[key] = [];
    groups[key].push({ id:id, nama:nama, spec:spec });
  });

  var dupGroups = Object.keys(groups)
    .filter(function(k){ return groups[k].length > 1; })
    .map(function(k){ return { nama:groups[k][0].nama, spec:groups[k][0].spec, items:groups[k] }; });

  return { ok:true, count:dupGroups.length, groups:dupGroups };
}
function apiFindDuplicateItems() {
  try {
    var r = findDuplicateItemsCore();
    if (!r.count) return { status:'ok', message:'Tidak ada baris Master_Item kembar ditemukan (dicek dari kombinasi Nama Material + Spesifikasi).', count:0, groups:[] };
    return {
      status:'ok',
      message: r.count+' kelompok baris kembar ditemukan. Review manual di Master_Item -- putuskan ID mana yang dipertahankan sebelum menghapus/menggabungkan baris lain, karena riwayat transaksinya perlu disatukan juga.',
      count:r.count, groups:r.groups
    };
  } catch(err) {
    return { status:'error', message:'apiFindDuplicateItems: '+err.message };
  }
}

// ============================================================
//  FIND ID COLLISIONS (Audit G-01, CRITICAL) — >1 baris Master_Item
//  berbagi SATU ID_Item yang sama (2 barang beda ditempel di ID yang
//  sama, biasanya human error input/migrasi). BEDA dari G-03 (baris
//  kembar -- Nama+Spek sama, ID beda): di sini ID-nya yang sama, tapi
//  Nama Material BEDA -- akibatnya saldo 2 barang berbeda tercampur
//  jadi 1 angka, dan getStockLedger (rekonsiliasi per-ID) TIDAK PERNAH
//  bisa mendeteksinya karena membandingkan replay per-ID, bukan per-
//  barang-fisik. Hanya DETEKSI + bantu pisah kalau aman (lihat
//  resolveIdCollision di bawah) -- keputusan akhir tetap admin.
// ============================================================
function findIdCollisionsCore() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var master = ss.getSheetByName(SHEET_MASTER);
  if (!master || master.getLastRow() < 2) return { ok:true, count:0, collisions:[] };

  var mData = master.getRange(2,1,master.getLastRow()-1,9).getValues();
  var byId = {};
  mData.forEach(function(r){
    var id = String(r[COL_MASTER.ID]||'').trim().toUpperCase();
    if (!id) return;
    if (!byId[id]) byId[id] = [];
    byId[id].push({ no:String(r[COL_MASTER.NO]), id:String(r[COL_MASTER.ID]).trim(), nama:String(r[COL_MASTER.NAMA]||'').trim(), spec:String(r[COL_MASTER.SPEC]||'').trim() });
  });

  var collidedIds = Object.keys(byId).filter(function(id){ return byId[id].length > 1; });
  if (!collidedIds.length) return { ok:true, count:0, collisions:[] };

  // Breakdown transaksi per Nama_Item, utk tiap ID yang collide -- dipakai cek
  // apakah aman dipisah otomatis lewat resolveIdCollision (lihat splitSafe di bawah).
  var trx = ss.getSheetByName(SHEET_TRANSAKSI);
  var trxByIdNama = {}; // id -> { NAMA_UPPER: count }
  if (trx && trx.getLastRow() >= 2) {
    trx.getRange(2,1,trx.getLastRow()-1,COL_TRX.NAMA+1).getValues().forEach(function(r){ // ID_Item, Nama_Item
      var id = String(r[COL_TRX.ID]||'').trim().toUpperCase();
      if (collidedIds.indexOf(id) === -1) return;
      var nama = String(r[COL_TRX.NAMA]||'').trim().toUpperCase();
      if (!trxByIdNama[id]) trxByIdNama[id] = {};
      trxByIdNama[id][nama] = (trxByIdNama[id][nama]||0) + 1;
    });
  }

  var collisions = collidedIds.sort().map(function(id){
    var rows = byId[id];
    var masterNamaSet = {};
    rows.forEach(function(r){ masterNamaSet[r.nama.toUpperCase()] = true; });

    var trxNamaCounts = trxByIdNama[id] || {};
    var trxBreakdown = Object.keys(trxNamaCounts).map(function(namaUpper){
      return { nama: namaUpper, jumlahTransaksi: trxNamaCounts[namaUpper], cocokMasterItem: !!masterNamaSet[namaUpper] };
    });

    // "splitSafe" HANYA true kalau SETIAP Nama_Item yang pernah tercatat di transaksi utk
    // ID ini cocok PERSIS salah satu Nama Master_Item yang collide -- kalau ada Nama_Item
    // transaksi yang tidak cocok siapa pun (typo lama/nama pernah diganti), splitSafe:false,
    // wajib direview manual di Transaksi_Log dulu sebelum dipisah.
    var splitSafe = trxBreakdown.length > 0 && trxBreakdown.every(function(t){ return t.cocokMasterItem; });

    return { id: id, masterRows: rows, transaksiBreakdown: trxBreakdown, splitSafe: splitSafe };
  });

  return { ok:true, count:collisions.length, collisions:collisions };
}
function apiFindIdCollisions() {
  try {
    var r = findIdCollisionsCore();
    if (!r.count) return { status:'ok', message:'Tidak ada ID collision ditemukan di Master_Item.', count:0, collisions:[] };
    return {
      status:'ok',
      message: r.count+' ID collision ditemukan (1 ID_Item dipakai >1 barang berbeda) — CRITICAL, saldo item-item ini tidak bisa dipercaya sampai dipisah. Cek splitSafe per collision: true = bisa dipisah otomatis via resolveIdCollision berdasarkan Nama_Item; false = ada transaksi yang tidak cocok nama manapun, wajib direview manual dulu.',
      count:r.count, collisions:r.collisions
    };
  } catch(err) {
    return { status:'error', message:'apiFindIdCollisions: '+err.message };
  }
}

// ============================================================
//  RESOLVE ID COLLISION (Audit G-01) — pisahkan SATU barang (dikenali
//  dari Nama Material persis) yang nyasar berbagi ID dgn barang lain,
//  ke ID baru. Baris Master_Item-nya dipindah, dan SEMUA baris
//  Transaksi_Log dgn ID_Item lama + Nama_Item yang cocok persis (trim+
//  uppercase) ikut dipindah ke ID baru. Setelah itu Stok_Saldo/
//  Stok_Per_Rak di-RECALCULATE PENUH (recalculateAllSaldoCore, bukan
//  hitung incremental manual di sini) supaya ID lama & baru dijamin
//  sinkron dari nol.
//  Ditolak (fail-safe) kalau bukan persis SATU baris Master_Item yang
//  Nama-nya cocok `namaToMove` di ID lama itu -- 0 (salah ketik nama)
//  atau >1 (ambigu, perlu dibedakan manual dulu via Spesifikasi) sama-
//  sama ditolak.
//  `dryRun:true` -- hitung & tampilkan apa yang AKAN berubah TANPA
//  menulis apa pun -- dipakai frontend utk preview/konfirmasi dulu
//  sebelum admin klik "Ya, pisahkan".
// ============================================================
function resolveIdCollisionCore(oldId, namaToMove, newId, dryRun) {
  oldId = String(oldId||'').trim().toUpperCase();
  var namaKey = String(namaToMove||'').trim().toUpperCase();
  if (!oldId || !namaKey) return { ok:false, message:'oldId dan namaToMove wajib diisi.' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var master = ss.getSheetByName(SHEET_MASTER);
  if (!master || master.getLastRow() < 2) return { ok:false, message:'Master_Item kosong.' };

  var mData = master.getRange(2,1,master.getLastRow()-1,9).getValues();
  var matches = [];
  mData.forEach(function(r, idx){
    if (String(r[COL_MASTER.ID]||'').trim().toUpperCase() === oldId && String(r[COL_MASTER.NAMA]||'').trim().toUpperCase() === namaKey) {
      matches.push(idx);
    }
  });
  if (matches.length === 0) return { ok:false, message:'Tidak ada baris Master_Item dgn ID '+oldId+' & Nama persis "'+namaToMove+'".' };
  if (matches.length > 1) return { ok:false, message:'Ambigu: ada '+matches.length+' baris Master_Item dgn ID+Nama yang sama persis. Bedakan dulu manual (mis. via Spesifikasi) sebelum pakai tool ini.' };

  // Pastikan ID ini memang collision (>1 baris) -- tool ini bukan buat ganti ID sembarang.
  var sameIdCount = mData.filter(function(r){ return String(r[COL_MASTER.ID]||'').trim().toUpperCase() === oldId; }).length;
  if (sameIdCount < 2) return { ok:false, message:'ID '+oldId+' tidak collision (cuma 1 baris Master_Item). Tool ini khusus utk memisah ID yang dipakai >1 barang.' };

  newId = String(newId||'').trim().toUpperCase();
  if (!newId) newId = generateID();
  var idAlreadyUsed = mData.some(function(r){ return String(r[COL_MASTER.ID]||'').trim().toUpperCase() === newId; });
  if (idAlreadyUsed) return { ok:false, message:'ID baru "'+newId+'" sudah dipakai barang lain. Pilih ID lain atau kosongkan utk auto-generate.' };

  var trx = ss.getSheetByName(SHEET_TRANSAKSI);
  var trxRowsToMove = [];
  if (trx && trx.getLastRow() >= 2) {
    var tData = trx.getRange(2,1,trx.getLastRow()-1,13).getValues();
    tData.forEach(function(r, idx){
      if (String(r[COL_TRX.ID]||'').trim().toUpperCase() === oldId && String(r[COL_TRX.NAMA]||'').trim().toUpperCase() === namaKey) {
        trxRowsToMove.push(idx); // 0-based; offset baris sheet sebenarnya = idx+2
      }
    });
  }

  var preview = {
    oldId: oldId, newId: newId, namaToMove: String(namaToMove).trim(),
    masterRowsMoved: 1, transaksiRowsMoved: trxRowsToMove.length
  };
  if (dryRun) return { ok:true, dryRun:true, preview:preview };

  // --- Eksekusi (bukan dry run) ---
  master.getRange(matches[0]+2, COL_MASTER.ID+1).setValue(newId);

  if (trx && trxRowsToMove.length) {
    trxRowsToMove.forEach(function(idx){
      trx.getRange(idx+2, COL_TRX.ID+1).setValue(newId);
    });
  }

  CacheService.getScriptCache().remove('masterLists_v1');
  var recalc = recalculateAllSaldoCore();

  return { ok:true, dryRun:false, preview:preview, recalc:recalc };
}
function apiResolveIdCollision(body) {
  try {
    var r = resolveIdCollisionCore(body.oldId, body.namaToMove, body.newId, !!body.dryRun);
    if (!r.ok) return { status:'error', message:r.message };
    if (r.dryRun) {
      return {
        status:'ok', dryRun:true,
        message:'Preview: '+r.preview.masterRowsMoved+' baris Master_Item + '+r.preview.transaksiRowsMoved+' baris Transaksi_Log akan dipindah dari '+r.preview.oldId+' ke '+r.preview.newId+' (Nama: '+r.preview.namaToMove+'). Kirim ulang dgn dryRun:false utk eksekusi.',
        preview:r.preview
      };
    }
    return {
      status:'ok',
      message:'ID collision dipisah: "'+r.preview.namaToMove+'" dipindah dari '+r.preview.oldId+' ke '+r.preview.newId+' ('+r.preview.masterRowsMoved+' baris Master_Item, '+r.preview.transaksiRowsMoved+' baris Transaksi_Log). Stok_Saldo/Stok_Per_Rak sudah di-recalculate penuh.',
      preview:r.preview
    };
  } catch(err) {
    return { status:'error', message:'apiResolveIdCollision: '+err.message };
  }
}

// Router utk tombol "Admin Database" di frontend. Frontend kirim {action:'adminTool', fn:'...'}
// (lihat runAdminTool() di HTML) -- dulu tombolnya ada di UI tapi backend belum punya route ini
// sama sekali, jadi klik "Jalankan" selalu gagal/unknown action.
function runAdminToolAPI(fn, body) {
  if (fn === 'recalculateAllSaldo') return apiRecalculateAllSaldo();
  if (fn === 'migrateAddID')        return apiMigrateAddID();
  if (fn === 'findOrphanItems')     return apiFindOrphanItems();
  if (fn === 'findDuplicateItems')  return apiFindDuplicateItems();
  if (fn === 'resyncMasterLists')   return apiResyncMasterLists();
  if (fn === 'findIdCollisions')    return apiFindIdCollisions();
  if (fn === 'resolveIdCollision')  return apiResolveIdCollision(body||{});
  return { status:'error', message:'Admin tool tidak dikenal: ' + fn };
}

// ============================================================
//  STOCK LEDGER FORMAL — replay Transaksi_Log vs cache Stok_Saldo
//  Opening balance selalu 0 (semua stok, termasuk yg pertama kali,
//  sekarang tercatat sbg transaksi MASUK -- tidak ada lagi angka
//  statis "qty awal" yg tersembunyi di Master_Item).
// ============================================================
// Expose seluruh Stok_Per_Rak (dipakai tab "Cek Per Rak" utk grouping per lokasi yg BENAR,
// bukan lagi dari 1 kolom RAK di Master_Item yang sudah tidak ada)
function getAllRakBreakdown() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(SHEET_RAK_SALDO);
    var rows = [];
    if (sh && sh.getLastRow() >= 2) {
      sh.getRange(2,1,sh.getLastRow()-1,3).getValues().forEach(function(r){
        var qty = parseFloat(r[COL_RAK_SALDO.QTY])||0;
        if (qty !== 0) rows.push({ id:String(r[COL_RAK_SALDO.ID]||''), rak:String(r[COL_RAK_SALDO.RAK]||''), qty:qty });
      });
    }
    return { status:'ok', rows:rows };
  } catch(err) {
    return { status:'error', message:'getAllRakBreakdown: ' + err.message };
  }
}

function getStockLedger(itemId) {
  try {
    itemId = String(itemId||'').trim().toUpperCase();
    if (!itemId) return { status:'error', message:'itemId wajib diisi' };

    var ss     = SpreadsheetApp.getActiveSpreadsheet();
    var master = ss.getSheetByName(SHEET_MASTER);
    if (!master) return { status:'error', message:'Sheet Master_Item tidak ditemukan' };

    var mLast = master.getLastRow();
    var nama = '';
    if (mLast >= 2) {
      var mData = master.getRange(2,1,mLast-1,9).getValues();
      var idx = findRowIndex(mData, [[COL_MASTER.ID, itemId]]);
      if (idx >= 0) nama = String(mData[idx][COL_MASTER.NAMA]||'');
    }

    var trx = ss.getSheetByName(SHEET_TRANSAKSI);
    var entries = [];
    var tLast = trx ? trx.getLastRow() : 0;
    if (trx && tLast>=2) {
      // FIX v5.17 (F-07): sama seperti getHistory -- scan kolom ID_Item saja dulu,
      // baru ambil baris 13-kolom lengkap untuk yang cocok saja (bukan seluruh log).
      var rowNums = findMatchingRowNumbers_(trx, COL_TRX.ID, tLast, itemId);
      var tData = getRowsByNumbers_(trx, rowNums, 13);
      tData.forEach(function(row){
        entries.push({
          timestamp: fmtDateTime(row[COL_TRX.TIMESTAMP]), jenis: String(row[COL_TRX.JENIS]), qty: parseFloat(row[COL_TRX.QTY])||0,
          rak: String(row[COL_TRX.RAK]), vendor: String(row[COL_TRX.VENDOR]), noReferensi: String(row[COL_TRX.NO_REF]),
          saldoSebelum: parseFloat(row[COL_TRX.SALDO_SEBELUM])||0, saldoSesudah: parseFloat(row[COL_TRX.SALDO_SESUDAH])||0,
          keterangan: String(row[COL_TRX.KETERANGAN]), admin: String(row[COL_TRX.ADMIN])
        });
      });
    }

    var computedClosing = 0;
    entries.forEach(function(e){ computedClosing += (e.jenis.toUpperCase()==='MASUK' ? e.qty : -e.qty); });

    var cachedClosing = 0;
    var saldoMap = getSaldoMap();
    if (saldoMap.hasOwnProperty(itemId)) cachedClosing = saldoMap[itemId];

    var reconciled = Math.abs(computedClosing - cachedClosing) < 0.0001;

    return {
      status: 'ok', itemId: itemId, nama: nama,
      openingBalance: 0, entries: entries,
      computedClosing: computedClosing, cachedClosing: cachedClosing,
      reconciled: reconciled, diff: computedClosing - cachedClosing
    };
  } catch(err) {
    return { status:'error', message:'getStockLedger: ' + err.message };
  }
}

// ============================================================
//  MASTER LIST (Kategori/UOM/Vendor/Rak) — dropdown terpusat
// ============================================================
function getMasterLists() {
  try {
    // PERF v5.4: dipanggil tiap kali app dibuka tapi isinya jarang berubah (cuma nambah
    // kategori/uom/vendor/rak baru sesekali) -- cache 5 menit, invalidate manual di
    // addMasterValue() tiap kali ada nilai baru ditambahkan.
    var cache = CacheService.getScriptCache();
    var cached = cache.get('masterLists_v1');
    if (cached) return JSON.parse(cached);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    function readList(name) {
      var sh = ss.getSheetByName(name);
      if (!sh || sh.getLastRow() < 2) return [];
      return sh.getRange(2,1,sh.getLastRow()-1,1).getValues()
        .map(function(r){ return String(r[0]||'').trim(); })
        .filter(function(v){ return v; });
    }
    var result = {
      status: 'ok',
      kategori: readList(SHEET_KATEGORI),
      uom:      readList(SHEET_UOM),
      vendor:   readList(SHEET_VENDOR),
      rak:      readList(SHEET_RAK)
    };
    cache.put('masterLists_v1', JSON.stringify(result), 300); // 5 menit
    return result;
  } catch(err) {
    return { status:'error', message:'getMasterLists: ' + err.message };
  }
}

function addMasterValue(body) {
  try {
    var type = String(body.type||'').toLowerCase();
    var val  = String(body.value||'').trim();
    if (!val) return { status:'error', message:'Nilai tidak boleh kosong' };
    var sheetName = { kategori:SHEET_KATEGORI, uom:SHEET_UOM, vendor:SHEET_VENDOR, rak:SHEET_RAK }[type];
    if (!sheetName) return { status:'error', message:'Tipe master tidak dikenal: ' + type };

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(sheetName);
    if (!sh) { sh = ss.insertSheet(sheetName); sh.getRange(1,1).setValue('Nilai').setFontWeight('bold'); sh.setFrozenRows(1); }

    var existing = sh.getLastRow() >= 2
      ? sh.getRange(2,1,sh.getLastRow()-1,1).getValues().map(function(r){ return String(r[0]||'').trim().toUpperCase(); })
      : [];
    if (existing.indexOf(val.toUpperCase()) !== -1) return { status:'ok', message:'Sudah ada', value:val };

    sh.appendRow([val]);
    CacheService.getScriptCache().remove('masterLists_v1'); // invalidate cache biar getMasterLists lihat nilai baru
    return { status:'ok', message:'Ditambahkan', value:val };
  } catch(err) {
    return { status:'error', message:'addMasterValue: ' + err.message };
  }
}

// ============================================================
//  RESYNC MASTER-LIST DARI DATA YANG SUDAH ADA (opsional, manual)
//  Beda dengan setupSheets() (yang cukup dijalankan SEKALI di awal utk
//  MEMBUAT ke-8 sheet): fungsi ini untuk REBUILD isi Master_Vendor &
//  Master_Rak dengan menyisir Vendor/RAK yang pernah dipakai di
//  Transaksi_Log/Stok_Per_Rak -- berguna kalau dropdown vendor/rak di
//  app "kotor" (banyak variasi ejaan) dan mau disamakan ulang.
// ============================================================
function setupMasterListSheetsCore() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var vendorSet={}, kategoriSet={}, uomSet={};

  // FIX v5.13 (Audit G-06): dulu key dictionary di sini pakai nilai APA ADANYA
  // (case-sensitive) -- "Acme" dan "ACME" jadi 2 entri beda di Master_Vendor/UOM
  // walau sebenarnya barang/vendor yang sama. Sekarang key-nya di-uppercase dulu
  // (dedup case-insensitive), tapi bentuk TAMPILAN yang disimpan tetap versi
  // PERTAMA yang ditemukan di data (bukan dipaksa jadi UPPERCASE semua), supaya
  // dropdown tetap enak dibaca.
  function addDedup(set, raw) {
    var v = String(raw||'').trim();
    if (!v) return;
    var key = v.toUpperCase();
    if (!set[key]) set[key] = v; // simpan bentuk pertama yg ditemukan
  }

  // Vendor/Kategori/Unit sekarang datang dari Transaksi_Log (vendor) & Master_Item (kategori/unit)
  var trx = ss.getSheetByName(SHEET_TRANSAKSI);
  if (trx && trx.getLastRow()>=2) {
    trx.getRange(2,1,trx.getLastRow()-1,COL_TRX.VENDOR+1).getValues().forEach(function(r){
      addDedup(vendorSet, r[COL_TRX.VENDOR]);
    });
  }
  var master = ss.getSheetByName(SHEET_MASTER);
  var rakSet = {};
  if (master && master.getLastRow()>=2) {
    master.getRange(2,1,master.getLastRow()-1,9).getValues().forEach(function(r){
      addDedup(uomSet, r[COL_MASTER.UNIT]);
      addDedup(kategoriSet, r[COL_MASTER.KATEGORI]);
    });
  }
  var rakSld = ss.getSheetByName(SHEET_RAK_SALDO);
  if (rakSld && rakSld.getLastRow()>=2) {
    rakSld.getRange(2,1,rakSld.getLastRow()-1,COL_RAK_SALDO.RAK+1).getValues().forEach(function(r){
      addDedup(rakSet, r[COL_RAK_SALDO.RAK]);
    });
  }

  function writeList(name, values, defaults) {
    var sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    sh.clearContents();
    sh.getRange(1,1).setValue('Nilai').setBackground('#1a3a7a').setFontColor('#ffffff').setFontWeight('bold');
    sh.setFrozenRows(1);
    // `values` sudah dedup case-insensitive (key=UPPERCASE, value=bentuk tampilan);
    // `defaults` di-dedup dgn cara sama supaya default juga tidak dobel dgn data asli.
    var all = {};
    defaults.forEach(function(d){ addDedup(all, d); });
    Object.keys(values).forEach(function(k){ if (!all[k]) all[k] = values[k]; });
    var list = Object.keys(all).map(function(k){ return all[k]; }).sort();
    if (list.length) sh.getRange(2,1,list.length,1).setValues(list.map(function(v){ return [v]; }));
    return list.length;
  }

  var n1 = writeList(SHEET_VENDOR,   vendorSet,   []);
  var n2 = writeList(SHEET_RAK,      rakSet,      []);
  var n3 = writeList(SHEET_UOM,      uomSet,      ['Pcs','Set','Unit','Box','Kg','Liter']);
  var n4 = writeList(SHEET_KATEGORI, kategoriSet, ['Tool','Consumable','Sparepart','Raw Material']);

  CacheService.getScriptCache().remove('masterLists_v1'); // invalidate cache setelah resync

  return { ok:true, vendor:n1, rak:n2, uom:n3, kategori:n4 };
}

// Dipakai manual dari editor Apps Script (dropdown fungsi -> Run) -- tampilkan alert di Sheets.
function setupMasterListSheets() {
  var r = setupMasterListSheetsCore();
  SpreadsheetApp.getUi().alert(
    '✅ Master list siap!\n• Vendor: ' + r.vendor + '\n• Rak: ' + r.rak + '\n• Unit: ' + r.uom + '\n• Kategori: ' + r.kategori
  );
}

// FIX v5.13 (Audit G-04/G-05/G-06): dulu resync Master_Kategori/UOM/Vendor/Rak HANYA
// bisa dijalankan manual dari editor Apps Script (setupMasterListSheets di atas) --
// itu sebabnya Master_Rak sempat "basi" (cuma 1 nilai lama, padahal rak aktual di
// Stok_Per_Rak sudah lebih banyak) dan Master_Kategori/Vendor/UOM tidak overlap dgn
// nilai aktual: tidak ada yang inisiatif buka editor Apps Script buat jalankannya.
// Sekarang ada versi API-nya, dipanggil dari tombol "Admin Database" di aplikasi --
// resync jadi semudah klik tombol, tidak perlu buka Apps Script sama sekali.
function apiResyncMasterLists() {
  try {
    var r = setupMasterListSheetsCore();
    return {
      status:'ok',
      message:'Resync master list selesai — Vendor: '+r.vendor+', Rak: '+r.rak+', Unit: '+r.uom+', Kategori: '+r.kategori+'.',
      vendor:r.vendor, rak:r.rak, uom:r.uom, kategori:r.kategori
    };
  } catch(err) {
    return { status:'error', message:'apiResyncMasterLists: '+err.message };
  }
}

// ============================================================
//  HELPERS
// ============================================================
function fmtDate(val) {
  if (!val || val==='') return '';
  if (val instanceof Date) {
    try { return Utilities.formatDate(val, Session.getScriptTimeZone(), 'dd/MM/yyyy'); }
    catch(e) { return String(val); }
  }
  return String(val);
}

function fmtDateTime(val) {
  if (!val || val==='') return '';
  if (val instanceof Date) {
    try { return Utilities.formatDate(val, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm'); }
    catch(e) { return String(val); }
  }
  return String(val);
}
