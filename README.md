# RDI Indirect Scanner

PWA (Progressive Web App) untuk scan barcode/QR transaksi masuk & keluar item indirect material (spare part, tools, consumable) — **PT Rayard Deli Indonesia**.

Aplikasi berjalan penuh di browser (bisa di-*install* ke HP/desktop seperti app biasa), dengan backend Google Apps Script + Google Sheets sebagai database.

## Fitur

- Scan barcode/QR (kamera HP) untuk transaksi **MASUK** / **KELUAR** stok
- Manajemen stok multi-rak (1 barang bisa tersebar di beberapa lokasi rak)
- Riwayat transaksi & kartu stok per item (rekonsiliasi otomatis)
- Mode **Editor** (bisa input/edit data) dan **Viewer** (lihat & cari saja, login username/password)
- Bekerja offline-first — draft transaksi tersimpan lokal, disinkron saat online kembali
- Dashboard ringkas: total item, total masuk/keluar bulan berjalan, item paling sering ditransaksikan
- Tools admin database: kalkulasi ulang saldo, isi ID kosong, deteksi item yatim/duplikat/ID collision
- Export data ke Excel

## Struktur Proyek

```
├── index.html          # Aplikasi utama (UI + logika inline: daftar item, transaksi, riwayat, dashboard, pengaturan)
├── scanner.html        # Scanner fullscreen terpisah (dibuka dari index via tombol; hasil via postMessage)
├── sw.js               # Service worker (offline caching) — nama CACHE wajib naik tiap shell berubah
├── manifest.json       # PWA manifest (nama, ikon, tema)
├── Code.gs             # Backend Google Apps Script (deploy terpisah ke Apps Script)
├── appsscript.json     # Manifest project Apps Script
├── icon-192.png, icon-512.png
├── js/
│   ├── format.js       # Helper murni (tanpa DOM): parseQty, fmtQty, fmtNum, stockGuard, anomalyStats, ...
│   ├── util.js, outbox.js, cetak.js, importexcel.js, exportexcel.js
│   └── *.min.js        # Vendor, self-hosted tanpa CDN: jsQR (decode QR), qrcode (pembuat QR), jspdf, html2pdf, xlsx, exceljs (jangan diedit/format ulang)
├── tests/
│   ├── l1/             # Statis / simulasi (Node, tanpa browser) — dijalankan di CI
│   ├── l2/, e2e/       # Browser runtime (Chrome)
│   ├── tools/          # Pembantu tes
│   └── l1/sw_shell_manifest.json   # Hash shell untuk gate cache service worker
├── .github/workflows/l1.yml        # CI: menjalankan L1 tiap push/PR ke main
├── AGENTS.md, TESTING.md, DESIGN.md, PLAN.md, CHANGELOG.md   # Aturan agen, panduan tes, desain, rencana, riwayat perubahan
├── anti-slop/          # Laporan audit
├── apps-script/        # Berkas tambahan backend (proxy AI, POC) — ditempel manual ke project Apps Script
└── poc/                # Halaman uji terpisah (tidak ikut aplikasi produksi)
```

Backend (`Code.gs`) ada di repo ini sebagai **sumber kode** — tetap harus di-*paste*/push ke project Apps Script dan di-*deploy* sebagai Web App terpisah (lihat Setup).

## Cara Kerja

```
Browser (PWA)  <──HTTP GET/POST──>  Google Apps Script (Web App)  <──>  Google Sheets
```

- **GET** — ambil data (daftar item, riwayat, dashboard, dll), bisa diakses Editor maupun Viewer (via header `X-Editor-Key` / `X-Viewer-Token`)
- **POST** — tulis data (transaksi, tambah/edit item, dll), wajib `editorKey` yang valid (body atau header)

### Offline-first

