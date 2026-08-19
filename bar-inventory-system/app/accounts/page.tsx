'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { BookOpen, Plus, Search, ChevronRight, ChevronDown, Edit2, Trash2 } from 'lucide-react';
import Navbar from '../components/Navbar';
import { accountsApi, authApi } from '../lib/api';
import { toast } from 'sonner';

export default function AccountsPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; role: string; email: string } | null>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editAccount, setEditAccount] = useState<any>(null);
  const [form, setForm] = useState({
    account_code: '', account_name: '', parent_id: '', account_type: 'Assets', normal_balance: 'Debit'
  });

  useEffect(() => {
    const token = Cookies.get('token');
    if (!token) { router.push('/login'); return; }
    authApi.me().then(res => setUser(res.data)).catch(() => router.push('/login'));
    loadAccounts();
  }, []);

  async function loadAccounts() {
    setLoading(true);
    try {
      const { data } = await accountsApi.getAll();
      setAccounts(data);
    } catch {
      toast.error('Failed to load accounts');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      if (editAccount) {
        await accountsApi.update(editAccount.id, form);
        toast.success('Account updated');
      } else {
        await accountsApi.create(form);
        toast.success('Account created');
      }
      setModalOpen(false);
      loadAccounts();
    } catch (err) {
      toast.error('Failed to save account');
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Are you sure you want to delete this account?')) return;
    try {
      await accountsApi.delete(id);
      toast.success('Account deleted');
      loadAccounts();
    } catch {
      toast.error('Failed to delete account');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-brand" />
            Chart of Accounts
          </h1>
          <button
            onClick={() => { setEditAccount(null); setForm({account_code:'', account_name:'', parent_id:'', account_type:'Assets', normal_balance:'Debit'}); setModalOpen(true); }}
            className="flex items-center gap-2 bg-brand text-white px-4 py-2 rounded-lg hover:bg-brand/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Account
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Balance</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500">Loading...</td></tr>
              ) : accounts.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-500">No accounts found</td></tr>
              ) : accounts.map((acc) => (
                <tr key={acc.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{acc.account_code}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{acc.account_name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{acc.account_type}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{acc.normal_balance}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <button 
                      onClick={() => { setEditAccount(acc); setForm({account_code:acc.account_code, account_name:acc.account_name, parent_id:acc.parent_id||'', account_type:acc.account_type, normal_balance:acc.normal_balance}); setModalOpen(true); }}
                      className="text-brand hover:text-brand/80"
                    >
                      <Edit2 className="w-4 h-4 inline" />
                    </button>
                    <button 
                      onClick={() => handleDelete(acc.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="w-4 h-4 inline" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4">{editAccount ? 'Edit Account' : 'New GL Account'}</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
                  <input className="w-full border rounded-lg px-3 py-2" value={form.account_code} onChange={e => setForm({...form, account_code: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select className="w-full border rounded-lg px-3 py-2" value={form.account_type} onChange={e => setForm({...form, account_type: e.target.value})}>
                    <option>Assets</option>
                    <option>Liabilities</option>
                    <option>Equity</option>
                    <option>Income</option>
                    <option>Expenses</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account Name</label>
                <input className="w-full border rounded-lg px-3 py-2" value={form.account_name} onChange={e => setForm({...form, account_name: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parent Account</label>
                <select className="w-full border rounded-lg px-3 py-2" value={form.parent_id} onChange={e => setForm({...form, parent_id: e.target.value})}>
                  <option value="">None</option>
                  {accounts.filter(a => a.id !== editAccount?.id).map(a => (
                    <option key={a.id} value={a.id}>{a.account_code} - {a.account_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Normal Balance</label>
                <select className="w-full border rounded-lg px-3 py-2" value={form.normal_balance} onChange={e => setForm({...form, normal_balance: e.target.value})}>
                  <option>Debit</option>
                  <option>Credit</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleSave} className="flex-1 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand/90 transition-colors">Save Account</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
