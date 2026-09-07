'use client';

import { useEffect, useRef, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { Plus, Search, X, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import Navbar from '../components/Navbar';
import { authApi, inventoryApi, locationsApi, ordersApi, suppliersApi, referenceDataApi } from '../lib/api';

type Product = { id: number; name: string; sku?: string; barcode?: string; stock: number; cost: number; price: number; previous_unit_price?: number; previous_discount?: number };
type Line = { product: Product; quantity: number; costBeforeDiscount: number; discountPercent: number; taxPercent: number; profitMargin: number; sellingPrice: number; accountType: string };
type Named = { id: number; name: string; active?: boolean };
type RefRow = { id: number; name: string; short_name?: string; parent_name?: string };
const round = (n: number, digits = 2) => Number(n.toFixed(digits));
const money = (n: number) => n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function amounts(line: Line) {
  const after = round(line.costBeforeDiscount * (1 - line.discountPercent / 100), 4);
  const subtotal = round(line.quantity * after);
  return { after, subtotal, total: round(subtotal + round(subtotal * line.taxPercent / 100)), taxedUnit: after * (1 + line.taxPercent / 100) };
}
const field = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';
const button = 'inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const errorMessage = (err: any) => err.response?.data?.message || 'Unable to complete the request. Please try again.';

export default function PurchasesPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [suppliers, setSuppliers] = useState<Named[]>([]);
  const [locations, setLocations] = useState<Named[]>([]);
  const [units, setUnits] = useState<RefRow[]>([]);
  const [categories, setCategories] = useState<RefRow[]>([]);
  const [brands, setBrands] = useState<RefRow[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [locationId, setLocationId] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [status, setStatus] = useState('delivered');
  const [payTerm, setPayTerm] = useState('Due on receipt');
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [active, setActive] = useState(0);
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const searchVersion = useRef(0);
  const searchInput = useRef<HTMLInputElement>(null);
  const [modal, setModal] = useState<'product' | 'supplier' | null>(null);
  const [creating, setCreating] = useState(false);
  const [recent, setRecent] = useState<any[]>([]);
  const [initialError, setInitialError] = useState('');

  async function loadReferenceData(nextLocationId = locationId) {
    if (!nextLocationId) return;
    const [u, c, b] = await Promise.all([
      referenceDataApi.getAll('units', { locationId: Number(nextLocationId) }),
      referenceDataApi.getAll('categories', { locationId: Number(nextLocationId) }),
      referenceDataApi.getAll('brands', { locationId: Number(nextLocationId) }),
    ]);
    setUnits(u.data); setCategories(c.data); setBrands(b.data);
  }

  async function loadOrders() { const res = await ordersApi.getAll(); setRecent(res.data.filter((o: any) => o.purchase_date)); }
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const me = await authApi.me();
        if (me.data.role !== 'admin') { router.replace('/pos'); return; }
        const [s, l, o] = await Promise.all([suppliersApi.getAll(), locationsApi.getAll(), ordersApi.getAll()]);
        if (!live) return;
        setUser(me.data); setSuppliers(s.data); setLocations(l.data.filter((x: Named) => x.active !== false && Number(x.active) !== 0));
        setRecent(o.data.filter((x: any) => x.purchase_date));
      } catch (err) { if (live) setInitialError(errorMessage(err)); }
    })();
    return () => { live = false; };
  }, [router]);

  useEffect(() => { loadReferenceData().catch(() => {}); }, [locationId]);

  useEffect(() => {
    const version = ++searchVersion.current;
    setResults([]); setActive(0); setSearchError('');
    if (!search.trim() || !locationId) { setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await inventoryApi.getAll({ search: search.trim(), locationId: Number(locationId) });
        if (version === searchVersion.current) setResults(res.data);
      } catch (err) { if (version === searchVersion.current) setSearchError(errorMessage(err)); }
      finally { if (version === searchVersion.current) setSearching(false); }
    }, 250);
    return () => { clearTimeout(timer); ++searchVersion.current; };
  }, [search, locationId]);

  function addProduct(product: Product) {
    setLines(previous => {
      if (previous.some(l => l.product.id === product.id)) return previous.map(l => l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l);
      const line: Line = { product, quantity: 1, costBeforeDiscount: Number(product.previous_unit_price ?? product.cost), discountPercent: Number(product.previous_discount ?? 0), taxPercent: 0, profitMargin: 0, sellingPrice: Number(product.price), accountType: 'asset' };
      const cost = amounts(line).taxedUnit;
      line.profitMargin = cost > 0 ? (line.sellingPrice / cost - 1) * 100 : 0;
      return [...previous, line];
    });
    ++searchVersion.current; setSearch(''); setResults([]); setSearchOpen(false); setSearching(false);
    searchInput.current?.focus();
  }
  async function lookup() {
    if (!locationId || !search.trim()) return;
    if (results.length && !searching) {
      const exact = results.filter(p => p.barcode === search.trim() || p.sku === search.trim());
      if (exact.length === 1) { addProduct(exact[0]); return; }
      if (!exact.length) { addProduct(results[active]); return; }
    }
    const version = ++searchVersion.current;
    setSearching(true); setSearchOpen(true);
    try {
      const res = await inventoryApi.getAll({ search: search.trim(), locationId: Number(locationId) });
      if (version !== searchVersion.current) return;
      const matches: Product[] = res.data;
      const exact = matches.filter(p => p.barcode === search.trim() || p.sku === search.trim());
      if (exact.length === 1 || matches.length === 1) addProduct(exact[0] || matches[0]);
      else { setResults(matches); setActive(0); if (!matches.length) setSearchError('No product found. Use Add new product to create it.'); }
    } catch (err) { if (version === searchVersion.current) setSearchError(errorMessage(err)); }
    finally { if (version === searchVersion.current) setSearching(false); }
  }
  function edit(index: number, key: keyof Omit<Line, 'product'>, value: number | string) {
    setLines(previous => previous.map((old, i) => {
      if (i !== index) return old;
      const line = { ...old, [key]: value };
      const cost = amounts(line).taxedUnit;
      if (key === 'sellingPrice') line.profitMargin = cost > 0 ? (Number(value) / cost - 1) * 100 : 0;
      else if (['costBeforeDiscount', 'discountPercent', 'taxPercent', 'profitMargin'].includes(key)) line.sellingPrice = round(cost * (1 + line.profitMargin / 100));
      return line;
    }));
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (saveLock.current || !lines.length) return;
    saveLock.current = true; setSaving(true);
    try {
      const res = await ordersApi.create({ supplierId: Number(supplierId), referenceNo, purchaseDate, status, locationId: Number(locationId), payTerm,
        items: lines.map(l => ({ itemId: l.product.id, quantity: l.quantity, unitPrice: amounts(l).after, costBeforeDiscount: l.costBeforeDiscount, discountPercent: l.discountPercent, taxPercent: l.taxPercent, profitMargin: l.profitMargin, sellingPrice: l.sellingPrice, accountType: l.accountType })) });
      toast.success(`Purchase #${res.data.id} saved${status === 'delivered' ? ' and stock updated' : ''}`);
      setLines([]); setReferenceNo(''); setSearch('');
      loadOrders().catch(() => toast.error('Purchase saved, but the purchase list could not refresh.'));
    } catch (err) { toast.error(errorMessage(err)); }
    finally { setSaving(false); saveLock.current = false; }
  }
  async function createInline(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (creating) return;
    const values = Object.fromEntries(new FormData(e.currentTarget));
    setCreating(true);
    try {
      if (modal === 'product') {
        const category = categories.find(c => String(c.id) === String(values.categoryId));
        const unit = units.find(u => String(u.id) === String(values.unitId));
        const brand = brands.find(b => String(b.id) === String(values.brandId));
        if (!category || !unit) throw new Error('Choose a category and unit');
        const res = await inventoryApi.create({ name: String(values.name).trim(), category: category.name, unit: unit.name, brand: brand?.name, categoryId: category.id, unitId: unit.id, brandId: brand?.id, sku: String(values.sku), barcode: String(values.barcode), stock: 0, cost: Number(values.cost), price: Number(values.price), threshold: 5, locationId: Number(locationId), supplierId: Number(supplierId) || undefined });
        addProduct(res.data); toast.success('Product created and added');
      } else {
        const res = await suppliersApi.create({ name: String(values.name).trim(), email: String(values.email), phone: String(values.phone) });
        setSuppliers(previous => [...previous, res.data]); setSupplierId(String(res.data.id)); setSupplierSearch(res.data.name); setSupplierOpen(false); toast.success('Supplier created');
      }
      setModal(null);
    } catch (err) { toast.error(errorMessage(err)); }
    finally { setCreating(false); }
  }
  async function createReference(type: 'units' | 'categories' | 'brands') {
    if (!locationId) return;
    const name = window.prompt(`New ${type.slice(0, -1)} name`);
    if (!name?.trim()) return;
    try {
      const { data } = await referenceDataApi.create(type, { locationId: Number(locationId), name: name.trim() });
      if (type === 'units') setUnits(current => [...current, data]);
      if (type === 'categories') setCategories(current => [...current, data]);
      if (type === 'brands') setBrands(current => [...current, data]);
      toast.success('Saved');
    } catch (err: any) { toast.error(err.response?.data?.message || 'Failed to save'); }
  }
  async function changeStatus(id: number, next: string) {
    if (saveLock.current) return;
    saveLock.current = true; setSaving(true);
    try { await ordersApi.updateStatus(id, next); toast.success(next === 'delivered' ? 'Purchase received and stock updated' : 'Purchase approved'); await loadOrders(); }
    catch (err) { toast.error(errorMessage(err)); }
    finally { saveLock.current = false; setSaving(false); }
  }
  const total = round(lines.reduce((sum, l) => sum + amounts(l).total, 0));
  function numberInput(line: Line, index: number, key: keyof Omit<Line,'product' | 'accountType'>, label: string, min = 0, max?: number, step: number | string = 'any') {
    return <input aria-label={`${label} for ${line.product.name}`} className={`${field} min-w-24`} type="number" required min={min} max={max} step={step} value={line[key]} onChange={e => edit(index, key, Number(e.target.value))} />;
  }
  return <><Navbar user={user} /><main className="p-4 lg:p-8 space-y-6">
    <div><p className="text-sm text-gray-500">Purchases / Create</p><h1 className="mt-1 text-2xl font-semibold text-gray-900">Add Purchase</h1><p className="mt-1 text-sm text-gray-500">Choose a supplier and location, then search or scan your products.</p></div>
    {initialError && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-700">{initialError}</p>}
    <form onSubmit={save} className="space-y-6"><fieldset disabled={saving || !user} className="space-y-6 min-w-0">
      <section className="rounded-xl border bg-white p-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <div><label htmlFor="supplier" className="block text-sm font-medium mb-2">Supplier *</label><div className="flex gap-2"><div className="relative flex-1"><input id="supplier" className={field} placeholder="Search supplier" value={supplierSearch} required autoComplete="off" role="combobox" aria-expanded={supplierOpen} aria-controls="supplier-results" onFocus={() => setSupplierOpen(true)} onBlur={() => setTimeout(() => setSupplierOpen(false), 150)} onChange={e => { setSupplierSearch(e.target.value); setSupplierId(''); setSupplierOpen(true); }} onKeyDown={e => { if (e.key === 'Escape') setSupplierOpen(false); if (e.key === 'Enter') { e.preventDefault(); const match = suppliers.filter(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase()))[0]; if (match) { setSupplierId(String(match.id)); setSupplierSearch(match.name); setSupplierOpen(false); } } }} />
        {supplierOpen && <div id="supplier-results" role="listbox" className="absolute z-30 mt-1 max-h-56 overflow-auto w-full rounded-md border bg-white shadow-lg">{suppliers.filter(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase())).map(s => <button type="button" role="option" aria-selected={String(s.id) === supplierId} key={s.id} className="block w-full px-3 py-2 text-left text-sm hover:bg-emerald-50" onMouseDown={e => e.preventDefault()} onClick={() => { setSupplierId(String(s.id)); setSupplierSearch(s.name); setSupplierOpen(false); }}>{s.name}</button>)}{!suppliers.some(s => s.name.toLowerCase().includes(supplierSearch.toLowerCase())) && <p className="p-3 text-sm text-gray-500">No suppliers found. Use + to add one.</p>}</div>}</div><button type="button" aria-label="Add new supplier" className={button} onClick={() => setModal('supplier')}><Plus size={16}/></button></div></div>
        <label className="text-sm font-medium">Reference No<input className={`${field} mt-2`} maxLength={100} value={referenceNo} onChange={e => setReferenceNo(e.target.value)} placeholder="Supplier invoice or reference" /></label>
        <label className="text-sm font-medium">Purchase Date *<input className={`${field} mt-2`} type="date" required value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} /></label>
        <label className="text-sm font-medium">Purchase Status<select className={`${field} mt-2`} value={status} onChange={e => setStatus(e.target.value)}><option value="delivered">Received</option><option value="pending">Pending</option><option value="approved">Approved</option></select></label>
        <label className="text-sm font-medium">Business Location *<select className={`${field} mt-2`} required value={locationId} disabled={lines.length > 0} onChange={e => { setLocationId(e.target.value); setSearch(''); }}><option value="">Select location</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>{lines.length > 0 && <span className="text-xs text-gray-500 font-normal">Remove line items to change location.</span>}</label>
        <label className="text-sm font-medium">Pay Term<input className={`${field} mt-2`} maxLength={100} value={payTerm} onChange={e => setPayTerm(e.target.value)} placeholder="e.g. Net 30 days" /></label>
      </section>
      <section className="rounded-xl border bg-white p-5 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3"><div className="relative flex-1"><Search className="absolute left-3 top-3 text-gray-400" size={18}/><input ref={searchInput} aria-label="Enter Product name / SKU / Scan barcode" placeholder="Enter Product name / SKU / Scan barcode" className={`${field} pl-10`} disabled={!locationId} value={search} autoComplete="off" role="combobox" aria-expanded={searchOpen && !!search} aria-controls="product-results" aria-activedescendant={searchOpen && results[active] ? `product-${results[active].id}` : undefined} onFocus={() => setSearchOpen(true)} onBlur={() => setTimeout(() => setSearchOpen(false), 150)} onChange={e => { setSearch(e.target.value); setSearchOpen(true); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void lookup(); } if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i+1, results.length-1)); setSearchOpen(true); } if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(0,i-1)); } if (e.key === 'Escape') setSearchOpen(false); }} />
        {searchOpen && search && <div id="product-results" role="listbox" className="absolute z-20 mt-1 w-full max-h-72 overflow-auto rounded-md border bg-white shadow-lg">{searching ? <p className="p-3 text-sm">Searching...</p> : searchError ? <p role="alert" className="p-3 text-sm text-red-600">{searchError}</p> : results.length ? results.map((p,i) => <button id={`product-${p.id}`} type="button" role="option" aria-selected={active === i} key={p.id} className={`w-full text-left p-3 hover:bg-emerald-50 ${active === i ? 'bg-emerald-50' : ''}`} onMouseDown={e => e.preventDefault()} onClick={() => addProduct(p)}><span className="block text-sm font-medium">{p.name}</span><span className="text-xs text-gray-500">{p.sku || p.barcode || 'No SKU'} ? Stock: {p.stock} ? Cost: {money(Number(p.cost))}</span></button>) : <p className="p-3 text-sm text-gray-500">No matching products at this location. Add a new product.</p>}</div>}</div><button type="button" className={button} disabled={!locationId} onClick={() => setModal('product')}><Plus size={16}/>Add new product</button></div>
        {!locationId && <p className="text-sm text-gray-500">Select a business location to search products.</p>}
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-xs text-gray-600"><tr>{['Product Name','Purchase Quantity','Unit Cost Before Discount','Discount Percent %','Unit Cost After Discount','Subtotal Before Tax','Product Tax %','Net Cost','Line Total','Profit Margin %','Unit Selling Price (Inc. Tax)','Account Type',''].map((h,i) => <th key={i} className="text-left p-3 min-w-24">{h}</th>)}</tr></thead><tbody>
          {!lines.length && <tr><td colSpan={13} className="py-14 text-center text-gray-400"><ShoppingCart className="mx-auto mb-3" size={28}/>Search or scan a product to add your first line item.</td></tr>}
          {lines.map((l,i) => { const a = amounts(l); return <tr key={l.product.id} className="border-t align-top"><td className="p-3 min-w-52"><p className="font-medium">{l.product.name}</p><p className="text-xs text-gray-500 mt-1">Current stock: {l.product.stock}</p><p className="text-xs text-gray-400 mt-2">Previous unit price: {money(Number(l.product.previous_unit_price ?? l.product.cost))}<br/>Previous discount: {Number(l.product.previous_discount ?? 0)}%</p></td>
          <td className="p-3">{numberInput(l,i,'quantity','Purchase quantity',1,1000000,1)}</td><td className="p-3">{numberInput(l,i,'costBeforeDiscount','Unit cost before discount',0,10000000)}</td><td className="p-3">{numberInput(l,i,'discountPercent','Discount percent',0,100)}</td><td className="p-3 tabular-nums">{a.after.toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:4})}</td><td className="p-3 tabular-nums">{money(a.subtotal)}</td><td className="p-3">{numberInput(l,i,'taxPercent','Product tax',0,100)}</td><td className="p-3 tabular-nums">{money(a.total)}</td><td className="p-3 tabular-nums font-medium">{money(a.total)}</td><td className="p-3">{numberInput(l,i,'profitMargin','Profit margin',-100,100000)}</td><td className="p-3">{numberInput(l,i,'sellingPrice','Unit selling price',0,100000000)}</td><td className="p-3"><select aria-label={`Account type for ${l.product.name}`} className={`${field} min-w-28`} value={l.accountType} onChange={e => edit(i,'accountType',e.target.value)}><option value="asset">Asset</option><option value="expense">Expense</option></select></td><td className="p-3"><button aria-label={`Delete ${l.product.name}`} type="button" className="p-2 text-red-500 hover:bg-red-50 rounded" onClick={() => setLines(previous => previous.filter((_,n) => n !== i))}><X size={18}/></button></td></tr>; })}
        </tbody></table></div>
        <div className="flex flex-wrap justify-between gap-4 border-t pt-5" aria-live="polite"><p>Total Items: <strong>{lines.reduce((sum,l) => sum+l.quantity,0)}</strong> <span className="text-gray-400 text-xs">({lines.length} products)</span></p><p>Net Total Amount: <strong className="text-xl text-emerald-700">KES {money(total)}</strong></p></div>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-4"><p className="text-xs text-gray-500">{status === 'delivered' ? 'Received purchases update stock and selling prices when saved.' : 'Stock will update when this purchase is received.'} Margin is markup on discounted cost, before tax.</p><button type="submit" disabled={!lines.length || !supplierId || !locationId || saving} className="rounded-md bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save Purchase'}</button></div>
    </fieldset></form>
    {recent.length > 0 && <section className="rounded-xl border bg-white p-5"><h2 className="font-semibold mb-4">Purchases</h2><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Reference','Supplier','Date','Status','Amount',''].map((h,i) => <th className="text-left p-2" key={i}>{h}</th>)}</tr></thead><tbody>{recent.map(o => <tr key={o.id} className="border-t"><td className="p-2">{o.reference_no || `#${o.id}`}</td><td className="p-2">{o.supplier_name}</td><td className="p-2">{String(o.purchase_date).slice(0,10)}</td><td className="p-2">{o.status === 'delivered' ? 'Received' : o.status}</td><td className="p-2">KES {money(Number(o.total))}</td><td className="p-2">{['pending','approved'].includes(o.status) && <button type="button" disabled={saving} className={button} onClick={() => changeStatus(o.id,o.status === 'pending' ? 'approved' : 'delivered')}>{o.status === 'pending' ? 'Approve' : 'Receive'}</button>}</td></tr>)}</tbody></table></div></section>}
    <Dialog.Root open={modal !== null} onOpenChange={open => { if (!open && !creating) setModal(null); }}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 bg-black/40 z-[60]"/><Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-[calc(100%_-_2rem)] max-w-lg max-h-[90vh] overflow-auto rounded-xl bg-white p-6 shadow-xl"><Dialog.Title className="text-lg font-semibold">{modal === 'product' ? 'Add new product' : 'Add new supplier'}</Dialog.Title><Dialog.Description className="text-sm text-gray-500 mt-1">{modal === 'product' ? 'Create a product at the selected location and add it to this purchase.' : 'Create a supplier and select it for this purchase.'}</Dialog.Description><Dialog.Close disabled={creating} aria-label="Close" className="absolute right-4 top-4"><X size={18}/></Dialog.Close>
      <form onSubmit={createInline} className="mt-5 space-y-4"><fieldset disabled={creating} className="space-y-4"><label className="block text-sm">Name *<input className={`${field} mt-1`} name="name" required pattern=".*\S.*" maxLength={150} defaultValue={modal === 'product' ? search : supplierSearch}/></label>
      {modal === 'product' ? <><div className="grid grid-cols-2 gap-3"><label className="text-sm">SKU<input className={`${field} mt-1`} name="sku" maxLength={100}/></label><label className="text-sm">Barcode<input className={`${field} mt-1`} name="barcode" maxLength={100}/></label></div><div className="space-y-3"><label className="text-sm block">Category *<span className="mt-1 flex gap-2"><select className={field} name="categoryId" required defaultValue=""><option value="">Select category</option>{categories.map(c => <option key={c.id} value={c.id}>{c.parent_name ? `${c.parent_name} / ${c.name}` : c.name}</option>)}</select><button type="button" aria-label="Add category" className={button} onClick={() => createReference('categories')}><Plus size={16}/></button></span></label><label className="text-sm block">Unit *<span className="mt-1 flex gap-2"><select className={field} name="unitId" required defaultValue=""><option value="">Select unit</option>{units.map(u => <option key={u.id} value={u.id}>{u.name}{u.short_name ? ` (${u.short_name})` : ''}</option>)}</select><button type="button" aria-label="Add unit" className={button} onClick={() => createReference('units')}><Plus size={16}/></button></span></label><label className="text-sm block">Brand<span className="mt-1 flex gap-2"><select className={field} name="brandId" defaultValue=""><option value="">No brand</option>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><button type="button" aria-label="Add brand" className={button} onClick={() => createReference('brands')}><Plus size={16}/></button></span></label></div><div className="grid grid-cols-2 gap-3"><label className="text-sm">Unit cost<input className={`${field} mt-1`} type="number" name="cost" min={0} max={10000000} step="0.01" defaultValue={0} required/></label><label className="text-sm">Selling price<input className={`${field} mt-1`} type="number" name="price" min={0} max={100000000} step="0.01" defaultValue={0} required/></label></div></> : <><label className="block text-sm">Email<input className={`${field} mt-1`} name="email" type="email"/></label><label className="block text-sm">Phone<input className={`${field} mt-1`} name="phone" type="tel"/></label></>}
      <button className="w-full rounded-md bg-emerald-600 p-3 text-sm font-semibold text-white" type="submit">{creating ? 'Creating...' : modal === 'product' ? 'Create and add product' : 'Create supplier'}</button></fieldset></form>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </main></>;
}
