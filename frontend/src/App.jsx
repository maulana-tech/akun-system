import React from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Sidebar from './components/Layout/Sidebar';
import Header from './components/Layout/Header';

// Pages
import Dashboard from './pages/Dashboard';
import JournalPage from './pages/JournalPage';
import LedgerPage from './pages/LedgerPage';
import ReportsPage from './pages/ReportsPage';
import BankPage from './pages/BankPage';
import CashPage from './pages/CashPage';
import SettingsPage from './pages/SettingsPage';

function App() {
  const location = useLocation();
  
  // Mapping path to title
  const getTitle = () => {
    switch (location.pathname) {
      case '/': return 'Dashboard';
      case '/jurnal': return 'Jurnal Umum';
      case '/ledger': return 'Buku Besar';
      case '/bank': return 'Buku Bank';
      case '/kas': return 'Buku Kas';
      case '/laporan': return 'Laporan Keuangan';
      case '/pengaturan': return 'Pengaturan';
      default: return 'Sistem Akuntansi';
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      <Sidebar />
      
      <div className="flex-1 flex flex-col">
        <Header title={getTitle()} />
        
        <main className="flex-1 p-6 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/jurnal" element={<JournalPage />} />
            <Route path="/ledger" element={<LedgerPage />} />
            <Route path="/bank" element={<BankPage />} />
            <Route path="/kas" element={<CashPage />} />
            <Route path="/laporan" element={<ReportsPage />} />
            <Route path="/pengaturan" element={<SettingsPage />} />
          </Routes>
        </main>
        
        <footer className="bg-white border-t px-6 py-4 text-center text-xs text-gray-500">
          &copy; 2026 Sistem Akuntansi Modern - Built for Precision
        </footer>
      </div>
    </div>
  );
}

export default App;
