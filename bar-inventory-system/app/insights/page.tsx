'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpRight, Clock3, PackageSearch, ShieldCheck, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import Navbar from '../components/Navbar';
import { authApi, reportsApi, suppliersApi } from '../lib/api';
import Cookies from 'js-cookie';
import { toast } from 'sonner';

type Stock = { id: number; name: string; stock: number; threshold: number; price: number; cost: number; category: string; status: string };
type Usage = { id: number; name: string; units_sold: number; revenue: number; stock: number; threshold: number; price: number; cost?: number; category: string };
type Hour = { hour: number; revenue: number; transactions: number };

export default function InsightsPage() {
  const [user, setUser] = useState<any>(null);
  const [stock, setStock] = useState<Stock[]>([]);
  const [usage, setUsage] = useState<Usage[]>([]);
  const [hours, setHours] = useState<Hour[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [benchmark, setBenchmark] = useState<any>(null);
  const [pairs, setPairs] = useState<any[]>([]);
  const [losses, setLosses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!Cookies.get('token')) return;
    authApi.me().then(r => setUser(r.data)).catch(() => {});
    Promise.all([reportsApi.getStock(), reportsApi.getUsage(30), reportsApi.getHourlySales(30), suppliersApi.getAll(), reportsApi.getBenchmarks(), reportsApi.getProductPairs(), reportsApi.getLossAlerts()])
      .then(([s, u, h, sup, bench, pair, loss]) => { setStock(s.data); setUsage(u.data); setHours(h.data.map((x: any) => ({ ...x, hour: Number(x.hour), revenue: Number(x.revenue), transactions: Number(x.transactions) }))); setSuppliers(sup.data); setBenchmark(bench.data); setPairs(pair.data); setLosses(loss.data); })
      .catch(() => toast.error('Could not load business insights'))
      .finally(() => setLoading(false));
  }, []);

  const riskItems = useMemo(() => usage.filter(i => i.stock <= i.threshold).sort((a, b) => a.stock - b.stock).slice(0, 5), [usage]);
  const slowItems = useMemo(() => usage.filter(i => Number(i.units_sold) === 0 || Number(i.units_sold) < 3).sort((a, b) => Number(a.revenue) - Number(b.revenue)).slice(0, 5), [usage]);
  const topItems = useMemo(() => [...usage].sort((a, b) => Number(b.units_sold) - Number(a.units_sold)).slice(0, 5), [usage]);
  const totalRevenue = usage.reduce((n, i) => n + Number(i.revenue), 0);
  const stockValue = slowItems.reduce((n, i) => n + Number(i.stock) * Number(i.cost || i.price || 0), 0);
  const peak = hours.reduce<Hour | null>((best, h) => !best || h.revenue > best.revenue ? h : best, null);
  const stockHealth = stock.length ? Math.round(((stock.length - riskItems.length) / stock.length) * 100) : 100;
  const score = Math.max(0, Math.min(100, Math.round(stockHealth * 0.45 + (topItems.length ? 35 : 0) + (peak ? 20 : 0))));
  const supplierCoverage = stock.filter(i => (i as any).supplier_name).length;
  const uncoveredItems = stock.filter(i => !(i as any).supplier_name).slice(0, 4);

  if (!user && !loading) return <div className="min-h-screen bg-gray-50" />;
  return <div className="min-h-screen bg-gray-50"><Navbar user={user} /><main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
    <div><div className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-green-600" /><h1 className="text-2xl font-semibold">Business Insights</h1></div><p className="text-sm text-gray-500 mt-1">Your daily operating intelligence—what needs attention, what is working, and where profit is hiding.</p></div>
    {loading ? <div className="py-20 text-center text-sm text-gray-400">Analysing your business...</div> : <>
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"><div className="bg-white border rounded-xl p-5"><div className="flex justify-between"><span className="text-sm text-gray-500">Bar Performance Score</span><ShieldCheck className="w-5 h-5 text-green-600" /></div><div className="text-4xl font-bold text-green-700 mt-3">{score}<span className="text-base text-gray-400">/100</span></div><p className="text-xs text-gray-500 mt-2">Based on stock health, sales activity and trading coverage</p></div><Metric title="30-day revenue" value={`KES ${totalRevenue.toLocaleString()}`} icon={<TrendingUp className="w-5 h-5 text-green-600" />} /><Metric title="Stockout risks" value={String(riskItems.length)} icon={<AlertTriangle className="w-5 h-5 text-amber-600" />} /><Metric title="Slow stock value" value={`KES ${stockValue.toLocaleString()}`} icon={<TrendingDown className="w-5 h-5 text-red-500" />} /></section>
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6"><InsightCard title="What needs attention" icon={<AlertTriangle className="w-4 h-4 text-amber-600" />}><div className="space-y-3">{riskItems.map(i => <div key={i.id} className="flex justify-between gap-3 border-b pb-2"><div><p className="text-sm font-medium">{i.name}</p><p className="text-xs text-gray-500">Only {i.stock} left · reorder threshold {i.threshold}</p></div><span className="text-xs text-amber-700 font-medium">Reorder soon</span></div>)}{!riskItems.length && <Empty text="No immediate stockout risks." />}</div></InsightCard><InsightCard title="Reorder recommendations" icon={<PackageSearch className="w-4 h-4 text-green-600" />}><div className="space-y-3">{riskItems.slice(0, 4).map(i => { const suggested = Math.max(i.threshold * 2 - i.stock, i.threshold); return <div key={i.id} className="flex justify-between gap-3 border-b pb-2"><div><p className="text-sm font-medium">{i.name}</p><p className="text-xs text-gray-500">Recommended order: {suggested} {i.category}</p></div><span className="text-xs text-green-700">Protect sales</span></div>; })}{!riskItems.length && <Empty text="Inventory is currently covered." />}</div></InsightCard><InsightCard title="Peak trading insight" icon={<Clock3 className="w-4 h-4 text-blue-600" />}><div className="flex items-center gap-4"><div className="text-4xl font-bold text-blue-700">{peak ? `${peak.hour}:00` : '—'}</div><div><p className="text-sm font-medium">Your busiest sales hour</p><p className="text-xs text-gray-500">Prepare staff and fast-moving stock before this hour.</p></div></div></InsightCard><InsightCard title="Profit opportunities" icon={<ArrowUpRight className="w-4 h-4 text-purple-600" />}><div className="space-y-3">{topItems.slice(0, 4).map(i => <div key={i.id} className="flex justify-between border-b pb-2"><div><p className="text-sm font-medium">{i.name}</p><p className="text-xs text-gray-500">{Number(i.units_sold).toLocaleString()} units sold · KES {Number(i.revenue).toLocaleString()} revenue</p></div><span className="text-xs text-purple-700">Promote</span></div>)}</div></InsightCard></section>
      <section className="grid grid-cols-1 lg:grid-cols-4 gap-6"><InsightCard title="Supplier intelligence" icon={<PackageSearch className="w-4 h-4 text-indigo-600" />}><p className="text-sm text-gray-600 mb-3">{supplierCoverage} of {stock.length} products have a supplier assigned.</p><div className="flex flex-wrap gap-2 mb-3">{suppliers.slice(0, 6).map(s => <span key={s.id} className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full">{s.name}</span>)}</div>{uncoveredItems.length ? <><p className="text-xs font-medium text-amber-700 mb-2">Products needing supplier coverage</p>{uncoveredItems.map(i => <p key={i.id} className="text-xs text-gray-500">• {i.name}</p>)}</> : <p className="text-xs text-green-700">Every product is linked to a supplier.</p>}</InsightCard><InsightCard title="Industry benchmark" icon={<TrendingUp className="w-4 h-4 text-blue-600" />}><p className="text-sm text-gray-600">Anonymous comparison across StockPro businesses.</p><div className="mt-4 space-y-2 text-sm"><div className="flex justify-between"><span>Your 30-day revenue</span><b>KES {totalRevenue.toLocaleString()}</b></div><div className="flex justify-between"><span>Network average</span><b>KES {Number(benchmark?.network?.avg_revenue || 0).toLocaleString()}</b></div><p className="text-xs text-gray-400">Based on {benchmark?.network?.businesses || 0} participating businesses.</p></div></InsightCard><InsightCard title="Popular pairings" icon={<ArrowUpRight className="w-4 h-4 text-purple-600" />}><div className="space-y-2">{pairs.slice(0, 4).map((p, i) => <div key={`${p.product_a}-${p.product_b}`} className="text-xs border-b pb-2"><p className="font-medium">{i + 1}. {p.product_a} + {p.product_b}</p><p className="text-gray-500">Bought together {p.times_bought_together} times</p></div>)}{!pairs.length && <Empty text="Pairing insights will appear after more sales." />}</div></InsightCard><InsightCard title="Weekly owner report" icon={<Sparkles className="w-4 h-4 text-emerald-600" />}><p className="text-sm text-gray-600">Download a simple briefing to share with the owner or management team.</p><button onClick={() => { const text = `StockPro Weekly Briefing\nScore: ${score}/100\nRevenue: KES ${totalRevenue.toLocaleString()}\nStockout risks: ${riskItems.length}\nSlow stock value: KES ${stockValue.toLocaleString()}\nPeak hour: ${peak ? `${peak.hour}:00` : 'N/A'}`; const blob = new Blob([text], { type: 'text/plain' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `stockpro-weekly-briefing-${new Date().toISOString().slice(0, 10)}.txt`; a.click(); URL.revokeObjectURL(url); }} className="mt-4 bg-gray-900 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium">Download weekly briefing</button></InsightCard></section>
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6"><InsightCard title="Loss and leakage monitor" icon={<AlertTriangle className="w-4 h-4 text-red-600" />}><p className="text-sm text-gray-600 mb-3">Sales recorded below product cost in the last 30 days.</p><div className="space-y-2">{losses.slice(0, 5).map(l => <div key={`${l.sale_id}-${l.item_name}`} className="flex justify-between border-b pb-2 text-xs"><span>{l.item_name} · {l.quantity} units</span><span className="font-medium text-red-600">KES {Number(l.estimated_loss).toLocaleString()} loss</span></div>)}{!losses.length && <Empty text="No below-cost sales detected." />}</div></InsightCard><InsightCard title="Owner briefing" icon={<Sparkles className="w-4 h-4 text-emerald-600" />}><p className="text-sm text-gray-600 leading-6">Focus on protecting {riskItems.length || 'no'} stockout risk{riskItems.length === 1 ? '' : 's'}, preparing for your {peak ? `${peak.hour}:00` : 'peak'} trading period, and reviewing KES {stockValue.toLocaleString()} tied up in slow-moving stock.</p></InsightCard></section>
    </>}
  </main></div>;
}

function Metric({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) { return <div className="bg-white border rounded-xl p-5"><div className="flex justify-between"><span className="text-sm text-gray-500">{title}</span>{icon}</div><div className="text-2xl font-bold mt-4">{value}</div><p className="text-xs text-gray-400 mt-2">Updated from your latest records</p></div>; }
function InsightCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) { return <div className="bg-white border rounded-xl p-5"><div className="flex items-center gap-2 mb-4"><span>{icon}</span><h2 className="text-sm font-semibold">{title}</h2></div>{children}</div>; }
function Empty({ text }: { text: string }) { return <p className="text-sm text-gray-400 py-4">{text}</p>; }
