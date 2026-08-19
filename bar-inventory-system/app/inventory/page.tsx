'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { Search, Plus, Download, Upload, FileDown } from 'lucide-react';
import Navbar from '../components/Navbar';
import InventoryTable from '../components/InventoryTable';
import type { InventoryItem } from '../components/InventoryTable';
import { inventoryApi, authApi } from '../lib/api';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

const CATEGORIES = ['All', 'Beers', 'Spirits', 'Wines', 'Mixers', 'Garnishes'];
const UNITS = ['Bottles', 'Cases', 'Liters', 'Pieces'];

const EMPTY_FORM = { name:'', category:'Beers', unit:'Bottles', stock:0, threshold:5, cost:0, price:0, sold:0 };

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
  const [adjustmentItem, setAdjustmentItem] = useState<InventoryItem | null>(null);
  const [adjustmentQty, setAdjustmentQty] = useState(0);
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [form, setForm]             = useState(EMPTY_FORM);
  const [saving, setSaving]         = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ createdCount: number; errorCount: number; errors: Array<{ row: number; name: string; message: string }> } | null>(null);

  const loadItems = useCallback(async () => {
    try {
      const { data } = await inventoryApi.getAll();
      setItems(data);
    } catch {
      toast.error('Failed to load inventory');
    }
  }, []);

  useEffect(() => {
    const token = Cookies.get('token');
    if (!token) {
      router.push('/login');
      return;
    }
    authApi.me()
      .then((res) => setUser(res.data))
      .catch(() => {
        Cookies.remove('token');
        router.push('/login');
      });
  }, [router]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

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
    setForm({ name:item.name, category:item.category, unit:item.unit, stock:item.stock, threshold:item.threshold, cost:item.cost, price:item.price, sold:item.sold });
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

  function openAdjustment(item: InventoryItem) {
    setAdjustmentItem(item);
    setAdjustmentQty(0);
    setAdjustmentReason('');
  }

  async function confirmAdjustment() {
    if (!adjustmentItem) return;
    if (!Number.isInteger(adjustmentQty) || adjustmentQty === 0) return toast.error('Enter a non-zero whole quantity');
    if (adjustmentReason.trim().length < 5) return toast.error('Enter a correction reason (at least 5 characters)');
    try {
      const { data } = await inventoryApi.adjustStock(adjustmentItem.id, { quantity: adjustmentQty, reason: adjustmentReason.trim() });
      setItems((current) => current.map((item) => item.id === data.id ? data : item));
      toast.success(`${adjustmentItem.name} adjusted ${adjustmentQty > 0 ? '+' : ''}${adjustmentQty}`);
      setAdjustmentItem(null);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to post stock adjustment');
    }
  }

  function exportCSV() {
    const csv = XLSX.utils.json_to_sheet(filtered.map((i) => ({
      Name: i.name,
      Category: i.category,
      Unit: i.unit,
      Stock: i.stock,
      Threshold: i.threshold,
      Cost: i.cost,
      Price: i.price,
      Sold: i.sold,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, csv, 'Inventory');
    XLSX.writeFile(wb, `inventory-${new Date().toISOString().split('T')[0]}.csv`);
  }

  function downloadTemplate() {
    const template = [
      { name: 'Tusker Lager', category: 'Beers', unit: 'Bottles', stock: 48, threshold: 20, cost: 180, price: 200 },
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products');
    XLSX.writeFile(wb, 'inventory-import-template.xlsx');
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet);

      if (!rows.length) {
        toast.error('The file has no rows to import');
        return;
      }

      const sheetRows = rows as Array<Record<string, unknown>>;
      const { data } = await inventoryApi.bulkImport(
        sheetRows.map((r) => ({
          name: String(r.name ?? r.Name ?? '').trim(),
          category: String(r.category ?? r.Category ?? '').trim(),
          unit: String(r.unit ?? r.Unit ?? 'Bottles').trim(),
          stock: Number(r.stock ?? r.Stock ?? 0),
          threshold: Number(r.threshold ?? r.Threshold ?? 5),
          cost: Number(r.cost ?? r.Cost ?? 0),
          price: Number(r.price ?? r.Price ?? 0),
        }))
      );

      setImportResult(data);
      if (data.createdCount > 0) {
        toast.success(`Imported ${data.createdCount} item(s)`);
        await loadItems();
      }
      if (data.errorCount > 0) {
        toast.warning(`${data.errorCount} row(s) failed — see details below`);
      }
    } catch {
      toast.error('Failed to import file');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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
            <button type="button" onClick={exportCSV} className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 text-sm px-3 py-2 rounded-lg hover:bg-gray-50">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
            {isAdmin && (
              <>
                <button type="button" onClick={downloadTemplate} className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 text-sm px-3 py-2 rounded-lg hover:bg-gray-50">
                  <FileDown className="w-3.5 h-3.5" /> Template
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                  className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 text-sm px-3 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" /> {importing ? 'Importing...' : 'Import Excel'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleImportFile}
                  className="hidden"
                />
                <button type="button" onClick={openAdd} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-2 rounded-lg">
                  <Plus className="w-3.5 h-3.5" /> Add Item
                </button>
              </>
            )}
          </div>
        </div>

        {/* Import result banner */}
        {importResult && (
          <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm">
            <p className="font-medium text-gray-900">
              Import result: {importResult.createdCount} created, {importResult.errorCount} failed
            </p>
            {importResult.errors.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-red-600">
                {importResult.errors.map((e) => (
                  <li key={`${e.row}-${e.name}`}>Row {e.row} ({e.name}): {e.message}</li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => setImportResult(null)} className="mt-2 text-xs text-gray-500 hover:text-gray-700">
              Dismiss
            </button>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[250px]">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
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
          onAdjust={openAdjustment}
          isAdmin={isAdmin}
        />

        {/* Add/Edit Modal */}
        {modalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full p-6 space-y-4">
              <h2 className="text-lg font-semibold">{editItem ? 'Edit Item' : 'Add Item'}</h2>
              <div className="space-y-3">
                <div>
                  <label htmlFor="item-name" className="text-xs font-medium text-gray-600 mb-1 block">Item Name</label>
                  <input id="item-name" type="text" placeholder="e.g. Tusker Lager" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label htmlFor="item-category" className="text-xs font-medium text-gray-600 mb-1 block">Category</label>
                  <select id="item-category" value={form.category} onChange={(e) => setForm({...form, category: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                    {CATEGORIES.filter((c) => c !== 'All').map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="item-unit" className="text-xs font-medium text-gray-600 mb-1 block">Unit</label>
                  <select id="item-unit" value={form.unit} onChange={(e) => setForm({...form, unit: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                    {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="item-stock" className="text-xs font-medium text-gray-600 mb-1 block">Stock Quantity</label>
                  <input id="item-stock" type="number" placeholder="0" value={form.stock} onChange={(e) => setForm({...form, stock: parseInt(e.target.value) || 0})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label htmlFor="item-threshold" className="text-xs font-medium text-gray-600 mb-1 block">Low Stock Threshold</label>
                  <input id="item-threshold" type="number" placeholder="5" value={form.threshold} onChange={(e) => setForm({...form, threshold: parseInt(e.target.value) || 0})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label htmlFor="item-cost" className="text-xs font-medium text-gray-600 mb-1 block">Cost (KES)</label>
                  <input id="item-cost" type="number" placeholder="0" value={form.cost} onChange={(e) => setForm({...form, cost: parseInt(e.target.value) || 0})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label htmlFor="item-price" className="text-xs font-medium text-gray-600 mb-1 block">Price (KES)</label>
                  <input id="item-price" type="number" placeholder="0" value={form.price} onChange={(e) => setForm({...form, price: parseInt(e.target.value) || 0})} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium">Cancel</button>
                <button type="button" onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
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
                <p className="text-sm text-gray-600 mb-2">Current stock: {restockItem.stock}</p>
                <input type="number" value={restockQty} onChange={(e) => setRestockQty(parseInt(e.target.value) || 0)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setRestockItem(null)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium">Cancel</button>
                <button type="button" onClick={confirmRestock} className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">Confirm</button>
              </div>
            </div>
          </div>
        )}

        {adjustmentItem && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-md w-full p-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Stock correction: {adjustmentItem.name}</h2>
                <p className="text-sm text-amber-700 mt-1">Post-launch corrections only. Do not use this for opening stock or purchase receipts.</p>
                <p className="text-sm text-gray-600 mt-2">Current stock: {adjustmentItem.stock}. Positive adds stock; negative removes stock.</p>
              </div>
              <div>
                <label htmlFor="adjustment-quantity" className="text-xs font-medium text-gray-600 mb-1 block">Quantity adjustment</label>
                <input id="adjustment-quantity" type="number" step="1" value={adjustmentQty} onChange={(e) => setAdjustmentQty(Number(e.target.value))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div>
                <label htmlFor="adjustment-reason" className="text-xs font-medium text-gray-600 mb-1 block">Correction reason</label>
                <textarea id="adjustment-reason" value={adjustmentReason} onChange={(e) => setAdjustmentReason(e.target.value)} rows={3} placeholder="e.g. Count correction after physical stocktake" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setAdjustmentItem(null)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium">Cancel</button>
                <button type="button" onClick={confirmAdjustment} className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium">Post Correction</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
