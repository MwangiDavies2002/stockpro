'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { BookText, FileText, Calendar } from 'lucide-react';
import Navbar from '../../components/Navbar';
import { reportsApi, authApi } from '../../lib/api';
import { toast } from 'sonner';

export default function LedgerPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; role: string; email: string } | null>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = Cookies.get('token');
    if (!token) { router.push('/login'); return; }
    authApi.me().then(res => setUser(res.data)).catch(() => router.push('/login'));
    loadLedger();
  }, []);

  async function loadLedger() {
    setLoading(true);
    try {
      const { data } = await reportsApi.getLedger();
      // data might be null if there are no records, handle carefully
      setEntries(Array.isArray(data) ? data : []);
    } catch {
      toast.error('Failed to load ledger');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BookText className="w-6 h-6 text-brand" />
            General Ledger
          </h1>
          <button onClick={loadLedger} className="text-sm text-brand hover:underline">Refresh</button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
          </div>
        ) : entries.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
            No journal entries found.
          </div>
        ) : (
          <div className="space-y-6">
            {entries.map((je) => (
              <div key={je.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1 text-sm font-medium text-gray-900">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      {new Date(je.posting_date).toLocaleDateString()}
                    </div>
                    <span className="text-sm text-gray-500 font-mono">REF: {je.reference}</span>
                  </div>
                  <span className="text-sm font-bold text-gray-900">{je.description}</span>
                </div>
                <table className="min-w-full">
                  <thead className="bg-white border-b border-gray-100">
                    <tr>
                      <th className="px-6 py-2 text-left text-[10px] font-bold text-gray-400 uppercase">Account</th>
                      <th className="px-6 py-2 text-right text-[10px] font-bold text-gray-400 uppercase w-32">Debit</th>
                      <th className="px-6 py-2 text-right text-[10px] font-bold text-gray-400 uppercase w-32">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {je.lines && JSON.parse(typeof je.lines === 'string' ? je.lines : JSON.stringify(je.lines)).map((line: any, idx: number) => (
                      <tr key={idx}>
                        <td className="px-6 py-3">
                          <div className="text-sm font-medium text-gray-900">{line.account_name}</div>
                          <div className="text-xs text-gray-500">{line.account_code}</div>
                        </td>
                        <td className="px-6 py-3 text-right text-sm text-gray-900">
                          {line.debit > 0 ? Number(line.debit).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                        </td>
                        <td className="px-6 py-3 text-right text-sm text-gray-900">
                          {line.credit > 0 ? Number(line.credit).toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
