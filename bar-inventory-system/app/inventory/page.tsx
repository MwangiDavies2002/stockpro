'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { Search, Plus, Download, Upload, FileDown, X } from '../components/TextMark';
import Navbar from '../components/Navbar';
import {useAccess} from '../components/AccessBoundary';
import {canAct} from '../lib/access';
import InventoryTable from '../components/InventoryTable';
import StockHistory from '../components/StockHistory';
import type { InventoryItem } from '../components/InventoryTable';
import { inventoryApi, authApi, locationsApi, referenceDataApi } from '../lib/api';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { mapInventoryImportRow, isInventoryTemplatePlaceholder } from '../lib/inventoryImport';
import axios from 'axios';
import {downloadCsv} from '../lib/csv';
import {showDone} from '../lib/feedback';

type RefRow = { id: number; name: string; location_id: number; short_name?: string; allow_decimal?: boolean | number; parent_name?: string; description?: string };
type Location = { id: number; name: string; active?: boolean };

const EMPTY_FORM = { name:'', category:'', unit:'Pieces', brand:'', categoryId:'', unitId:'', brandId:'', locationId:'', stock:0, threshold:5, cost:0, price:0, sold:0, imageUrl:'', sku:'', barcode:'' };

export default function InventoryPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; role: string; email: string } | null>(null);
  const {access}=useAccess();
  const isAdmin=canAct(access,'inventory','update');
  const canCreate=canAct(access,'inventory','create');

  const [items, setItems]           = useState<InventoryItem[]>([]);
  const [locations, setLocations]   = useState<Location[]>([]);
  const [units, setUnits]           = useState<RefRow[]>([]);
  const [categories, setCategories] = useState<RefRow[]>([]);
  const [brands, setBrands]         = useState<RefRow[]>([]);
  const [search, setSearch]         = useState('');
  const [catFilter, setCatFilter]   = useState('All');
  const [modalOpen, setModalOpen]   = useState(false);
  const [editItem, setEditItem]     = useState<InventoryItem | null>(null);
  const [adjustmentItem, setAdjustmentItem] = useState<InventoryItem | null>(null);
  const [adjustmentQty, setAdjustmentQty] = useState(0);
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [detailItem, setDetailItem] = useState<InventoryItem | null>(null);
  const [form, setForm]             = useState(EMPTY_FORM);
  const [quickAdd, setQuickAdd]     = useState<null | 'units' | 'categories' | 'brands'>(null);
  const [quickForm, setQuickForm]   = useState({ name: '', shortName: '', allowDecimal: false, description: '' });
  const [saving, setSaving] = useState(false);
  const saveLock=useRef(false), referenceVersion=useRef(0), requestId=useRef(''), adjustmentRequest=useRef('');
  const [quickSaving,setQuickSaving]=useState(false),[attempted,setAttempted]=useState(false),[adjustmentAttempted,setAdjustmentAttempted]=useState(false),[locationFilter,setLocationFilter]=useState('All');
  const message=(e:any)=>e.response?.data?.message||e.response?.data?.error||e.message||'Unable to complete the request';

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importLocationId, setImportLocationId] = useState('');
  const [importResult, setImportResult] = useState<{ createdCount: number; errorCount: number; errors: Array<{ row: number; name: string; message: string }> } | null>(null);

  const loadItems = useCallback(async () => {
    try {
      const { data } = await inventoryApi.getAll();
      setItems(data);
    } catch {
      toast.error('Failed to load inventory');
    }
  }, []);

  const loadReferenceData = useCallback(async (nextLocationId: string) => {
    const version=++referenceVersion.current;setUnits([]);setCategories([]);setBrands([]);
    if (!nextLocationId) return;
    try {
      const [u, c, b] = await Promise.all([
        referenceDataApi.getAll('units', { locationId: Number(nextLocationId) }),
        referenceDataApi.getAll('categories', { locationId: Number(nextLocationId) }),
        referenceDataApi.getAll('brands', { locationId: Number(nextLocationId) }),
      ]);
      if(version===referenceVersion.current){setUnits(u.data);setCategories(c.data);setBrands(b.data);}
    } catch {
      toast.error('Failed to load product setup data');
    }
  }, []);

  useEffect(() => {
    const token = Cookies.get('token');
    if (!token) {
      router.push('/login');
      return;
    }
    authApi.me()
      .then(async (res) => {
        setUser(res.data);
        const locs = await locationsApi.getAll();
        const active = locs.data.filter((l: Location) => l.active !== false && Number(l.active) !== 0);
        setLocations(active);
        if (active[0]) {
          setForm(current => ({ ...current, locationId: String(active[0].id) }));
          await loadReferenceData(String(active[0].id));
        }
      })
      .catch((e:any) => {
        if(e.response?.status===401){Cookies.remove('token');router.push('/login');}else toast.error(message(e));
      });
  }, [router, loadReferenceData]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const filtered = items.filter((i) =>
    (catFilter === 'All' || i.category === catFilter) &&
    (locationFilter==='All'||String(i.location_id)===locationFilter)&&[i.name,i.sku,i.barcode,i.brand,i.category,i.location_name].join(' ').toLowerCase().includes(search.toLowerCase())
  );

  function openAdd() {
    setEditItem(null);setAttempted(false);requestId.current=crypto.randomUUID();
    const nextLocationId = form.locationId || (locations[0] ? String(locations[0].id) : '');
    setForm({ ...EMPTY_FORM, locationId: nextLocationId });
    void loadReferenceData(nextLocationId);
    setModalOpen(true);
  }
  function openEdit(item: InventoryItem) {
    setEditItem(item);setAttempted(false);requestId.current=crypto.randomUUID();
    const nextLocationId = String((item as any).location_id || form.locationId || locations[0]?.id || '');
    setForm({ name:item.name, category:item.category, unit:item.unit, brand:(item as any).brand || '', categoryId:String((item as any).category_id || ''), unitId:String((item as any).unit_id || ''), brandId:String((item as any).brand_id || ''), locationId:nextLocationId, stock:item.stock, threshold:item.threshold, cost:item.cost, price:item.price, sold:item.sold, imageUrl:(item as any).image_url || '',sku:item.sku||'',barcode:item.barcode||'' });
    void loadReferenceData(nextLocationId);
    setModalOpen(true);
  }

  function openDuplicate(item: InventoryItem) {
    openEdit(item);
    setEditItem(null);
    setForm(current => ({ ...current, name: `${item.name.slice(0,143)} (copy)`, stock: 0, sold: 0, sku:'', barcode:'' }));
  }

  async function openDetails(item: InventoryItem) {
    try{const r=await inventoryApi.getOne(item.id);setDetailItem(r.data);}catch(e){toast.error(message(e));}
  }

  async function handleSave() {
    if(saveLock.current)return;
    if (!form.name.trim()) return toast.error('Item name is required');
    if ([form.cost, form.price, form.stock, form.threshold].some(value => !Number.isFinite(value) || value < 0)) return toast.error('Prices and quantities must be zero or greater');
    if (!form.locationId) return toast.error('Business location is required');
    if (!form.unitId && !(editItem&&form.unit)) return toast.error('Unit is required');
    saveLock.current=true;setSaving(true);setAttempted(true);
    try {
      const selectedCategory = categories.find(c => String(c.id) === form.categoryId);
      const selectedUnit = units.find(u => String(u.id) === form.unitId);
      const selectedBrand = brands.find(b => String(b.id) === form.brandId);
      const payload = { ...form,requestId:requestId.current, locationId: Number(form.locationId), categoryId: form.categoryId ? Number(form.categoryId) : null, unitId: form.unitId?Number(form.unitId):null, brandId: form.brandId ? Number(form.brandId) : null, category: selectedCategory?.name || form.category, unit: selectedUnit?.name || form.unit, brand: selectedBrand?.name || form.brand };
      if (editItem) {
        const { data } = await inventoryApi.update(editItem.id, {...payload,stock:undefined,...(editItem.stock>0?{cost:undefined}:{})});
        setItems((prev) => prev.map((i) => i.id === editItem.id ? data : i));
        toast.success('Item updated');
      } else {
        const { data } = await inventoryApi.create(payload);
        setItems((prev) => [...prev, data]);
        toast.success('Item added');
      }
      setModalOpen(false);
    } catch (e:any) {
      if(e.response)setAttempted(false);toast.error(message(e));
    } finally {
      setSaving(false);saveLock.current=false;
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this item?')) return;
    try {
      await inventoryApi.delete(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast.success('Item deleted');
    } catch(e) {
      toast.error(message(e));
    }
  }

  async function handleRestock(item: InventoryItem) {
    router.push(`/purchases/create?itemId=${item.id}`);
  }

  function handleImage(file?: File) {
    if (!file) return;
    if (!['image/png','image/jpeg','image/gif','image/webp'].includes(file.type)) return toast.error('Choose an image file');
    if (file.size > 2 * 1024 * 1024) return toast.error('Image must be under 2MB');
    const reader = new FileReader();
    reader.onload = () => setForm(current => ({ ...current, imageUrl: String(reader.result || '') }));
    reader.readAsDataURL(file);
  }

  async function createQuickReference(e: React.FormEvent) {
    e.preventDefault();
    if (!quickAdd || !form.locationId || quickSaving) return;
    setQuickSaving(true);
    try {
      const { data } = await referenceDataApi.create(quickAdd, {
        locationId: Number(form.locationId),
        name: quickForm.name.trim(),
        shortName: quickForm.shortName.trim(),
        allowDecimal: quickForm.allowDecimal,
        description: quickForm.description.trim(),
      });
      if (quickAdd === 'units') { setUnits(current => [...current, data]); setForm(current => ({ ...current, unitId: String(data.id), unit: data.name })); }
      if (quickAdd === 'categories') { setCategories(current => [...current, data]); setForm(current => ({ ...current, categoryId: String(data.id), category: data.name })); }
      if (quickAdd === 'brands') { setBrands(current => [...current, data]); setForm(current => ({ ...current, brandId: String(data.id), brand: data.name })); }
      setQuickAdd(null);
      setQuickForm({ name: '', shortName: '', allowDecimal: false, description: '' });
      toast.success('Saved');
    } catch (err: any) {
      toast.error(message(err));
    } finally {setQuickSaving(false);}
  }

  function openAdjustment(item: InventoryItem) {
    setAdjustmentItem(item);setAdjustmentAttempted(false);adjustmentRequest.current=crypto.randomUUID();
    setAdjustmentQty(0);
    setAdjustmentReason('');
  }

  async function confirmAdjustment() {
    if (!adjustmentItem || saveLock.current) return;
    if (!Number.isInteger(adjustmentQty) || adjustmentQty === 0) return toast.error('Enter a non-zero whole quantity');
    if (adjustmentReason.trim().length < 5) return toast.error('Enter a correction reason (at least 5 characters)');
    saveLock.current=true;setSaving(true);setAdjustmentAttempted(true);
    try {
      const { data } = await inventoryApi.adjustStock(adjustmentItem.id, { quantity: adjustmentQty, reason: adjustmentReason.trim(),requestId:adjustmentRequest.current });
      setItems((current) => current.map((item) => item.id === data.id ? data : item));
      toast.success(`${adjustmentItem.name} adjusted ${adjustmentQty > 0 ? '+' : ''}${adjustmentQty}`);
      setAdjustmentItem(null);
    } catch (error: any) {
      if(error.response)setAdjustmentAttempted(false);toast.error(message(error));
    } finally {saveLock.current=false;setSaving(false);}
  }

  function exportCSV() {
    downloadCsv('inventory.csv',[['Name','SKU','Barcode','Brand','Category','Unit','Location','Stock','Threshold','Cost','Price','Sold'],...filtered.map(i=>[i.name,i.sku,i.barcode,i.brand,i.category,i.unit,i.location_name,i.stock,i.threshold,i.cost,i.price,i.sold])]);
  }

  function downloadTemplate() {
    const template = [{'Product Name':'',Category:'',Unit:'',Brand:'',SKU:'',Barcode:'','Opening Stock':0,'Alert quantity':5,'Purchase Price (Including Tax)':'','Selling Price':''}];
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
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      const productRows = rows.map((row, index) => ({row, excelRow: Number(row.__rowNum__ ?? index + 1) + 1})).filter(({row}) => !isInventoryTemplatePlaceholder(row));

      if (!productRows.length) {
        toast.error('This workbook is an empty product template. Fill in Product Name and your product values from row 2, save it, then import again.');
        return;
      }

      const sheetRows = productRows.map(({row}) => row);
      const hash = await crypto.subtle.digest('SHA-256', buffer);
      const fingerprint = Array.from(new Uint8Array(hash)).map(byte=>byte.toString(16).padStart(2,'0')).join('');
      const locationId = Number(importLocationId || locations[0]?.id);
      if (!locationId) throw new Error('Select a business location before importing');
      const { data } = await inventoryApi.bulkImport(
        sheetRows.map(mapInventoryImportRow), locationId, `${locationId}:${fingerprint}`
      );

      if (Array.isArray(data.errors)) data.errors = data.errors.map((error: any) => ({...error, row: productRows[error.row - 2]?.excelRow ?? error.row}));
      setImportResult(data);
      if (data.replayed) toast.info('This file was already imported into this location');
      if (data.skippedCount) toast.info(`Skipped ${data.skippedCount} existing SKU(s)`);
      if (data.createdCount > 0) {
        if(!data.errorCount)showDone(data.replayed ? 'This file was already imported safely.' : `Imported ${data.createdCount} item(s)`);
        await loadItems();
      }
      if (data.errorCount > 0) {
        toast.warning(`${data.errorCount} row(s) failed — see details below`);
      }
      if (!data.createdCount && !data.errorCount) showDone(data.skippedCount ? `Skipped ${data.skippedCount} existing SKU(s).` : 'Import complete.');
    } catch (error) {
      const response = axios.isAxiosError(error) ? error.response?.data : undefined;
      if (response && Array.isArray(response.errors)) {
        setImportResult(response);
        toast.error(`${response.errorCount} row(s) failed — see details below`);
      } else {
        toast.error(axios.isAxiosError(error)&&error.code==='ECONNABORTED' ? 'The import is taking longer than expected. You can retry this file safely; existing items will not be duplicated.' : response?.message || (error instanceof Error ? error.message : 'Failed to import file'));
      }
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
            <button type="button" onClick={exportCSV} className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 text-sm px-3 py-2 rounded-sm hover:bg-gray-50">
              <Download className="w-3.5 h-3.5" /> Export
            </button>
            {canCreate && (
              <>
                <button type="button" onClick={downloadTemplate} className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 text-sm px-3 py-2 rounded-sm hover:bg-gray-50">
                  <FileDown className="w-3.5 h-3.5" /> Template
                </button>
                <select aria-label="Import business location" value={importLocationId || String(locations[0]?.id || '')} onChange={event => setImportLocationId(event.target.value)} disabled={importing} className="bg-white border border-gray-300 text-gray-700 text-sm px-3 py-2 rounded-sm">
                  {locations.map(location => <option key={location.id} value={location.id}>{location.name}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importing}
                  className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 text-sm px-3 py-2 rounded-sm hover:bg-gray-50 disabled:opacity-50"
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
                <button type="button" disabled={saving} onClick={openAdd} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-2 rounded-sm">
                  <Plus className="w-3.5 h-3.5" /> Add Item
                </button>
              </>
            )}
          </div>
        </div>

        {/* Import result banner */}
        {importResult && (
          <div className="bg-white border border-gray-200 rounded-sm p-4 text-sm">
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
              placeholder="Search name, SKU, barcode or brand..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {['All', ...Array.from(new Set(items.map((i) => i.category).filter(Boolean)))].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <label className="block text-sm">Location<select aria-label="Filter inventory location" value={locationFilter} onChange={e=>setLocationFilter(e.target.value)} className="ml-3 border p-2 rounded-sm"><option value="All">All assigned locations</option>{locations.map(l=><option value={l.id} key={l.id}>{l.name}</option>)}</select></label>
        {/* Table */}
        <InventoryTable
          items={filtered}
          onEdit={openEdit}
          onDelete={handleDelete}
          onRestock={handleRestock}
          onAdjust={openAdjustment}
          onView={openDetails}
          onDuplicate={openDuplicate}
          isAdmin={isAdmin}
        />

        {detailItem && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setDetailItem(null)}>
            <div className="bg-white rounded-sm max-w-2xl w-full max-h-[90vh] overflow-y-auto " onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-4 p-6 border-b">
                <div className="flex items-center gap-4">
                  {detailItem.image_url ? <img src={detailItem.image_url} alt={detailItem.name} className="w-20 h-20 rounded-sm object-cover border" /> : <div className="w-20 h-20 rounded-sm bg-gray-100 flex items-center justify-center text-gray-400 text-xs">No image</div>}
                  <div><h2 className="text-xl font-semibold text-gray-900">{detailItem.name}</h2><p className="text-sm text-gray-500">{detailItem.category} · {detailItem.unit}</p></div>
                </div>
                <button type="button" aria-label="Close product details" onClick={() => setDetailItem(null)} className="p-2 rounded-sm hover:bg-gray-100">Close</button>
              </div>
              <div className="p-6 space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-sm bg-emerald-50 p-3"><p className="text-xs text-emerald-700">Current stock</p><p className="text-xl font-semibold text-emerald-900">{detailItem.stock}</p></div>
                  <div className="rounded-sm bg-blue-50 p-3"><p className="text-xs text-blue-700">Total sold</p><p className="text-xl font-semibold text-blue-900">{detailItem.sold}</p></div>
                  <div className="rounded-sm bg-amber-50 p-3"><p className="text-xs text-amber-700">Reorder at</p><p className="text-xl font-semibold text-amber-900">{detailItem.threshold}</p></div>
                  <div className="rounded-sm bg-purple-50 p-3"><p className="text-xs text-purple-700">Stock value</p><p className="text-xl font-semibold text-purple-900">KES {(Number(detailItem.stock) * Number(detailItem.cost)).toLocaleString()}</p></div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <div><p className="text-xs text-gray-500">Purchase cost</p><p className="font-medium">KES {Number(detailItem.cost).toLocaleString()}</p></div>
                  <div><p className="text-xs text-gray-500">Selling price</p><p className="font-medium">KES {Number(detailItem.price).toLocaleString()}</p></div>
                  <div><p className="text-xs text-gray-500">Margin per unit</p><p className="font-medium text-emerald-700">KES {(Number(detailItem.price) - Number(detailItem.cost)).toLocaleString()}</p></div>
                  <div><p className="text-xs text-gray-500">Brand</p><p className="font-medium">{detailItem.brand||"No brand"}</p></div><div><p className="text-xs text-gray-500">Location</p><p className="font-medium">{detailItem.location_name||"Not recorded"}</p></div>
                  <div><p className="text-xs text-gray-500">SKU</p><p className="font-medium">{(detailItem as any).sku || '—'}</p></div>
                  <div><p className="text-xs text-gray-500">Barcode</p><p className="font-medium">{(detailItem as any).barcode || '—'}</p></div>
                  <div><p className="text-xs text-gray-500">Supplier</p><p className="font-medium">{(detailItem as any).supplier_name || '—'}</p></div>
                </div>
                <StockHistory key={detailItem.id} id={detailItem.id} stock={detailItem.stock} />
                <div className="flex flex-wrap gap-2 pt-2 border-t">
                  {isAdmin && <button type="button" onClick={() => { setDetailItem(null); openEdit(detailItem); }} className="px-4 py-2 rounded-sm bg-gray-900 text-white text-sm">Edit product</button>}
                  {canAct(access,'purchases','create') && <button type="button" onClick={() => { setDetailItem(null); handleRestock(detailItem); }} className="px-4 py-2 rounded-sm border border-emerald-600 text-emerald-700 text-sm">Receive purchase</button>}
                  {isAdmin && <button type="button" onClick={() => { setDetailItem(null); openAdjustment(detailItem); }} className="px-4 py-2 rounded-sm border border-amber-600 text-amber-700 text-sm">Adjust stock</button>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add/Edit Modal */}
        {modalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <form role="dialog" aria-modal="true" aria-labelledby="item-dialog-title" onKeyDown={(event) => { if (event.key === 'Escape'&&!saveLock.current) setModalOpen(false); }} onSubmit={(event) => { event.preventDefault(); void handleSave(); }} className="bg-white rounded-sm max-w-md w-full max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden ">
              <div className="flex items-center justify-between gap-3 p-6 pb-4 shrink-0 border-b">
                <h2 id="item-dialog-title" className="text-lg font-semibold">{editItem ? 'Edit Item' : 'Add Item'}</h2>
                <button type="button" aria-label="Close item form" disabled={saving} onClick={() => setModalOpen(false)} className="p-2 rounded-sm hover:bg-gray-100">Close</button>
              </div>
              <fieldset disabled={saving||attempted} className="space-y-3 overflow-y-auto overscroll-contain min-h-0 flex-1 p-6">
                <div>
                  <label htmlFor="item-location" className="text-xs font-medium text-gray-600 mb-1 block">Business Location</label>
                  <select id="item-location" disabled={!!editItem&&(editItem.stock>0||editItem.sold>0)} value={form.locationId} onChange={(e) => { setForm({...form, locationId: e.target.value, categoryId: '', unitId: '', brandId: '', category: '', unit: '', brand: ''}); void loadReferenceData(e.target.value); }} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                    <option value="">Select location</option>
                    {locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="item-name" className="text-xs font-medium text-gray-600 mb-1 block">Item Name</label>
                  <input id="item-name" required maxLength={150} type="text" placeholder="e.g. Tusker Lager" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div className="grid grid-cols-2 gap-3"><label className="text-xs">SKU<input aria-label="SKU" maxLength={100} placeholder="Auto-generated if blank" className="mt-1 border p-2 rounded-sm w-full" value={form.sku} onChange={e=>setForm({...form,sku:e.target.value})}/></label><label className="text-xs">Barcode<input aria-label="Barcode" maxLength={100} className="mt-1 border p-2 rounded-sm w-full" value={form.barcode} onChange={e=>setForm({...form,barcode:e.target.value})}/></label></div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Product Picture</label>
                  <div className="flex items-center gap-3"><label className="cursor-pointer px-3 py-2 border rounded-sm text-sm hover:bg-gray-50"><Upload className="w-4 h-4 inline mr-2" />Choose image<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => handleImage(e.target.files?.[0])} /></label>{form.imageUrl && <img src={form.imageUrl} alt="Preview" className="w-12 h-12 rounded-sm object-cover" />}</div>
                </div>
                <div>
                  <label htmlFor="item-category" className="text-xs font-medium text-gray-600 mb-1 block">Category (optional)</label>
                  <div className="flex gap-2"><select id="item-category" value={form.categoryId} onChange={(e) => { const row = categories.find(c => String(c.id) === e.target.value); setForm({...form, categoryId: e.target.value, category: row?.name || ''}); }} className="min-w-0 flex-1 px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                    <option value="">No category</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.parent_name ? `${c.parent_name} / ${c.name}` : c.name}</option>)}
                  </select><button type="button" aria-label="Add category" onClick={() => setQuickAdd('categories')} disabled={!form.locationId} className="px-3 py-2 rounded-sm border border-gray-300 hover:bg-gray-50 disabled:opacity-50">Add</button></div>
                </div>
                <div>
                  <label htmlFor="item-unit" className="text-xs font-medium text-gray-600 mb-1 block">Unit</label>
                  <div className="flex gap-2"><select id="item-unit" disabled={!!editItem&&editItem.stock>0} value={form.unitId} onChange={(e) => { const row = units.find(u => String(u.id) === e.target.value); setForm({...form, unitId: e.target.value, unit: row?.name || ''}); }} className="min-w-0 flex-1 px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                    <option value="">{editItem&&form.unit?`Current unit: ${form.unit}`:"Select unit"}</option>
                    {units.map((u) => <option key={u.id} value={u.id}>{u.name}{u.short_name ? ` (${u.short_name})` : ''}</option>)}
                  </select><button type="button" aria-label="Add unit" onClick={() => setQuickAdd('units')} disabled={!form.locationId} className="px-3 py-2 rounded-sm border border-gray-300 hover:bg-gray-50 disabled:opacity-50">Add</button></div>
                </div>
                <div>
                  <label htmlFor="item-brand" className="text-xs font-medium text-gray-600 mb-1 block">Brand</label>
                  <div className="flex gap-2"><select id="item-brand" value={form.brandId} onChange={(e) => { const row = brands.find(b => String(b.id) === e.target.value); setForm({...form, brandId: e.target.value, brand: row?.name || ''}); }} className="min-w-0 flex-1 px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                    <option value="">No brand</option>
                    {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select><button type="button" aria-label="Add brand" onClick={() => setQuickAdd('brands')} disabled={!form.locationId} className="px-3 py-2 rounded-sm border border-gray-300 hover:bg-gray-50 disabled:opacity-50">Add</button></div>
                </div>
                <div>
                  <label htmlFor="item-stock" className="text-xs font-medium text-gray-600 mb-1 block">{editItem?"Current stock (use a receipt or correction to change)":"Initial stock quantity"}</label>
                  <input id="item-stock" disabled={!!editItem} min={0} max={2147483647} step="1" type="number" placeholder="0" value={form.stock} onChange={(e) => setForm({...form, stock: Number(e.target.value)})} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label htmlFor="item-threshold" className="text-xs font-medium text-gray-600 mb-1 block">Low Stock Threshold</label>
                  <input id="item-threshold" min={0} max={2147483647} step="1" type="number" placeholder="5" value={form.threshold} onChange={(e) => setForm({...form, threshold: Number(e.target.value)})} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label htmlFor="item-cost" className="text-xs font-medium text-gray-600 mb-1 block">Purchase Price per Unit (KES)</label>
                  <input id="item-cost" disabled={!!editItem&&editItem.stock>0} type="number" min="0" max="99999999.99" step="0.01" required placeholder="0.00" value={form.cost} onChange={(e) => setForm({...form, cost: Number(e.target.value) || 0})} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div>
                  <label htmlFor="item-price" className="text-xs font-medium text-gray-600 mb-1 block">Selling Price per Unit (KES)</label>
                  <input id="item-price" type="number" min="0" max="99999999.99" step="0.01" required placeholder="0.00" value={form.price} onChange={(e) => setForm({...form, price: Number(e.target.value) || 0})} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>
                <div className="rounded-sm bg-gray-50 border p-3 text-sm">
                  <p className="font-medium">Expected gross profit per unit: KES {(form.price - form.cost).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  <p className="text-xs text-gray-500 mt-1">Selling price minus purchase price, before discounts, tax and operating expenses.</p>
                </div>
              </fieldset>
              {attempted&&!saving&&<p className="px-6 text-sm text-amber-700">Save could not be confirmed. Retry these details, or check inventory before starting another product.</p>}
              <div className="flex items-center gap-2 p-6 pt-4 border-t bg-white shrink-0">
                <button type="button" disabled={saving} onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-sm hover:bg-gray-50 text-sm font-medium">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-green-600 text-white rounded-sm hover:bg-green-700 text-sm font-medium disabled:opacity-50">{saving ? 'Saving...' : attempted?'Retry save':'Save'}</button>
              </div>
            </form>
          </div>
        )}

        {quickAdd && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
            <form onSubmit={createQuickReference} className="bg-white rounded-sm max-w-md w-full max-h-[90vh] overflow-auto p-6 space-y-4"><fieldset disabled={quickSaving} className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Add {quickAdd === 'units' ? 'Unit' : quickAdd === 'categories' ? 'Category' : 'Brand'}</h2>
                <button type="button" aria-label="Close" onClick={() => setQuickAdd(null)}>Close</button>
              </div>
              <label className="block text-sm">Name *<input required maxLength={quickAdd==='units'?30:150} value={quickForm.name} onChange={(e) => setQuickForm({...quickForm, name: e.target.value})} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-green-500" /></label>
              {quickAdd === 'units' && (
                <>
                  <label className="block text-sm">Short name / abbreviation<input maxLength={30} value={quickForm.shortName} onChange={(e) => setQuickForm({...quickForm, shortName: e.target.value})} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-green-500" /></label>
                  <p className="text-xs text-gray-500">Stock quantities use whole units.</p>
                </>
              )}
              {quickAdd !== 'units' && (
                <label className="block text-sm">Short description / note<textarea rows={3} value={quickForm.description} onChange={(e) => setQuickForm({...quickForm, description: e.target.value})} maxLength={4000} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-green-500" /></label>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => setQuickAdd(null)} className="flex-1 px-4 py-2 border border-gray-300 rounded-sm hover:bg-gray-50 text-sm font-medium">Cancel</button>
                <button disabled={quickSaving} className="flex-1 px-4 py-2 bg-green-600 text-white rounded-sm hover:bg-green-700 text-sm font-medium">{quickSaving?"Saving...":"Save"}</button>
              </div>
            </fieldset></form>
          </div>
        )}

        {adjustmentItem && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-sm max-w-md w-full p-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Stock correction: {adjustmentItem.name}</h2>
                <p className="text-sm text-amber-700 mt-1">Post-launch corrections only. Do not use this for opening stock or purchase receipts.</p>
                <p className="text-sm text-gray-600 mt-2">Current stock: {adjustmentItem.stock}. Positive adds stock; negative removes stock.</p>
              </div>
              <div>
                <label htmlFor="adjustment-quantity" className="text-xs font-medium text-gray-600 mb-1 block">Quantity adjustment</label>
                <input id="adjustment-quantity" disabled={saving||adjustmentAttempted} type="number" step="1" value={adjustmentQty} onChange={(e) => setAdjustmentQty(Number(e.target.value))} className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div>
                <label htmlFor="adjustment-reason" className="text-xs font-medium text-gray-600 mb-1 block">Correction reason</label>
                <textarea id="adjustment-reason" disabled={saving||adjustmentAttempted} maxLength={255} value={adjustmentReason} onChange={(e) => setAdjustmentReason(e.target.value)} rows={3} placeholder="e.g. Count correction after physical stocktake" className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setAdjustmentItem(null)} disabled={saving} className="flex-1 px-4 py-2 border border-gray-300 rounded-sm hover:bg-gray-50 text-sm font-medium">Cancel</button>
                <button type="button" onClick={confirmAdjustment} disabled={saving} className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-sm hover:bg-amber-700 text-sm font-medium">{saving?"Posting...":adjustmentAttempted?"Retry correction":"Post correction"}</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
