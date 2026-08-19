'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { Plus, Users as UsersIcon, Phone, X } from 'lucide-react';
import Navbar from '../components/Navbar';
import { customersApi, authApi } from '../lib/api';
import { toast } from 'sonner';

interface Customer {
  id: number;
  name: string;
  phone: string | null;
  credit_limit: number;
  balance: number;
  active: boolean;
}

interface Statement {
  customer: Customer;
  sales: { id: number; total: number; created_at: string; notes: string }[];
  payments: { id: number; amount: number; method: string; notes: string; created_at: string }[];
}

const EMPTY = { name: '', phone: '', creditLimit: 0 };

export default function CustomersPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; role: string; email: string } | null>(null);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null);
  const [statement, setStatement] = useState<Statement | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);

  useEffect(() => {
    const token = Cookies.get('token');
    if (!token) { router.push('/login'); return; }
    authApi.me()
      .then((res) => setUser(res.data))
      .catch(() => { Cookies.remove('token'); router.push('/login'); });
  }, []);

  useEffect(() => {
    loadCustomers();
  }, []);

  async function loadCustomers() {
    setLoading(true);
    try {
      const { data } = await customersApi.getAll();
      setCustomers(data);
    } catch {
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!form.name.trim()) return toast.error('Name is required');
    setSaving(true);
    try {
      await customersApi.create(form);
      toast.success('Customer added');
      setModalOpen(false);
      setForm(EMPTY);
      await loadCustomers();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to add customer');
    } finally {
      setSaving(false);
    }
  }

  async function openStatement(c: Customer) {
    setStatementCustomer(c);
    setPaymentAmount(0);
    try {
      const { data } = await customersApi.getStatement(c.id);
      setStatement(data);
    } catch {
      toast.error('Failed to load statement');
    }
  }

  async function recordPayment() {
    if (!statementCustomer || paymentAmount <= 0) return;
    try {
      await customersApi.recordPayment(statementCustomer.id, { amount: paymentAmount, method: 'cash' });
      toast.success('Payment recorded');
      const { data } = await customersApi.getStatement(statementCustomer.id);
      setStatement(data);
      setPaymentAmount(0);
      await loadCustomers();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to record payment');
    }
  }

  if (!user) return <div className="min-h-screen bg-gray-50" />;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-base font-semibold text-gray-900">Customers</h1>
            <p className="text-xs text-gray-500 mt-0.5">Running tabs and credit accounts</p>
          </div>
          <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-2 rounded-lg">
            <Plus className="w-3.5 h-3.5" /> Add Customer
          </button>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Phone</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Balance</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Credit Limit</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>}
                {!loading && !customers.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No customers yet</td></tr>}
                {customers.map((c) => {
                  const over = Number(c.balance) > Number(c.credit_limit);
                  return (
                    <tr key={c.id} onClick={() => openStatement(c)} className="hover:bg-gray-50 cursor-pointer transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-green-600 text-white text-xs flex items-center justify-center font-medium">
                            {c.name[0]}
                          </div>
                          <span className="font-medium text-gray-900">{c.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {c.phone ? <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span> : '—'}
                      </td>
                      <td className={`px-4 py-3 font-medium ${over ? 'text-red-600' : 'text-gray-900'}`}>
                        KSh {Number(c.balance).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-gray-500">KSh {Number(c.credit_limit).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          !c.active ? 'bg-gray-100 text-gray-500' : over ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'
                        }`}>
                          {!c.active ? 'Inactive' : over ? 'Over limit' : 'Good standing'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Add customer modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-sm w-full p-6 space-y-4">
            <h2 className="text-lg font-semibold">Add Customer</h2>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Name</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Phone</label>
              <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Credit Limit (KSh)</label>
              <input type="number" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm disabled:opacity-50">
                {saving ? 'Saving...' : 'Add Customer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Statement modal */}
      {statementCustomer && statement && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{statementCustomer.name}</h2>
              <button onClick={() => { setStatementCustomer(null); setStatement(null); }}>
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
              <span className="text-sm text-gray-600">Current Balance</span>
              <span className="text-lg font-semibold text-gray-900">KSh {Number(statement.customer.balance).toLocaleString()}</span>
            </div>

            <div className="flex gap-2">
              <input type="number" placeholder="Payment amount" value={paymentAmount || ''}
                onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              <button onClick={recordPayment} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm whitespace-nowrap">
                Record Payment
              </button>
            </div>

            <div>
              <h3 className="text-xs font-medium text-gray-500 mb-2">Recent Sales (credit)</h3>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {statement.sales.map((s) => (
                  <div key={s.id} className="flex justify-between text-sm border-b border-gray-100 pb-1.5">
                    <span className="text-gray-500">{new Date(s.created_at).toLocaleDateString('en-KE')}</span>
                    <span className="font-medium">KSh {Number(s.total).toLocaleString()}</span>
                  </div>
                ))}
                {!statement.sales.length && <p className="text-xs text-gray-400">No credit sales yet</p>}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-medium text-gray-500 mb-2">Payment History</h3>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {statement.payments.map((p) => (
                  <div key={p.id} className="flex justify-between text-sm border-b border-gray-100 pb-1.5">
                    <span className="text-gray-500">{new Date(p.created_at).toLocaleDateString('en-KE')}</span>
                    <span className="font-medium text-green-700">- KSh {Number(p.amount).toLocaleString()}</span>
                  </div>
                ))}
                {!statement.payments.length && <p className="text-xs text-gray-400">No payments recorded yet</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}