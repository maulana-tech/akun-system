import React, { useState } from 'react';
import api from '../../services/api';

const BalanceSheet = () => {
  const [asOfDate, setAsOfDate] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const generateReport = async () => {
    setLoading(true);
    try {
      const data = await api.getBalanceSheet(asOfDate);
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

  const renderSection = (title, items, colorClass = 'text-gray-800') => (
    <div className="mb-6">
      <h3 className={`text-lg font-semibold border-b pb-2 mb-3 ${colorClass}`}>
        {title}
      </h3>
      <table className="w-full">
        <tbody>
          {items.map((item) => (
            <tr key={item.code} className="hover:bg-gray-50">
              <td className="py-2 pl-8">{item.code} - {item.name}</td>
              <td className="py-2 text-right">{formatCurrency(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Neraca</h2>
      
      <div className="flex gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Per Tanggal</label>
          <input
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={generateReport}
            disabled={loading || !asOfDate}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? 'Memuat...' : 'Tampilkan'}
          </button>
        </div>
      </div>

      {report && (
        <div className="grid grid-cols-2 gap-8">
          {/* Left Side: Assets */}
          <div>
            {renderSection('ASET', report.assets, 'text-blue-700')}
            <div className="bg-blue-50 rounded-lg p-4 mt-4">
              <div className="flex justify-between font-bold text-blue-800">
                <span>TOTAL ASET</span>
                <span>{formatCurrency(report.summary.totalAssets)}</span>
              </div>
            </div>
          </div>

          {/* Right Side: Liabilities & Equity */}
          <div>
            {renderSection('KEWAJIBAN', report.liabilities, 'text-red-700')}
            {renderSection('EKUITAS', report.equity, 'text-green-700')}
            
            <div className="bg-gray-100 rounded-lg p-4 mt-4">
              <div className="flex justify-between font-bold text-gray-800 border-b pb-2 mb-2">
                <span>TOTAL KEWAJIBAN + EKUITAS</span>
                <span>{formatCurrency(report.summary.totalLiabilitiesEquity)}</span>
              </div>
              <div className={`text-sm text-center mt-2 ${
                report.summary.isBalanced ? 'text-green-600' : 'text-red-600'
              }`}>
                {report.summary.isBalanced ? '✓ Neraca Seimbang' : '✗ Neraca Tidak Seimbang!'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BalanceSheet;
