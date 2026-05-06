import React, { useState } from 'react';
import { FileText, BarChart3, Scale } from 'lucide-react';
import TrialBalance from '../components/Reports/TrialBalance';
import IncomeStatement from '../components/Reports/IncomeStatement';
import BalanceSheet from '../components/Reports/BalanceSheet';

const tabs = [
  { id: 'neraca-saldo', label: 'Neraca Saldo', icon: Scale },
  { id: 'rugi-laba', label: 'Rugi Laba', icon: BarChart3 },
  { id: 'neraca', label: 'Neraca', icon: FileText },
];

const ReportsPage = () => {
  const [activeTab, setActiveTab] = useState('neraca-saldo');

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex gap-2 bg-white rounded-lg p-2 shadow-sm">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-6 py-3 rounded-md transition-colors ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span className="font-medium">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Report Content */}
      {activeTab === 'neraca-saldo' && <TrialBalance />}
      {activeTab === 'rugi-laba' && <IncomeStatement />}
      {activeTab === 'neraca' && <BalanceSheet />}
    </div>
  );
};

export default ReportsPage;