- **Shell aplikasi** (HTML/CSS/JS/ikon) di-cache service worker → buka app tanpa internet tetap bisa (menu, draft, history lokal).
- **Data live** dari Google Sheets selalu network-first — tidak di-cache SW (akurat).
- Draft transaksi & outbox tersimpan di `localStorage`; saat offline, submit ditahan sebagai outbox. Saat koneksi kembali online (atau app dibuka), outbox otomatis dikirim ulang (FIFO, retry 30s).
- Setelah **deploy ubahan app shell**, **bump `CACHE` di `sw.js`** (mis. `rdi-stok-v9` → `rdi-stok-v10`) supaya HP lama tidak terjebak cache versi sebelumnya.

### Skema data (Google Sheets)

| Sheet | Isi |
|---|---|
| `Master_Item` | Identitas barang: ID, nama, spesifikasi, kategori, unit, min stock, status |
| `Transaksi_Log` | Riwayat semua transaksi MASUK/KELUAR (append-only) |
| `Stok_Saldo` | Saldo total per item (di-cache, direkalkulasi dari Transaksi_Log) |
| `Stok_Per_Rak` | Breakdown saldo per lokasi rak |
| `Master_Kategori` / `Master_UOM` / `Master_Vendor` / `Master_Rak` | Master data dropdown |
| `Editor_Accounts` *(legacy, tidak dipakai — kode dihapus 2026-09-28)* | Tab lama. Tidak lagi dibaca kode mana pun; akun editor kini ada di `RDI_Accounts`. Tabnya masih ada di spreadsheet sampai dihapus manual. |
| `Viewer_Accounts` | Akun lihat-saja (username/password) |
| `Sync_Errors` | Log kegagalan sinkronisasi saldo (jika ada) |

## Setup

### 1. Backend — Google Apps Script

1. Buat Google Sheets baru, buka **Extensions → Apps Script**
2. Tempel kode backend (`Code.gs`), lalu jalankan fungsi `setupSheets()` sekali dari editor Apps Script untuk membuat semua sheet yang dibutuhkan
3. Buka **Project Settings → Script Properties**, tambahkan:
   - `EDITOR_KEY` = kata sandi bebas (untuk akses tulis)
4. **Deploy → New deployment → Web app**
   - Execute as: *Me*
   - Who has access: *Anyone*
5. Salin URL Web App yang dihasilkan (`.../exec`)

### 2. Frontend — PWA

