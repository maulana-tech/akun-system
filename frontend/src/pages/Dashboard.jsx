import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  CreditCard,
  ArrowUpRight,
  ArrowDownRight
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

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalAssets: 0,
    totalLiabilities: 0,
    totalEquity: 0,
    cashBalance: 0
  });
  const [recentJournals, setRecentJournals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Get balance sheet for summary
      const today = new Date().toISOString().split('T')[0];
      const bs = await api.getBalanceSheet(today);
      
      // Get recent journals
      const journals = await api.getJournals({ limit: 5 });
      
      setStats({
        totalAssets: bs.summary.totalAssets,
        totalLiabilities: bs.summary.totalLiabilities,
        totalEquity: bs.summary.totalEquity,
        cashBalance: bs.assets.find(a => a.code === '1110')?.amount || 0
      });
      
      setRecentJournals(journals.data || []);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-6">
        <StatCard 
          title="Total Aset" 
          amount={stats.totalAssets} 
          icon={Wallet} 
          color="bg-slate-500"
          trend="+12.5% dari bulan lalu"
          trendUp={true}
        />
        <StatCard 
          title="Total Kewajiban" 
          amount={stats.totalLiabilities} 
          icon={CreditCard} 
          color="bg-slate-500"
          trend="+5.2% dari bulan lalu"
          trendUp={false}
        />
        <StatCard 
          title="Ekuitas" 
          amount={stats.totalEquity} 
          icon={TrendingUp} 
          color="bg-slate-500"
          trend="+8.7% dari bulan lalu"
          trendUp={true}
        />
        <StatCard 
          title="Saldo Kas" 
          amount={stats.cashBalance} 
          icon={TrendingDown} 
          color="bg-slate-500"
        />
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
                        journal.isPosted 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {journal.isPosted ? 'Posted' : 'Draft'}
                      </span>
                    </td>
                  </tr>
                ))}
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
                100.000.000
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
