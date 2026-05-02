/** biome-ignore-all lint/a11y/useButtonType: <explanation> */

'use client';

import { useState } from 'react';
import { Download, TrendingUp, BarChart2, FileSpreadsheet } from 'lucide-react';
import Navbar from '../components/Navbar';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const PRICE_GROUPS = [
  { label:'Micro',  range:'KES 0–50',     color:'#1D9E75', count:4,  total:140  },
  { label:'Small',  range:'KES 51–500',   color:'#378ADD', count:12, total:3240 },
  { label:'Medium', range:'KES 501–1000', color:'#BA7517', count:7,  total:5250 },
  { label:'Large',  range:'KES 1001–2500',color:'#D85A30', count:5,  total:9500 },
];

const INVENTORY = [
  { id:1,  name:'Tusker Lager',         category:'Beers',     stock:48, threshold:20, price:200,  sold:234 },
  { id:2,  name:'White Cap',            category:'Beers',     stock:8,  threshold:15, price:180,  sold:189 },
  { id:3,  name:'Johnnie Walker Black', category:'Spirits',   stock:5,  threshold:10, price:2200, sold:42  },
  { id:4,  name:'Gilbeys Gin',          category:'Spirits',   stock:22, threshold:8,  price:950,  sold:78  },
  { id:5,  name:'KWV Pinotage',         category:'Wines',     stock:11, threshold:6,  price:750,  sold:33  },
  { id:6,  name:'Soda Water',           category:'Mixers',    stock:3,  threshold:12, price:50,   sold:310 },
  { id:7,  name:'Lime Wedges',          category:'Garnishes', stock:40, threshold:30, price:5,    sold:450 },
  { id:8,  name:'Konyagi',              category:'Spirits',   stock:30, threshold:10, price:650,  sold:115 },
  { id:9,  name:'Pilsner Urquell',      category:'Beers',     stock:25, threshold:10, price:220,  sold:97  },
  { id:10, name:'Red Bull',             category:'Mixers',    stock:7,  threshold:15, price:350,  sold:180 },
];

function genTrend(days: number) {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    return {
      date: d.toLocaleDateString('en-KE', { month:'short', day:'numeric' }),
      revenue: Math.floor(Math.random() * 40000 + 15000),
      transactions: Math.floor(Math.random() * 20 + 5),
    };
  });
}

function genPayments(days: number) {
  const phones = ['0712****345','0722****890','0733****112','0741****567'];
  const items  = ['Tusker Lager','White Cap','Konyagi','Gilbeys Gin','Soda Water','Red Bull'];
  const amounts= [30,50,180,200,220,350,450,650,950,1200,1800,2200];
  const groups = (a:number) => a<=50?'Micro':a<=500?'Small':a<=1000?'Medium':'Large';
  return Array.from({ length: days * 2 }, (_, i) => {
    const amt = amounts[Math.floor(Math.random()*amounts.length)];
    const d   = new Date(); d.setDate(d.getDate() - Math.floor(i/2));
    return {
      'Transaction ID': `MP${1000+i}`,
      'Phone':          phones[i%phones.length],
      'Item':           items[i%items.length],
      'Amount (KES)':   amt,
      'Price Group':    groups(amt),
      'Date':           d.toLocaleDateString('en-KE'),
    };
  });
}

type Period = '7' | '14' | '30';

