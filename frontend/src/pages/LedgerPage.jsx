import React, { useState, useEffect } from 'react';
import { Search, FileText } from 'lucide-react';
import api from '../services/api';

const LedgerPage = () => {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const data = await api.getAccounts();
      setAccounts(data.filter(a => !a.isHeader));
    } catch (err) {
      console.error('Failed to load accounts:', err);
    }
  };

  const loadLedger = async (accountId) => {
    if (!accountId) {
      setSelectedAccount(null);
      setLedger([]);
      return;
    }
    setLoading(true);
    try {
      const data = await api.getLedger(accountId);
      setLedger(data);
      setSelectedAccount(accounts.find(a => a.id === parseInt(accountId)));
    } catch (err) {
      console.error('Failed to load ledger:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return parseFloat(amount).toLocaleString('id-ID', {
      minimumFractionDigits: 2
    });
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Pilih Akun</h3>
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <select
            onChange={(e) => loadLedger(e.target.value)}
            className="input-field pl-10 w-full"
            defaultValue=""
          >
            <option value="">-- Pilih Kode Rekening --</option>
            {accounts.map(account => (
              <option key={account.id} value={account.id}>
                {account.code} - {account.name} ({account.normalBalance})
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedAccount && (
        <div className="card">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-semibold">
                Buku Besar: {selectedAccount.code} - {selectedAccount.name}
              </h3>
              <p className="text-sm text-gray-500">
                Normal Balance: {selectedAccount.normalBalance} | 
                Saldo Awal: Rp {formatCurrency(selectedAccount.openingBalance)}
              </p>
            </div>
            <button className="btn-secondary flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Export PDF
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Tanggal</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Ref</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Keterangan</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Debit</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Kredit</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Saldo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {/* Opening Balance Row */}
                  <tr className="bg-yellow-50">
                    <td className="px-4 py-3 text-sm font-medium" colSpan="5">Saldo Awal</td>
                    <td className="px-4 py-3 text-sm text-right font-bold">
                      {formatCurrency(selectedAccount.openingBalance)}
                    </td>
                  </tr>
                  
                  {ledger.map((entry, index) => (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {new Date(entry.transactionDate).toLocaleDateString('id-ID')}
                      </td>
                      <td className="px-4 py-3 text-sm text-blue-600">
                        {entry.journal?.journalNo || entry.reference}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {entry.description || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        {entry.debit > 0 ? formatCurrency(entry.debit) : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right">
                        {entry.credit > 0 ? formatCurrency(entry.credit) : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium">
                        {formatCurrency(entry.balance)}
                      </td>
                    </tr>
                  ))}
                  
                  {ledger.length === 0 && (
                    <tr>
                      <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                        Belum ada transaksi untuk akun ini
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LedgerPage;
