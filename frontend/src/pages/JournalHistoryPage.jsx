import React, { useState } from 'react';
import { Search, Filter, FileText, Download } from 'lucide-react';
import JournalList from '../components/Journal/JournalList';

const JournalHistoryPage = () => {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight text-right md:text-left">RIWAYAT JURNAL</h2>
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-widest mt-1">General Ledger & Transaction History</p>
        </div>
        
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50 transition-all">
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card py-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[300px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Cari nomor jurnal, keterangan, atau referensi..." 
              className="input-field pl-10 border-slate-200 focus:border-slate-800 text-sm"
            />
          </div>
          
          <div className="flex gap-2">
            <select className="input-field border-slate-200 text-sm py-2">
              <option value="">Semua Tipe</option>
              <option value="GENERAL">Umum</option>
              <option value="ADJUSTING">Penyesuaian</option>
              <option value="CLOSING">Penutup</option>
            </select>
            
            <input type="date" className="input-field border-slate-200 text-sm py-2" />
            
            <button className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-slate-700 transition-all">
              <Filter className="w-4 h-4" />
              Terapkan Filter
            </button>
          </div>
        </div>
      </div>

      {/* Main List */}
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
        <JournalList key={refreshKey} />
      </div>
    </div>
  );
};

export default JournalHistoryPage;
