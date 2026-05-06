import React, { useState, useEffect } from 'react';
import { Landmark, Plus, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import api from '../services/api';

const BankPage = () => {
  const [banks, setBanks] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    bankId: '',
    transactionDate: new Date().toISOString().split('T')[0],
    transactionType: 'DEPOSIT',
    description: '',
    amount: ''
  });

  useEffect(() => {
    loadBanks();
  }, []);

  const loadBanks = async () => {
    try {
      const data = await api.request('/banks');
      setBanks(data);
      if (data.length > 0 && !formData.bankId) {
        setFormData(prev => ({ ...prev, bankId: data[0].id }));
        loadTransactions(data[0].id);
      }
    } catch (err) {
      console.error('Failed to load banks:', err);
    }
  };

  const loadTransactions = async (bankId) => {
    try {
      const data = await api.request(`/banks/${bankId}/transactions`);
      setTransactions(data);
    } catch (err) {
      console.error('Failed to load transactions:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.request('/banks/transaction', {
        method: 'POST',
        body: JSON.stringify({
          ...formData,
          amount: parseFloat(formData.amount),
          bankId: parseInt(formData.bankId)
        })
      });
      setShowForm(false);
      loadTransactions(formData.bankId);
      loadBanks();
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
      {/* Bank Cards */}
      <div className="grid grid-cols-3 gap-6">
        {banks.map(bank => (
          <div 
            key={bank.id} 
            className={`card cursor-pointer transition-all ${
              formData.bankId == bank.id ? 'ring-2 ring-blue-500' : ''
            }`}
            onClick={() => {
              setFormData(prev => ({ ...prev, bankId: bank.id }));
              loadTransactions(bank.id);
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Landmark className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">{bank.bankName}</h3>
                <p className="text-sm text-gray-500">{bank.accountNumber}</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-500">Saldo Saat Ini</p>
              <p className="text-2xl font-bold text-gray-800">
                Rp {formatCurrency(bank.currentBalance)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Transaction Form */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Transaksi Bank</h3>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {showForm ? 'Tutup' : 'Transaksi Baru'}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <form onSubmit={handleSubmit} className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bank</label>
              <select
                value={formData.bankId}
                onChange={(e) => setFormData({...formData, bankId: e.target.value})}
                className="input-field"
              >
                {banks.map(b => (
                  <option key={b.id} value={b.id}>{b.bankName}</option>
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
                <option value="DEPOSIT">Setoran (Debit Bank)</option>
                <option value="WITHDRAWAL">Penarikan (Kredit Bank)</option>
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
              <button type="submit" className="btn-primary w-full">Simpan</button>
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
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">Status</th>
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
                    {trx.transactionType === 'DEPOSIT' ? formatCurrency(trx.amount) : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-right text-red-600">
                    {trx.transactionType === 'WITHDRAWAL' ? formatCurrency(trx.amount) : '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      trx.isReconciled 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {trx.isReconciled ? 'Reconciled' : 'Unreconciled'}
                    </span>
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
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

export default BankPage;