1. Buka `index.html` di browser, atau host lewat GitHub Pages
2. Buka menu **Lainnya > Pengaturan**, isi **Google Apps Script URL** = URL dari langkah 1.5
3. Tidak ada lagi kolom "Editor Key" di aplikasi. Hak akses sekarang datang dari **login** — lihat [Panduan Akun](#panduan-akun) di bawah untuk membuat atau mengganti password.

### 3. Install sebagai App (opsional)

Buka `index.html` di Chrome/Safari mobile → menu browser → **Add to Home Screen** / **Install App**.

## Panduan Akun

Semua akun — editor maupun lihat-saja — disimpan di **satu sheet: `RDI_Accounts`**.
Semua pembuatan dan penggantian password dilakukan lewat **satu fungsi: `setupAccount()`**.
Tidak perlu mengedit sheet secara manual.

Isi sheet `RDI_Accounts` (7 kolom, baris 1 = header):

| Kolom | Isi | Catatan |
|---|---|---|
| A `Username` | nama untuk login | unik, tidak case-sensitive |
| B `Nama` | nama orang, tampil di topbar | bebas |
| C `PasswordHash` | `salt$5000$hash` | **jangan** diedit manual |
| D `Role` | `editor` atau `viewer` | menentukan boleh tulis atau tidak |
| E `Aktif` | `TRUE` / `FALSE` | `FALSE` = nonaktifkan tanpa menghapus |
| F `PasswordVersion` | diisi otomatis | berubah tiap reset password |
| G `Catatan` | bebas | diisi otomatis oleh `setupAccount()` |

### A. Menambah akun baru

1. Buka **Extensions > Apps Script**, lalu **Project Settings > Script Properties**
2. Tambahkan property berikut (nilai persis, huruf besar):

   | Nama property | Nilai | Wajib |
   |---|---|---|
   | `ACC_USERNAME` | mis. `budi` | ya |
   | `ACC_PASSWORD` | mis. `GudangBudi#2026` | ya |
   | `ACC_ROLE` | `editor` atau `viewer` | ya |
   | `ACC_NAMA` | `Budi Santoso` | tidak (default: nama lama, atau username) |
   | `ACC_NOTE` | mis. `staf gudang baru` | tidak |
   | `ACC_ALLOW_DOWNGRADE` | `TRUE` | hanya bila menurunkan editor jadi viewer |

   Hapus `ACC_NOTE` dan `ACC_ALLOW_DOWNGRADE` kalau tidak dipakai — nilai sisa dari
   proses sebelumnya bisa membuat hasil tidak seperti yang diharapkan.

3. Di editor, pilih fungsi **`setupAccount`** pada dropdown di atas `Code.gs`, tekan **Run**
4. Saat diminta otorisasi, pilih akun Google pemilik spreadsheet, lalu **Allow**
5. Buka tab **Executions** di kiri bawah, klik eksekusi terakhir, dan pastikan baris log:

   ```
   HASIL setupAccount -> username=budi  role=editor  DIBUAT
   ```

   `DIBUAT` = akun baru. `DIPERBARUI` = akun sudah ada dan datanya diperbarui.
   **Selalu periksa nilai `role` di baris itu** — inilah yang sebenarnya tersimpan.

6. Berikan `username` + `password` kepada pemilik akun. Minta ia logout lalu login ulang.

> **Penting:** `setupAccount()` **menghapus semua property di atas sebelum memvalidasi**.
> Tujuannya supaya password tidak tertinggal di Script Properties kalau proses gagal —
> tapi artinya kalau gagal, Anda harus **mengisi ulang semua property dari awal**.

### B. Mengganti / reset password

Langkah sama persis dengan bagian A, hanya ada dua perbedaan:

- `ACC_USERNAME` diisi **username yang sudah ada**
- `ACC_ROLE` **wajib sama** dengan role sekarang (lihat bagian C kalau mau menurunkan role)
- `ACC_NAMA` boleh **dikosongkan** — nama lama otomatis dipertahankan

Baris log akan berbunyi `DIPERBARUI` (bukan `DIBUAT`).

Mengganti password **langsung mematikan semua sesi lama** pemilik akun itu, lewat kolom
`PasswordVersion`. Jadi ia perlu login ulang, dan token yang sempat dicuri ikut tidak berlaku.

### C. Menurunkan editor jadi lihat-saja

Isi `ACC_ALLOW_DOWNGRADE` = `TRUE` (tambahkan sebagai property), lalu jalankan `setupAccount()`
seperti biasa. Tanpa property itu, proses **ditolak** dengan pesan:

```
budi masih editor aktif. Menurunkannya ke viewer butuh Script Property ACC_ALLOW_DOWNGRADE = TRUE.
```

Pengaman ini ada supaya role tidak berubah hanya karena salah isi.

### D. Menonaktifkan akun tanpa menghapus

Buka sheet `RDI_Accounts`, ubah kolom **E (`Aktif`)** jadi `FALSE` untuk baris tersebut.
Riwayatnya tetap ada, dan akun bisa diaktifkan lagi dengan mengesetnya kembali ke `TRUE`.
Menghapus baris langsung tidak disarankan.

### E. Kalau belum ada akun editor sama sekali (bootstrap)

Hanya untuk kondisi awal, sebelum ada editor aktif. Gunakan Script Property
`TEMP_EDITOR_PW`, lalu jalankan fungsi **`setupEditorAccount`**.

Perhatian: fungsi ini **membuat username `wahyu` dengan nama `Wahyu Susanto`** secara hardcode,
dan **menolak jalan** kalau sudah ada editor aktif — kecuali diisi
`TEMP_EDITOR_FORCE` = `TRUE`. Setelah akun pertama ada, pakai `setupAccount()` saja.

### Aturan password

Ditegakkan server, jadi tidak bisa dilewati:

- **Minimal 10 karakter**
- **Minimal 3 dari 4 jenis karakter**: huruf besar, huruf kecil, angka, simbol
- Tidak boleh semua karakter sama (`aaaaaaaaaa`)
- Tidak boleh urutan umum (`123456789`, `qwertyuiop`, `password`, `0123456789`, dll)

Contoh **lolos**: `GudangBudi#2026`, `Rdi-Warehouse-01`
Contoh **gagal**: `budi123` (terlalu pendek), `gudangbudi2026` (hanya 2 jenis),
`aaaaaaaaaa`, `qwertyuiop`

### Kalau ada masalah

| Pesan / gejala | Arti dan cara overcoming |
|---|---|
| `Script Property ACC_USERNAME belum diisi.` | Property tidak tersimpan. Periksa nama property tepat `ACC_USERNAME` (huruf besar). |
| `Script Property ACC_ROLE harus 'editor' atau 'viewer'` | Nilai role salah ketik. Gunakan huruf kecil semua. |
| `Password terlalu lemah: minimal 10 karakter dan 3 jenis karakter` | Password tidak memenuhi aturan di atas. |
| `<username> masih editor aktif. Menurunkannya ke viewer butuh ...` | Tambahkan `ACC_ALLOW_DOWNGRADE` = `TRUE`. |
| Login **lambat sekali** (> 1 menit) | Password lama masih memakai hash 100.000 iterasi. Kode sekarang memakai 5.000. Jalankan ulang `setupAccount()` untuk akun itu agar hash-nya dihitung ulang. |
| `Terlalu banyak percobaan login. Coba lagi dalam 15 menit.` | 5 kali salah berturut. Tunggu 15 menit. Ini pengaman anti brute-force, bukan kerusakan. |
| Akun tidak masuk padahal password benar | Cek baris log `HASIL setupAccount` — bisa jadi `role` tersimpan berbeda dari yang Anda kira. |

### Catatan penting

- **Satu akun per orang.** Kolom `admin` pada setiap transaksi diisi dari identitas yang
  diverifikasi server. Kalau banyak orang berbagi satu akun editor, semua transaksi
  tercatat atas nama yang sama dan akuntabilitasnya hilang.
- **Jangan pernah menulis password plaintext di sheet.** Kolom `PasswordHash` hanya boleh
  berisi `salt$iterasi$hash`.
- **Script Properties hanya bisa dilihat pemilik project.** Tetap begitulah, password
  sebaiknya tidak disimpan lama di sana — dan `setupAccount()` membersihkannya setiap kali jalan.
- **Rotasi `VIEWER_TOKEN_SECRET`** (di Script Properties) membuat **semua** token viewer
  tidak berlaku, sehingga setiap pengguna lihat-saja harus login ulang. Lakukan hanya
  bilakah secret pernah bocor.

## Deploy ke GitHub Pages

1. Settings → Pages → Source: branch `main`, folder `/ (root)`
2. Akses via `https://<username>.github.io/rdi-scanner-pwa/`

## Pengembangan & tes

- Tidak ada build step dan tidak ada dependensi npm. Layani folder secara statis (mis. `python -m http.server`) — service worker butuh `https` atau `localhost`.
- `npm test` menjalankan **L1** (Node ≥ 18, statis/simulasi, tanpa browser). `npm run test:l2` menjalankan **L2** (butuh Chrome). Arti tiap level dan aturan klaimnya ada di [TESTING.md](TESTING.md) dan `AGENTS.md`.
- Logika murni (hitung/format/validasi) ditaruh di `js/format.js` dan diuji dengan tes unit yang **mengeksekusi kode aslinya** (`tests/l1/*_exec.js`, via `vm`), bukan sekadar mencocokkan teks.
- Tes `repo_layout` menjaga tata letak repo (tidak ada berkas nyasar di folder utama, semua `<script src>` dan aset precache ada) serta kesinkronan `APP_VERSION` dengan `package.json`; `version_consistency` menjaga `APP_VERSION` di judul, meta, dan header.

## Rilis (checklist wajib)

1. `npm test` lulus — termasuk `repo_layout` dan `sw_shell_cache_gate`.
2. Mengubah berkas shell (`index.html`, `scanner.html`, `sw.js`, `manifest.json`, `js/*.js`, vendor, ikon)? **Naikkan nama `CACHE` di `sw.js`** (mis. `rdi-stok-v110` → `v111`), lalu jalankan `node tests/l1/sw_shell_cache_gate.js --print` dan ikut-commit `tests/l1/sw_shell_manifest.json`.
   Alasannya: aset disajikan *cache-first*. Tanpa kenaikan nama, HP yang sudah memasang aplikasi tetap memakai berkas lama — dulu ini membuat `js/format.js` lama bertahan dan halaman Stok gagal (27 Nov 2026).
3. Rilis yang bermakna: naikkan `APP_VERSION` di `index.html` dan `version` di `package.json`, lalu catat di [CHANGELOG.md](CHANGELOG.md).
4. Unggah **dengan struktur folder utuh** (git, atau seret *folder* ke GitHub; jangan mengunggah file satu per satu — file bisa jatuh ke folder utama). `repo_layout` akan gagal bila ada berkas yang salah folder.
5. Backend (`Code.gs`) berubah? Deploy ulang project Apps Script sebagai versi baru (URL `/exec` tetap).
6. Setelah deploy: buka aplikasi di HP dan cek versi di menu **Lainnya**. Jika muncul banner merah "js/format.js masih versi lama", ketuk **Perbarui sekarang**.

## Pemecahan masalah umum

| Gejala | Penyebab biasa | Tindakan |
|---|---|---|
| Banner merah "berkas js/format.js masih versi lama" | HP masih memakai cache service worker lama (nama `CACHE` belum dinaikkan saat rilis) | Ketuk **Perbarui sekarang** (tidak menghapus antrean transaksi). Untuk rilis berikutnya, ikuti checklist di atas. |
| Halaman Stok: "Terjadi kesalahan di aplikasi" | Berkas `js/*.js` tidak cocok dengan `index.html` (sebagian terunggah / salah folder) | Pastikan `tests/l1/repo_layout.js` lulus, unggah ulang dengan struktur folder utuh |
| `sw_shell_cache_gate` gagal | Shell berubah tanpa menaikkan `CACHE` / manifest belum diregenerasi | Naikkan `CACHE`, jalankan `--print`, commit manifest |

## Keamanan

- Semua aksi tulis (`postTransaksi`, `addItem`, dll) melewati satu gerbang: `checkEditorSession_()`, yang diperoleh dari **token sesi** hasil login dengan role `editor`
- Ada **break-glass**: Script Property `EDITOR_KEY` tunggal masih diterima, tapi hanya aktif bila `ALLOW_LEGACY_SINGLE_KEY=TRUE` atau belum ada satu pun akun editor aktif. Strings-nya dibandingkan *constant-time*, dengan rate limit 10 gagal per kunci dan 30 gagal global per 10 menit
- Password akun disimpan ter-hash: SHA-256 iteratif dengan salt, **5.000 iterasi**, format `salt$iterasi$hash` — bukan plaintext
- Token sesi ditandatangani (HMAC), berlaku **6 jam**, dengan mekanisme **revocation / denylist jti** dan versi password (reset password atau ganti hash membunuh sesi lama)
- Login punya **rate limit** 5 gagal per username per 15 menit untuk mencegah brute-force
- Error ke user bersifat **umum** — exception runtime tidak ditampilkan ke operator, hanya dicatat di console
- **Kredensial hanya lewat body JSON, bukan header.** `X-Editor-Key` dan `X-Viewer-Token` terbukti **ditolak** di produksi, karena Apps Script web app tidak customized request header ke `e.postData.headers` (bukti L3, catatan di `Code.gs`). Jangan lullai diri dengan asumsi header sudah aman; satu-satunya jalur yang benar adalah body
- Idempotensi: body-hash + `requestId` untuk cegah double-submit; mutex Script Lock pada tulis saldo
- **Editor Key jangan dibagikan ke sembarang orang** — siapa pun yang memilikinya bisa mengubah data; di perangkat, key disimpan di storage lokal (sessionStorage/localStorage) — jangan pakai perangkat bersama tanpa logout

## Kontak / Maintainer

PT Rayard Deli Indonesia — Warehouse/Inventory Management
