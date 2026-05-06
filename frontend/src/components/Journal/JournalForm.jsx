import React, { useState, useEffect } from 'react';
import api from '../../services/api';

const JournalForm = ({ onSuccess }) => {
  const [accounts, setAccounts] = useState([]);
  const [entries, setEntries] = useState([
    { accountId: '', description: '', debit: '', credit: '' },
    { accountId: '', description: '', debit: '', credit: '' }
  ]);
  const [journalData, setJournalData] = useState({
    journalDate: new Date().toISOString().split('T')[0],
    periodId: '1',
    journalType: 'GENERAL',
    reference: '',
    description: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const data = await api.getAccounts();
      setAccounts(data.filter(a => !a.isHeader));
    } catch (err) {
      setError('Gagal memuat daftar akun');
    }
  };

  const addEntry = () => {
    setEntries([...entries, { accountId: '', description: '', debit: '', credit: '' }]);
  };

  const removeEntry = (index) => {
    if (entries.length <= 2) return;
    setEntries(entries.filter((_, i) => i !== index));
  };

  const updateEntry = (index, field, value) => {
    const newEntries = [...entries];
    newEntries[index][field] = value;
    
    // Auto-balance: if debit entered, clear credit and vice versa
    if (field === 'debit' && value) {
      newEntries[index].credit = '';
    } else if (field === 'credit' && value) {
      newEntries[index].debit = '';
    }
    
    setEntries(newEntries);
  };

  const calculateTotals = () => {
    const totalDebit = entries.reduce((sum, e) => sum + (parseFloat(e.debit) || 0), 0);
    const totalCredit = entries.reduce((sum, e) => sum + (parseFloat(e.credit) || 0), 0);
    return { totalDebit, totalCredit, isBalanced: Math.abs(totalDebit - totalCredit) < 0.01 };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { isBalanced } = calculateTotals();
    if (!isBalanced) {
      setError('Jurnal tidak balance! Total Debit harus sama dengan Total Kredit.');
      setLoading(false);
      return;
    }

    try {
      const payload = {
        ...journalData,
        details: entries
          .filter(e => e.accountId)
          .map((e, i) => ({
            ...e,
            debit: parseFloat(e.debit) || 0,
            credit: parseFloat(e.credit) || 0,
            lineNo: i + 1
          }))
      };

      await api.createJournal(payload);
      onSuccess?.();
      // Reset form
      setEntries([
        { accountId: '', description: '', debit: '', credit: '' },
        { accountId: '', description: '', debit: '', credit: '' }
      ]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const { totalDebit, totalCredit, isBalanced } = calculateTotals();

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Input Jurnal Umum</h2>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Header Info */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tanggal Jurnal
            </label>
            <input
              type="date"
              value={journalData.journalDate}
              onChange={(e) => setJournalData({...journalData, journalDate: e.target.value})}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tipe Jurnal
            </label>
            <select
              value={journalData.journalType}
              onChange={(e) => setJournalData({...journalData, journalType: e.target.value})}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="GENERAL">Jurnal Umum</option>
              <option value="ADJUSTING">Jurnal Penyesuaian</option>
              <option value="CLOSING">Jurnal Penutup</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Referensi
            </label>
            <input
              type="text"
              value={journalData.reference}
              onChange={(e) => setJournalData({...journalData, reference: e.target.value})}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              placeholder="No. Bukti"
            />
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Keterangan
          </label>
          <textarea
            value={journalData.description}
            onChange={(e) => setJournalData({...journalData, description: e.target.value})}
            className="w-full border border-gray-300 rounded-md px-3 py-2"
            rows="2"
            placeholder="Keterangan jurnal..."
          />
        </div>

        {/* Journal Entries */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Akun</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Keterangan</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Debit (Rp)</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Kredit (Rp)</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {entries.map((entry, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <select
                      value={entry.accountId}
                      onChange={(e) => updateEntry(index, 'accountId', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
                      required
                    >
                      <option value="">Pilih Akun</option>
                      {accounts.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.code} - {acc.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      value={entry.description}
                      onChange={(e) => updateEntry(index, 'description', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm"
                      placeholder="Keterangan baris"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      value={entry.debit}
                      onChange={(e) => updateEntry(index, 'debit', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm text-right"
                      placeholder="0"
                      min="0"
                      step="0.01"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="number"
                      value={entry.credit}
                      onChange={(e) => updateEntry(index, 'credit', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-2 py-1 text-sm text-right"
                      placeholder="0"
                      min="0"
                      step="0.01"
                    />
                  </td>
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => removeEntry(index)}
                      className="text-red-600 hover:text-red-800"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 font-semibold">
              <tr>
                <td colSpan="2" className="px-4 py-3 text-right">TOTAL:</td>
                <td className={`px-4 py-3 text-right ${!isBalanced ? 'text-red-600' : ''}`}>
                  {totalDebit.toLocaleString('id-ID', {minimumFractionDigits: 2})}
                </td>
                <td className={`px-4 py-3 text-right ${!isBalanced ? 'text-red-600' : ''}`}>
                  {totalCredit.toLocaleString('id-ID', {minimumFractionDigits: 2})}
                </td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-4 flex justify-between items-center">
          <button
            type="button"
            onClick={addEntry}
            className="bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300"
          >
            + Tambah Baris
          </button>
          
          <div className="flex items-center gap-4">
            {!isBalanced && (
              <span className="text-red-600 text-sm">
                Selisih: {(totalDebit - totalCredit).toLocaleString('id-ID')}
              </span>
            )}
            <button
              type="submit"
              disabled={loading || !isBalanced}
              className={`px-6 py-2 rounded-md text-white ${
                loading || !isBalanced
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {loading ? 'Menyimpan...' : 'Simpan Jurnal'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default JournalForm;
