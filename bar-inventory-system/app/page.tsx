'use client';
import {canAct, canVisit} from './lib/access';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowLeftRight, BadgeAlert, CircleDollarSign, Download, FileText, Info, Receipt, ShoppingCart } from 'lucide-react';
import Cookies from 'js-cookie';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from 'recharts';
import Navbar from './components/Navbar';
import LoadingSheet from './components/LoadingSheet';
import { reportsApi, authApi } from './lib/api';
import { toast } from 'sonner';

interface StockRow {
  id: number;
  name: string;
  category: string;
  stock: number;
  threshold: number;
  status: 'LOW' | 'OK';
}

interface UsageRow {
  id: number;
  name: string;
  category: string;
  units_sold: number;
  revenue: number;
}

interface TrendRow {
  date: string;
  revenue: number;
  transactions: number;
}

interface SizeGroup {
  price_group: string;
  count: number;
  total: number;
}

const GROUP_META: Record<string, { range: string; color: string }> = {
  Micro:  { range: 'KES 0–50',      color: 'var(--chart-accent, #354f43)' },
  Small:  { range: 'KES 51–500',    color: 'var(--chart-accent, #354f43)' },
  Medium: { range: 'KES 501–1000',  color: 'var(--chart-accent, #354f43)' },
  Large:  { range: 'KES 1001+',     color: 'var(--chart-accent, #354f43)' },
};

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ id: number; name: string; role: string; email: string; access?: any; business?: any } | null>(null);
  const [sellMenuOpen, setSellMenuOpen] = useState(false);

  const [stock, setStock]   = useState<StockRow[]>([]);
  const [usage, setUsage]   = useState<UsageRow[]>([]);
  const [trend, setTrend]   = useState<TrendRow[]>([]);
  const [todayRevenue, setTodayRevenue] = useState(0);
  const [groups, setGroups] = useState<SizeGroup[]>([]);
  const [hourly, setHourly] = useState<{ hour: number; revenue: number; transactions: number }[]>([]);
  const [dailyTarget, setDailyTarget] = useState(120000);
  const [salesPeriodDays, setSalesPeriodDays] = useState(1);
  const [summary,setSummary]=useState<any>(null);
  const [summaryLoading,setSummaryLoading]=useState(true);
  useEffect(() => { const saved = localStorage.getItem('stockpro_daily_target'); if (saved) setDailyTarget(Number(saved) || 120000); }, []);
  useEffect(() => { localStorage.setItem('stockpro_daily_target', String(dailyTarget)); }, [dailyTarget]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = Cookies.get('token');
    if (!token) {
      router.push('/login');
      return;
    }
    authApi.me()
      .then((res) => {
        setUser(res.data);
        if (!canVisit(res.data.access,window.location.pathname)) {
          router.push('/pos');
        }
      })
      .catch(() => {
        Cookies.remove('token');
        router.push('/login');
      });
  }, []);

  useEffect(()=>{
    if(!user)return;
    if(user.role!=='admin'&&!user.access?.owner){setSummaryLoading(false);return;}
    let active=true;setSummaryLoading(true);
    reportsApi.dashboardSummary(salesPeriodDays).then(({data})=>{if(active)setSummary(data);}).catch(()=>{if(active)toast.error('Could not load financial dashboard summary');}).finally(()=>{if(active)setSummaryLoading(false);});
    return()=>{active=false;};
  },[user,salesPeriodDays]);

  useEffect(() => {
    (async () => {
      try {
        const [stockRes, groupsRes, hourlyRes, todayTrendRes] = await Promise.all([
          reportsApi.getStock(),
          reportsApi.getSaleSizeGroups(),
          reportsApi.getHourlySales(3),
          reportsApi.getSalesTrend(1),
        ]);
        setStock(stockRes.data);
        setGroups((groupsRes.data as SizeGroup[]).map((g) => ({
          ...g,
          count: Number(g.count),
          total: Number(g.total),
        })));
        setHourly(hourlyRes.data.map((r: any) => ({ ...r, hour: Number(r.hour), revenue: Number(r.revenue), transactions: Number(r.transactions) })));
        setTodayRevenue((todayTrendRes.data as TrendRow[]).reduce((sum, row) => sum + Number(row.revenue), 0));
      } catch {
        toast.error('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([reportsApi.getUsage(salesPeriodDays), reportsApi.getSalesTrend(salesPeriodDays)])
      .then(([usageRes, trendRes]) => {
        if (!active) return;
        setUsage(usageRes.data);
        setTrend((trendRes.data as TrendRow[]).map((r) => ({
          date: new Date(r.date).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' }),
          revenue: Number(r.revenue),
          transactions: Number(r.transactions),
        })));
      })
      .catch(() => {
        if (active) toast.error('Failed to load sales for the selected period');
      });
    return () => { active = false; };
  }, [salesPeriodDays]);

  const lowStock = stock.filter((s) => s.status === 'LOW');
  const outOfStock = stock.filter((s) => Number(s.stock) <= 0);
  const targetProgress = Math.min(100, Math.round((todayRevenue / dailyTarget) * 100));
  const topSelling = [...usage].sort((a, b) => Number(b.units_sold) - Number(a.units_sold)).slice(0, 5);
  const categoryData = Object.values(usage.reduce((acc: Record<string,{name:string;sold:number}>,item)=>{acc[item.category]=acc[item.category]||{name:item.category,sold:0};acc[item.category].sold+=Number(item.units_sold);return acc;},{}));
  const currency=summary?.currency||user?.business?.currency||'KES';
  const summaryMoney=(value:any)=>`${currency} ${Number(value||0).toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const summaryCards=[
    {label:'TOTAL SALES',value:summary?.totalSales,icon:ShoppingCart,color:'sky',hint:''},
    {label:'GROSS PROFIT',value:summary?.grossProfit,icon:CircleDollarSign,color:'emerald',hint:summary?.missingCostLines?`${summary.missingCostLines} sale item(s) have no recorded cost`:'Profit after recorded item costs',info:true},
    {label:'INVOICE DUE',value:summary?.invoiceDue,icon:FileText,color:'amber',hint:''},
    {label:'NET SALES',value:summary?.netSales,icon:ArrowLeftRight,color:'rose',hint:`Total Credit Note: ${summaryMoney(summary?.creditNotes)}`},
    {label:'TOTAL PURCHASE',value:summary?.totalPurchases,icon:Download,color:'sky',hint:''},
    {label:'PURCHASE DUE',value:summary?.purchaseDue,icon:BadgeAlert,color:'amber',hint:''},
    {label:'TOTAL PURCHASE CREDIT NOTE',value:summary?.purchaseCreditNotes,icon:Receipt,color:'rose',hint:'Supplier purchase credit notes are not recorded yet',info:true},
    {label:'EXPENSE',value:summary?.expenses,icon:CircleDollarSign,color:'rose',hint:''},
  ];
  const salesChoices = [
    { href: '/pos', title: 'POS — instant sale', detail: 'Take payment now and update stock immediately.' },
    { href: '/sales-ar/invoice?new=1', title: 'Invoice', detail: 'Create an invoice and choose to issue now or save as a draft.' },
    { href: '/sales-ar/quotation?new=1', title: 'Quotation', detail: 'Prepare a quote without recording a sale or reducing stock.' },
  ].filter((choice) => canVisit(user?.access, choice.href) && canAct(user?.access, 'sales', 'create'));

  if (!user) {
    return <div className="min-h-screen bg-gray-50" />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} alertCount={lowStock.length} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        <header className="border-b border-gray-300 pb-5"><p className="text-sm text-gray-500 mb-2">Your business today</p><h1 className="text-3xl">Sales and stock</h1><p className="mt-2 text-sm text-gray-600">Track sales, check stock levels, and plan your next order.</p></header>
        {(user.role==='admin'||user.access?.owner)&&<section aria-label="Financial summary" className="space-y-4">
          <div className="flex items-center justify-end gap-2"><label htmlFor="dashboard-sales-period" className="text-sm text-gray-600">Summary period</label><select id="dashboard-sales-period" aria-label="Financial summary period" value={salesPeriodDays} onChange={event=>setSalesPeriodDays(Number(event.target.value))} className="rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm"><option value={1}>Today</option><option value={7}>Last 7 days</option><option value={14}>Last 14 days</option><option value={30}>Last 30 days</option></select></div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">{summaryCards.map(({label,value,icon:Icon,color,hint,info})=>{const colors:Record<string,{edge:string;ring:string;icon:string}>={sky:{edge:'border-l-sky-500',ring:'border-sky-200 bg-sky-50',icon:'text-sky-600'},emerald:{edge:'border-l-emerald-600',ring:'border-emerald-200 bg-emerald-50',icon:'text-emerald-600'},amber:{edge:'border-l-amber-500',ring:'border-amber-200 bg-amber-50',icon:'text-amber-600'},rose:{edge:'border-l-rose-500',ring:'border-rose-200 bg-rose-50',icon:'text-rose-600'}};const theme=colors[color];return <article key={label} className={`flex min-h-[112px] items-center gap-5 rounded-3xl border border-gray-100 border-l-4 bg-white p-5 shadow-sm ${theme.edge}`}>
            <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full border ${theme.ring}`}><Icon size={27} strokeWidth={2.2} className={theme.icon}/></div><div className="min-w-0"><div className="flex items-center gap-2 text-sm font-semibold text-slate-500"><span>{label}</span>{info&&<span title={label==='GROSS PROFIT'?'Sales less recorded product cost.':'Supplier purchase credit notes are not recorded yet.'} className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500 text-white"><Info size={13}/></span>}</div><p className="mt-1 font-mono text-2xl font-bold tracking-wide text-slate-900">{summaryLoading ? "..." : !summary || value == null ? "-" : summaryMoney(value)}</p>{hint&&<p className="mt-2 text-sm text-slate-400">{hint}</p>}</div>
          </article>;})}</div>
        </section>}
        <section aria-label="Common tasks" className="space-y-3"><div className="flex items-end justify-between gap-3"><div><h2 className="text-base font-semibold">What would you like to do?</h2><p className="text-sm text-gray-500">Shortcuts to everyday work</p></div><div className="flex flex-wrap gap-2 text-sm">{outOfStock.length>0&&<Link href="/inventory?status=out" className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-red-800">{outOfStock.length} out of stock</Link>}{lowStock.length>0&&<Link href="/inventory?status=low" className="rounded-sm border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">{lowStock.length} low stock</Link>}</div></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {salesChoices.length > 0 && <button type="button" onClick={() => setSellMenuOpen(true)} className="group rounded-sm border border-gray-200 bg-white p-4 text-left transition hover:border-brand hover:shadow-sm"><span className="inline-flex rounded-sm bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white">Sell now</span><span className="mt-2 block text-sm text-gray-600">Choose POS, invoice or quotation</span></button>}
          {[
          {href:'/purchases',title:'Receive a purchase',detail:'Record supplier goods and bills',accent:'bg-slate-800'},
          {href:'/stock-transfers',title:'Transfer stock',detail:'Move items to another shop',accent:'bg-slate-800'},
          {href:'/stock-adjustments',title:'Adjust stock',detail:'Record a count, damage or wastage',accent:'bg-slate-800'},
          {href:'/expenses',title:'Record an expense',detail:'Choose a kind and linked ledger',accent:'bg-slate-800'},
          {href:'/inventory',title:'Manage inventory',detail:'Search products and stock status',accent:'bg-slate-800'},
        ].filter(task=>canVisit(user.access,task.href)).map(task=><Link key={task.href} href={task.href} className="group rounded-sm border border-gray-200 bg-white p-4 transition hover:border-brand hover:shadow-sm"><span className={`inline-flex rounded-sm px-3 py-1.5 text-sm font-semibold text-white ${task.accent}`}>{task.title}</span><span className="mt-2 block text-sm text-gray-600">{task.detail}</span></Link>)}</div></section>
        <Dialog.Root open={sellMenuOpen} onOpenChange={setSellMenuOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-[60] w-[calc(100%_-_2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 space-y-4 bg-white p-6 shadow-xl">
              <Dialog.Title className="text-xl font-semibold">Choose how to sell</Dialog.Title>
              <Dialog.Description className="text-sm text-gray-600">StockPro checks available stock before recording a sale. Quotations do not reduce stock.</Dialog.Description>
              <div className="space-y-2">
                {salesChoices.map((choice) => (
                  <Dialog.Close asChild key={choice.href}>
                    <Link href={choice.href} className="block rounded-sm border p-3 transition hover:border-brand hover:bg-gray-50">
                      <span className="block font-medium">{choice.title}</span>
                      <span className="mt-1 block text-sm text-gray-600">{choice.detail}</span>
                    </Link>
                  </Dialog.Close>
                ))}
              </div>
              <Dialog.Close className="rounded-sm border px-4 py-2 text-sm">Cancel</Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        {loading ? <LoadingSheet label="Loading sales and stock" /> : <>
        <div className="bg-white border border-gray-200 rounded-sm p-5">
          <div className="flex items-center justify-between mb-3"><div><h2 className="text-sm font-medium">Daily Sales Pace</h2><p className="text-xs text-gray-500">Target progress and revenue goal tracking</p></div><div className="flex items-center gap-2"><label className="text-xs text-gray-500">Target KES</label><input type="number" min={1} value={dailyTarget} onChange={(e) => setDailyTarget(Number(e.target.value) || 1)} className="w-28 border rounded-sm px-2 py-1 text-sm" /></div></div>
          <div className="flex justify-between text-xs mb-1"><span>Today: KES {todayRevenue.toLocaleString()}</span><span>{targetProgress}% of KES {dailyTarget.toLocaleString()}</span></div>
          <div className="h-3 bg-gray-100 rounded-sm overflow-hidden"><div className="h-full bg-brand   " style={{ width: `${targetProgress}%` }} /></div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <div className=" bg-white border border-gray-200 rounded-sm p-5"><div className="flex justify-between mb-4"><h2 className="text-sm font-medium">Sales by the Hour</h2><span className="text-xs text-green-600">Last 3 days</span></div><ResponsiveContainer width="100%" height={220}><LineChart data={hourly}><CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" /><XAxis dataKey="hour" tickFormatter={(v) => `${v}:00`} tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Line type="monotone" dataKey="revenue" stroke="var(--chart-accent, #354f43)" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div>
          <div className="bg-white border border-gray-200 rounded-sm p-5"><div className="flex justify-between mb-4"><h2 className="text-sm font-medium">Top Selling Products</h2><span className="text-xs text-green-600">Live rank</span></div><div className="space-y-2">{topSelling.map((item, i) => <div key={item.id} className="flex items-center gap-2 p-2 rounded-sm bg-gray-50"><span className="w-6 h-6 rounded-sm bg-amber-100 text-amber-800 text-xs flex items-center justify-center font-semibold">{i + 1}</span><div className="min-w-0 flex-1"><div className="text-xs font-medium truncate">{item.name}</div><div className="text-[11px] text-gray-500">{Number(item.units_sold).toLocaleString()} sold</div></div><span className="text-xs font-semibold text-green-700">KES {Number(item.revenue).toLocaleString()}</span></div>)}{!topSelling.length && <p className="text-sm text-gray-400">No sales yet</p>}</div></div>
        </div>

        <div className="grid grid-cols-1 gap-6">

          {/* Sale Size Groups */}
          <div className="bg-white border border-gray-200 rounded-sm p-5">
            <h2 className="text-sm font-medium mb-4">Sale Size Groups</h2>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {Object.entries(GROUP_META).map(([label, meta]) => {
                const g = groups.find((x) => x.price_group === label);
                return (
                  <div key={label} className="bg-gray-50 rounded-sm p-3 text-center border border-gray-100">
                    <div className="text-[10px] text-gray-400 mb-1">{meta.range}</div>
                    <div className="text-lg font-semibold" style={{ color: meta.color }}>
                      {g?.count || 0}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{label}</div>
                    <div className="h-0.5 rounded-sm mt-2" style={{ background: meta.color, opacity: 0.5 }} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Low Stock */}
          <div className="bg-white border border-gray-200 rounded-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium">Low Stock Alerts</h2>
              <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-sm font-medium">
                {lowStock.length} items
              </span>
            </div>
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {lowStock.map((item) => {
                const critical = item.stock <= Math.floor(item.threshold / 2);
                return (
                  <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-sm bg-gray-50">
                    <div className={`w-2 h-2 rounded-sm flex-shrink-0 ${critical ? 'bg-red-500' : 'bg-amber-400'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{item.name}</div>
                      <div className="text-xs text-gray-500">{item.stock} left · threshold: {item.threshold}</div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-sm font-medium ${
                      critical ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {critical ? 'Critical' : 'Low'}
                    </span>
                  </div>
                );
              })}
              {!loading && !lowStock.length && (
                <div className="text-center py-6 text-sm text-gray-400">All stock levels healthy</div>
              )}
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 gap-6">

          {/* Sales trend */}
          <div className="bg-white border border-gray-200 rounded-sm p-5">
            <h2 className="text-sm font-medium mb-4">Sales Trend (14 Days)</h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => [`KES ${v.toLocaleString()}`, 'Revenue']} />
                <Line type="monotone" dataKey="revenue" stroke="var(--chart-accent, #354f43)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Sales by category */}
          <div className="bg-white border border-gray-200 rounded-sm p-5">
            <h2 className="text-sm font-medium mb-4">Units Sold by Category (14d)</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={categoryData}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="sold" fill="var(--chart-accent, #354f43)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        </>}
      </main>
    </div>
  );
}
