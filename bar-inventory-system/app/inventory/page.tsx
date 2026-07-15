/** biome-ignore-all lint/a11y/useButtonType: <explanation> */
/** biome-ignore-all lint/a11y/noLabelWithoutControl: <explanation> */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { Search, Plus, Download, Filter } from 'lucide-react';
import Navbar from '../components/Navbar';
import InventoryTable, { InventoryItem } from '../components/InventoryTable';
import { inventoryApi, authApi } from '../lib/api';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

const CATEGORIES = ['All', 'Beers', 'Spirits', 'Wines', 'Mixers', 'Garnishes'];
const UNITS = ['Bottles', 'Cases', 'Liters', 'Pieces'];

const EMPTY_FORM = { name:'', category:'Beers', unit:'Bottles', stock:0, threshold:5, price:0, sold:0 };

export default function InventoryPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; role: string; email: string } | null>(null);
  const isAdmin = user?.role === 'admin';

  const [items, setItems]           = useState<InventoryItem[]>([]);
  const [search, setSearch]         = useState('');
  const [catFilter, setCatFilter]   = useState('All');
  const [modalOpen, setModalOpen]   = useState(false);
  const [editItem, setEditItem]     = useState<InventoryItem | null>(null);
  const [restockItem, setRestockItem] = useState<InventoryItem | null>(null);
  const [restockQty, setRestockQty] = useState(24);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);

  useEffect(() => {
    const token = Cookies.get('token');
    if (!token) {
      router.push('/login');
      return;
    }
    authApi.me()
  .then((res) => {
    setUser(res.data);
    if (res.data.role !== 'admin') {
      router.push('/pos');
    }
  })
  .catch(() => {
    Cookies.remove('token');
    router.push('/login');
  });
  }, []);

  useEffect(() => {
    async function loadItems() {
      try {
        const { data } = await inventoryApi.getAll();
        setItems(data);
      } catch {
        toast.error('Failed to load inventory');
      }
    }
    loadItems();
  }, []);

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
        const { data } = await inventoryApi.update(editItem.id, form);
        setItems((prev) => prev.map((i) => i.id === editItem.id ? data : i));
        toast.success('Item updated');
      } else {
        const { data } = await inventoryApi.create(form);
        setItems((prev) => [...prev, data]);
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
      await inventoryApi.delete(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast.success('Item deleted');
    } catch {
      toast.error('Failed to delete item');
    }
  }

  

  async function handleRestock(item: InventoryItem) {
    setRestockItem(item);
    setRestockQty(24);
  }

  async function confirmRestock() {
    if (!restockItem || restockQty <= 0) return;
    try {
      const { data } = await inventoryApi.restock(restockItem.id, restockQty);
      setItems((prev) => prev.map((i) => i.id === restockItem.id ? data : i));
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

  if (!user) {
    return <div className="min-h-screen bg-gray-50" />;
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
          onRestock={handleRestock}
          isAdmin={isAdmin}
        />

        {/* Add/Edit Modal — with labels */}
        {modalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full p-6 space-y-4">
              <h2 className="text-lg font-semibold">{editItem ? 'Edit Item' : 'Add Item'}</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Item Name</label>
                  <input type="text" placeholder="e.g. Tusker Lager" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Category</label>
                  <select value={form.category} onChange={(e) => setForm({...form, category: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                    {CATEGORIES.filter((c) => c !== 'All').map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Unit</label>
                  <select value={form.unit} onChange={(e) => setForm({...form, unit: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Stock Quantity</label>
                  <input type="number" placeholder="0" value={form.stock} onChange={(e) => setForm({...form, stock: parseInt(e.target.value) || 0})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Low Stock Threshold</label>
                  <input type="number" placeholder="5" value={form.threshold} onChange={(e) => setForm({...form, threshold: parseInt(e.target.value) || 0})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Price (KES)</label>
                  <input type="number" placeholder="0" value={form.price} onChange={(e) => setForm({...form, price: parseInt(e.target.value) || 0})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                </div>
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