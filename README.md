<!-- =========================================================
  README.md
  Project: Kas Badminton Pinus 2
  Website transparansi dana kas + iuran badminton
  Hosting: GitHub Pages
  Database: Firebase Firestore (tanpa login, hemat limit)
========================================================= -->

# 🏸 Kas Badminton Pinus 2
Website transparansi kas & iuran komunitas **Badminton Pinus 2**.  
Tujuan: **Transparansi, Solidaritas Team, Sehat Bareng.**

---

## ✅ Fitur Utama
- **Dashboard otomatis**:
  - Saldo total (GLOBAL) semua bulan
  - Total membership bulan ini
  - Total iuran main (Sabtu) bulan ini
  - Total pengeluaran bulan ini
- **Laporan transaksi** (filter bulan/tahun)
- **Anggota + status membership** (Lunas / Belum)
- **Top 5 Telat bayar membership bulan ini**
- **Admin panel** (pakai kode admin)
  - Input pemasukan (membership / main)
  - Input pengeluaran
  - Tambah anggota (tanpa Firebase Console)
  - Hapus anggota terpilih
- Export laporan:
  - **CSV**
  - **PDF** (print → save as PDF)

---

## 🌐 Link Website
- GitHub Pages: `https://vicky-790.github.io/kas-badminton-pinus2/`

---

## 🔐 Admin
Admin panel terkunci oleh kode.

- **Kode admin default:** `pinus2`
- Bisa kamu ubah di file `app.js`

Cari bagian ini:
```js
const ADMIN_CODE = "pinus2";
