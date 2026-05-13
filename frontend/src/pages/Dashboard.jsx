import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  TrendingUp, TrendingDown, Wallet, CreditCard,
  ArrowUpRight, ArrowDownRight, Plus, Landmark, 
  PiggyBank, RefreshCw, X, DollarSign, Building
} from 'lucide-react';
import api from '../services/api';

const StatCard = ({ title, amount, icon: Icon, trend, trendUp, color }) => (
  <div className="card">
    <div className="flex justify-between items-start">
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-slate-800">
          {parseFloat(amount).toLocaleString('id-ID')}
        </h3>
      </div>
      <div className={`p-2 rounded border ${color.replace('bg-', 'text-').replace('-500', '-600')} ${color.replace('bg-', 'bg-').replace('-500', '-50')}`}>
        <Icon className="w-5 h-5" />
      </div>
    </div>
    {trend && (
      <div className={`flex items-center gap-1 mt-4 text-[11px] font-medium ${trendUp ? 'text-emerald-600' : 'text-rose-600'}`}>
        {trendUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
        <span>{trend}</span>
      </div>
    )}
  </div>
);

const QuickActionCard = ({ icon: Icon, label, desc, color, onClick }) => (
  <button onClick={onClick} className="card group cursor-pointer hover:shadow-lg transition-all text-left">
    <div className="flex items-center gap-4">
      <div className={`p-3 rounded-lg ${color} group-hover:scale-110 transition-transform`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <p className="text-sm font-bold text-slate-800">{label}</p>
        <p className="text-xs text-slate-500">{desc}</p>
      </div>
    </div>
  </button>
);

const SetoranModal = ({ isOpen, onClose, onSuccess }) => {
  const [accounts, setAccounts] = useState([]);
  const [banks, setBanks] = useState([]);
  const [cashAccounts, setCashAccounts] = useState([]);
  const [sourceType, setSourceType] = useState('cash');
  const [form, setForm] = useState({
    sourceId: '',
    amount: '',
    description: '',
    date: new Date().toISOString().split('T')[0]
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    loadData();
  }, [isOpen]);

  const loadData = async () => {
    try {
      const [accs, bks, cash] = await Promise.all([
        api.getAccounts(),
        api.request('/banks'),
        api.request('/cash')
      ]);
      const detailAccs = accs.filter(a => !a.isHeader);
      setAccounts(detailAccs);
      setBanks(bks);
      setCashAccounts(cash);
      if (bks.length > 0) setForm(prev => ({ ...prev, sourceId: bks[0].id }));
    } catch (err) {
      setError('Gagal memuat data');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const amount = parseFloat(form.amount);
      if (!amount || amount <= 0) {
        setError('Jumlah harus lebih dari 0');
        setLoading(false);
        return;
      }

      const modalAccount = accounts.find(a => a.code === '3100');
      if (!modalAccount) {
        setError('Akun Modal Pemilik (3100) tidak ditemukan');
        setLoading(false);
        return;
      }

      let sourceAccountId;
      if (sourceType === 'bank') {
        const bank = banks.find(b => b.id === parseInt(form.sourceId));
        if (!bank) throw new Error('Bank tidak ditemukan');
        sourceAccountId = bank.accountId;
      } else {
        const cash = cashAccounts.find(c => c.id === parseInt(form.sourceId));
        if (!cash) throw new Error('Akun kas tidak ditemukan');
        sourceAccountId = cash.accountId;
      }

      const journalData = {
        journalDate: form.date,
        periodId: 1,
        journalType: 'GENERAL',
        reference: 'MODAL',
        description: form.description || `Setoran Modal - ${sourceType === 'bank' ? 'Bank' : 'Kas'}`,
        details: [
          { accountId: sourceAccountId, description: 'Setoran Modal', debit: amount, credit: 0 },
          { accountId: modalAccount.id, description: 'Setoran Modal', debit: 0, credit: amount }
        ]
      };

      await api.createJournal(journalData);
      onSuccess?.();
      onClose();
      setForm(prev => ({ ...prev, amount: '', description: '' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-100 text-emerald-600">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Setoran Modal</h2>
              <p className="text-xs text-slate-500">Setoran modal pemilik ke perusahaan</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
              Sumber Dana
            </label>
            <div className="flex gap-2 mb-3">
              <button type="button" onClick={() => { setSourceType('cash'); setForm(prev => ({ ...prev, sourceId: cashAccounts[0]?.id || '' })); }}
                className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                  sourceType === 'cash' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-100 text-slate-500'
                }`}
              >
                Kas
              </button>
              <button type="button" onClick={() => { setSourceType('bank'); setForm(prev => ({ ...prev, sourceId: banks[0]?.id || '' })); }}
                className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                  sourceType === 'bank' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 text-slate-500'
                }`}
              >
                Bank
              </button>
            </div>
            <select value={form.sourceId} onChange={(e) => setForm({...form, sourceId: e.target.value})}
              className="input-field" required
            >
              {sourceType === 'bank'
                ? banks.map(b => <option key={b.id} value={b.id}>{b.bankName} - {b.accountNumber}</option>)
                : cashAccounts.map(c => <option key={c.id} value={c.id}>{c.cashName}</option>)
              }
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                Tanggal
              </label>
              <input type="date" value={form.date} onChange={(e) => setForm({...form, date: e.target.value})}
                className="input-field" required
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                Jumlah Setoran
              </label>
              <input type="number" value={form.amount} onChange={(e) => setForm({...form, amount: e.target.value})}
                className="input-field" placeholder="0" min="0" required
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
              Keterangan
            </label>
            <input type="text" value={form.description} onChange={(e) => setForm({...form, description: e.target.value})}
              className="input-field" placeholder="Setoran modal awal / tambahan..."
            />
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <p className="text-xs text-slate-500">
              <span className="font-bold text-slate-700">Jurnal yang akan dibuat:</span><br/>
              Debit: <span className="font-semibold">{sourceType === 'bank' ? 'Bank' : 'Kas'}</span>
              {' → '}Kredit: <span className="font-semibold">Modal Pemilik</span>
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-6 py-2.5 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Batal
            </button>
            <button type="submit" disabled={loading}
              className="px-8 py-2.5 rounded-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 transition-colors shadow-lg"
            >
              {loading ? 'Memproses...' : 'Simpan Setoran'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalAssets: 0, totalLiabilities: 0, totalEquity: 0,
    cashBalance: 0, bankBalance: 0, bankNames: []
  });
  const [recentJournals, setRecentJournals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(true);
  const [showSetoranModal, setShowSetoranModal] = useState(false);
  const intervalRef = useRef(null);

  const loadDashboardData = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const [bs, journals, banks] = await Promise.all([
        api.getBalanceSheet(today),
        api.getJournals({ limit: 5 }),
        api.request('/banks')
      ]);

      const bankSum = banks.reduce((s, b) => s + parseFloat(b.currentBalance || 0), 0);
      const bankNames = banks.map(b => ({ name: b.bankName, balance: b.currentBalance }));

      setStats({
        totalAssets: bs.summary.totalAssets,
        totalLiabilities: bs.summary.totalLiabilities,
        totalEquity: bs.summary.totalEquity,
        cashBalance: bs.assets.find(a => a.code === '1110')?.amount || 0,
        bankBalance: bankSum,
        bankNames
      });
      setRecentJournals(journals.data || []);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();

    intervalRef.current = setInterval(loadDashboardData, 30000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setIsLive(true);
        loadDashboardData();
      } else {
        setIsLive(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loadDashboardData]);

  const handleRefresh = () => {
    loadDashboardData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-800"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">DASHBOARD</h2>
          <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
            isLive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            {isLive ? 'LIVE' : 'PAUSED'}
          </span>
        </div>
        <button onClick={handleRefresh}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-200 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          REFRESH
        </button>
      </div>

      {/* Quick Action Buttons */}
      <div className="grid grid-cols-4 gap-4">
        <QuickActionCard
          icon={Plus} label="Jurnal Baru" desc="Input jurnal umum"
          color="bg-slate-700" onClick={() => navigate('/input', { state: { tab: 'journal' } })}
        />
        <QuickActionCard
          icon={DollarSign} label="Setoran Modal" desc="Setor modal pemilik"
          color="bg-emerald-600" onClick={() => setShowSetoranModal(true)}
        />
        <QuickActionCard
          icon={Landmark} label="Transaksi Bank" desc="Setor/tarik bank"
          color="bg-blue-600" onClick={() => navigate('/input', { state: { tab: 'bank' } })}
        />
        <QuickActionCard
          icon={Wallet} label="Transaksi Kas" desc="Terima/bayar kas"
          color="bg-amber-600" onClick={() => navigate('/input', { state: { tab: 'cash' } })}
        />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-6">
        <StatCard title="Total Aset" amount={stats.totalAssets} icon={Wallet} color="bg-slate-500" />
        <StatCard title="Total Kewajiban" amount={stats.totalLiabilities} icon={CreditCard} color="bg-slate-500" />
        <StatCard title="Ekuitas" amount={stats.totalEquity} icon={TrendingUp} color="bg-slate-500" />
        <StatCard title="Saldo Kas & Bank" amount={stats.cashBalance + stats.bankBalance} icon={PiggyBank} color="bg-slate-500" />
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-3 gap-6">
        <div className="card col-span-2">
          <h3 className="text-lg font-semibold mb-4">Jurnal Terbaru</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">No. Jurnal</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Tanggal</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Keterangan</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Total</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {recentJournals.map((journal) => (
                  <tr key={journal.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-blue-600">{journal.journalNo}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(journal.journalDate).toLocaleDateString('id-ID')}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 truncate max-w-xs">
                      {journal.description || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium">
                      Rp {parseFloat(journal.totalDebit).toLocaleString('id-ID')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        journal.isPosted ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {journal.isPosted ? 'Posted' : 'Draft'}
                      </span>
                    </td>
                  </tr>
                ))}
                {recentJournals.length === 0 && (
                  <tr><td colSpan="5" className="px-4 py-8 text-center text-slate-400 text-sm">Belum ada jurnal</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-4">Ringkasan Akun</h3>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-slate-50 border border-slate-100 rounded">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Kas</span>
              <span className="font-bold text-slate-800">
                {parseFloat(stats.cashBalance).toLocaleString('id-ID')}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-slate-50 border border-slate-100 rounded">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Bank</span>
              <span className="font-bold text-slate-800">
                {parseFloat(stats.bankBalance).toLocaleString('id-ID')}
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-slate-50 border border-slate-100 rounded">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Piutang</span>
              <span className="font-bold text-slate-800">
                25.000.000
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-slate-50 border border-slate-100 rounded">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Hutang</span>
              <span className="font-bold text-slate-800">
                30.000.000
              </span>
            </div>
            <div className="flex justify-between items-center p-3 bg-emerald-50 border border-emerald-100 rounded">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Ekuitas</span>
              <span className="font-bold text-emerald-700">
                {parseFloat(stats.totalEquity).toLocaleString('id-ID')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Setoran Modal */}
      <SetoranModal
        isOpen={showSetoranModal}
        onClose={() => setShowSetoranModal(false)}
        onSuccess={() => { handleRefresh(); }}
      />
    </div>
  );
};

export default Dashboard;
