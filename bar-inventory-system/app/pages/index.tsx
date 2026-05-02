'use client';

import { useEffect, useState } from 'react';
import {
  Package, TrendingUp, AlertTriangle, CreditCard,
  ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend,
} from 'recharts';
import Navbar from '../components/Navbar';
import { inventoryApi, reportsApi, mpesaApi } from '../lib/api';
import { toast } from 'sonner';

const PRICE_GROUPS = [
  { label: 'Micro',  range: 'KES 0–50',     color: '#1D9E75' },
  { label: 'Small',  range: 'KES 51–500',   color: '#378ADD' },
  { label: 'Medium', range: 'KES 501–1000', color: '#BA7517' },
  { label: 'Large',  range: 'KES 1001–2500',color: '#D85A30' },
];

const MOCK_TREND = Array.from({ length: 14 }, (_, i) => ({
  day: `Apr ${i + 13}`,
  sales: Math.floor(Math.random() * 60000 + 20000),
  transactions: Math.floor(Math.random() * 40 + 10),
}));

const MOCK_CAT = [
  { name: 'Beers',     sold: 420 },
  { name: 'Spirits',   sold: 235 },
  { name: 'Wines',     sold: 66  },
  { name: 'Mixers',    sold: 490 },
  { name: 'Garnishes', sold: 450 },
];

export default function DashboardPage() {
  const [user]        = useState({ name: 'Admin', role: 'admin', email: 'admin@bar.co.ke' });
  const [lowStock, setLowStock]   = useState<any[]>([]);
  const [pgCounts, setPgCounts]   = useState<Record<string,number>>({});
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalSold, setTotalSold]       = useState(0);
  const [loading, setLoading]           = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // Replace with real API calls; using mock for now
        // const { data: low } = await inventoryApi.getLowStock();
        // const { data: pg  } = await mpesaApi.getGroups();
        setLowStock([
          { id:2,  name:'White Cap',            stock:8,  threshold:15, category:'Beers'   },
          { id:3,  name:'Johnnie Walker Black', stock:5,  threshold:10, category:'Spirits' },
          { id:6,  name:'Soda Water',           stock:3,  threshold:12, category:'Mixers'  },
          { id:10, name:'Red Bull',             stock:7,  threshold:15, category:'Mixers'  },
        ]);
        setPgCounts({ Micro:4, Small:12, Medium:7, Large:5 });
        setTotalRevenue(124500);
        setTotalSold(1661);
      } catch {
        toast.error('Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const metrics = [
    {
      label: 'Total Items Sold',
      value: totalSold.toLocaleString(),
      icon: TrendingUp,
      sub: '+12% this week',
      up: true,
    },
    {
      label: 'M-Pesa Revenue',
      value: `KES ${totalRevenue.toLocaleString()}`,
      icon: CreditCard,
      sub: '28 transactions',
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
      value: '10',
      icon: Package,
      sub: 'Across 5 categories',
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
              <div className="text-xl font-semibold text-gray-900">{value}</div>
              <div className={`flex items-center gap-1 mt-1 text-xs ${up ? 'text-green-600' : 'text-red-500'}`}>
                {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {sub}
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Price Groups */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-medium mb-4">M-Pesa Price Groups</h2>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {PRICE_GROUPS.map((g) => (
                <div key={g.label} className="bg-gray-50 rounded-lg p-3 text-center border border-gray-100">
                  <div className="text-[10px] text-gray-400 mb-1">{g.range}</div>
                  <div className="text-lg font-semibold" style={{ color: g.color }}>
                    {pgCounts[g.label] || 0}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-0.5">{g.label}</div>
                  <div className="h-0.5 rounded-full mt-2" style={{ background: g.color, opacity: 0.5 }} />
                </div>
              ))}
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
            <div className="space-y-2">
              {lowStock.map((item) => {
                const critical = item.stock <= Math.floor(item.threshold / 2);
                return (
                  <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${critical ? 'bg-red-500 low-stock-pulse' : 'bg-amber-400'}`} />
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
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Sales trend */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-medium mb-4">Sales Trend (14 Days)</h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={MOCK_TREND}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => [`KES ${v.toLocaleString()}`, 'Sales']} />
                <Line type="monotone" dataKey="sales" stroke="#1D9E75" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Sales by category */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-medium mb-4">Units Sold by Category</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={MOCK_CAT}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip />
                <Bar dataKey="sold" fill="#1D9E75" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </main>
    </div>
  );
}
