'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import { authApi, subscriptionsApi } from '../../lib/api';
import Cookies from 'js-cookie';

export default function SubscriptionStatusPage() {
  const [user, setUser] = useState<any>(null); const [current, setCurrent] = useState<any>(null); const [loading, setLoading] = useState(true);
  useEffect(() => { if (!Cookies.get('token')) return; authApi.me().then(r => { setUser(r.data); subscriptionsApi.getCurrent().then(x => setCurrent(x.data)).finally(() => setLoading(false)); }).catch(() => setLoading(false)); }, []);
  const expiry = current?.end_date ? new Date(current.end_date) : null; const days = expiry ? Math.ceil((expiry.getTime() - Date.now()) / 86400000) : 0; const active = current?.current_status === 'approved' && days >= 0;
  return <div className="min-h-screen bg-gray-50"><Navbar user={user} /><main className="max-w-3xl mx-auto px-4 sm:px-6 py-8"><div className="bg-white border rounded-sm p-6 sm:p-8"><h1 className="text-2xl font-semibold">Subscription Status</h1>{loading ? <p className="mt-8 text-gray-400">Loading subscription...</p> : !current ? <div className="mt-8"><p className="text-gray-600">You do not have an active subscription yet.</p><Link href="/subscription" className="inline-block mt-4 bg-green-600 text-white rounded-sm px-4 py-2 text-sm">View packages</Link></div> : <div className="mt-6 space-y-5"><div className="flex items-center justify-between"><div><p className="text-sm text-gray-500">Current plan</p><p className="text-2xl font-bold">{String(current.plan).toUpperCase()}</p></div><span className={`px-3 py-1 rounded-sm text-sm font-medium ${active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{active ? 'Active' : 'Expired'}</span></div><div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><div className="bg-gray-50 rounded-sm p-4"><p className="text-xs text-gray-500">Started</p><p className="font-medium mt-1">{new Date(current.start_date).toLocaleDateString()}</p></div><div className="bg-gray-50 rounded-sm p-4"><p className="text-xs text-gray-500">Expires</p><p className="font-medium mt-1">{expiry?.toLocaleDateString()}</p></div><div className="bg-gray-50 rounded-sm p-4"><p className="text-xs text-gray-500">Remaining</p><p className="font-medium mt-1">{active ? `${days} days` : 'Expired'}</p></div></div><Link href="/subscription" className="inline-block bg-green-600 text-white rounded-sm px-4 py-2 text-sm">Renew or change plan</Link></div>}</div></main></div>;
}
