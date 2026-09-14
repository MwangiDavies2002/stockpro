'use client';

import { useEffect, useState } from 'react';
import { Check, Smartphone, WifiOff } from 'lucide-react';
import Navbar from '../components/Navbar';
import { authApi } from '../lib/api';
import Cookies from 'js-cookie';
import { toast } from 'sonner';

const plans = [
  { id: 'basic', name: 'Basic POS', price: 1000, description: 'POS, inventory and reports', features: ['1 business location', 'Up to 5 users', 'Unlimited products', 'Sales reports', 'M-Pesa and offline POS'] },
  { id: 'growth', name: 'Growth', price: 5000, description: 'For growing bars and restaurants', features: ['5 business locations', 'Unlimited users', 'Purchasing and suppliers', 'Advanced analytics', 'Accounting and ledger'] },
  { id: 'erp', name: 'ERP', price: 30000, description: 'Complete multi-branch operations', features: ['Unlimited locations', 'Unlimited users', 'Full accounting suite', 'Priority support', 'Custom business settings'] },
];

export default function SubscriptionPage() {
  const [user, setUser] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [phone, setPhone] = useState('');
  const [offline, setOffline] = useState(false);
  useEffect(() => { if (!Cookies.get('token')) return; authApi.me().then(r => setUser(r.data)).catch(() => {}); }, []);
  function subscribe() {
    if (!selected) return;
    if (!offline && !phone.trim()) return toast.error('Enter the M-Pesa phone number');
    localStorage.setItem('stockpro_subscription_request', JSON.stringify({ plan: selected.id, phone, offline, requestedAt: new Date().toISOString() }));
    toast.success(offline ? 'Subscription request sent for admin approval' : 'M-Pesa payment request created');
    setSelected(null);
  }
  return <div className="min-h-screen bg-gray-50"><Navbar user={user} /><main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6"><div><h1 className="text-2xl font-semibold text-gray-900">Packages & Subscription</h1><p className="text-sm text-gray-500 mt-1">Choose a plan for your business and manage your subscription.</p></div><div className="grid grid-cols-1 md:grid-cols-3 gap-5">{plans.map(plan => <div key={plan.id} className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col shadow-sm"><h2 className="text-lg font-semibold">{plan.name}</h2><p className="text-sm text-gray-500 mt-1">{plan.description}</p><div className="text-3xl font-bold text-green-700 mt-5">KES {plan.price.toLocaleString()}<span className="text-sm font-normal text-gray-500"> / month</span></div><ul className="space-y-3 text-sm my-6 flex-1">{plan.features.map(f => <li key={f} className="flex gap-2"><Check className="w-4 h-4 text-green-600 shrink-0" />{f}</li>)}</ul><button onClick={() => setSelected(plan)} className="w-full rounded-lg bg-green-600 hover:bg-green-700 text-white py-3 font-medium">Subscribe</button></div>)}</div>{selected && <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"><div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4"><h2 className="text-lg font-semibold">Subscribe to {selected.name}</h2><p className="text-sm text-gray-500">KES {selected.price.toLocaleString()} per month</p><div className="flex gap-2"><button onClick={() => setOffline(false)} className={`flex-1 border rounded-lg p-3 text-sm ${!offline ? 'border-green-600 bg-green-50' : ''}`}><Smartphone className="w-4 h-4 mx-auto mb-1" />M-Pesa</button><button onClick={() => setOffline(true)} className={`flex-1 border rounded-lg p-3 text-sm ${offline ? 'border-green-600 bg-green-50' : ''}`}><WifiOff className="w-4 h-4 mx-auto mb-1" />Offline approval</button></div>{!offline && <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="M-Pesa phone number" className="w-full border rounded-lg px-3 py-2 text-sm" />}{offline && <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">Your request will be sent to an administrator for approval.</p>}<div className="flex gap-2"><button onClick={() => setSelected(null)} className="flex-1 border rounded-lg py-2 text-sm">Cancel</button><button onClick={subscribe} className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm">Continue</button></div></div></div>}</main></div>;
}
