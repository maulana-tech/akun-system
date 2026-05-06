import React, { useState, useEffect } from 'react';
import { Wallet, Plus, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import api from '../services/api';

const CashPage = () => {
  const [cashAccounts, setCashAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    cashId: '',
    transactionDate: new Date().toISOString().split('T')[0],
    transactionType: 'RECEIPT',
    description: '',
    amount: ''
  });

  useEffect(() => {
    loadCashAccounts();
  }, []);

  const loadCashAccounts = async () => {
    try {
      const data = await api.request('/cash');
      setCashAccounts(data);
      if (data.length > 0 && !formData.cashId) {
        setFormData(prev => ({ ...prev, cashId: data[0].id }));
        loadTransactions(data[0].id);
      }
    } catch (err) {
      console.error('Failed to load cash accounts:', err);
    }
  };

  const loadTransactions = async (cashId) => {
    try {
      const data = await api.request(`/cash/${cashId}/transactions`);
      setTransactions(data);
    } catch (err) {
      console.error('Failed to load transactions:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.request('/cash/transaction', {
        method: 'POST',
        body: JSON.stringify({
          ...formData,
          amount: parseFloat(formData.amount),
          cashId: parseInt(formData.cashId)
        })
      });
      setShowForm(false);
      loadTransactions(formData.cashId);
      loadCashAccounts();
    } catch (err) {
      alert(err.message);
    }
  };

  const formatCurrency = (amount) => {
    return parseFloat(amount).toLocaleString('id-ID', {
      minimumFractionDigits: 2
    });
  };

  return (
    <div className="space-y-6">
      {/* Cash Cards */}
      <div className="grid grid-cols-3 gap-6">
        {cashAccounts.map(cash => (
          <div 
            key={cash.id} 
            className={`card cursor-pointer transition-all ${
              formData.cashId == cash.id ? 'ring-2 ring-green-500' : ''
            }`}
            onClick={() => {
              setFormData(prev => ({ ...prev, cashId: cash.id }));
              loadTransactions(cash.id);
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-green-100 rounded-lg">
                <Wallet className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">{cash.cashName}</h3>
                <p className="text-sm text-gray-500">Kas Operasional</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-500">Saldo Saat Ini</p>
              <p className="text-2xl font-bold text-gray-800">
                Rp {formatCurrency(cash.currentBalance)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Transaction Form */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Transaksi Kas</h3>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="btn-primary flex items-center gap-2 bg-green-600 hover:bg-green-700"
        >
          <Plus className="w-4 h-4" />
          {showForm ? 'Tutup' : 'Transaksi Baru'}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <form onSubmit={handleSubmit} className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kas</label>
              <select
                value={formData.cashId}
                onChange={(e) => setFormData({...formData, cashId: e.target.value})}
                className="input-field"
              >
                {cashAccounts.map(c => (
                  <option key={c.id} value={c.id}>{c.cashName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal</label>
              <input
                type="date"
                value={formData.transactionDate}
                onChange={(e) => setFormData({...formData, transactionDate: e.target.value})}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipe</label>
              <select
                value={formData.transactionType}
                onChange={(e) => setFormData({...formData, transactionType: e.target.value})}
                className="input-field"
              >
                <option value="RECEIPT">Penerimaan (Debit Kas)</option>
                <option value="PAYMENT">Pengeluaran (Kredit Kas)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Jumlah</label>
              <input
                type="number"
                value={formData.amount}
                onChange={(e) => setFormData({...formData, amount: e.target.value})}
                className="input-field"
                placeholder="0"
                required
              />
            </div>
            <div className="col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Keterangan</label>
              <input
                type="text"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className="input-field"
                placeholder="Keterangan transaksi..."
              />
            </div>
            <div className="flex items-end">
              <button type="submit" className="btn-primary w-full bg-green-600 hover:bg-green-700">Simpan</button>
            </div>
          </form>
        </div>
      )}

      {/* Transaction List */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Tanggal</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Ref</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Keterangan</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Masuk</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Keluar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {transactions.map((trx) => (
                <tr key={trx.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {new Date(trx.transactionDate).toLocaleDateString('id-ID')}
                  </td>
                  <td className="px-4 py-3 text-sm text-blue-600">{trx.referenceNo || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{trx.description}</td>
                  <td className="px-4 py-3 text-sm text-right text-green-600">
                    {trx.transactionType === 'RECEIPT' ? formatCurrency(trx.amount) : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-red-600">
                    {trx.transactionType === 'PAYMENT' ? formatCurrency(trx.amount) : '-'}
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan="5" className="px-4 py-8 text-center text-gray-500">
                    Belum ada transaksi
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CashPage;