export default function ReportsPage() {
  const user = { name:'Admin', role:'admin', email:'admin@bar.co.ke' };
  const [period, setPeriod] = useState<Period>('7');
  const [exporting, setExporting] = useState(false);

  const trendData = genTrend(parseInt(period));

  async function exportExcel(p: Period) {
    setExporting(true);
    try {
      const days = parseInt(p);
      const label = p === '7' ? '7_Days' : p === '14' ? '14_Days' : '30_Days';

      const payments = genPayments(days);
      const ws1 = XLSX.utils.json_to_sheet(payments);

      const ws2 = XLSX.utils.json_to_sheet(INVENTORY.map(i => ({
        'Item':          i.name,
        'Category':      i.category,
        'Stock':         i.stock,
        'Threshold':     i.threshold,
        'Price (KES)':   i.price,
        'Units Sold':    i.sold,
        'Revenue (KES)': i.price * i.sold,
        'Status':        i.stock <= i.threshold ? 'LOW' : 'OK',
      })));

      const ws3 = XLSX.utils.json_to_sheet(PRICE_GROUPS.map(g => ({
        'Group':          g.label,
        'Range':          g.range,
        'Transactions':   g.count,
        'Total (KES)':    g.total,
      })));

      const ws4 = XLSX.utils.json_to_sheet(genTrend(days).map(r => ({
        'Date':         r.date,
        'Revenue (KES)':r.revenue,
        'Transactions': r.transactions,
      })));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws1, 'M-Pesa Payments');
      XLSX.utils.book_append_sheet(wb, ws2, 'Inventory Snapshot');
      XLSX.utils.book_append_sheet(wb, ws3, 'Price Groups');
      XLSX.utils.book_append_sheet(wb, ws4, 'Daily Sales');

      XLSX.writeFile(wb, `BarStock_Report_${label}.xlsx`);
      toast.success(`Exported ${days}-day report as Excel`);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  }

  const totalRevenue = PRICE_GROUPS.reduce((a,g) => a+g.total, 0);
  const totalTxns    = PRICE_GROUPS.reduce((a,g) => a+g.count, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-base font-semibold text-gray-900">Reports & Analytics</h1>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
              {(['7','14','30'] as Period[]).map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors
                    ${period===p ? 'bg-brand text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                  {p} Days
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label:'Total Revenue',     value:`KES ${totalRevenue.toLocaleString()}`, sub:'From M-Pesa payments' },
            { label:'Total Transactions',value:totalTxns.toString(),                  sub:'Confirmed payments' },
            { label:'Avg. Transaction',  value:`KES ${Math.round(totalRevenue/totalTxns)}`, sub:'Per payment' },
            { label:'Low Stock Items',   value:`${INVENTORY.filter(i=>i.stock<=i.threshold).length}`, sub:'Need restocking' },
          ].map(m => (
            <div key={m.label} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="text-xs text-gray-500 mb-2">{m.label}</div>
              <div className="text-xl font-semibold text-gray-900">{m.value}</div>
              <div className="text-xs text-gray-400 mt-1">{m.sub}</div>
            </div>
          ))}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <FileSpreadsheet className="w-4 h-4 text-brand" />
            <h2 className="text-sm font-medium">Export Sales Data (Excel)</h2>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Downloads a multi-sheet workbook: M-Pesa Payments · Inventory Snapshot · Price Groups · Daily Sales
          </p>
          <div className="flex gap-2 flex-wrap">
            {(['7','14','30'] as Period[]).map(p => (
              <button key={p} onClick={() => exportExcel(p)} disabled={exporting}
                className={`flex items-center gap-2 text-sm px-4 py-2 rounded-lg transition-colors disabled:opacity-60
                  ${p==='7' ? 'bg-brand text-white hover:bg-brand-dark' : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}>
                <Download className="w-3.5 h-3.5" />
                Past {p} Days
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-brand" />
              <h2 className="text-sm font-medium">Revenue Trend ({period} Days)</h2>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="date" tick={{ fontSize:10 }} tickLine={false} axisLine={false}
                  interval={period==='30' ? 4 : period==='14' ? 2 : 0} />
                <YAxis tick={{ fontSize:10 }} tickLine={false} axisLine={false}
                  tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v:number) => [`KES ${v.toLocaleString()}`, 'Revenue']} />
                <Line type="monotone" dataKey="revenue" stroke="#1D9E75" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 className="w-4 h-4 text-brand" />
              <h2 className="text-sm font-medium">M-Pesa Price Group Totals</h2>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={PRICE_GROUPS}>
                <XAxis dataKey="label" tick={{ fontSize:10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize:10 }} tickLine={false} axisLine={false}
                  tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v:number) => [`KES ${v.toLocaleString()}`, 'Total']} />
                <Bar dataKey="total" fill="#1D9E75" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

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
                {INVENTORY.map(i => {
                  const isLow = i.stock <= i.threshold;
                  return (
                    <tr key={i.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{i.name}</td>
                      <td className="px-4 py-3 text-gray-600">{i.category}</td>
                      <td className="px-4 py-3">{i.sold}</td>
                      <td className="px-4 py-3 font-medium">KES {(i.price * i.sold).toLocaleString()}</td>
                      <td className="px-4 py-3">{i.stock}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isLow ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                          {isLow ? 'LOW' : 'OK'}
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
    </div>
  );
}
