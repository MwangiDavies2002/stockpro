'use client';

import { useEffect, useState } from 'react';
import {
  Package, TrendingUp, AlertTriangle, CreditCard,
  ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from 'recharts';
import Navbar from './components/Navbar';
import { reportsApi } from './lib/api';
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
  Micro:  { range: 'KES 0–50',      color: '#1D9E75' },
  Small:  { range: 'KES 51–500',    color: '#378ADD' },
  Medium: { range: 'KES 501–1000',  color: '#BA7517' },
  Large:  { range: 'KES 1001+',     color: '#D85A30' },
};

export default function DashboardPage() {
  const [user] = useState({ name: 'Admin', role: 'admin', email: 'admin@bar.co.ke' });

  const [stock, setStock]   = useState<StockRow[]>([]);
  const [usage, setUsage]   = useState<UsageRow[]>([]);
  const [trend, setTrend]   = useState<TrendRow[]>([]);
  const [groups, setGroups] = useState<SizeGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [stockRes, usageRes, trendRes, groupsRes] = await Promise.all([
          reportsApi.getStock(),
          reportsApi.getUsage(14),
          reportsApi.getSalesTrend(14),
          reportsApi.getMpesaGroups(), // hits /reports/sale-size-groups
        ]);
        setStock(stockRes.data);
        setUsage(usageRes.data);
        setTrend((trendRes.data as TrendRow[]).map((r) => ({
          date: new Date(r.date).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' }),
          revenue: Number(r.revenue),
          transactions: Number(r.transactions),
        })));
        setGroups((groupsRes.data as SizeGroup[]).map((g) => ({
          ...g,
          count: Number(g.count),
          total: Number(g.total),
        })));
      } catch {
        toast.error('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const lowStock = stock.filter((s) => s.status === 'LOW');
  const totalRevenue14d = usage.reduce((sum, u) => sum + Number(u.revenue), 0);
  const totalSold14d = usage.reduce((sum, u) => sum + Number(u.units_sold), 0);
  const activeCategories = new Set(stock.map((s) => s.category)).size;

  const categoryData = Object.values(
    usage.reduce((acc: Record<string, { name: string; sold: number }>, u) => {
      acc[u.category] = acc[u.category] || { name: u.category, sold: 0 };
      acc[u.category].sold += Number(u.units_sold);
      return acc;
    }, {})
  );

  const metrics = [
    {
      label: 'Items Sold (14d)',
      value: totalSold14d.toLocaleString(),
      icon: TrendingUp,
      sub: 'Last 14 days',
      up: true,
    },
    {
      label: 'Revenue (14d)',
      value: `KES ${totalRevenue14d.toLocaleString()}`,
      icon: CreditCard,
      sub: `${groups.reduce((s, g) => s + g.count, 0)} sale(s)`,
      up: true,
    },
    {
      label: 'Low Stock Alerts',
      value: lowStock.length.toString(),
      icon: AlertTriangle,
      sub: 'Needs attention',
      up: false,
    },
    {
      label: 'Active Products',
      value: stock.length.toString(),
      icon: Package,
      sub: `Across ${activeCategories} categories`,
      up: true,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} alertCount={lowStock.length} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* Metric cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map(({ label, value, icon: Icon, sub, up }) => (
            <div key={label} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-gray-500">{label}</span>
                <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Icon className="w-3.5 h-3.5 text-gray-600" />
                </div>
              </div>
              <div className="text-xl font-semibold text-gray-900">{loading ? '—' : value}</div>
              <div className={`flex items-center gap-1 mt-1 text-xs ${up ? 'text-green-600' : 'text-red-500'}`}>
                {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {sub}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Sale Size Groups */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-medium mb-4">Sale Size Groups</h2>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {Object.entries(GROUP_META).map(([label, meta]) => {
                const g = groups.find((x) => x.price_group === label);
                return (
                  <div key={label} className="bg-gray-50 rounded-lg p-3 text-center border border-gray-100">
                    <div className="text-[10px] text-gray-400 mb-1">{meta.range}</div>
                    <div className="text-lg font-semibold" style={{ color: meta.color }}>
                      {g?.count || 0}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{label}</div>
                    <div className="h-0.5 rounded-full mt-2" style={{ background: meta.color, opacity: 0.5 }} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Low Stock */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium">Low Stock Alerts</h2>
              <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium">
                {lowStock.length} items
              </span>
            </div>
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {lowStock.map((item) => {
                const critical = item.stock <= Math.floor(item.threshold / 2);
                return (
                  <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${critical ? 'bg-red-500' : 'bg-amber-400'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{item.name}</div>
                      <div className="text-xs text-gray-500">{item.stock} left · threshold: {item.threshold}</div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Sales trend */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-medium mb-4">Sales Trend (14 Days)</h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => [`KES ${v.toLocaleString()}`, 'Revenue']} />
                <Line type="monotone" dataKey="revenue" stroke="#16a34a" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Sales by category */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-medium mb-4">Units Sold by Category (14d)</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={categoryData}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="sold" fill="#16a34a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </main>
    </div>
  );
}