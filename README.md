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
├── index.html      # Aplikasi utama (daftar item, transaksi, riwayat, dashboard, pengaturan)
├── scanner.html     # Halaman scanner kamera (dipanggil dari index.html)
├── manifest.json    # PWA manifest (nama, ikon, tema)
├── sw.js             # Service worker (offline caching)
├── icon-192.png
└── icon-512.png
```

Backend (Google Apps Script) **tidak ada di repo ini** — dikelola terpisah sebagai Apps Script project yang terhubung ke Google Sheets database.

## Cara Kerja

```
Browser (PWA)  <──HTTP GET/POST──>  Google Apps Script (Web App)  <──>  Google Sheets
```

- **GET** — ambil data (daftar item, riwayat, dashboard, dll), bisa diakses Editor maupun Viewer
- **POST** — tulis data (transaksi, tambah/edit item, dll), wajib `editorKey` yang valid

### Skema data (Google Sheets)

| Sheet | Isi |
|---|---|
| `Master_Item` | Identitas barang: ID, nama, spesifikasi, kategori, unit, min stock, status |
| `Transaksi_Log` | Riwayat semua transaksi MASUK/KELUAR (append-only) |
| `Stok_Saldo` | Saldo total per item (di-cache, direkalkulasi dari Transaksi_Log) |
| `Stok_Per_Rak` | Breakdown saldo per lokasi rak |
| `Master_Kategori` / `Master_UOM` / `Master_Vendor` / `Master_Rak` | Master data dropdown |
| `Editor_Accounts` *(opsional)* | Akun editor per-orang (nama + key), untuk identitas transaksi yang terverifikasi |
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
2. Buka menu **Lainnya → Pengaturan**, isi:
   - **Google Apps Script URL** = URL dari langkah 1.5
   - **Editor Key** = nilai `EDITOR_KEY` dari Script Properties (khusus perangkat admin/editor)
3. Untuk pengguna lihat-saja: jalankan `setupViewerAccountsSheet()` sekali dari Apps Script, isi akun di sheet `Viewer_Accounts`, lalu bagikan link app tanpa parameter apa pun

### 3. Install sebagai App (opsional)

Buka `index.html` di Chrome/Safari mobile → menu browser → **Add to Home Screen** / **Install App**.

## Deploy ke GitHub Pages

1. Settings → Pages → Source: branch `main`, folder `/ (root)`
2. Akses via `https://<username>.github.io/rdi-scanner-pwa/`

## Keamanan

- Semua aksi tulis (`postTransaksi`, `addItem`, dll) wajib `editorKey` yang cocok dengan Script Property `EDITOR_KEY`
- Password akun Viewer disimpan ter-hash (SHA-256 + salt), bukan plaintext
- Token sesi Viewer ditandatangani (HMAC), berlaku 30 hari
- **Editor Key jangan dibagikan ke sembarang orang** — siapa pun yang memilikinya bisa mengubah data

## Kontak / Maintainer

PT Rayard Deli Indonesia — Warehouse/Inventory Management
