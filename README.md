# SIAKUNT — Sistem Informasi Akuntansi Terintegrasi

**SIAKUNT** adalah aplikasi akuntansi desktop profesional yang dirancang untuk mencatat, memproses, dan melaporkan transaksi keuangan secara akurat dan efisien. Dibangun dengan arsitektur hybrid (Electron + SQLite), SIAKUNT bekerja **100% offline** tanpa perlu koneksi internet, cocok untuk usaha kecil, menengah, hingga kantor akuntansi.

---

## Daftar Isi

- [Arsitektur Aplikasi](#arsitektur-aplikasi)
- [Alur Akuntansi (Accounting Flow)](#alur-akuntansi-accounting-flow)
- [Fitur Lengkap](#fitur-lengkap)
- [Tech Stack](#tech-stack)
- [Struktur Proyek](#struktur-proyek)
- [Panduan Instalasi](#panduan-instalasi)
- [Cara Menjalankan](#cara-menjalankan)
- [Membangun Installer](#membangun-installer)
- [API Endpoints](#api-endpoints)

---

## Arsitektur Aplikasi

```
┌─────────────────────────────────────────────────────┐
│                  ELECTRON SHELL                      │
│  (Main Process: main.js)                             │
│  ┌───────────────────────────────────────────────┐  │
│  │            FRONTEND (React + Vite)            │  │
│  │  ┌─────────┐ ┌──────────┐ ┌───────────────┐  │  │
│  │  │ Dashboard│ │Transaksi │ │ Laporan       │  │  │
│  │  │   Pages  │ │  Center  │ │   Reports     │  │  │
│  │  └─────────┘ └──────────┘ └───────────────┘  │  │
│  └───────────────────────────────────────────────┘  │
│                         │ HTTP REST API              │
│  ┌───────────────────────────────────────────────┐  │
│  │         BACKEND (Node.js + Express)          │  │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────┐   │  │
│  │  │Controller │ │ Services │ │   Routes   │   │  │
│  │  └──────────┘ └──────────┘ └────────────┘   │  │
│  │         │ Prisma ORM                         │  │
│  │  ┌─────────────────────────────────┐         │  │
│  │  │       SQLite Database           │         │  │
│  │  │       (database.db)             │         │  │
│  │  └─────────────────────────────────┘         │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Komponen Utama

| Layer | Teknologi | Fungsi |
|-------|-----------|--------|
| **Desktop Shell** | Electron 30 | Membungkus aplikasi web menjadi aplikasi desktop; menjalankan backend sebagai child process; manajemen database lokal |
| **Frontend** | React 18 + Vite + Tailwind CSS | Antarmuka pengguna dengan navigasi sidebar, form input, tabel, dan laporan |
| **Backend** | Node.js + Express + Prisma | REST API untuk semua operasi CRUD, logika bisnis akuntansi, dan pembuatan laporan |
| **Database** | SQLite (via Prisma) | Penyimpanan data lokal di file `database.db`, portabel dan tanpa setup server |

### Alur Data

1. User berinteraksi dengan **Frontend React**
2. Frontend mengirim **HTTP request** ke Backend (port 3000)
3. Backend memproses logika bisnis via **Controller** dan **Prisma ORM**
4. Prisma membaca/menulis ke **SQLite database**
5. Response dikembalikan ke Frontend untuk ditampilkan

---

## Alur Akuntansi (Accounting Flow)

### 1. Chart of Accounts (Daftar Akun)

Struktur akun menggunakan hierarki 3 level:

```
Level 1 (Header)         1000  ASET
  Level 2 (Sub-header)   1100  ASET LANCAR
    Level 3 (Detail)     1110  Kas
    Level 3 (Detail)     1120  Bank
    Level 3 (Detail)     1130  Piutang Usaha
  Level 2 (Sub-header)   1200  ASET TETAP
    Level 3 (Detail)     1210  Tanah
    Level 3 (Detail)     1220  Bangunan

Level 1 (Header)         2000  KEWAJIBAN
Level 1 (Header)         3000  EKUITAS
Level 1 (Header)         4000  PENDAPATAN
Level 1 (Header)         5000  BEBAN
```

Setiap akun memiliki:
- **normal_balance**: DEBIT (untuk Aset & Beban) atau CREDIT (untuk Kewajiban, Ekuitas, Pendapatan)
- **opening_balance**: Saldo awal yang di-set saat inisialisasi
- **is_header**: Menandai apakah akun adalah header (hanya sebagai grup) atau detail (bisa diinput transaksi)

### 2. Input Jurnal

Proses pencatatan transaksi:

1. User mengisi **Journal Header**: tanggal, tipe jurnal (Umum/Penyesuaian/Penutup), referensi, deskripsi
2. User mengisi **Journal Details**: minimal 2 baris (debit dan kredit), maksimal tak terbatas
3. **Validasi balance**: Total Debit HARUS sama dengan Total Kredit (selisih maksimal 0.01)
4. Sistem meng-generate **nomor jurnal otomatis**: `JU-{tahun}-{nomor urut}` (contoh: `JU-2026-0001`)
5. Jurnal disimpan dengan status **Draft** atau langsung **Posted** (auto-posting)

### 3. Posting ke Buku Besar (General Ledger)

Ketika jurnal di-posting:

1. Sistem membaca setiap **baris detail jurnal** (per akun)
2. Menghitung **saldo berjalan (running balance)** masing-masing akun:
   - Akun normal DEBIT: `saldo_baru = saldo_lama + debit - kredit`
   - Akun normal CREDIT: `saldo_baru = saldo_lama + kredit - debit`
3. Menyimpan record ke tabel **GeneralLedger**:
   - `account_id`, `period_id`, `journal_id`
   - `transaction_date`, `description`
   - `debit`, `credit`, `balance` (running balance)
   - `reference` (nomor jurnal)
4. Menandai jurnal sebagai **isPosted = true**

### 4. Saldo Akun (Running Balance)

Saldo setiap akun dihitung secara real-time:

```
Saldo Akhir = Opening Balance + total_mutasi_debit - total_mutasi_kredit
(dengan mempertimbangkan normal_balance DEBIT/CREDIT)
```

Saldo ini bisa dilihat di **Buku Besar** per akun, yang menampilkan:
- Saldo awal
- Setiap transaksi (debit/kredit) dengan saldo setelah transaksi
- Saldo akhir

### 5. Laporan Keuangan

Sistem menghasilkan 3 laporan keuangan standar:

#### a. Neraca Saldo (Trial Balance)
Menampilkan seluruh akun beserta saldo debit/kredit untuk memverifikasi keseimbangan.
```
Akun       | Debit      | Kredit     | Saldo Akhir
Kas        | 50.000.000 | 10.000.000 | 60.000.000
Bank       | 100.000.000| 0          | 100.000.000
...        | ...        | ...        | ...
TOTAL      | xxx        | xxx        |
```
- **Seimbang** jika total Debit = total Kredit

#### b. Laporan Rugi Laba (Income Statement)
Menampilkan kinerja perusahaan dalam periode tertentu:
```
PENDAPATAN
  Pendapatan Usaha        xxx
  Pendapatan Lain-lain    xxx
Total Pendapatan          xxx

BEBAN
  Harga Pokok Penjualan   xxx
  Beban Gaji              xxx
  Beban Sewa              xxx
Total Beban               xxx

LABA/RUGI BERSIH         xxx
```
- Pendapatan > Beban = **Laba** (positif)
- Pendapatan < Beban = **Rugi** (negatif)

#### c. Neraca (Balance Sheet)
Menampilkan posisi keuangan pada tanggal tertentu:
```
ASET                          KEWAJIBAN + EKUITAS
  Aset Lancar     xxx           Kewajiban Lancar   xxx
  Aset Tetap      xxx           Ekuitas            xxx
---------------------        ------------------------
TOTAL ASET       xxx          TOTAL KEWAJIBAN     xxx
                               + EKUITAS
```
- Harus **Seimbang**: Total Aset = Total Kewajiban + Ekuitas

### 6. Buku Bank & Buku Kas

**Transaksi Bank dan Kas** memiliki alur khusus:

1. User memilih jenis (Masuk/Keluar), akun sumber, nominal, dan akun lawan
2. Sistem secara **otomatis membuat jurnal** dengan 2 baris:
   - **Setoran (Masuk)**: Debit Bank/Kas, Kredit akun lawan (misal: Pendapatan)
   - **Penarikan (Keluar)**: Debit akun lawan (misal: Beban), Kredit Bank/Kas
3. Jurnal langsung di-**posting otomatis** (auto-posting)
4. Saldo Bank/Kas langsung ter-update

---

## Fitur Lengkap

### Manajemen Akun
| Fitur | Keterangan |
|-------|-----------|
| Chart of Accounts | Struktur hierarki 3 level (Header → Sub-header → Detail) |
| Kode Akun | Format numerik 4 digit (1000, 1100, 1110, dll.) |
| Tipe Akun | ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE |
| Normal Balance | Setiap akun memiliki posisi normal DEBIT atau CREDIT |
| Saldo Awal | Opening balance bisa di-set per akun |
| Aktif/Nonaktif | Akun bisa dinonaktifkan tanpa menghapus histori |

### Input Transaksi
| Fitur | Keterangan |
|-------|-----------|
| Jurnal Umum | Input jurnal dengan jumlah baris tak terbatas |
| Validasi Balance | Validasi otomatis total Debit = total Kredit |
| Auto Numbering | Nomor jurnal di-generate otomatis (JU-YYYY-XXXX) |
| Auto Posting | Jurnal otomatis diposting ke Buku Besar saat disimpan |
| Draft & Posted | Status jurnal tercatat; bisa posting manual nanti |
| Transaksi Bank | Input setoran/penarikan bank dengan pembuatan jurnal otomatis |
| Transaksi Kas | Input penerimaan/pengeluaran kas dengan pembuatan jurnal otomatis |

### Buku Besar (General Ledger)
| Fitur | Keterangan |
|-------|-----------|
| Running Balance | Saldo berjalan dihitung otomatis per transaksi |
| Filter Akun | Pilih akun untuk melihat detail mutasi |
| Filter Periode | Batasi tanggal awal dan akhir |
| Referensi Jurnal | Setiap entri menampilkan nomor jurnal asal |

### Laporan Keuangan
| Fitur | Keterangan |
|-------|-----------|
| Neraca Saldo | Trial Balance dengan total debit/kredit dan indikator seimbang |
| Rugi Laba | Income Statement dengan pendapatan, beban, dan laba/rugi bersih |
| Neraca | Balance Sheet dengan total aset = total kewajiban + ekuitas |
| Format Rupiah | Semua angka ditampilkan dalam format IDR (Rp) |

### Antarmuka
| Fitur | Keterangan |
|-------|-----------|
| Dashboard | Ringkasan total aset, kewajiban, ekuitas, saldo kas, dan jurnal terbaru |
| Sidebar Navigasi | Menu lengkap ke semua modul |
| Transaction Center | Input terpadu untuk jurnal, bank, dan kas dalam satu halaman |
| Riwayat Jurnal | Daftar jurnal dengan pagination, filter, dan aksi posting |
| Export | Persiapan untuk export Excel/PDF |
| Dark Sidebar | Tema slate-800 profesional |

### Desktop (Electron)
| Fitur | Keterangan |
|-------|-----------|
| Offline First | 100% berjalan di lokal tanpa internet |
| Sidecar Backend | Backend Node.js dijalankan otomatis sebagai child process |
| Database Portabel | SQLite di folder User Data, aman saat update aplikasi |
| Self-Contained | Installer siap pakai tanpa perlu Node.js, Git, atau Docker |
| Hot Reload Dev | Mode development dengan Vite HMR + Nodemon |

---

## Tech Stack

| Layer | Teknologi | Versi |
|-------|-----------|-------|
| **Desktop Shell** | Electron | 30.x |
| **Frontend Framework** | React | 18.x |
| **Frontend Build** | Vite | 5.x |
| **CSS Framework** | Tailwind CSS | 3.x |
| **Icons** | Lucide React | 0.x |
| **Routing** | React Router DOM | 6.x |
| **Backend Runtime** | Node.js | 20.x |
| **Backend Framework** | Express | 4.x |
| **ORM** | Prisma | 5.x |
| **Database** | SQLite | (via Prisma) |
| **Charts** | Recharts | 2.x |
| **Packaging** | electron-builder | 24.x |

---

## Struktur Proyek

```
akun-system/
├── main.js                      # Electron main process
├── package.json                 # Root config, build scripts
├── setup-local.sh               # Inisialisasi database
├── push.sh                      # Deploy script
│
├── backend/                     # REST API Server
│   ├── prisma/
│   │   ├── schema.prisma        # Database schema (9 models)
│   │   ├── seed.js              # Seed data (20 akun, 1 periode, 1 jurnal)
│   │   ├── trigger_setup.sql    # PostgreSQL triggers (referensi)
│   │   ├── dev.db               # SQLite database (development)
│   │   └── template.sqlite      # Template database untuk produksi
│   │
│   ├── src/
│   │   ├── app.js               # Entry point Express
│   │   ├── controllers/
│   │   │   ├── journalController.js   # CRUD jurnal + posting logic
│   │   │   └── reportController.js    # Trial Balance, Income, Balance Sheet
│   │   ├── routes/
│   │   │   ├── accounts.js      # CRUD daftar akun
│   │   │   ├── journals.js      # Routes jurnal
│   │   │   ├── reports.js       # Routes laporan
│   │   │   ├── banks.js         # Bank + transaksi bank
│   │   │   └── cash.js          # Kas + transaksi kas
│   │   └── middleware/
│   │       └── simpleAuth.js    # Auth opsional (token sederhana)
│   │
│   ├── package.json
│   ├── Dockerfile
│   └── .env
│
├── frontend/                    # React UI
│   ├── src/
│   │   ├── App.jsx              # Routing utama + layout
│   │   ├── main.jsx             # Entry point React
│   │   ├── index.css            # Tailwind directives
│   │   │
│   │   ├── components/
│   │   │   ├── Layout/
│   │   │   │   ├── Sidebar.jsx  # Navigasi sidebar
│   │   │   │   └── Header.jsx   # Header dengan tanggal
│   │   │   ├── Journal/
│   │   │   │   ├── JournalForm.jsx   # Form input jurnal
│   │   │   │   └── JournalList.jsx   # Tabel daftar jurnal
│   │   │   └── Reports/
│   │   │       ├── TrialBalance.jsx   # Laporan neraca saldo
│   │   │       ├── IncomeStatement.jsx # Laporan rugi laba
│   │   │       └── BalanceSheet.jsx   # Laporan neraca
│   │   │
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx          # Halaman utama
│   │   │   ├── TransactionCenter.jsx  # Input transaksi terpadu
│   │   │   ├── JournalHistoryPage.jsx # Riwayat jurnal
│   │   │   ├── LedgerPage.jsx         # Buku besar
│   │   │   ├── BankPage.jsx           # Buku bank
│   │   │   ├── CashPage.jsx           # Buku kas
│   │   │   ├── ReportsPage.jsx        # Laporan keuangan
│   │   │   ├── AccountsPage.jsx       # Daftar akun
│   │   │   └── SettingsPage.jsx       # Pengaturan
│   │   │
│   │   ├── services/
│   │   │   └── api.js            # API client (fetch wrapper)
│   │   └── hooks/
│   │       └── useApi.js
│   │
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── package.json
│   ├── Dockerfile
│   └── .env
│
├── build/                       # Icons untuk installer
├── docker-compose.yml           # PostgreSQL mode (development)
├── docker-compose.prod.yml      # Production compose
└── AGENTS.md                    # Panduan untuk AI coding assistant
```

### Database Schema (9 Models)

| Model | Tabel | Deskripsi |
|-------|-------|-----------|
| **Account** | `accounts` | Chart of Accounts dengan hierarki parent-child |
| **AccountingPeriod** | `accounting_periods` | Periode akuntansi (bulanan/tahunan) |
| **JournalHeader** | `journal_headers` | Header jurnal (no, tanggal, tipe, total) |
| **JournalDetail** | `journal_details` | Baris jurnal (akun, debit, kredit) |
| **GeneralLedger** | `general_ledger` | Buku besar (running balance per akun) |
| **Bank** | `banks` | Data rekening bank |
| **BankTransaction** | `bank_transactions` | Transaksi bank (setoran/penarikan) |
| **CashAccount** | `cash_accounts` | Data akun kas |
| **CashTransaction** | `cash_transactions` | Transaksi kas (penerimaan/pengeluaran) |
| **TrialBalance** | `trial_balances` | Snapshot neraca saldo per periode |

---

## Panduan Instalasi

### Prasyarat

- **Node.js** versi 18 atau 20 ([download](https://nodejs.org/))
- **Git** ([download](https://git-scm.com/))

### Instalasi Development

```bash
# 1. Clone repositori
git clone <url-repo>
cd akun-system

# 2. Install semua dependencies
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# 3. Inisialisasi database (seed data)
bash setup-local.sh
```

### Seed Data (Default)

Setelah inisialisasi, sistem memiliki data awal:

**Periode Akuntansi:** Mei 2026

**20 Akun** dengan saldo awal:

| Kode | Nama Akun | Tipe | Saldo Awal |
|------|-----------|------|-----------|
| 1110 | Kas | Aset Lancar | Rp 50.000.000 |
| 1120 | Bank | Aset Lancar | Rp 100.000.000 |
| 1130 | Piutang Usaha | Aset Lancar | Rp 25.000.000 |
| 1140 | Persediaan Barang | Aset Lancar | Rp 75.000.000 |
| 1210 | Tanah | Aset Tetap | Rp 200.000.000 |
| 1220 | Bangunan | Aset Tetap | Rp 500.000.000 |
| 1230 | Akum. Penyusutan | Aset Tetap | Rp 50.000.000 |
| 2110 | Hutang Usaha | Kewajiban | Rp 30.000.000 |
| 2120 | Hutang Bank | Kewajiban | Rp 100.000.000 |
| 3100 | Modal Pemilik | Ekuitas | Rp 500.000.000 |
| 3200 | Laba Ditahan | Ekuitas | Rp 270.000.000 |
| *(dan 9 akun lainnya)* | | | |

**Data Bank:** Bank BCA (No. Rek: 1234567890, Saldo: Rp 100.000.000)

**Data Kas:** Kas Pusat (Saldo: Rp 50.000.000)

**Jurnal Awal:** Setoran Modal Awal Rp 10.000.000 (sudah di-posting)

---

## Cara Menjalankan

### Mode Development (dengan Hot Reload)

```bash
# Jalankan semua komponen (backend + frontend + electron)
npm start
```

Atau secara terpisah:

```bash
# Terminal 1: Backend API
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev

# Terminal 3: Electron (setelah frontend siap)
npm run start:electron
```

### Akses Aplikasi

| Komponen | URL |
|----------|-----|
| Frontend (browser) | http://localhost:5173 |
| Backend API | http://localhost:3000 |
| Health Check | http://localhost:3000/api/health |
| Database (SQLite) | `backend/prisma/dev.db` |

### Mode Production (Docker dengan PostgreSQL)

```bash
# Menggunakan PostgreSQL (bukan SQLite)
docker-compose up --build
```

---

## Membangun Installer

Untuk mendistribusikan aplikasi ke klien (tanpa perlu Node.js dan Git):

```bash
# Build frontend + package Electron
npm run build
```

Hasil build akan berada di folder `dist-electron/`:

| Platform | File |
|----------|------|
| **Windows** | `SIAKUNT Setup 1.0.0.exe` |
| **macOS** | `SIAKUNT-1.0.0.dmg` |

Atau build per platform:

```bash
npm run build:win   # Windows saja
npm run build:mac   # macOS saja
```

Klien cukup mengklik installer dan aplikasi siap digunakan secara offline.

---

## API Endpoints

### Health
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/api/health` | Status server |

### Accounts
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/api/accounts` | Mendapatkan semua akun |
| GET | `/api/accounts/:id` | Detail akun + parent + children |
| POST | `/api/accounts` | Membuat akun baru |
| PUT | `/api/accounts/:id` | Update akun (nama, aktif, saldo) |

### Journals
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| POST | `/api/journals` | Membuat jurnal baru (auto-posting) |
| GET | `/api/journals` | Daftar jurnal (pagination, filter) |
| POST | `/api/journals/:id/post` | Posting jurnal ke buku besar |
| GET | `/api/journals/ledger/:accountId` | Buku besar per akun |

### Reports
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/api/reports/trial-balance` | Neraca saldo |
| GET | `/api/reports/income-statement` | Rugi laba (startDate, endDate) |
| GET | `/api/reports/balance-sheet` | Neraca (asOfDate) |

### Banks
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/api/banks` | Daftar rekening bank |
| GET | `/api/banks/:id/transactions` | Transaksi bank tertentu |
| POST | `/api/banks/transaction` | Transaksi bank baru (auto-journal) |

### Cash
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/api/cash` | Daftar akun kas |
| GET | `/api/cash/:id/transactions` | Transaksi kas tertentu |
| POST | `/api/cash/transaction` | Transaksi kas baru (auto-journal) |

---

## Lisensi

Hak cipta dilindungi. Proyek ini bersifat proprietary.

---

Dibangun untuk akuntansi profesional yang akurat, cepat, dan terpercaya.
