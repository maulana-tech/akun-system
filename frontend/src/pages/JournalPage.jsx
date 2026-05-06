import React, { useState } from 'react';
import { Plus, Search, Filter } from 'lucide-react';
import JournalForm from '../components/Journal/JournalForm';
import JournalList from '../components/Journal/JournalList';

const JournalPage = () => {
  const [showForm, setShowForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSuccess = () => {
    setShowForm(false);
    setRefreshKey(prev => prev + 1);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex gap-4">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Cari jurnal..." 
              className="input-field pl-10 w-64"
            />
          </div>
          <button className="btn-secondary flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filter
          </button>
        </div>
        
        <button 
          onClick={() => setShowForm(!showForm)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {showForm ? 'Tutup Form' : 'Tambah Jurnal'}
        </button>
      </div>

      {showForm && <JournalForm onSuccess={handleSuccess} />}
      
      <JournalList key={refreshKey} />
    </div>
  );
};

export default JournalPage;
