'use client';

import { useEffect, useMemo, useState } from 'react';
import { Calendar, Receipt, ChevronDown, ChevronUp, Download } from 'lucide-react';
import Navbar from '../components/Navbar';
import { salesApi } from '../lib/api';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface SaleItem {
  id: number;
  item_name: string;
  quantity: number;
  unit_price: number;
}

interface Sale {
  id: number;
  total: number;
  notes: string;
  created_by_name: string | null;
  created_at: string;
  items: SaleItem[];
}

function todayISO() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().split('T')[0];
}

export default function SalesHistoryPage() {
  const user = { name: 'Admin', role: 'admin', email: 'admin@bar.co.ke' };

  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState(todayISO());
  const [toDate, setToDate] = useState(todayISO());
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    loadSales();
  }, []);

  async function loadSales() {
    setLoading(true);
    try {
      const { data } = await salesApi.getAll();
      setSales(data);
    } catch {
      toast.error('Failed to load sales');
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    return sales.filter((s) => {
      const day = s.created_at?.slice(0, 10);
      return day >= fromDate && day <= toDate;
    });
  }, [sales, fromDate, toDate]);

  const totalRevenue = filtered.reduce((sum, s) => sum + Number(s.total), 0);
  const totalItems = filtered.reduce(
    (sum, s) => sum + s.items.reduce((isum, i) => isum + i.quantity, 0),
    0
  );

  function setQuickRange(days: number) {
    const end = todayISO();
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    setFromDate(start.toISOString().split('T')[0]);
    setToDate(end);
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
  }

  function exportSales() {
    if (!filtered.length) {
      toast.error('No sales in this range to export');
      return;
    }

    // Sheet 1: one row per sale (summary)
    const summarySheet = XLSX.utils.json_to_sheet(
      filtered.map((s) => ({
        'Sale ID':     s.id,
        'Date':        new Date(s.created_at).toLocaleDateString('en-KE'),
        'Time':        formatTime(s.created_at),
        'Cashier':     s.created_by_name || '—',
        'Items':       s.items.reduce((sum, i) => sum + i.quantity, 0),
        'Total (KES)': Number(s.total),
        'Notes':       s.notes || '',
      }))
    );

    // Sheet 2: one row per line item (detail)
    const lineRows: any[] = [];
    filtered.forEach((s) => {
      s.items.forEach((item) => {
        lineRows.push({
          'Sale ID':       s.id,
          'Date':          new Date(s.created_at).toLocaleDateString('en-KE'),
          'Item':          item.item_name,
          'Quantity':      item.quantity,
          'Unit Price':    Number(item.unit_price),
          'Subtotal':      item.quantity * Number(item.unit_price),
        });
      });
    });
    const detailSheet = XLSX.utils.json_to_sheet(lineRows);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Sales Summary');
    XLSX.utils.book_append_sheet(wb, detailSheet, 'Line Items');

    const rangeSuffix = fromDate === toDate ? fromDate : `${fromDate}_to_${toDate}`;
    XLSX.writeFile(wb, `Sales_${rangeSuffix}.xlsx`);
    toast.success(`Exported ${filtered.length} sale(s)`);
  }

  const rangeLabel = fromDate === toDate
    ? new Date(fromDate).toLocaleDateString('en-KE', { weekday: 'long', month: 'long', day: 'numeric' })
    : `${new Date(fromDate).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' })} – ${new Date(toDate).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' })}`;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">

        {/* Header: total revenue front and center, top-left */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">Total Sales — {rangeLabel}</p>
            <h1 className="text-3xl font-bold text-green-700">
              KSh {totalRevenue.toLocaleString()}
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              {filtered.length} sale(s) · {totalItems} item(s) sold
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  type="date"
                  value={fromDate}
                  max={toDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <span className="text-gray-400 text-sm">to</span>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  type="date"
                  value={toDate}
                  min={fromDate}
                  max={todayISO()}
                  onChange={(e) => setToDate(e.target.value)}
                  className="pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
            <div className="flex gap-1.5">
              {[
                { label: 'Today', days: 1 },
                { label: '7 Days', days: 7 },
                { label: '30 Days', days: 30 },
              ].map((r) => (
                <button
                  key={r.label}
                  onClick={() => setQuickRange(r.days)}
                  className="px-2.5 py-1 text-xs rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
                >
                  {r.label}
                </button>
              ))}
              <button
                onClick={exportSales}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
              >
                <Download className="w-3 h-3" /> Export
              </button>
            </div>
          </div>
        </div>

        {/* Secondary summary */}
        <div className="grid grid-cols-2 gap-4 max-w-md">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">Sales</div>
            <div className="text-xl font-semibold text-gray-900">{filtered.length}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-xs text-gray-500 mb-1">Items Sold</div>
            <div className="text-xl font-semibold text-gray-900">{totalItems}</div>
          </div>
        </div>

        {/* Sales list */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-green-600" />
            <h2 className="text-sm font-medium">Sales — {rangeLabel}</h2>
          </div>

          {loading ? (
            <div className="text-center py-12 text-sm text-gray-400">Loading...</div>
          ) : !filtered.length ? (
            <div className="text-center py-12 text-sm text-gray-400">No sales recorded for this range</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filtered
                .slice()
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .map((sale) => {
                  const isOpen = expanded === sale.id;
                  const itemCount = sale.items.reduce((s, i) => s + i.quantity, 0);
                  return (
                    <div key={sale.id}>
                      <button
                        onClick={() => setExpanded(isOpen ? null : sale.id)}
                        className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 text-left"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-400 w-16">{formatTime(sale.created_at)}</span>
                          <div>
                            <p className="text-sm font-medium text-gray-900">Sale #{sale.id}</p>
                            <p className="text-xs text-gray-500">
                              {itemCount} item(s) {sale.created_by_name ? `· ${sale.created_by_name}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-green-700">
                            KSh {Number(sale.total).toLocaleString()}
                          </span>
                          {isOpen ? (
                            <ChevronUp className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          )}
                        </div>
                      </button>

                      {isOpen && (
                        <div className="px-5 pb-4 bg-gray-50">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-xs text-gray-500">
                                <th className="text-left py-1.5">Item</th>
                                <th className="text-right py-1.5">Qty</th>
                                <th className="text-right py-1.5">Price</th>
                                <th className="text-right py-1.5">Subtotal</th>
                              </tr>
                            </thead>
                            <tbody>
                              {sale.items.map((item) => (
                                <tr key={item.id} className="border-t border-gray-200">
                                  <td className="py-1.5 text-gray-900">{item.item_name}</td>
                                  <td className="py-1.5 text-right text-gray-600">{item.quantity}</td>
                                  <td className="py-1.5 text-right text-gray-600">
                                    {Number(item.unit_price).toLocaleString()}
                                  </td>
                                  <td className="py-1.5 text-right font-medium text-gray-900">
                                    {(item.quantity * Number(item.unit_price)).toLocaleString()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {sale.notes && (
                            <p className="text-xs text-gray-400 mt-2">Note: {sale.notes}</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}