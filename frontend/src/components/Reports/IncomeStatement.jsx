import React, { useState } from 'react';
import api from '../../services/api';

const IncomeStatement = () => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const generateReport = async () => {
    setLoading(true);
    try {
      const data = await api.getIncomeStatement(startDate, endDate);
      setReport(data);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return parseFloat(amount).toLocaleString('id-ID', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Laporan Rugi Laba</h2>
      
      <div className="flex gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Dari Tanggal</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sampai Tanggal</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={generateReport}
            disabled={loading || !startDate || !endDate}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? 'Memuat...' : 'Tampilkan'}
          </button>
        </div>
      </div>

      {report && (
        <div className="space-y-6">
          {/* Revenue Section */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-3">
              PENDAPATAN
            </h3>
            <table className="w-full">
              <tbody>
                {report.revenue.map((item) => (
                  <tr key={item.code} className="hover:bg-gray-50">
                    <td className="py-2 pl-8">{item.code} - {item.name}</td>
                    <td className="py-2 text-right">{formatCurrency(item.amount)}</td>
                  </tr>
                ))}
                <tr className="font-semibold border-t">
                  <td className="py-3 pl-4">Total Pendapatan</td>
                  <td className="py-3 text-right text-green-600">
                    {formatCurrency(report.summary.totalRevenue)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Expense Section */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 border-b pb-2 mb-3">
              BEBAN
            </h3>
            <table className="w-full">
              <tbody>
                {report.expenses.map((item) => (
                  <tr key={item.code} className="hover:bg-gray-50">
                    <td className="py-2 pl-8">{item.code} - {item.name}</td>
                    <td className="py-2 text-right">{formatCurrency(item.amount)}</td>
                  </tr>
                ))}
                <tr className="font-semibold border-t">
                  <td className="py-3 pl-4">Total Beban</td>
                  <td className="py-3 text-right text-red-600">
                    {formatCurrency(report.summary.totalExpense)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Net Income */}
          <div className="bg-gray-100 rounded-lg p-4">
            <div className="flex justify-between items-center text-xl font-bold">
              <span>LABA/RUGI BERSIH</span>
              <span className={report.summary.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}>
                {formatCurrency(report.summary.netIncome)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IncomeStatement;
