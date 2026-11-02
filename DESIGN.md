# DESIGN.md - RDI Indirect Scanner

Dokumen arah desain. Isinya mendeskripsikan apa yang SUDAH dipakai aplikasi (v15.39),
bukan mengganti arah. Dibuat 2026-11-01 dari audit antislop 001.

## 1. Identitas

- Produk: RDI Indirect Scanner, aplikasi inventaris spare part, tools, dan indirect PT Rayard Deli Indonesia.
- Pengguna: operator gudang, admin gudang, dan viewer (akses lihat saja).
- Konteks pakai: HP di area gudang, satu tangan, kadang dengan sarung tangan, cahaya terang, jaringan tidak stabil.
- Karakter yang dituju: alat kerja yang cepat dibaca, bukan landing page marketing.

## 2. Dial

Dial: ENERGY 1 / RHYTHM 2 / MOTION 1.

- ENERGY 1 (tenang): layar penuh data tabel dan form. Animasi berlebih mengganggu input cepat.
- RHYTHM 2 (konsisten dengan beberapa jeda): sebagian besar layar memakai pola kartu dan tabel yang sama; jeda hanya pada ringkasan dashboard dan konfirmasi.
- MOTION 1 (hover dan transisi saja): transisi 80 sampai 300 ms untuk sheet, overlay, dan toast. Tidak ada parallax atau animasi dekoratif. Semua non-esensial berhenti saat prefers-reduced-motion.

## 3. Palet

Warna inti (2 warna inti + netral + aksen semantik):

| Peran | Token | Nilai |
|---|---|---|
| Brand 1 | --brand-1 | #0057C2 |
| Brand 2 | --brand-2 | #0060DF |
| Aksi | --action | #0067E2 |
| Aksi gelap | --action-dark | #0047B0 |
| Latar | --bg | #F1F4F9 |
| Permukaan | --surface | #FFFFFF |
| Teks utama | --text | #0F172A |
| Teks sekunder | --text2 | #475569 |
| Teks tersier | --text3 | #5A6A81 |
| Sukses | --green / --green-text | #15803D / #166534 |
| Bahaya | --red / --red-text | #b91c1c / #991b1b |
| Peringatan | --amber | #B45309 |

Alasan: navy dan biru dipakai untuk menandai aksi utama dan identitas perusahaan.
Hijau, merah, dan amber hanya muncul sebagai status data (masuk, keluar, stok rendah),
bukan sebagai dekorasi.

Kontras terukur (audit 001): --text 16,19:1, --text2 6,87:1, --text3 5,0:1 terhadap --bg.
Semua di atas minimum WCAG AA 4,5:1.

## 4. Tipografi

- --font-sans: Inter, dengan fallback system-ui, Segoe UI, Roboto, Arial.
  Alasan: label tabel berukuran 12 sampai 13 px di HP harus tetap tajam, dan Inter punya
  tinggi x yang tinggi serta angka yang mudah dibedakan. Fallback sistem dipakai agar
  aplikasi tidak bergantung pada unduhan font.
- --font-mono: JetBrains Mono, dengan fallback ui-monospace, Consolas.
  Alasan: kode alat, nomor urut, dan angka stok dibaca cepat dan rawan tertukar;
  lebar karakter monospace membuat digit seperti 0/O dan 1/l tidak ambigu.

Dilarang menambah typeface dekoratif tanpa alasan tertulis di dokumen ini.

## 5. Bentuk, elevasi, dan gerak

- Radius: skala --br-2 sampai --br-999. Kartu dan panel memakai 12 sampai 16 px,
  kontrol kecil 8 sampai 10 px, badge dan chip memakai 999 px karena bentuk pil
  menandai status, bukan gaya default semua elemen.
- Elevasi: --elev-1 (kartu diam), --elev-2 (kartu terangkat), --elev-3 (sheet dan modal).
  Bayangan menandai lapisan, bukan hiasan.
- Gerak: --dur-fast 80 ms sampai --dur-base 150 ms untuk umpan balik, --dur-sheet-in 300 ms
  untuk sheet. Semua transisi memakai --ease-std kecuali sheet memakai --ease-sheet.
- Spasi: kelipatan 8 px (--space-1 sampai --space-6).

## 6. Aksesibilitas (wajib)

- Kontras teks minimum 4,5:1 (teks normal) dan 3:1 (teks 18 px ke atas).
- Target sentuh minimum 44 px pada viewport pointer kasar (HP dan tablet).
- Indikator fokus terlihat: outline 2 px warna --amber dengan offset 2 px.
- Setiap kontrol punya nama aksesibel. Ikon dekoratif memakai aria-hidden.
- Status data memakai role=status atau role=alert dengan aria-live.
- Animasi non-esensial berhenti pada prefers-reduced-motion.

## 7. Larangan

- Em dash (karakter U+2014) pada teks baru. Pakai koma, titik dua, titik, atau tanda hubung.
- Menambah gradient, glow, atau blur baru tanpa alasan hierarki yang tertulis.
- Klaim angka atau testimoni tanpa sumber nyata.
- Mengubah tema menjadi gelap. Mode gelap dihapus pada 2026 karena tombol tema
  memakan ruang topbar HP tanpa menambah informasi; aplikasi selalu terang.
