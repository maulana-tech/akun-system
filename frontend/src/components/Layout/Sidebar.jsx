import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  BookOpen, 
  FileText, 
  BarChart3, 
  Landmark, 
  Wallet,
  Settings
} from 'lucide-react';

const menuItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/jurnal', icon: BookOpen, label: 'Jurnal Umum' },
  { path: '/ledger', icon: FileText, label: 'Buku Besar' },
  { path: '/bank', icon: Landmark, label: 'Buku Bank' },
  { path: '/kas', icon: Wallet, label: 'Buku Kas' },
  { path: '/laporan', icon: BarChart3, label: 'Laporan' },
  { path: '/pengaturan', icon: Settings, label: 'Pengaturan' },
];

const Sidebar = () => {
  return (
    <aside className="w-64 bg-slate-800 text-white min-h-screen flex flex-col">
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-slate-400" />
          <span className="tracking-tight">AKUNTANSI</span>
        </h1>
        <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-semibold">Enterprise System</p>
      </div>
      
      <nav className="flex-1 py-4">
        {menuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-6 py-3 transition-colors ${
                isActive
                  ? 'bg-slate-700 text-white border-l-4 border-slate-400'
                  : 'text-slate-400 hover:bg-slate-700 hover:text-slate-100'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            <span className="text-sm font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>
      
      <div className="p-4 border-t border-slate-700">
        <div className="text-xs text-slate-400">
          <p>Periode Aktif:</p>
          <p className="text-white font-medium">Mei 2026</p>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
