import React, { useState, useEffect } from 'react';
import { BookOpen, Landmark, Wallet, History, AlertCircle } from 'lucide-react';
import JournalForm from '../components/Journal/JournalForm';
import JournalList from '../components/Journal/JournalList';
import api from '../services/api';

const TransactionCenter = () => {
  const [activeTab, setActiveTab] = useState('journal');
  const [refreshKey, setRefreshKey] = useState(0);
  const [accounts, setAccounts] = useState([]);
  const [banks, setBanks] = useState([]);
  const [cashAccounts, setCashAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Simplified Form State
  const [simpleFormData, setSimpleFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    sourceId: '',
    oppositeAccountId: '',
    amount: '',
    description: '',
    type: 'IN' // IN or OUT
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [accs, bks, cash] = await Promise.all([
        api.getAccounts(),
        api.request('/banks'),
        api.request('/cash')
      ]);
      setAccounts(accs.filter(a => !a.isHeader));
      setBanks(bks);
      setCashAccounts(cash);
      
      // Default selections
      if (bks.length > 0) setSimpleFormData(prev => ({ ...prev, sourceId: bks[0].id }));
    } catch (err) {
      console.error('Failed to load transaction data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    // Reset source selection based on tab
    if (tab === 'bank' && banks.length > 0) {
      setSimpleFormData(prev => ({ ...prev, sourceId: banks[0].id, type: 'IN' }));
    } else if (tab === 'cash' && cashAccounts.length > 0) {
      setSimpleFormData(prev => ({ ...prev, sourceId: cashAccounts[0].id, type: 'IN' }));
    }
  };

  const handleSimpleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        transactionDate: simpleFormData.date,
        description: simpleFormData.description,
        amount: parseFloat(simpleFormData.amount),
        oppositeAccountId: parseInt(simpleFormData.oppositeAccountId)
      };

      if (activeTab === 'bank') {
        await api.createBankTransaction({
          ...payload,
          bankId: parseInt(simpleFormData.sourceId),
          transactionType: simpleFormData.type === 'IN' ? 'DEPOSIT' : 'WITHDRAWAL'
        });
      } else {
        await api.createCashTransaction({
          ...payload,
          cashId: parseInt(simpleFormData.sourceId),
          transactionType: simpleFormData.type === 'IN' ? 'RECEIPT' : 'PAYMENT'
        });
      }

      alert('Transaksi berhasil disimpan!');
      setSimpleFormData(prev => ({ ...prev, amount: '', description: '' }));
      setRefreshKey(prev => prev + 1);
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Transaction Header */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">TRANSACTION CENTER</h2>
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-widest mt-1">Unified Data Entry Hub</p>
        </div>
        
        {/* Tab Switcher */}
        <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200">
          <button 
            onClick={() => handleTabChange('journal')}
            className={`flex items-center gap-2 px-6 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${
              activeTab === 'journal' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:bg-slate-200'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Jurnal Umum
          </button>
          <button 
            onClick={() => handleTabChange('bank')}
            className={`flex items-center gap-2 px-6 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${
              activeTab === 'bank' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-200'
            }`}
          >
            <Landmark className="w-4 h-4" />
            Buku Bank
          </button>
          <button 
            onClick={() => handleTabChange('cash')}
            className={`flex items-center gap-2 px-6 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${
              activeTab === 'cash' ? 'bg-green-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-200'
            }`}
          >
            <Wallet className="w-4 h-4" />
            Buku Kas
          </button>
        </div>
      </div>

      {/* Forms Area */}
      <div className="animate-in fade-in duration-500">
        {activeTab === 'journal' ? (
          <JournalForm onSuccess={() => setRefreshKey(prev => prev + 1)} />
        ) : (
          <div className="card border-t-4 border-t-blue-600">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${activeTab === 'bank' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
                  {activeTab === 'bank' ? <Landmark className="w-5 h-5" /> : <Wallet className="w-5 h-5" />}
                </div>
                {activeTab === 'bank' ? 'TRANSAKSI BANK' : 'TRANSAKSI KAS'}
              </h3>
              <div className="flex items-center gap-2 px-3 py-1 bg-slate-100 rounded text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                <AlertCircle className="w-3 h-3" />
                Auto-Posting Enabled
              </div>
            </div>
            
            <form onSubmit={handleSimpleSubmit} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                    Tanggal Transaksi
                  </label>
                  <input 
                    type="date" 
                    className="input-field border-slate-200 focus:border-slate-800"
                    value={simpleFormData.date}
                    onChange={(e) => setSimpleFormData({...simpleFormData, date: e.target.value})}
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                    {activeTab === 'bank' ? 'Rekening Bank Sumber/Tujuan' : 'Akun Kas'}
                  </label>
                  <select 
                    className="input-field border-slate-200"
                    value={simpleFormData.sourceId}
                    onChange={(e) => setSimpleFormData({...simpleFormData, sourceId: e.target.value})}
                    required
                  >
                    {activeTab === 'bank' ? 
                      banks.map(b => <option key={b.id} value={b.id}>{b.bankName} - {b.accountNumber}</option>) :
                      cashAccounts.map(c => <option key={c.id} value={c.id}>{c.cashName}</option>)
                    }
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                    Arus Kas
                  </label>
                  <div className="flex gap-1 p-1 bg-slate-100 rounded-lg">
                    <button 
                      type="button"
                      onClick={() => setSimpleFormData({...simpleFormData, type: 'IN'})}
                      className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-md transition-all ${
                        simpleFormData.type === 'IN' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-400'
                      }`}
                    >
                      Masuk
                    </button>
                    <button 
                      type="button"
                      onClick={() => setSimpleFormData({...simpleFormData, type: 'OUT'})}
                      className={`flex-1 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-md transition-all ${
                        simpleFormData.type === 'OUT' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-400'
                      }`}
                    >
                      Keluar
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                    Kategori / Akun Lawan
                  </label>
                  <select 
                    className="input-field border-slate-200"
                    value={simpleFormData.oppositeAccountId}
                    onChange={(e) => setSimpleFormData({...simpleFormData, oppositeAccountId: e.target.value})}
                    required
                  >
                    <option value="">Pilih Kategori...</option>
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.code} | {acc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                    Nominal Transaksi
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">IDR</span>
                    <input 
                      type="number" 
                      className="input-field pl-12 border-slate-200 font-bold text-slate-700"
                      placeholder="0.00"
                      value={simpleFormData.amount}
                      onChange={(e) => setSimpleFormData({...simpleFormData, amount: e.target.value})}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                    Deskripsi / Memo
                  </label>
                  <input 
                    type="text" 
                    className="input-field border-slate-200"
                    placeholder="Contoh: Pembayaran invoice..."
                    value={simpleFormData.description}
                    onChange={(e) => setSimpleFormData({...simpleFormData, description: e.target.value})}
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-slate-100">
                <button type="submit" className={`px-8 py-3 rounded-lg text-white text-xs font-bold uppercase tracking-widest transition-all shadow-lg hover:translate-y-[-2px] active:translate-y-[0] ${
                  activeTab === 'bank' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'
                }`}>
                  Simpan Transaksi
                </button>
              </div>
            </form>
          </div>
        )}
      </div>

      {/* History Area */}
      <div className="pt-6">
        <div className="flex items-center gap-3 mb-4">
          <History className="w-5 h-5 text-slate-400" />
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">Aktivitas Terakhir</h3>
        </div>
        <JournalList key={refreshKey} />
      </div>
    </div>
  );
};

export default TransactionCenter;
