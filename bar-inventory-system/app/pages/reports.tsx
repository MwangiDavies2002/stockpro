'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, TrendingUp, BarChart2, FileSpreadsheet } from 'lucide-react';
import Navbar from '../components/Navbar';
import { reportsApi } from '../lib/api';
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
  Micro: '#1D9E75',
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

export default function ReportsPage() {
  const user = { name: 'Admin', role: 'admin', email: 'admin@bar.co.ke' };
  const [period, setPeriod] = useState<Period>('7');
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);

  const [usage, setUsage]   = useState<UsageRow[]>([]);
  const [trend, setTrend]   = useState<TrendRow[]>([]);
  const [groups, setGroups] = useState<SizeGroup[]>([]);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const [usageRes, trendRes, groupsRes] = await Promise.all([
        reportsApi.getUsage(parseInt(period, 10)),
        reportsApi.getSalesTrend(parseInt(period, 10)),
        reportsApi.getMpesaGroups(), // still named this in lib/api.ts; hits /sale-size-groups
      ]);
      setUsage(usageRes.data as UsageRow[]);
      setTrend((trendRes.data as TrendRow[]).map((r) => ({
        date: new Date(r.date).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' }),
        revenue: Number(r.revenue),
        transactions: Number(r.transactions),
      })));
      setGroups((groupsRes.data as SizeGroup[]).map((g) => ({
        ...g,
        total: Number(g.total),
        avg_amount: Number(g.avg_amount),
        count: Number(g.count),
      })));
    } catch {
      toast.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  async function exportExcel(p: Period) {
    setExporting(true);
    try {
      const days = parseInt(p);
      const label = p === '7' ? '7_Days' : p === '14' ? '14_Days' : '30_Days';

      const [usageRes, trendRes, groupsRes] = await Promise.all([
        reportsApi.getUsage(days),
        reportsApi.getSalesTrend(days),
        reportsApi.getMpesaGroups(),
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

      const ws3 = XLSX.utils.json_to_sheet((trendRes.data as TrendRow[]).map((r) => ({
        'Date':          new Date(r.date).toLocaleDateString('en-KE'),
        'Revenue (KES)': Number(r.revenue),
        'Transactions':  Number(r.transactions),
      })));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws1, 'Inventory Snapshot');
      XLSX.utils.book_append_sheet(wb, ws2, 'Sale Size Groups');
      XLSX.utils.book_append_sheet(wb, ws3, 'Daily Sales');

      XLSX.writeFile(wb, `BarStock_Report_${label}.xlsx`);
      toast.success(`Exported ${days}-day report as Excel`);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  }

  const totalRevenue = groups.reduce((a, g) => a + g.total, 0);
  const totalTxns    = groups.reduce((a, g) => a + g.count, 0);
  const lowStockCount = usage.filter((i) => i.stock <= i.threshold).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-base font-semibold text-gray-900">Reports & Analytics</h1>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
              {(['7', '14', '30'] as Period[]).map((p) => (
                <button type="button" key={p} onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors
                    ${period === p ? 'bg-green-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                  {p} Days
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Summary metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Revenue',      value: `KES ${totalRevenue.toLocaleString()}`, sub: `Last ${period} days` },
            { label: 'Total Transactions', value: totalTxns.toString(),                    sub: 'Completed sales' },
            { label: 'Avg. Transaction',   value: totalTxns ? `KES ${Math.round(totalRevenue / totalTxns).toLocaleString()}` : 'KES 0', sub: 'Per sale' },
            { label: 'Low Stock Items',    value: `${lowStockCount}`,                      sub: 'Need restocking' },
          ].map((m) => (
            <div key={m.label} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-2">{m.label}</div>
              <div className="text-xl font-semibold text-gray-900">{m.value}</div>
              <div className="text-xs text-gray-400 mt-1">{m.sub}</div>
            </div>
          ))}
        </div>

        {/* Export section */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <FileSpreadsheet className="w-4 h-4 text-green-600" />
            <h2 className="text-sm font-medium">Export Sales Data (Excel)</h2>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Downloads a multi-sheet workbook: Inventory Snapshot · Sale Size Groups · Daily Sales
          </p>
          <div className="flex gap-2 flex-wrap">
            {(['7', '14', '30'] as Period[]).map((p) => (
              <button type="button" key={p} onClick={() => exportExcel(p)} disabled={exporting}
                className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-60
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
            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-gray-200 rounded-xl p-5">
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
                    <Line type="monotone" dataKey="revenue" stroke="#16a34a" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-5">
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
                      {groups.map((g) => (
                        <Cell key={g.price_group} fill={GROUP_COLORS[g.price_group] || '#16a34a'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Inventory usage table */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
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
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium
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
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="text-sm font-medium mb-4">Sale Size Groups Breakdown</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {groups.map((g) => (
                  <div key={g.price_group} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-500">{GROUP_RANGES[g.price_group] || ''}</span>
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: GROUP_COLORS[g.price_group] || '#16a34a' }} />
                    </div>
                    <div className="text-2xl font-semibold" style={{ color: GROUP_COLORS[g.price_group] || '#16a34a' }}>{g.count}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{g.price_group} — KES {g.total.toLocaleString()}</div>
                    <div className="mt-2 h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ background: GROUP_COLORS[g.price_group] || '#16a34a', width: `${totalTxns ? Math.round((g.count / totalTxns) * 100) : 0}%` }} />
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