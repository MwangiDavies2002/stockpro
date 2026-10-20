'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { Plus, Users as UsersIcon, Phone, X } from '../components/TextMark';
import Navbar from '../components/Navbar';
import { customersApi, authApi, businessSettingsApi } from '../lib/api';
import { toast } from 'sonner';

interface Customer {
  id: number;
  name: string;
  phone: string | null;
  credit_limit: number;
  balance: number;
  active: boolean;
  contact_id?: string | null;
  email?: string | null;
}

interface Statement {
  customer: Customer;
  sales: { id: number; total: number; created_at: string; notes: string }[];
  payments: { id: number; amount: number; method: string; notes: string; created_at: string }[];
}

const EMPTY = { name: '', phone: '', creditLimit: 0, openingBalance: 0, paymentTermValue:'', paymentTermUnit:'', entityType:'individual', contactId:'', customerGroup:'', currencyCode:'KES', alternatePhone:'', landline:'', email:'', assignedTo:'', accountType:'', taxNumber:'', addressLine1:'', addressLine2:'', city:'', state:'', country:'', zipCode:'', landmark:'', streetName:'', buildingNumber:'', additionalNumber:'', idNumber:'', customField1:'', customField2:'', customField3:'', customField4:'', customField5:'', customField6:'', customField7:'', customField8:'', customField9:'', customField10:'', moreInfo:false };

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

  useEffect(() => { businessSettingsApi.get().then(({data})=>{const code=String(data.currency||'KES').toUpperCase();if(/^[A-Z]{3}$/.test(code))setForm(current=>({...current,currencyCode:code}));}).catch(()=>{}); }, []);

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
      const { moreInfo, ...contact } = form;
      await customersApi.create(contact);
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
          <button onClick={() => setModalOpen(true)} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-2 rounded-sm">
            <Plus className="w-3.5 h-3.5" /> Add Customer
          </button>
        </div>

        <div className="bg-white border border-gray-200 rounded-sm overflow-hidden">
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
                    <tr key={c.id} onClick={() => openStatement(c)} className="hover:bg-gray-50 cursor-pointer ">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-sm bg-green-600 text-white text-xs flex items-center justify-center font-medium">
                            {c.name[0]}
                          </div>
                          <span><span className="font-medium text-gray-900">{c.name}</span>{c.contact_id&&<span className="mt-0.5 block text-xs text-gray-500">ID: {c.contact_id}{c.email?` · ${c.email}`:''}</span>}</span>
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
                        <span className={`text-xs px-2 py-0.5 rounded-sm font-medium ${
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
          <form onSubmit={e=>{e.preventDefault();void handleSave();}} className="bg-white rounded-sm max-w-4xl w-full max-h-[92vh] overflow-y-auto shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4"><h2 className="text-lg font-semibold">Add a new contact</h2><button type="button" aria-label="Close" disabled={saving} onClick={()=>setModalOpen(false)} className="text-2xl leading-none text-gray-400">×</button></div>
            <fieldset disabled={saving} className="space-y-5 p-5">
              <div className="grid gap-4 md:grid-cols-3">
                <label className="text-sm font-medium">Contact type*<select className="mt-1 w-full rounded-sm border p-2.5" value="customer" disabled><option value="customer">Customers</option></select></label>
                <div className="flex items-center gap-5 pt-6 text-sm"><label className="flex items-center gap-2"><input type="radio" name="entityType" checked={form.entityType==='individual'} onChange={()=>setForm({...form,entityType:'individual'})}/>Individual</label><label className="flex items-center gap-2"><input type="radio" name="entityType" checked={form.entityType==='business'} onChange={()=>setForm({...form,entityType:'business'})}/>Business</label></div>
                <label className="text-sm font-medium">Contact ID<input className="mt-1 w-full rounded-sm border p-2.5 font-normal" maxLength={40} placeholder="Leave empty to autogenerate" value={form.contactId} onChange={e=>setForm({...form,contactId:e.target.value})}/><span className="mt-1 block text-xs font-normal text-gray-500">Leave empty to autogenerate</span></label>
                <label className="text-sm font-medium">Customer group<select className="mt-1 w-full rounded-sm border p-2.5 font-normal" value={form.customerGroup} onChange={e=>setForm({...form,customerGroup:e.target.value})}><option value="">None</option><option value="Retail">Retail</option><option value="Wholesale">Wholesale</option><option value="VIP">VIP</option><option value="Corporate">Corporate</option></select></label>
                <label className="text-sm font-medium">Currency*<select className="mt-1 w-full rounded-sm border p-2.5 font-normal" value={form.currencyCode} onChange={e=>setForm({...form,currencyCode:e.target.value})}><option value="KES">Kenya - Kenyan shilling (KES)</option><option value="USD">United States - US dollar (USD)</option><option value="UGX">Uganda - Ugandan shilling (UGX)</option><option value="TZS">Tanzania - Tanzanian shilling (TZS)</option><option value="EUR">Euro (EUR)</option><option value="GBP">United Kingdom - Pound sterling (GBP)</option></select><span className="mt-1 block text-xs font-normal text-gray-500">Customer account balances are recorded in the shop’s base currency.</span></label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-sm font-medium">Name*<input required maxLength={150} className="mt-1 w-full rounded-sm border p-2.5 font-normal" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Customer or business name"/></label>
                <label className="text-sm font-medium">Mobile<input type="tel" maxLength={20} className="mt-1 w-full rounded-sm border p-2.5 font-normal" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label>
                <label className="text-sm font-medium">Alternate contact number<input type="tel" maxLength={20} className="mt-1 w-full rounded-sm border p-2.5 font-normal" value={form.alternatePhone} onChange={e=>setForm({...form,alternatePhone:e.target.value})}/></label>
                <label className="text-sm font-medium">Landline<input type="tel" maxLength={20} className="mt-1 w-full rounded-sm border p-2.5 font-normal" value={form.landline} onChange={e=>setForm({...form,landline:e.target.value})}/></label>
                <label className="text-sm font-medium">Email<input type="email" maxLength={150} className="mt-1 w-full rounded-sm border p-2.5 font-normal" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
                <label className="text-sm font-medium">Assigned to<input maxLength={120} className="mt-1 w-full rounded-sm border p-2.5 font-normal" value={form.assignedTo} onChange={e=>setForm({...form,assignedTo:e.target.value})} placeholder="Staff member"/></label>
                <label className="text-sm font-medium">Account type<select className="mt-1 w-full rounded-sm border p-2.5 font-normal" value={form.accountType} onChange={e=>setForm({...form,accountType:e.target.value})}><option value="">Please select</option><option value="retail">Retail</option><option value="wholesale">Wholesale</option><option value="corporate">Corporate</option></select></label>
              </div>
              <div className="text-center"><button type="button" className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600" onClick={()=>setForm({...form,moreInfo:!form.moreInfo})}>{form.moreInfo?'Less information':'More information'} {form.moreInfo?'⌃':'⌄'}</button></div>
              {form.moreInfo&&<div className="space-y-5 border-t pt-4"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><label className="text-sm font-medium">Tax number<input maxLength={50} className="mt-1 w-full rounded-sm border p-2.5 font-normal" value={form.taxNumber} onChange={e=>setForm({...form,taxNumber:e.target.value})}/></label><label className="text-sm font-medium">Opening balance ({form.currencyCode})<input type="number" min="0" max="99999999.99" step="0.01" className="mt-1 w-full rounded-sm border p-2.5 font-normal" value={form.openingBalance} onChange={e=>setForm({...form,openingBalance:parseFloat(e.target.value)||0})}/><span className="mt-1 block text-xs font-normal text-gray-500">Posted to Accounts Receivable and Opening Balance Equity.</span></label><label className="text-sm font-medium">Credit limit ({form.currencyCode})<input type="number" min="0" max="99999999.99" step="0.01" className="mt-1 w-full rounded-sm border p-2.5 font-normal" value={form.creditLimit} onChange={e=>setForm({...form,creditLimit:parseFloat(e.target.value)||0})}/><span className="mt-1 block text-xs font-normal text-gray-500">Leave at 0 for no credit sales.</span></label><div className="text-sm font-medium">Pay term<div className="mt-1 flex gap-2"><input type="number" min="1" max="9999" className="w-1/2 rounded-sm border p-2.5 font-normal" placeholder="Value" value={form.paymentTermValue} onChange={e=>setForm({...form,paymentTermValue:e.target.value})}/><select className="w-1/2 rounded-sm border p-2.5 font-normal" value={form.paymentTermUnit} onChange={e=>setForm({...form,paymentTermUnit:e.target.value})}><option value="">Please select</option><option value="days">Days</option><option value="weeks">Weeks</option><option value="months">Months</option></select></div></div><label className="text-sm font-medium">Address line 1<input maxLength={200} className="mt-1 w-full rounded-sm border p-2.5 font-normal" value={form.addressLine1} onChange={e=>setForm({...form,addressLine1:e.target.value})}/></label><label className="text-sm font-medium">Address line 2<input maxLength={200} className="mt-1 w-full rounded-sm border p-2.5 font-normal" value={form.addressLine2} onChange={e=>setForm({...form,addressLine2:e.target.value})}/></label><label className="text-sm font-medium">City<input maxLength={100} className="mt-1 w-full rounded-sm border p-2.5 font-normal" value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/></label><label className="text-sm font-medium">State / County<input maxLength={100} className="mt-1 w-full rounded-sm border p-2.5 font-normal" value={form.state} onChange={e=>setForm({...form,state:e.target.value})}/></label><label className="text-sm font-medium">Country<input maxLength={100} className="mt-1 w-full rounded-sm border p-2.5 font-normal" value={form.country} onChange={e=>setForm({...form,country:e.target.value})}/></label><label className="text-sm font-medium">Zip Code<input maxLength={20} className="mt-1 w-full rounded-sm border p-2.5 font-normal" value={form.zipCode} onChange={e=>setForm({...form,zipCode:e.target.value})}/></label><label className="text-sm font-medium">Landmark<input maxLength={150} className="mt-1 w-full rounded-sm border p-2.5 font-normal" value={form.landmark} onChange={e=>setForm({...form,landmark:e.target.value})}/></label><label className="text-sm font-medium">Street name<input maxLength={150} className="mt-1 w-full rounded-sm border p-2.5 font-normal" value={form.streetName} onChange={e=>setForm({...form,streetName:e.target.value})}/></label><label className="text-sm font-medium">Building number<input maxLength={50} className="mt-1 w-full rounded-sm border p-2.5 font-normal" value={form.buildingNumber} onChange={e=>setForm({...form,buildingNumber:e.target.value})}/></label><label className="text-sm font-medium">Additional number<input maxLength={50} className="mt-1 w-full rounded-sm border p-2.5 font-normal" value={form.additionalNumber} onChange={e=>setForm({...form,additionalNumber:e.target.value})}/></label><label className="text-sm font-medium">ID number<input maxLength={80} className="mt-1 w-full rounded-sm border p-2.5 font-normal" value={form.idNumber} onChange={e=>setForm({...form,idNumber:e.target.value})}/></label></div><div className="grid gap-4 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({length:10},(_,i)=>{const key=`customField${i+1}` as keyof typeof form;return <label key={key} className="text-sm font-medium">Custom Field {i+1}<input maxLength={200} className="mt-1 w-full rounded-sm border p-2.5 font-normal" value={form[key] as string} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>;})}</div></div>}
            </fieldset>
            <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-white p-4"><button type="button" disabled={saving} onClick={()=>setModalOpen(false)} className="rounded-sm border px-4 py-2 text-sm">Close</button><button disabled={saving} className="rounded-lg bg-indigo-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving?'Saving...':'Save'}</button></div>
          </form>
        </div>
      )}

      {/* Statement modal */}
      {statementCustomer && statement && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-sm max-w-lg w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{statementCustomer.name}</h2>
              <button onClick={() => { setStatementCustomer(null); setStatement(null); }}>
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <div className="bg-gray-50 rounded-sm p-3 flex items-center justify-between">
              <span className="text-sm text-gray-600">Current Balance</span>
              <span className="text-lg font-semibold text-gray-900">KSh {Number(statement.customer.balance).toLocaleString()}</span>
            </div>

            <div className="flex gap-2">
              <input type="number" placeholder="Payment amount" value={paymentAmount || ''}
                onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              <button onClick={recordPayment} className="px-4 py-2 bg-green-600 text-white rounded-sm text-sm whitespace-nowrap">
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
