import React, { useState, useEffect } from 'react';
import { Save, Database, Calendar, Building } from 'lucide-react';
import api from '../services/api';

const SettingsPage = () => {
  const [settings, setSettings] = useState({
    companyName: 'PT. Contoh Sejahtera',
    companyAddress: 'Jl. Sudirman No. 123, Jakarta',
    companyPhone: '021-1234567',
    fiscalYearStart: '2026-01-01',
    currentPeriod: 'Mei 2026'
  });
  const [accounts, setAccounts] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const data = await api.getAccounts();
      setAccounts(data);
    } catch (err) {
      console.error('Failed to load accounts:', err);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    // Simulate save
    setTimeout(() => {
      setSaving(false);
      alert('Pengaturan berhasil disimpan!');
    }, 1000);
  };

  return (
    <div className="space-y-6">
      {/* Company Info */}
      <div className="card">
        <div className="flex items-center gap-3 mb-6">
          <Building className="w-6 h-6 text-blue-600" />
          <h3 className="text-lg font-semibold">Informasi Perusahaan</h3>
        </div>
        
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nama Perusahaan</label>
            <input
              type="text"
              value={settings.companyName}
              onChange={(e) => setSettings({...settings, companyName: e.target.value})}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telepon</label>
            <input
              type="text"
              value={settings.companyPhone}
              onChange={(e) => setSettings({...settings, companyPhone: e.target.value})}
              className="input-field"
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Alamat</label>
            <textarea
              value={settings.companyAddress}
              onChange={(e) => setSettings({...settings, companyAddress: e.target.value})}
              className="input-field"
              rows="2"
            />
          </div>
        </div>
      </div>

      {/* Fiscal Period */}
      <div className="card">
        <div className="flex items-center gap-3 mb-6">
          <Calendar className="w-6 h-6 text-green-600" />
          <h3 className="text-lg font-semibold">Periode Akuntansi</h3>
        </div>
        
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Awal Tahun Fiskal</label>
            <input
              type="date"
              value={settings.fiscalYearStart}
              onChange={(e) => setSettings({...settings, fiscalYearStart: e.target.value})}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Periode Aktif</label>
            <input
              type="text"
              value={settings.currentPeriod}
              disabled
              className="input-field bg-gray-100"
            />
          </div>
        </div>
      </div>

      {/* Chart of Accounts Summary */}
      <div className="card">
        <div className="flex items-center gap-3 mb-6">
          <Database className="w-6 h-6 text-purple-600" />
          <h3 className="text-lg font-semibold">Ringkasan Kode Rekening</h3>
        </div>
        
        <div className="grid grid-cols-5 gap-4 text-center">
          <div className="p-4 bg-blue-50 rounded-lg">
            <p className="text-2xl font-bold text-blue-700">
              {accounts.filter(a => a.accountType === 'ASSET').length}
            </p>
            <p className="text-sm text-gray-600">Aset</p>
          </div>
          <div className="p-4 bg-red-50 rounded-lg">
            <p className="text-2xl font-bold text-red-700">
              {accounts.filter(a => a.accountType === 'LIABILITY').length}
            </p>
            <p className="text-sm text-gray-600">Kewajiban</p>
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <p className="text-2xl font-bold text-green-700">
              {accounts.filter(a => a.accountType === 'EQUITY').length}
            </p>
            <p className="text-sm text-gray-600">Ekuitas</p>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg">
            <p className="text-2xl font-bold text-purple-700">
              {accounts.filter(a => a.accountType === 'REVENUE').length}
            </p>
            <p className="text-sm text-gray-600">Pendapatan</p>
          </div>
          <div className="p-4 bg-yellow-50 rounded-lg">
            <p className="text-2xl font-bold text-yellow-700">
              {accounts.filter(a => a.accountType === 'EXPENSE').length}
            </p>
            <p className="text-sm text-gray-600">Beban</p>
          </div>
        </div>

        <div className="mt-4 text-sm text-gray-500">
          Total Akun: <span className="font-semibold">{accounts.length}</span> | 
          Header: <span className="font-semibold">{accounts.filter(a => a.isHeader).length}</span> | 
          Detail: <span className="font-semibold">{accounts.filter(a => !a.isHeader).length}</span>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
        </button>
      </div>
    </div>
  );
};

export default SettingsPage;
