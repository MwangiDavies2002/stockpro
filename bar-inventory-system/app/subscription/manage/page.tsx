'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, Clock, X } from '../../components/TextMark';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import Navbar from '../../components/Navbar';
import { authApi, subscriptionsApi } from '../../lib/api';
import { toast } from 'sonner';

export default function ManageSubscriptionsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!Cookies.get('token')) { router.push('/login'); return; }
    authApi.me().then(async ({ data }) => {
      if (data.role !== 'admin') { router.push('/subscription'); return; }
      setUser(data);
      const result = await subscriptionsApi.getAll();
      setRequests(result.data);
    }).catch(() => router.push('/login')).finally(() => setLoading(false));
  }, [router]);
  async function approve(id: number) {
    try {
      const { data } = await subscriptionsApi.approve(id);
      setRequests(current => current.map(item => item.id === id ? data : item));
      toast.success('Subscription approved');
    } catch (err: any) { toast.error(err?.response?.data?.message || 'Approval failed'); }
  }
  return <div className="min-h-screen bg-gray-50"><Navbar user={user} /><main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6"><div><h1 className="text-2xl font-semibold">Subscription Management</h1><p className="text-sm text-gray-500 mt-1">Review and approve package requests for this business.</p></div><div className="bg-white border rounded-sm overflow-hidden"><div className="p-5 border-b"><h2 className="font-semibold">Requests</h2></div>{loading ? <div className="p-10 text-center text-gray-400">Loading requests...</div> : !requests.length ? <div className="p-10 text-center text-gray-400">No subscription requests yet.</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left text-xs text-gray-500"><th className="px-5 py-3">Plan</th><th className="px-5 py-3">Amount</th><th className="px-5 py-3">Payment</th><th className="px-5 py-3">Phone</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Action</th></tr></thead><tbody className="divide-y">{requests.map(request => <tr key={request.id}><td className="px-5 py-4 font-medium">{String(request.plan).toUpperCase()}</td><td className="px-5 py-4">KES {Number(request.amount).toLocaleString()}</td><td className="px-5 py-4">{request.payment_method}</td><td className="px-5 py-4">{request.phone || '—'}</td><td className="px-5 py-4"><span className={`inline-flex items-center gap-1 px-2 py-1 rounded-sm text-xs ${request.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{request.status === 'approved' ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}{request.status}</span></td><td className="px-5 py-4">{request.status !== 'approved' && <button onClick={() => approve(request.id)} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-sm text-xs">Approve</button>}</td></tr>)}</tbody></table></div>}</div></main></div>;
}
