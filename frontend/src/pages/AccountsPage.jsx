import React, { useState, useEffect } from 'react';
import { Edit2, Save, X, Search, Plus } from 'lucide-react';
import api from '../services/api';

const AccountsPage = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const data = await api.getAccounts();
      setAccounts(data);
    } catch (err) {
      alert('Gagal memuat daftar akun');
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (account) => {
    setEditingId(account.id);
    setEditData({
      code: account.code,
      name: account.name,
      openingBalance: account.openingBalance,
      isActive: account.isActive
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditData({});
  };

  const handleSave = async (id) => {
    try {
      await api.updateAccount(id, editData);
      setEditingId(null);
      loadAccounts();
    } catch (err) {
      alert('Gagal menyimpan perubahan: ' + err.message);
    }
  };

  const filteredAccounts = accounts.filter(a => 
    a.name.toLowerCase().includes(search.toLowerCase()) || 
    a.code.includes(search)
  );

  const getAccountTypeName = (type) => {
    const types = {
      'ASSET': 'Aset',
      'LIABILITY': 'Kewajiban',
      'EQUITY': 'Ekuitas',
      'REVENUE': 'Pendapatan',
      'EXPENSE': 'Beban'
    };
    return types[type] || type;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input 
            type="text" 
            placeholder="Cari akun atau kode..." 
            className="input-field pl-10 w-80"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Kode</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nama Akun</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipe</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Saldo Awal</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Aksi</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan="6" className="px-6 py-10 text-center text-gray-500">Memuat data...</td>
              </tr>
            ) : filteredAccounts.length === 0 ? (
              <tr>
                <td colSpan="6" className="px-6 py-10 text-center text-gray-500">Tidak ada akun ditemukan</td>
              </tr>
            ) : (
              filteredAccounts.map((account) => (
                <tr key={account.id} className={account.isHeader ? 'bg-gray-50 font-semibold' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {editingId === account.id ? (
                      <input
                        type="text"
                        className="input-field py-1 w-24"
                        value={editData.code}
                        onChange={(e) => setEditData({...editData, code: e.target.value})}
                      />
                    ) : (
                      account.code
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {editingId === account.id ? (
                      <input
                        type="text"
                        className="input-field py-1 w-full"
                        value={editData.name}
                        onChange={(e) => setEditData({...editData, name: e.target.value})}
                      />
                    ) : (
                      <span className={account.level > 1 ? `ml-${(account.level - 1) * 4}` : ''}>
                        {account.name}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {getAccountTypeName(account.accountType)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                    {editingId === account.id && !account.isHeader ? (
                      <input
                        type="number"
                        className="input-field py-1 w-32 text-right"
                        value={editData.openingBalance}
                        onChange={(e) => setEditData({...editData, openingBalance: e.target.value})}
                      />
                    ) : (
                      new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2 }).format(account.openingBalance)
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${account.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {account.isActive ? 'Aktif' : 'Non-aktif'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {editingId === account.id ? (
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleSave(account.id)} className="text-green-600 hover:text-green-900">
                          <Save className="w-5 h-5" />
                        </button>
                        <button onClick={cancelEditing} className="text-gray-600 hover:text-gray-900">
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => startEditing(account)} className="text-blue-600 hover:text-blue-900">
                        <Edit2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AccountsPage;
