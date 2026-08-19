'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { Wallet, Plus, ArrowUpRight, ArrowDownLeft, ArrowLeftRight, History } from 'lucide-react';
import Navbar from '../components/Navbar';
import { treasuryApi, authApi, accountsApi } from '../lib/api';
import { toast } from 'sonner';

export default function TreasuryPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; role: string; email: string } | null>(null);
  const [treasuries, setTreasuries] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'create' | 'deposit' | 'withdraw' | 'transfer'>('create');
  const [selectedTreasury, setSelectedTreasury] = useState<any>(null);
  
  const [form, setForm] = useState({
    name: '', type: 'Cash', account_number: '', linked_gl_account: '', opening_balance: 0, notes: ''
  });
  const [txForm, setTxForm] = useState({
    amount: 0, reference: '', description: '', toTreasuryId: ''
  });

  useEffect(() => {
    const token = Cookies.get('token');
    if (!token) { router.push('/login'); return; }
    authApi.me().then(res => setUser(res.data)).catch(() => router.push('/login'));
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [tRes, aRes] = await Promise.all([treasuryApi.getAll(), accountsApi.getAll()]);
      setTreasuries(tRes.data);
      setAccounts(aRes.data);
    } catch (err) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    try {
      await treasuryApi.create(form);
      toast.success('Treasury account created');
      setModalOpen(false);
      loadData();
    } catch (err) {
      toast.error('Failed to create account');
    }
  }

  async function handleTransaction() {
    if (txForm.amount <= 0) return toast.error('Amount must be greater than 0');
    try {
      if (modalType === 'deposit') {
        await treasuryApi.deposit(selectedTreasury.id, txForm);
        toast.success('Deposit successful');
      } else if (modalType === 'withdraw') {
        await treasuryApi.withdraw(selectedTreasury.id, txForm);
        toast.success('Withdrawal successful');
      } else if (modalType === 'transfer') {
        await treasuryApi.transfer({
          fromTreasuryId: selectedTreasury.id,
          toTreasuryId: Number(txForm.toTreasuryId),
          amount: txForm.amount,
          reference: txForm.reference,
          description: txForm.description
        });
        toast.success('Transfer successful');
      }
      setModalOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Transaction failed');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Wallet className="w-6 h-6 text-brand" />
            Treasury Management
          </h1>
          <button
            onClick={() => { setModalType('create'); setModalOpen(true); }}
            className="flex items-center gap-2 bg-brand text-white px-4 py-2 rounded-lg hover:bg-brand/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Account
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {treasuries.map(t => (
              <div key={t.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-gray-900">{t.name}</h3>
                    <p className="text-sm text-gray-500">{t.type}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${t.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                    {t.status}
                  </span>
                </div>
                <div className="mb-6">
                  <p className="text-sm text-gray-500">Current Balance</p>
                  <p className="text-3xl font-bold text-gray-900">
                    KES {Number(t.current_balance).toLocaleString()}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => { setSelectedTreasury(t); setModalType('deposit'); setModalOpen(true); }}
                    className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-green-50 text-green-600 transition-colors"
                  >
                    <ArrowDownLeft className="w-5 h-5" />
                    <span className="text-[10px] font-bold">DEPOSIT</span>
                  </button>
                  <button
                    onClick={() => { setSelectedTreasury(t); setModalType('withdraw'); setModalOpen(true); }}
                    className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-red-50 text-red-600 transition-colors"
                  >
                    <ArrowUpRight className="w-5 h-5" />
                    <span className="text-[10px] font-bold">WITHDRAW</span>
                  </button>
                  <button
                    onClick={() => { setSelectedTreasury(t); setModalType('transfer'); setModalOpen(true); }}
                    className="flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors"
                  >
                    <ArrowLeftRight className="w-5 h-5" />
                    <span className="text-[10px] font-bold">TRANSFER</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4 capitalize">
              {modalType === 'create' ? 'New Treasury Account' : `${modalType} funds`}
            </h2>
            
            {modalType === 'create' ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Account Name</label>
                  <input
                    className="w-full border rounded-lg px-3 py-2"
                    value={form.name}
                    onChange={e => setForm({...form, name: e.target.value})}
                    placeholder="e.g. Main Cash"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select
                    className="w-full border rounded-lg px-3 py-2"
                    value={form.type}
                    onChange={e => setForm({...form, type: e.target.value})}
                  >
                    <option>Cash</option>
                    <option>Bank</option>
                    <option>Mobile Money</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Linked GL Account</label>
                  <select
                    className="w-full border rounded-lg px-3 py-2"
                    value={form.linked_gl_account}
                    onChange={e => setForm({...form, linked_gl_account: e.target.value})}
                  >
                    <option value="">None</option>
                    {accounts.filter(a => a.account_type === 'Assets').map(a => (
                      <option key={a.id} value={a.id}>{a.account_code} - {a.account_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Opening Balance</label>
                  <input
                    type="number"
                    className="w-full border rounded-lg px-3 py-2"
                    value={form.opening_balance}
                    onChange={e => setForm({...form, opening_balance: Number(e.target.value)})}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                  <input
                    type="number"
                    className="w-full border rounded-lg px-3 py-2"
                    value={txForm.amount}
                    onChange={e => setTxForm({...txForm, amount: Number(e.target.value)})}
                  />
                </div>
                {modalType === 'transfer' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">To Treasury</label>
                    <select
                      className="w-full border rounded-lg px-3 py-2"
                      value={txForm.toTreasuryId}
                      onChange={e => setTxForm({...txForm, toTreasuryId: e.target.value})}
                    >
                      <option value="">Select destination</option>
                      {treasuries.filter(t => t.id !== selectedTreasury?.id).map(t => (
                        <option key={t.id} value={t.id}>{t.name} (KES {t.current_balance})</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
                  <input
                    className="w-full border rounded-lg px-3 py-2"
                    value={txForm.reference}
                    onChange={e => setTxForm({...txForm, reference: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    className="w-full border rounded-lg px-3 py-2"
                    value={txForm.description}
                    onChange={e => setTxForm({...txForm, description: e.target.value})}
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setModalOpen(false)}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={modalType === 'create' ? handleCreate : handleTransaction}
                className="flex-1 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand/90 transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
