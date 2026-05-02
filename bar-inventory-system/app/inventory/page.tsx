/** biome-ignore-all lint/a11y/useButtonType: <explanation> */
/** biome-ignore-all lint/a11y/noLabelWithoutControl: <explanation> */

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

  async function handleRestock(id: number) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    setRestockItem(item);
    setRestockQty(24);
  }

  async function confirmRestock() {
    if (!restockItem || restockQty <= 0) return;
    try {
      // await inventoryApi.restock(restockItem.id, restockQty);
      setItems((prev) => prev.map((i) => i.id === restockItem.id ? { ...i, stock: i.stock + restockQty } : i));
      toast.success(`${restockItem.name} restocked +${restockQty}`);
      setRestockItem(null);
    } catch {
      toast.error('Failed to restock');
    }
  }

  function exportCSV() {
    const csv = XLSX.utils.json_to_sheet(filtered.map((i) => ({
      Name: i.name,
      Category: i.category,
      Unit: i.unit,
      Stock: i.stock,
      Threshold: i.threshold,
      Price: i.price,
      Sold: i.sold,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, csv, 'Inventory');
    XLSX.writeFile(wb, `inventory-${new Date().toISOString().split('T')[0]}.csv`);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-base font-semibold text-gray-900">Inventory Management</h1>
            <p className="text-xs text-gray-500 mt-0.5">{items.length} items tracked</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={exportCSV} className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 text-sm px-3 py-2 rounded-lg hover:bg-gray-50">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
            {isAdmin && (
              <button onClick={openAdd} className="flex items-center gap-2 bg-brand hover:bg-brand-dark text-white text-sm px-3 py-2 rounded-lg">
                <Plus className="w-3.5 h-3.5" /> Add Item
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[250px]">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <InventoryTable
          items={filtered}
          onEdit={openEdit}
          onDelete={handleDelete}
          onSell={handleSell}
          onRestock={handleRestock}
          isAdmin={isAdmin}
        />

        {/* Add/Edit Modal */}
        {modalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full p-6 space-y-4">
              <h2 className="text-lg font-semibold">{editItem ? 'Edit Item' : 'Add Item'}</h2>
              <div className="space-y-3">
                <input type="text" placeholder="Item name" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                <select value={form.category} onChange={(e) => setForm({...form, category: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                  {CATEGORIES.filter((c) => c !== 'All').map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={form.unit} onChange={(e) => setForm({...form, unit: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <input type="number" placeholder="Stock" value={form.stock} onChange={(e) => setForm({...form, stock: parseInt(e.target.value) || 0})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                <input type="number" placeholder="Threshold" value={form.threshold} onChange={(e) => setForm({...form, threshold: parseInt(e.target.value) || 0})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                <input type="number" placeholder="Price (KES)" value={form.price} onChange={(e) => setForm({...form, price: parseInt(e.target.value) || 0})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-dark text-sm font-medium disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
              </div>
            </div>
          </div>
        )}

        {/* Restock Modal */}
        {restockItem && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full p-6 space-y-4">
              <h2 className="text-lg font-semibold">Restock: {restockItem.name}</h2>
              <div>
                <label className="text-sm text-gray-600 mb-2 block">Current stock: {restockItem.stock}</label>
                <input type="number" value={restockQty} onChange={(e) => setRestockQty(parseInt(e.target.value) || 0)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setRestockItem(null)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium">Cancel</button>
                <button onClick={confirmRestock} className="flex-1 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-dark text-sm font-medium">Confirm</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
