import React from 'react';
import { X, Printer, Download, CheckCircle, Clock } from 'lucide-react';

const JournalDetailModal = ({ journal, onClose }) => {
  if (!journal) return null;

  const formatCurrency = (amount) => {
    return parseFloat(amount).toLocaleString('id-ID', {
      minimumFractionDigits: 2
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-slate-800 px-6 py-4 flex justify-between items-center text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-700 rounded-lg">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold tracking-tight uppercase">{journal.journalNo}</h3>
              <p className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">Detail Jurnal Umum</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-700 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 max-h-[80vh] overflow-y-auto">
          {/* Info Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10 pb-8 border-b border-slate-100">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tanggal</p>
              <p className="text-sm font-bold text-slate-700">
                {new Date(journal.journalDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Tipe</p>
              <span className="inline-flex px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-wider">
                {journal.journalType}
              </span>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Referensi</p>
              <p className="text-sm font-bold text-slate-700">{journal.reference || '-'}</p>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p>
              <div className="flex items-center gap-1.5">
                {journal.isPosted ? (
                  <>
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                    <p className="text-sm font-bold text-emerald-600">POSTED</p>
                  </>
                ) : (
                  <>
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                    <p className="text-sm font-bold text-amber-600">DRAFT</p>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="mb-8">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Keterangan Jurnal</p>
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 italic text-slate-600 text-sm">
              "{journal.description || 'Tidak ada keterangan'}"
            </div>
          </div>

          {/* Table */}
          <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Akun</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Keterangan Baris</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Debit</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Kredit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {journal.details.map((detail, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-xs font-black text-blue-600 tracking-tight">{detail.account?.code}</p>
                      <p className="text-sm font-bold text-slate-700">{detail.account?.name}</p>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {detail.description || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-700 text-right">
                      {detail.debit > 0 ? formatCurrency(detail.debit) : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm font-bold text-slate-700 text-right">
                      {detail.credit > 0 ? formatCurrency(detail.credit) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-800 text-white font-bold">
                <tr>
                  <td colSpan="2" className="px-6 py-4 text-[10px] font-black uppercase tracking-widest">Total Transaksi</td>
                  <td className="px-6 py-4 text-right text-sm">{formatCurrency(journal.totalDebit)}</td>
                  <td className="px-6 py-4 text-right text-sm">{formatCurrency(journal.totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-8 py-4 border-t border-slate-100 flex justify-between items-center">
          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-tight">
            <Clock className="w-3 h-3" />
            Terakhir diubah: {new Date(journal.createdAt).toLocaleString('id-ID')}
          </div>
          <div className="flex gap-3">
            <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50 transition-all">
              <Download className="w-4 h-4" />
              Download PDF
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-slate-700 transition-all shadow-md">
              <Printer className="w-4 h-4" />
              Cetak Voucher
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JournalDetailModal;
