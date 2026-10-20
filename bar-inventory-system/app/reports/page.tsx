'use client';
import {canVisit} from '../lib/access';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { Download, TrendingUp, BarChart2, FileSpreadsheet } from '../components/TextMark';
import StockReports from '../components/reports/StockReports';
import Navbar from '../components/Navbar';
import {useAccess} from '../components/AccessBoundary';
import {canAct} from '../lib/access';
import api, { reportsApi, authApi } from '../lib/api';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

interface UsageRow {
  id: number;
  name: string;
  category: string;
  price: number;
  stock: number;
  threshold: number;
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
  avg_amount: number;
}

const GROUP_COLORS: Record<string, string> = {
  Micro: 'var(--chart-accent, #354f43)',
  Small: '#378ADD',
  Medium: '#BA7517',
  Large: '#D85A30',
};
const GROUP_RANGES: Record<string, string> = {
  Micro: 'KES 0–50',
  Small: 'KES 51–500',
  Medium: 'KES 501–1000',
  Large: 'KES 1001+',
};

type Period = '7' | '14' | '30';
type ProfitReport = {
  items: Array<{ item_id: number; item_name: string; units_sold: number; net_revenue: number; recorded_cost: number; missing_cost_lines: number; gross_profit: number | null }>;
  summary: { netRevenue: number; recordedCost: number; missingCostLines: number; grossProfit: number | null; marginPercent: number | null };
};
const money = (value: number) => `KES ${Number(value).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ReportsPage() {
  const router = useRouter();
  const {access}=useAccess();
  const [user, setUser] = useState<{ name: string; role: string; email: string } | null>(null);

  const reportVersion=useRef(0);
  const [period, setPeriod] = useState<Period>('7');
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);

  const [usage, setUsage]   = useState<UsageRow[]>([]);
  const [trend, setTrend]   = useState<TrendRow[]>([]);
  const [groups, setGroups] = useState<SizeGroup[]>([]);
  const [profit, setProfit] = useState<ProfitReport | null>(null);

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

  useEffect(() => {
    loadReports();
  }, [period]);

  async function loadReports() {
    const version=++reportVersion.current;setLoading(true);setUsage([]);setTrend([]);setGroups([]);setProfit(null);
    try {
      const [usageRes, trendRes, groupsRes, profitRes] = await Promise.all([
        reportsApi.getUsage(parseInt(period)),
        reportsApi.getSalesTrend(parseInt(period)),
        reportsApi.getMpesaGroups(parseInt(period)), // hits /reports/sale-size-groups
        reportsApi.getProfit(parseInt(period)),
      ]);
      if(version!==reportVersion.current)return;setProfit(profitRes.data);
      setUsage(usageRes.data);
      setTrend(trendRes.data.map((r: any) => ({
        date: new Date(r.date).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' }),
        revenue: Number(r.revenue),
        transactions: Number(r.transactions),
      })));
      setGroups(groupsRes.data.map((g: any) => ({
        ...g,
        total: Number(g.total),
        avg_amount: Number(g.avg_amount),
        count: Number(g.count),
      })));
    } catch {
      toast.error('Failed to load reports');
    } finally {
      if(version===reportVersion.current)setLoading(false);
    }
  }

  async function exportExcel(p: Period) {
    if(!canAct(access,'reports','export'))return toast.error('Your role cannot export reports');
    setExporting(true);
    try {
      const days = parseInt(p);
      const label = p === '7' ? '7_Days' : p === '14' ? '14_Days' : '30_Days';

      const [usageRes, trendRes, groupsRes, profitRes] = await Promise.all([
        reportsApi.getUsage(days),
        reportsApi.getSalesTrend(days),
        reportsApi.getMpesaGroups(days),
        reportsApi.getProfit(days),
      ]);

      const ws1 = XLSX.utils.json_to_sheet(usageRes.data.map((i: UsageRow) => ({
        'Item':          i.name,
        'Category':      i.category,
        'Stock':         i.stock,
        'Threshold':     i.threshold,
        'Price (KES)':   i.price,
        'Units Sold':    i.units_sold,
        'Revenue (KES)': i.revenue,
        'Status':        i.stock <= i.threshold ? 'LOW' : 'OK',
      })));

      const ws2 = XLSX.utils.json_to_sheet(groupsRes.data.map((g: SizeGroup) => ({
        'Group':          g.price_group,
        'Transactions':   g.count,
        'Total (KES)':    g.total,
        'Avg (KES)':      Math.round(g.avg_amount),
      })));

      const ws3 = XLSX.utils.json_to_sheet(trendRes.data.map((r: any) => ({
        'Date':          new Date(r.date).toLocaleDateString('en-KE'),
        'Revenue (KES)': Number(r.revenue),
        'Transactions':  Number(r.transactions),
      })));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws1, 'Inventory Snapshot');
      XLSX.utils.book_append_sheet(wb, ws2, 'Sale Size Groups');
      XLSX.utils.book_append_sheet(wb, ws3, 'Daily Sales');
      const profitData = profitRes.data as ProfitReport;
      const ws4 = XLSX.utils.json_to_sheet(profitData.items.map(row => ({
        'Item': row.item_name, 'Net Units Sold': row.units_sold, 'Net Revenue (KES)': row.net_revenue,
        'Recorded Purchase Cost (KES)': row.recorded_cost, 'Gross Profit (KES)': row.gross_profit ?? 'Cost unavailable',
        'Missing Cost Lines': row.missing_cost_lines,
      })));
      XLSX.utils.book_append_sheet(wb, ws4, 'Gross Profit');

      XLSX.writeFile(wb, `StockPro_Report_${label}.xlsx`);
      toast.success(`Exported ${days}-day report as Excel`);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  }

  const totalRevenue = trend.reduce((a, row) => a + row.revenue, 0);
  const totalTxns    = trend.reduce((a, row) => a + row.transactions, 0);
  const lowStockCount = usage.filter((i) => i.stock <= i.threshold).length;

  if (!user) {
    return <div className="min-h-screen bg-gray-50" />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-base font-semibold text-gray-900">Reports & Analytics</h1>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-white border border-gray-200 rounded-sm p-1">
              {(['7', '14', '30'] as Period[]).map((p) => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-sm
                    ${period === p ? 'bg-green-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                  {p} Days
                </button>
              ))}
            </div>
          </div>
        </div>

        <StockReports days={Number(period)}/>
        {/* Summary metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Sales total (incl. tax)',      value: `KES ${totalRevenue.toLocaleString()}`, sub: `Last ${period} days` },
            { label: 'Total Transactions', value: totalTxns.toString(),                    sub: 'Completed sales' },
            { label: 'Avg. Transaction',   value: totalTxns ? `KES ${Math.round(totalRevenue / totalTxns).toLocaleString()}` : 'KES 0', sub: 'Per sale' },
            { label: 'Low Stock Items',    value: `${lowStockCount}`,                      sub: 'Need restocking' },
          ].map((m) => (
            <div key={m.label} className="bg-white border border-gray-200 rounded-sm p-4">
              <div className="text-xs text-gray-500 mb-2">{m.label}</div>
              <div className="text-xl font-semibold text-gray-900">{m.value}</div>
              <div className="text-xs text-gray-400 mt-1">{m.sub}</div>
            </div>
          ))}
        </div>

        {/* Export section */}
        <div className="bg-white border border-gray-200 rounded-sm p-5">
          <div className="flex items-center gap-2 mb-1">
            <FileSpreadsheet className="w-4 h-4 text-green-600" />
            <h2 className="text-sm font-medium">Export Sales Data (Excel)</h2>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Downloads a multi-sheet workbook: Inventory Snapshot · Sale Size Groups · Daily Sales
          </p>
          <div className="flex gap-2 flex-wrap">
            {(['7', '14', '30'] as Period[]).map((p) => (
              <button key={p} onClick={() => exportExcel(p)} disabled={exporting||!canAct(access,'reports','export')}
                className={`flex items-center gap-2 text-sm px-4 py-2 rounded-sm  disabled:opacity-60
                  ${p === '7' ? 'bg-green-600 text-white hover:bg-green-700' : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}>
                <Download className="w-3.5 h-3.5" />
                Past {p} Days
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-sm text-gray-400">Loading reports...</div>
        ) : (
          <>
            {profit && <section className="bg-white border border-gray-200 rounded-sm p-5 space-y-4">
              <div><h2 className="text-sm font-semibold">Gross Profit on Items Sold ({period} Days)</h2><p className="text-xs text-gray-500 mt-1">Sales after discounts, excluding tax, minus the purchase cost recorded at sale. Credit notes reduce revenue and cost. Operating expenses are excluded.</p></div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  ['Net sales', money(profit.summary.netRevenue)],
                  ['Recorded purchase cost', money(profit.summary.recordedCost)],
                  ['Gross profit', profit.summary.grossProfit === null ? 'Incomplete costs' : money(profit.summary.grossProfit)],
                  ['Gross margin', profit.summary.marginPercent === null ? 'Unavailable' : `${profit.summary.marginPercent.toFixed(2)}%`],
                ].map(([label, value]) => <div key={label} className="rounded-sm bg-gray-50 p-3"><p className="text-xs text-gray-500">{label}</p><p className="font-semibold mt-1">{value}</p></div>)}
              </div>
              {profit.summary.missingCostLines > 0 && <p role="status" className="text-sm text-amber-800 bg-amber-50 rounded-sm p-3">{profit.summary.missingCostLines} older sale or return line(s) have no recorded purchase cost. Their profit is unavailable; changing today's item cost will not reconstruct those costs.</p>}
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-2 pr-3">Item</th><th className="py-2 pr-3">Net units sold</th><th className="py-2 pr-3">Net revenue</th><th className="py-2 pr-3">Purchase cost</th><th className="py-2">Gross profit</th></tr></thead><tbody>
                {profit.items.map(row => <tr key={`${row.item_id}-${row.item_name}`} className="border-b"><td className="py-3 pr-3">{row.item_name}</td><td className="py-3 pr-3">{row.units_sold}</td><td className="py-3 pr-3 whitespace-nowrap">{money(row.net_revenue)}</td><td className="py-3 pr-3 whitespace-nowrap">{row.missing_cost_lines ? 'Incomplete costs' : money(row.recorded_cost)}</td><td className="py-3 whitespace-nowrap">{row.gross_profit === null ? 'Unavailable' : money(row.gross_profit)}</td></tr>)}
                {!profit.items.length && <tr><td colSpan={5} className="py-6 text-center text-gray-500">No items sold in this period.</td></tr>}
              </tbody></table></div>
            </section>}
            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-gray-200 rounded-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp className="w-4 h-4 text-green-600" />
                  <h2 className="text-sm font-medium">Revenue Trend ({period} Days)</h2>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                      interval={period === '30' ? 4 : period === '14' ? 2 : 0} />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                      tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => [`KES ${v.toLocaleString()}`, 'Revenue']} />
                    <Line type="monotone" dataKey="revenue" stroke="var(--chart-accent, #354f43)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white border border-gray-200 rounded-sm p-5">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart2 className="w-4 h-4 text-green-600" />
                  <h2 className="text-sm font-medium">Sale Size Breakdown</h2>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={groups}>
                    <XAxis dataKey="price_group" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                      tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => [`KES ${v.toLocaleString()}`, 'Total']} />
                    <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                      {groups.map((g, i) => (
                        <Cell key={i} fill={GROUP_COLORS[g.price_group] || 'var(--chart-accent, #354f43)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Inventory usage table */}
            <div className="bg-white border border-gray-200 rounded-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-200">
                <h2 className="text-sm font-medium">Stock Usage Report</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Item</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Category</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Units Sold</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Revenue</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Stock Left</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {[...usage].sort((a, b) => b.revenue - a.revenue).map((item) => {
                      const low = item.stock <= item.threshold;
                      const critical = item.stock <= Math.floor(item.threshold / 2);
                      return (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                          <td className="px-4 py-3 text-gray-500">{item.category}</td>
                          <td className="px-4 py-3">{item.units_sold.toLocaleString()}</td>
                          <td className="px-4 py-3 font-medium text-green-700">KES {Number(item.revenue).toLocaleString()}</td>
                          <td className="px-4 py-3">{item.stock}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-sm font-medium
                              ${critical ? 'bg-red-50 text-red-600' : low ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-700'}`}>
                              {critical ? 'Critical' : low ? 'Low' : 'OK'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {!usage.length && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No data yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Sale size group detail */}
            <div className="bg-white border border-gray-200 rounded-sm p-5">
              <h2 className="text-sm font-medium mb-4">Sale Size Groups Breakdown</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {groups.map((g) => (
                  <div key={g.price_group} className="border border-gray-200 rounded-sm p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-500">{GROUP_RANGES[g.price_group] || ''}</span>
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: GROUP_COLORS[g.price_group] || 'var(--chart-accent, #354f43)' }} />
                    </div>
                    <div className="text-2xl font-semibold" style={{ color: GROUP_COLORS[g.price_group] || 'var(--chart-accent, #354f43)' }}>{g.count}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{g.price_group} — KES {g.total.toLocaleString()}</div>
                    <div className="mt-2 h-1 bg-gray-100 rounded-sm overflow-hidden">
                      <div className="h-full rounded-sm" style={{ background: GROUP_COLORS[g.price_group] || 'var(--chart-accent, #354f43)', width: `${totalTxns ? Math.round((g.count / totalTxns) * 100) : 0}%` }} />
                    </div>
                  </div>
                ))}
                {!groups.length && (
                  <div className="col-span-full text-center py-8 text-sm text-gray-400">No sales yet</div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
