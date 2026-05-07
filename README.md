# SIAKUNT - Professional Accounting Desktop

A high-fidelity, professional accounting system built for speed, accuracy, and ease of use. This application is designed as a **Hybrid Desktop App** (Electron + SQLite) that works 100% offline but can be extended for cloud synchronization.

## 🚀 Key Features

- **Unified Transaction Center**: Manage Journal, Bank, and Cash transactions in a single, streamlined interface.
- **Auto-Posting Engine**: Intelligent background logic that automatically updates the General Ledger and calculates balances in real-time.
- **Enterprise-Grade UI**: Clean, high-contrast, professional design (Slate-800 theme) optimized for daily accounting workflows.
- **Editable Chart of Accounts (CoA)**: Fully customizable accounts with support for opening balances and multi-level hierarchies.
- **Comprehensive Reports**: Generate Trial Balances, Income Statements, and Balance Sheets with one click.
- **Offline First**: Runs entirely on your machine with a local SQLite database—zero internet required.

## 🛠 Tech Stack

- **Frontend**: React.js, Vite, Tailwind CSS, Lucide Icons.
- **Backend**: Node.js, Express, Prisma ORM.
- **Database**: SQLite (Local file-based).
- **Desktop Shell**: Electron.js.

## 🏁 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (Recommended version 18 or 20)
- [Git](https://git-scm.com/)

### Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone <your-repo-url>
   cd akun-system
   ```

2. **Install all dependencies**:
   ```bash
   npm install
   ```

3. **Initialize the local database**:
   Run the automated setup script to create the database and seed initial accounts:
   ```bash
   bash setup-local.sh
   ```

## 💻 Running the App

To start the application in development mode (with Hot Reload):
```bash
npm start
```

## 📦 Building for Production

To generate a standalone installer (`.exe` or `.dmg`) for your clients:
```bash
npm run build
```
The installer will be generated in the `dist-electron/` directory.

---

## 📖 Panduan Penginstalan (Untuk Klien)

Ikuti langkah-langkah berikut untuk memberikan aplikasi ini kepada klien Anda:

### 1. Persiapan Build
Pastikan Anda sudah menjalankan `bash setup-local.sh` di komputer pengembangan Anda sebelum melakukan build agar database awal sudah siap (opsional, aplikasi akan membuat database baru jika belum ada).

### 2. Membuat Installer
Jalankan perintah build:
```bash
npm run build
```
Hasil build akan berada di folder `dist-electron/`. Anda akan melihat file:
- **Windows**: `SIAKUNT Setup 1.0.0.exe`
- **Mac**: `SIAKUNT-1.0.0.dmg`

### 3. Cara Instalasi di Komputer Klien
Anda hanya perlu mengirimkan file `.exe` atau `.dmg` tersebut ke klien. Klien **TIDAK PERLU** menginstal Node.js, Git, atau Docker.

**Langkah Klien:**
1.  Klik dua kali pada file `SIAKUNT Setup 1.0.0.exe`.
2.  Ikuti instruksi instalasi (Next -> Finish).
3.  Aplikasi **SIAKUNT** akan muncul di Desktop atau Start Menu.
4.  Buka aplikasi, dan sistem siap digunakan secara offline.

### 4. Lokasi Data
Semua data transaksi klien akan disimpan secara lokal di folder data aplikasi masing-masing sistem operasi, sehingga aman dan tidak akan hilang saat aplikasi diupdate.

---

## 📂 Project Structure

```text
├── backend/            # API, Prisma models, and Business Logic
├── frontend/           # React application and UI components
├── main.js             # Electron main process
├── package.json        # Root configuration and build scripts
└── setup-local.sh      # Automated database initialization script
```

## 🛡 License
This project is proprietary. All rights reserved.

---
Built with ❤️ for professional accounting.
