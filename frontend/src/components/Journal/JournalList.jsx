import React, { useState, useEffect } from 'react';
import { Eye, CheckCircle, XCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../../services/api';
import JournalDetailModal from './JournalDetailModal';

const JournalList = () => {
  const [journals, setJournals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [viewJournal, setViewJournal] = useState(null);

  useEffect(() => {
    loadJournals();
  }, [page]);

  const loadJournals = async () => {
    setLoading(true);
    try {
      const data = await api.getJournals({ page, limit: 10 });
      setJournals(data.data || []);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      console.error('Failed to load journals:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePost = async (id) => {
    if (!confirm('Yakin ingin memposting jurnal ini?')) return;
    
    try {
      await api.postJournal(id);
      loadJournals();
    } catch (err) {
      alert(err.message);
    }
  };

  const formatCurrency = (amount) => {
    return parseFloat(amount).toLocaleString('id-ID', {
      minimumFractionDigits: 2
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">No. Jurnal</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tanggal</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipe</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Keterangan</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Debit</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Kredit</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {journals.map((journal) => (
              <tr key={journal.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-blue-600">{journal.journalNo}</td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {new Date(journal.journalDate).toLocaleDateString('id-ID')}
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs ${
                    journal.journalType === 'GENERAL' ? 'bg-blue-100 text-blue-700' :
                    journal.journalType === 'ADJUSTING' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-purple-100 text-purple-700'
                  }`}>
                    {journal.journalType === 'GENERAL' ? 'Umum' :
                     journal.journalType === 'ADJUSTING' ? 'Penyesuaian' : 'Penutup'}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                  {journal.description || '-'}
                </td>
                <td className="px-4 py-3 text-sm text-right font-medium">
                  {formatCurrency(journal.totalDebit)}
                </td>
                <td className="px-4 py-3 text-sm text-right font-medium">
                  {formatCurrency(journal.totalCredit)}
                </td>
                <td className="px-4 py-3 text-center">
                  {journal.isPosted ? (
                    <span className="flex items-center justify-center gap-1 text-green-600 text-sm">
                      <CheckCircle className="w-4 h-4" />
                      Posted
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-1 text-yellow-600 text-sm">
                      <XCircle className="w-4 h-4" />
                      Draft
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex justify-center gap-2">
                    <button 
                      onClick={() => setViewJournal(journal)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {!journal.isPosted && (
                      <button 
                        onClick={() => handlePost(journal.id)}
                        className="text-green-600 hover:text-green-800"
                        title="Posting ke Buku Besar"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center mt-4 pt-4 border-t">
        <p className="text-sm text-gray-500">
          Halaman {page} dari {totalPages}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="p-2 rounded-md border hover:bg-gray-50 disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="p-2 rounded-md border hover:bg-gray-50 disabled:opacity-50"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Modal View */}
      {viewJournal && (
        <JournalDetailModal 
          journal={viewJournal} 
          onClose={() => setViewJournal(null)} 
        />
      )}
    </div>
  );
};

export default JournalList;
