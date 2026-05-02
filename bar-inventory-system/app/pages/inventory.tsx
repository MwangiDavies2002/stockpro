/** biome-ignore-all lint/a11y/noLabelWithoutControl: <explanation> */
/** biome-ignore-all lint/a11y/noSvgWithoutTitle: <explanation> */
/** biome-ignore-all lint/a11y/useButtonType: <explanation> */
'use client';

import { useEffect, useState } from 'react';
import { Search, Plus, Download, Filter } from 'lucide-react';
import Navbar from '../components/Navbar';
import InventoryTable, { InventoryItem } from '../components/InventoryTable';
import { inventoryApi } from '../lib/api';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

const CATEGORIES = ['All', 'Beers', 'Spirits', 'Wines', 'Mixers', 'Garnishes'];
const UNITS = ['Bottles', 'Cases', 'Liters', 'Pieces'];

const MOCK_ITEMS: InventoryItem[] = [
  { id:1,  name:'Tusker Lager',         category:'Beers',     unit:'Bottles', stock:48, threshold:20, price:200,  sold:234 },
  { id:2,  name:'White Cap',            category:'Beers',     unit:'Bottles', stock:8,  threshold:15, price:180,  sold:189 },
  { id:3,  name:'Johnnie Walker Black', category:'Spirits',   unit:'Bottles', stock:5,  threshold:10, price:2200, sold:42  },
  { id:4,  name:'Gilbeys Gin',          category:'Spirits',   unit:'Bottles', stock:22, threshold:8,  price:950,  sold:78  },
  { id:5,  name:'KWV Pinotage',         category:'Wines',     unit:'Bottles', stock:11, threshold:6,  price:750,  sold:33  },
  { id:6,  name:'Soda Water',           category:'Mixers',    unit:'Bottles', stock:3,  threshold:12, price:50,   sold:310 },
  { id:7,  name:'Lime Wedges',          category:'Garnishes', unit:'Pieces',  stock:40, threshold:30, price:5,    sold:450 },
  { id:8,  name:'Konyagi',              category:'Spirits',   unit:'Bottles', stock:30, threshold:10, price:650,  sold:115 },
  { id:9,  name:'Pilsner Urquell',      category:'Beers',     unit:'Bottles', stock:25, threshold:10, price:220,  sold:97  },
  { id:10, name:'Red Bull',             category:'Mixers',    unit:'Bottles', stock:7,  threshold:15, price:350,  sold:180 },
];

const EMPTY_FORM = { name:'', category:'Beers', unit:'Bottles', stock:0, threshold:5, price:0, sold:0 };

