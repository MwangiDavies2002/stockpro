'use client';
import { useEffect, useState } from 'react';
import { inventoryApi } from '../lib/api';

type Movement = { id: number; change_type: string; qty_change: number; after_stock: number; created_at: string; note: string | null; user_name: string | null };

export default function StockHistory({ id, stock }: { id: number; stock: number }) {
  const [rows, setRows] = useState<Movement[]>([]);
  const [status, setStatus] = useState('loading');
  const [retry, setRetry] = useState(0);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    let active = true;
    setStatus('loading');
    inventoryApi.getHistory(id).then(({ data }) => {
      if (active) { setRows(data); setStatus('ready'); }
    }).catch(() => { if (active) setStatus('error'); });
    return () => { active = false; };
  }, [id, retry]);
  const invalid = !!(start && end && start > end);
  const filtered = rows.filter(row => {
    const date = new Date(row.created_at);
    return !invalid && (!start || date >= new Date(`${start}T00:00:00`)) && (!end || date <= new Date(`${end}T23:59:59.999`));
  });
  const totals = filtered.reduce((sum, row) => {
    const quantity = Number(row.qty_change);
    if (row.change_type === 'sale') sum.sold += Math.abs(quantity);
    else if(row.change_type==='transfer_in')sum.transferredIn+=quantity;
    else if(row.change_type==='transfer_out')sum.transferredOut+=Math.abs(quantity);
    else if (row.change_type === 'adjustment') sum.adjustments += quantity;
    else if (quantity > 0) sum.received += quantity;
    return sum;
  }, { received: 0, sold: 0, adjustments: 0,transferredIn:0,transferredOut:0 });
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  function exportCSV() {
    const escape = (value: unknown) => `"${String(value ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
    const data = [['Type', 'Quantity change', 'Balance', 'Date', 'Staff', 'Notes'], ...filtered.map(r => [r.change_type, r.qty_change, r.after_stock, r.created_at, r.user_name, r.note])];
    const url = URL.createObjectURL(new Blob([data.map(r => r.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `product-${id}-stock-history.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section className="border-t pt-4 space-y-3">
    <h3 className="font-semibold">Stock movement history</h3>
    <div className="flex flex-wrap gap-3 items-end">
      <label className="text-sm">From<input type="date" value={start} onChange={e => { setStart(e.target.value); setPage(1); }} className="block border rounded-sm p-2" /></label>
      <label className="text-sm">To<input type="date" value={end} onChange={e => { setEnd(e.target.value); setPage(1); }} className="block border rounded-sm p-2" /></label>
      <button type="button" onClick={exportCSV} disabled={status !== 'ready' || invalid || !filtered.length} className="border rounded-sm p-2 disabled:opacity-50">Export CSV</button>
    </div>
    {invalid && <p role="alert" className="text-red-600">End date must be on or after start date.</p>}
    {status === 'loading' && <p role="status">Loading stock movements…</p>}
    {status === 'error' && <p role="alert">Unable to load history. <button type="button" className="underline" onClick={() => setRetry(r => r + 1)}>Retry</button></p>}
    {status === 'ready' && <>
      <p className="text-xs text-gray-500">Movement totals cover the selected dates. Current stock is the product balance when opened. Only recorded movements are included.</p>
      <div className="grid grid-cols-2 gap-2 text-sm">{Object.entries({ 'Stock received': totals.received, 'Stock sold': totals.sold, 'Transferred in':totals.transferredIn,'Transferred out':totals.transferredOut,'Net adjustments': totals.adjustments, 'Current stock': stock }).map(([label, value]) => <div key={label} className="bg-gray-50 p-3 rounded-sm">{label}<strong className="block">{Number(value).toLocaleString()}</strong></div>)}</div>
      <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr>{['Type', 'Change', 'Balance', 'Date', 'Staff', 'Notes'].map(h => <th key={h} className="p-2">{h}</th>)}</tr></thead><tbody>
        {filtered.slice((page - 1) * 10, page * 10).map(row => <tr key={row.id} className="border-t"><td className="p-2">{row.change_type.replaceAll('_', ' ')}</td><td className={`p-2 ${Number(row.qty_change) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{Number(row.qty_change) > 0 ? '+' : ''}{row.qty_change}</td><td className="p-2">{row.after_stock}</td><td className="p-2 whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</td><td className="p-2">{row.user_name || 'Unavailable'}</td><td className="p-2">{row.note || '—'}</td></tr>)}
        {!filtered.length && <tr><td colSpan={6} className="p-4">No recorded movements for these dates.</td></tr>}
      </tbody></table></div>
      <div className="flex items-center justify-between gap-2 text-sm"><button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button><span>{filtered.length} movements · Page {page} of {pages}</span><button type="button" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</button></div>
    </>}
  </section>;
}
