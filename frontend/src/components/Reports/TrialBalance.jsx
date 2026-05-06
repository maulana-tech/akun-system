import React, { useState, useEffect } from 'react';
import { Search, Download, Printer } from 'lucide-react';
import api from '../../services/api';

const TrialBalance = () => {
  const [report, setReport] = useState([]);
  const [loading, setLoading] = useState(false);
  const [periodId, setPeriodId] = useState('');

  useEffect(() => {
    generateReport();
  }, []);

  const generateReport = async () => {
    setLoading(true);
    try {
      const data = await api.getTrialBalance(periodId || 1);
      setReport(data);
    } catch (err) {
      console.error('Failed to load trial balance:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return parseFloat(amount).toLocaleString('id-ID', {
      minimumFractionDigits: 2
    });
  };

  const totalDebit = report.reduce((sum, r) => sum + parseFloat(r.totalDebit || 0), 0);
  const totalCredit = report.reduce((sum, r) => sum + parseFloat(r.totalCredit || 0), 0);

  return (
    <div className="card">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-semibold">Neraca Saldo</h3>
          <p className="text-sm text-gray-500">Periode: Mei 2026</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary flex items-center gap-2">
            <Printer className="w-4 h-4" />
            Cetak
          </button>
          <button className="btn-secondary flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export Excel
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kode</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama Akun</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Posisi Normal</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Debit (Rp)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Kredit (Rp)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Saldo Akhir (Rp)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {report.map((item) => (
                  <tr key={item.accountCode} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-blue-600">{item.accountCode}</td>
                    <td className="px-4 py-3 text-sm text-gray-800">{item.accountName}</td>
                    <td className="px-4 py-3 text-sm text-center">
                      <span className={`px-2 py-1 rounded-full text-xs ${
                        item.normalBalance === 'DEBIT' 
                          ? 'bg-blue-100 text-blue-700' 
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {item.normalBalance}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {parseFloat(item.totalDebit) > 0 ? formatCurrency(item.totalDebit) : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {parseFloat(item.totalCredit) > 0 ? formatCurrency(item.totalCredit) : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium">
                      {formatCurrency(item.endingBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-100 font-semibold">
                <tr>
                  <td colSpan="3" className="px-4 py-3 text-right">TOTAL</td>
                  <td className="px-4 py-3 text-right text-blue-700">{formatCurrency(totalDebit)}</td>
                  <td className="px-4 py-3 text-right text-green-700">{formatCurrency(totalCredit)}</td>
                  <td className="px-4 py-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className={`mt-4 p-3 rounded-lg text-center text-sm font-medium ${
            Math.abs(totalDebit - totalCredit) < 0.01 
              ? 'bg-green-100 text-green-700' 
              : 'bg-red-100 text-red-700'
          }`}>
            {Math.abs(totalDebit - totalCredit) < 0.01 
              ? '✓ Neraca Saldo Seimbang' 
              : `✗ Tidak Seimbang! Selisih: ${formatCurrency(Math.abs(totalDebit - totalCredit))}`}
          </div>
        </>
      )}
    </div>
  );
};

export default TrialBalance;