export default function InventoryPage() {
  const user = { name:'Admin', role:'admin', email:'admin@bar.co.ke' };
  const isAdmin = user.role === 'admin';

  const [items, setItems]           = useState<InventoryItem[]>(MOCK_ITEMS);
  const [search, setSearch]         = useState('');
  const [catFilter, setCatFilter]   = useState('All');
  const [modalOpen, setModalOpen]   = useState(false);
  const [editItem, setEditItem]     = useState<InventoryItem | null>(null);
  const [restockItem, setRestockItem] = useState<InventoryItem | null>(null);
  const [restockQty, setRestockQty] = useState(24);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);

  const filtered = items.filter((i) =>
    (catFilter === 'All' || i.category === catFilter) &&
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  function openAdd() {
    setEditItem(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }
  function openEdit(item: InventoryItem) {
    setEditItem(item);
    setForm({ name:item.name, category:item.category, unit:item.unit, stock:item.stock, threshold:item.threshold, price:item.price, sold:item.sold });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return toast.error('Item name is required');
    setSaving(true);
    try {
      if (editItem) {
        // await inventoryApi.update(editItem.id, form);
        setItems((prev) => prev.map((i) => i.id === editItem.id ? { ...i, ...form } : i));
        toast.success('Item updated');
      } else {
        // const { data } = await inventoryApi.create(form);
        const newItem: InventoryItem = { id: Date.now(), ...form };
        setItems((prev) => [...prev, newItem]);
        toast.success('Item added');
      }
      setModalOpen(false);
    } catch {
      toast.error('Failed to save item');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this item?')) return;
    try {
      // await inventoryApi.delete(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast.success('Item deleted');
    } catch {
      toast.error('Failed to delete item');
    }
  }

  function handleSell(id: number) {
    setItems((prev) => prev.map((i) => {
      if (i.id !== id || i.stock === 0) return i;
      const updated = { ...i, stock: i.stock - 1, sold: i.sold + 1 };
      if (updated.stock <= updated.threshold) toast.warning(`Low stock: ${updated.name}`);
      return updated;
    }));
  }

  async function handleRestock() {
    if (!restockItem) return;
    try {
      // await inventoryApi.restock(restockItem.id, restockQty);
      setItems((prev) => prev.map((i) => i.id === restockItem.id ? { ...i, stock: i.stock + restockQty } : i));
      toast.success(`Restocked ${restockItem.name} +${restockQty}`);
      setRestockItem(null);
    } catch {
      toast.error('Restock failed');
    }
  }

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(items.map((i) => ({
      'Item':       i.name,
      'Category':   i.category,
      'Unit':       i.unit,
      'Stock':      i.stock,
      'Threshold':  i.threshold,
      'Price(KES)': i.price,
      'Total Sold': i.sold,
      'Status':     i.stock <= i.threshold ? 'LOW' : 'OK',
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
    XLSX.writeFile(wb, 'inventory_snapshot.xlsx');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} alertCount={items.filter(i => i.stock <= i.threshold).length} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-base font-semibold text-gray-900">Inventory Management</h1>
          <div className="flex gap-2">
            <button onClick={exportExcel} className="flex items-center gap-2 border border-gray-300 bg-white text-sm px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors text-gray-700">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
            {isAdmin && (
              <button onClick={openAdd} className="flex items-center gap-2 bg-brand hover:bg-brand-dark text-white text-sm px-3 py-2 rounded-lg transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add Item
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items..."
              className="border border-gray-300 bg-white rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand w-52"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCatFilter(c)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                  ${catFilter === c ? 'bg-brand text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Summary row */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="text-lg font-semibold">{items.length}</div>
            <div className="text-xs text-gray-500">Total Items</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="text-lg font-semibold text-amber-600">{items.filter(i=>i.stock<=i.threshold).length}</div>
            <div className="text-xs text-gray-500">Low Stock</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <div className="text-lg font-semibold">{items.reduce((a,i)=>a+i.sold,0).toLocaleString()}</div>
            <div className="text-xs text-gray-500">Total Sold</div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <InventoryTable
            items={filtered}
            isAdmin={isAdmin}
            onEdit={openEdit}
            onDelete={handleDelete}
            onRestock={(item) => { setRestockItem(item); setRestockQty(24); }}
            onSell={handleSell}
          />
        </div>

      </main>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6 shadow-xl border border-gray-200">
            <div className="flex items-start justify-between mb-5">
              <h2 className="text-base font-semibold">{editItem ? 'Edit Item' : 'Add Inventory Item'}</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-700">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="space-y-3">
              {[
                { label:'Item Name', key:'name', type:'text', placeholder:'e.g. Tusker Lager' },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                  <input
                    type={type}
                    value={(form as any)[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                  <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                    {CATEGORIES.slice(1).map((c) => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Unit</label>
                  <select value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                    {UNITS.map((u) => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Stock Qty</label>
                  <input type="number" min={0} value={form.stock} onChange={(e) => setForm((f) => ({ ...f, stock: +e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Low-Stock Threshold</label>
                  <input type="number" min={1} value={form.threshold} onChange={(e) => setForm((f) => ({ ...f, threshold: +e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Price (KES)</label>
                  <input type="number" min={0} value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: +e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setModalOpen(false)} className="border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="bg-brand text-white px-4 py-2 rounded-lg text-sm hover:bg-brand-dark disabled:opacity-60">
                {saving ? 'Saving...' : editItem ? 'Save Changes' : 'Add Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restock Modal */}
      {restockItem && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm p-6 border border-gray-200">
            <div className="flex items-start justify-between mb-1">
              <h2 className="text-base font-semibold">Restock Item</h2>
              <button onClick={() => setRestockItem(null)} className="text-gray-400 hover:text-gray-700">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">{restockItem.name} — current stock: {restockItem.stock}</p>
            <label className="block text-xs font-medium text-gray-700 mb-1">Quantity to add</label>
            <input type="number" min={1} value={restockQty} onChange={(e) => setRestockQty(+e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand mb-4" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setRestockItem(null)} className="border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={handleRestock} className="bg-brand text-white px-4 py-2 rounded-lg text-sm hover:bg-brand-dark">Confirm Restock</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
