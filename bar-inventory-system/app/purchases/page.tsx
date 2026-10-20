'use client';
import {canVisit} from '../lib/access';

import { useEffect, useRef, useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import * as Dialog from '@radix-ui/react-dialog';
import { Plus, Search, X, ShoppingCart } from '../components/TextMark';
import { toast } from 'sonner';
import Navbar from '../components/Navbar';
import PurchaseView from '../components/purchases/PurchaseView';
import { downloadCsv } from '../lib/csv';
import { authApi, inventoryApi, locationsApi, ordersApi, suppliersApi, referenceDataApi, treasuryApi } from '../lib/api';

type Product = { id: number; name: string; sku?: string; barcode?: string; stock: number; cost: number; price: number; previous_unit_price?: number; previous_discount?: number };
type Line = { product: Product; quantity: number; costBeforeDiscount: number; discountPercent: number; taxPercent: number; profitMargin: number; sellingPrice: number; accountType: string; lotNumber?: string };
type Named = { id: number; name: string; active?: boolean; phone?: string; email?: string; address?: string };
type RefRow = { id: number; name: string; short_name?: string; parent_name?: string };
const round = (n: number, digits = 2) => Number(n.toFixed(digits));
const money = (n: number) => n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function amounts(line: Line) {
  const after = round(line.costBeforeDiscount * (1 - line.discountPercent / 100), 4);
  const subtotal = round(line.quantity * after);
  return { after, subtotal, total: round(subtotal + round(subtotal * line.taxPercent / 100)), taxedUnit: after * (1 + line.taxPercent / 100) };
}
const field = 'w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';
const button = 'inline-flex items-center justify-center gap-2 rounded-sm border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const errorMessage = (err: any) => err.response?.data?.message || err.response?.data?.error || err.message || 'Unable to complete the request. Please try again.';

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
  const [transactionType, setTransactionType] = useState<'purchase' | 'opening_stock'>('purchase');
  const [payTerm, setPayTerm] = useState('Due on receipt');
  const [dueDate,setDueDate]=useState(''),[taxTreatment,setTaxTreatment]=useState('included'),[shippingCost,setShippingCost]=useState(0),[otherCost,setOtherCost]=useState(0),[shippingDetails,setShippingDetails]=useState(''),[otherCostNote,setOtherCostNote]=useState(''),[notes,setNotes]=useState('');
  const [paymentAmount,setPaymentAmount]=useState(0),[paymentMethod,setPaymentMethod]=useState('cash'),[paymentAccount,setPaymentAccount]=useState(''),[paymentReference,setPaymentReference]=useState('');
  const [treasury,setTreasury]=useState<any[]>([]),[view,setView]=useState<any>(null),[editingId,setEditingId]=useState<number|null>(null),[editor,setEditor]=useState(false),[attempted,setAttempted]=useState(false);
  const [listSearch,setListSearch]=useState(''),[filter,setFilter]=useState('all'),[page,setPage]=useState(1);
  const requestId=useRef('');
  useEffect(()=>{requestId.current=crypto.randomUUID();if(window.location.pathname.endsWith('/create'))setEditor(true);},[]);
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
  const inlineRequest=useRef('');useEffect(()=>{inlineRequest.current=crypto.randomUUID();},[modal]);
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

  async function loadOrders() { const res = await ordersApi.getAll(); setRecent(res.data.filter((o: any) => o.transaction_type !== 'opening_stock')); }
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const me = await authApi.me();
        if (!canVisit(me.data.access,window.location.pathname)) { router.replace('/pos'); return; }
        const [s, l, o, t] = await Promise.all([suppliersApi.getAll(), locationsApi.getAll(), ordersApi.getAll(), treasuryApi.getAll().catch(()=>({data:[]}))]);
        if (!live) return;
        setUser(me.data); setTreasury(t.data); setSuppliers(s.data); setLocations(l.data.filter((x: Named) => x.active !== false && Number(x.active) !== 0));
        setRecent(o.data.filter((x: any) => x.transaction_type !== 'opening_stock'));
        const itemId=new URLSearchParams(window.location.search).get('itemId');if(itemId){const p=await inventoryApi.getOne(Number(itemId));if(live){setLocationId(String(p.data.location_id));addProduct(p.data);setEditor(true);}}
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
    saveLock.current = true; setSaving(true); setAttempted(true);
    try {
      const payload = { requestId:requestId.current,supplierId: transactionType==='opening_stock'?undefined:Number(supplierId), referenceNo, purchaseDate, status, locationId: Number(locationId), payTerm,dueDate,taxTreatment,shippingCost,otherCost,shippingDetails,otherCostNote,notes,transactionType,payment:status==='delivered'&&paymentAmount>0?{amount:paymentAmount,method:paymentMethod,treasuryId:Number(paymentAccount)||undefined,referenceNo:paymentReference}:undefined,
        items: lines.map(l => ({ itemId: l.product.id, quantity: l.quantity, unitPrice: amounts(l).after, costBeforeDiscount: l.costBeforeDiscount, discountPercent: l.discountPercent, taxPercent: l.taxPercent, profitMargin: l.profitMargin, sellingPrice: l.sellingPrice, accountType: l.accountType,lotNumber:l.lotNumber })) };
      const res = editingId ? await ordersApi.update(editingId,payload) : await ordersApi.create(payload);
      const label=transactionType==='opening_stock'?'Opening stock':'Purchase',shop=locations.find(location=>String(location.id)===locationId)?.name||'selected shop',units=lines.reduce((sum,line)=>sum+Number(line.quantity),0);toast.success(status==='delivered'?`${label} #${res.data.id}: ${units} units received at ${shop}.`:`${label} #${res.data.id} saved as ${status}; stock updates when received.`);
      clearEditor();setEditor(false);setView(res.data);
      loadOrders().catch(() => toast.error('Purchase saved, but the purchase list could not refresh.'));
    } catch (err:any) { if(err.response)setAttempted(false);toast.error(errorMessage(err)); }
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
        if (!unit) throw new Error('Choose a unit');
        const res = await inventoryApi.create({ requestId:inlineRequest.current,name: String(values.name).trim(), category: category?.name || '', unit: unit.name, brand: brand?.name, categoryId: category?.id, unitId: unit.id, brandId: brand?.id, sku: String(values.sku), barcode: String(values.barcode), stock: 0, cost: Number(values.cost), price: Number(values.price), threshold: 5, locationId: Number(locationId), supplierId: Number(supplierId) || undefined });
        addProduct(res.data); toast.success('Product created and added');
      } else {
        const res = await suppliersApi.create({ name: String(values.name).trim(), email: String(values.email), phone: String(values.phone), address:String(values.address||'') });
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
    try { const r=await ordersApi.updateStatus(id, next); setView(r.data);toast.success(next === 'delivered' ? 'Goods received and supplier bill posted' : next==='cancelled'?'Purchase cancelled':'Purchase approved'); await loadOrders(); }
    catch (err) { toast.error(errorMessage(err)); }
    finally { saveLock.current = false; setSaving(false); }
  }
  const itemTotal = round(lines.reduce((sum, l) => sum + amounts(l).total, 0));
  const total=round(itemTotal+shippingCost+otherCost);
  const supplier= suppliers.find(s=>String(s.id)===supplierId);
  const filtered=recent.filter(o=>(filter==='all'||filter==='unpaid'&&Number(o.balance_due)>0||o.status===filter)&&[o.reference_no,o.id,o.supplier_name,o.location_name].join(' ').toLowerCase().includes(listSearch.toLowerCase()));
  const pages=Math.max(1,Math.ceil(filtered.length/25)),visible=filtered.slice((Math.min(page,pages)-1)*25,Math.min(page,pages)*25);
  async function openPurchase(id:number){try{const r=await ordersApi.getOne(id);setView(r.data);}catch(e){toast.error(errorMessage(e));}}
  function clearEditor(){setEditingId(null);setAttempted(false);setStatus('delivered');setTransactionType('purchase');setPurchaseDate(today());setPayTerm('Due on receipt');requestId.current=crypto.randomUUID();setLines([]);setReferenceNo('');setDueDate('');setTaxTreatment('included');setShippingCost(0);setOtherCost(0);setNotes('');setShippingDetails('');setOtherCostNote('');setPaymentAmount(0);setPaymentReference('');setSearch('');}
  function editPurchase(o:any){clearEditor();setEditingId(o.id);setTransactionType(o.transaction_type||'purchase');setSupplierId(String(o.supplier_id));setSupplierSearch(o.supplier?.name||o.supplier_name);setLocationId(String(o.location_id));setReferenceNo(o.reference_no||'');setPurchaseDate(String(o.purchase_date||o.created_at).slice(0,10));setDueDate(o.due_date?String(o.due_date).slice(0,10):'');setStatus(o.status);setPayTerm(o.pay_term||'Due on receipt');setNotes(o.notes||'');setShippingCost(Number(o.shipping_cost||0));setOtherCost(Number(o.other_cost||0));setShippingDetails(o.shipping_details||'');setOtherCostNote(o.other_cost_note||'');setTaxTreatment(o.tax_treatment||'included');setLines(o.items.map((l:any)=>({product:{id:l.item_id,name:l.item_name,stock:0,cost:Number(l.unit_price),price:Number(l.selling_price||0)},quantity:Number(l.quantity),costBeforeDiscount:Number(l.cost_before_discount??l.unit_price),discountPercent:Number(l.discount_percent||0),taxPercent:Number(l.tax_percent||0),profitMargin:Number(l.profit_margin||0),sellingPrice:Number(l.selling_price||0),accountType:l.account_type||'asset',lotNumber:l.lot_number||''})));setView(null);setEditor(true);window.scrollTo({top:0,behavior:'smooth'});}

  function numberInput(line: Line, index: number, key: keyof Omit<Line,'product' | 'accountType'>, label: string, min = 0, max?: number, step: number | string = 'any') {
    return <input aria-label={`${label} for ${line.product.name}`} className={`${field} min-w-24`} type="number" required min={min} max={max} step={step} value={line[key]} onChange={e => edit(index, key, Number(e.target.value))} />;
  }
  return <><Navbar user={user} /><main className="p-4 lg:p-8 space-y-6">
    <div className="flex justify-between gap-4"><div><h1 className="text-2xl font-semibold text-gray-900">{editor?(editingId?`Edit purchase #${editingId}`:'Add purchase'):'Purchases A/P'}</h1><p className="mt-1 text-sm text-gray-500">{editor?'Choose a supplier and location, then search or scan products.':'Receive goods, track supplier bills, and record payments.'}</p></div><button type="button" className={button} onClick={()=>{clearEditor();setEditor(!editor);}}>{editor?'Back to purchases':'Add purchase'}</button></div>
    {initialError && <p role="alert" className="rounded-sm bg-red-50 p-4 text-red-700">{initialError}</p>}
    {editor&&<form onSubmit={save} className="space-y-6"><fieldset disabled={saving || !user || attempted} className="space-y-6 min-w-0">
      <section className="rounded-sm border bg-white p-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <label className="text-sm font-medium">Transaction Type<select className={`${field} mt-2`} value={transactionType} onChange={e => setTransactionType(e.target.value as any)}><option value="purchase">Purchase (Supplier bill)</option><option value="opening_stock">Opening stock (Equity)</option></select></label>
        {transactionType === 'purchase' ? (
          <div><label htmlFor="supplier" className="block text-sm font-medium mb-2">Supplier *</label><div className="flex gap-2"><div className="relative flex-1"><input id="supplier" className={field} placeholder="Search supplier" value={supplierSearch} required autoComplete="off" role="combobox" aria-expanded={supplierOpen} aria-controls="supplier-results" onFocus={() => setSupplierOpen(true)} onBlur={() => setTimeout(() => setSupplierOpen(false), 150)} onChange={e => { setSupplierSearch(e.target.value); setSupplierId(''); setSupplierOpen(true); }} onKeyDown={e => { if (e.key === 'Escape') setSupplierOpen(false); if (e.key === 'Enter') { e.preventDefault(); const match = suppliers.filter(s => [s.name,s.phone,s.email].join(' ').toLowerCase().includes(supplierSearch.toLowerCase()))[0]; if (match) { setSupplierId(String(match.id)); setSupplierSearch(match.name); setSupplierOpen(false); } } }} />
          {supplierOpen && <div id="supplier-results" role="listbox" className="absolute z-30 mt-1 max-h-56 overflow-auto w-full rounded-sm border bg-white ">{suppliers.filter(s => [s.name,s.phone,s.email].join(' ').toLowerCase().includes(supplierSearch.toLowerCase())).map(s => <button type="button" role="option" aria-selected={String(s.id) === supplierId} key={s.id} className="block w-full px-3 py-2 text-left text-sm hover:bg-emerald-50" onMouseDown={e => e.preventDefault()} onClick={() => { setSupplierId(String(s.id)); setSupplierSearch(s.name); setSupplierOpen(false); }}>{s.name}<span className="block text-xs text-gray-500">{s.phone} {s.email}</span></button>)}{!suppliers.some(s => [s.name,s.phone,s.email].join(' ').toLowerCase().includes(supplierSearch.toLowerCase())) && <p className="p-3 text-sm text-gray-500">No suppliers found. Add a supplier.</p>}</div>}</div><button type="button" aria-label="Add new supplier" className={button} onClick={() => setModal('supplier')}>Add supplier</button></div>{supplier&&<p className="mt-2 text-xs text-gray-500 whitespace-pre-line">{supplier.address}{supplier.phone&&` | ${supplier.phone}`}</p>}</div>
        ) : (
          <div><label className="block text-sm font-medium mb-2">Supplier</label><p className="py-2 text-sm text-gray-500 italic">Not required for opening stock.</p></div>
        )}
        <label className="text-sm font-medium">Reference No<input className={`${field} mt-2`} maxLength={100} value={referenceNo} onChange={e => setReferenceNo(e.target.value)} placeholder={transactionType==='opening_stock'?'Optional reference':'Supplier invoice or reference'} /></label>
        <label className="text-sm font-medium">Purchase Date *<input className={`${field} mt-2`} type="date" required value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} /></label>
        <label className="text-sm font-medium">Purchase Status<select className={`${field} mt-2`} value={status} onChange={e => setStatus(e.target.value)}><option value="delivered">Received</option><option value="pending">Pending</option><option value="approved">Approved</option></select></label>
        <label className="text-sm font-medium">Business Location *<select className={`${field} mt-2`} required value={locationId} disabled={lines.length > 0} onChange={e => { setLocationId(e.target.value); setSearch(''); }}><option value="">Select location</option>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>{lines.length > 0 && <span className="text-xs text-gray-500 font-normal">Remove line items to change location.</span>}</label>
        <label className="text-sm font-medium">Due date<input type="date" min={purchaseDate} className={`${field} mt-2`} value={dueDate} onChange={e=>setDueDate(e.target.value)}/><span className="text-xs text-gray-500 font-normal">Leave blank for due on receipt.</span></label><label className="text-sm font-medium">Pay Term<input className={`${field} mt-2`} maxLength={100} value={payTerm} onChange={e => setPayTerm(e.target.value)} placeholder="e.g. Net 30 days" /><span className="text-xs text-gray-500 font-normal">Set the due date above to match these terms.</span></label>
      </section>
      <section className="rounded-sm border bg-white p-5 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3"><div className="relative flex-1"><Search className="absolute left-3 top-3 text-gray-400" size={18}/><input ref={searchInput} aria-label="Enter Product name / SKU / Scan barcode" placeholder="Enter Product name / SKU / Scan barcode" className={`${field} pl-10`} disabled={!locationId} value={search} autoComplete="off" role="combobox" aria-expanded={searchOpen && !!search} aria-controls="product-results" aria-activedescendant={searchOpen && results[active] ? `product-${results[active].id}` : undefined} onFocus={() => setSearchOpen(true)} onBlur={() => setTimeout(() => setSearchOpen(false), 150)} onChange={e => { setSearch(e.target.value); setSearchOpen(true); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void lookup(); } if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i+1, results.length-1)); setSearchOpen(true); } if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(0,i-1)); } if (e.key === 'Escape') setSearchOpen(false); }} />
        {searchOpen && search && <div id="product-results" role="listbox" className="absolute z-20 mt-1 w-full max-h-72 overflow-auto rounded-sm border bg-white ">{searching ? <p className="p-3 text-sm">Searching...</p> : searchError ? <p role="alert" className="p-3 text-sm text-red-600">{searchError}</p> : results.length ? results.map((p,i) => <button id={`product-${p.id}`} type="button" role="option" aria-selected={active === i} key={p.id} className={`w-full text-left p-3 hover:bg-emerald-50 ${active === i ? 'bg-emerald-50' : ''}`} onMouseDown={e => e.preventDefault()} onClick={() => addProduct(p)}><span className="block text-sm font-medium">{p.name}</span><span className="text-xs text-gray-500">{p.sku || p.barcode || 'No SKU'} | Stock: {p.stock} | Cost: {money(Number(p.cost))}</span></button>) : <p className="p-3 text-sm text-gray-500">No matching products at this location. Add a new product.</p>}</div>}</div><button type="button" className={button} disabled={!locationId} onClick={() => setModal('product')}><Plus size={16}/>Add new product</button></div>
        {!locationId && <p className="text-sm text-gray-500">Select a business location to search products.</p>}
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-xs text-gray-600"><tr>{['Product Name','Purchase Quantity','Unit Cost Before Discount','Discount Percent %','Unit Cost After Discount','Subtotal Before Tax','Product Tax %','Tax-inclusive Cost','Line Total','Markup %','Unit Selling Price (Inc. Tax)','Account Type','Lot reference',''].map((h,i) => <th key={i} className="text-left p-3 min-w-24">{h}</th>)}</tr></thead><tbody>
          {!lines.length && <tr><td colSpan={14} className="py-14 text-center text-gray-400"><ShoppingCart className="mx-auto mb-3" size={28}/>Search or scan a product to add your first line item.</td></tr>}
          {lines.map((l,i) => { const a = amounts(l); return <tr key={l.product.id} className="border-t align-top"><td className="p-3 min-w-52"><p className="font-medium">{l.product.name}</p><p className="text-xs text-gray-500 mt-1">{editingId?'Saved purchase line':`Current stock: ${l.product.stock}`}</p><p className="text-xs text-gray-400 mt-2">Previous unit price: {money(Number(l.product.previous_unit_price ?? l.product.cost))}<br/>Previous discount: {Number(l.product.previous_discount ?? 0)}%</p></td>
          <td className="p-3">{numberInput(l,i,'quantity','Purchase quantity',1,1000000,1)}</td><td className="p-3">{numberInput(l,i,'costBeforeDiscount','Unit cost before discount',0,10000000)}</td><td className="p-3">{numberInput(l,i,'discountPercent','Discount percent',0,100)}</td><td className="p-3 tabular-nums">{a.after.toLocaleString('en-KE',{minimumFractionDigits:2,maximumFractionDigits:4})}</td><td className="p-3 tabular-nums">{money(a.subtotal)}</td><td className="p-3">{numberInput(l,i,'taxPercent','Product tax',0,100)}</td><td className="p-3 tabular-nums">{money(a.total)}</td><td className="p-3 tabular-nums font-medium">{money(a.total)}</td><td className="p-3">{numberInput(l,i,'profitMargin','Markup',-100,100000)}</td><td className="p-3">{numberInput(l,i,'sellingPrice','Unit selling price',0,100000000)}</td><td className="p-3"><select aria-label={`Account type for ${l.product.name}`} className={`${field} min-w-28`} value={l.accountType} onChange={e => edit(i,'accountType',e.target.value)}><option value="asset">Inventory asset</option><option value="expense">Expense (no stock)</option></select></td><td className="p-3"><input aria-label={`Lot reference for ${l.product.name}`} maxLength={100} className={`${field} min-w-28`} value={l.lotNumber||''} onChange={e=>edit(i,'lotNumber',e.target.value)}/></td><td className="p-3"><button aria-label={`Delete ${l.product.name}`} type="button" className="p-2 text-red-500 hover:bg-red-50 rounded-sm" onClick={() => setLines(previous => previous.filter((_,n) => n !== i))}>Remove</button></td></tr>; })}
        </tbody></table></div>
        <div className="flex flex-wrap justify-between gap-4 border-t pt-5" aria-live="polite"><p>Total Items: <strong>{lines.reduce((sum,l) => sum+l.quantity,0)}</strong> <span className="text-gray-400 text-xs">({lines.length} products)</span></p><p>Items total: <strong className="text-xl text-emerald-700">KES {money(itemTotal)}</strong></p></div>
      </section>
      <details className="rounded-sm border bg-white"><summary className="cursor-pointer p-4 font-medium">Additional costs and notes <span className="text-xs font-normal text-gray-500">(optional)</span></summary><section className="p-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><label className="text-sm">Product tax treatment<select className={`${field} mt-2`} value={taxTreatment} onChange={e=>setTaxTreatment(e.target.value)}><option value="included">Include tax in item cost</option><option value="recoverable">Recoverable input tax (separate account)</option></select></label><label className="text-sm">Shipping cost (KES)<input type="number" min={0} step="0.01" required className={`${field} mt-2`} value={shippingCost} onChange={e=>setShippingCost(Number(e.target.value))}/></label><label className="text-sm">Other expense (KES)<input type="number" min={0} step="0.01" required className={`${field} mt-2`} value={otherCost} onChange={e=>setOtherCost(Number(e.target.value))}/></label><label className="text-sm">Shipping details<input maxLength={1000} className={`${field} mt-2`} value={shippingDetails} onChange={e=>setShippingDetails(e.target.value)}/></label><label className="text-sm">Other expense description<input maxLength={1000} className={`${field} mt-2`} value={otherCostNote} onChange={e=>setOtherCostNote(e.target.value)}/></label><label className="text-sm">Additional notes<textarea maxLength={4000} className={`${field} mt-2`} value={notes} onChange={e=>setNotes(e.target.value)}/></label><p className="sm:col-span-2 xl:col-span-3 text-xs text-gray-500">Shipping is allocated to inventory items. Other expenses use the purchase expense account. Recoverable tax posts separately to Input VAT; choose it only for tax you can recover.</p></section></details>
      {status==='delivered'&&<section className="rounded-sm border bg-white p-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><h2 className="sm:col-span-2 xl:col-span-4 font-semibold">Payment now (optional)</h2><label className="text-sm">Amount paid (KES)<input className={`${field} mt-2`} type="number" min={0} max={total} step="0.01" value={paymentAmount} onChange={e=>setPaymentAmount(Number(e.target.value))}/></label><label className="text-sm">Method<select className={`${field} mt-2`} value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}><option value="cash">Cash</option><option value="bank">Bank</option><option value="mpesa">Mobile money</option></select></label><label className="text-sm">Pay from<select className={`${field} mt-2`} value={paymentAccount} onChange={e=>setPaymentAccount(e.target.value)}><option value="">Method's configured account</option>{treasury.filter(t=>t.status==='active').map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label className="text-sm">Payment reference<input maxLength={100} className={`${field} mt-2`} value={paymentReference} onChange={e=>setPaymentReference(e.target.value)}/></label><p className="sm:col-span-2 xl:col-span-4 text-sm">Purchase total: <strong>KES {money(total)}</strong> | Balance due: <strong>KES {money(Math.max(0,total-paymentAmount))}</strong>. Leave the payment at zero to buy on credit.</p></section>}
      <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-4 border bg-white/95 p-3 shadow-lg"><p className="text-xs text-gray-500">{status === 'delivered' ? (transactionType === 'opening_stock' ? 'Opening stock updates your inventory and owner equity.' : 'Received purchases update stock and selling prices when saved.') : 'Stock will update when this purchase is received.'} Markup uses discounted unit cost including tax. It excludes allocated shipping.</p><button type="submit" disabled={!lines.length || (transactionType==='purchase' && !supplierId) || !locationId || saving} className="rounded-sm bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save Purchase'}</button></div>
    </fieldset>{attempted&&<div className="border bg-amber-50 p-4 text-sm"><p>Details are locked for a safe retry. Check the purchase list before starting a different purchase.</p><button type="submit" className={button} disabled={saving}>{saving?'Saving...':'Retry this purchase'}</button></div>}</form>}
    {!editor&&<section className="rounded-sm border bg-white p-5 space-y-4"><div className="flex flex-wrap justify-between gap-3"><h2 className="font-semibold">Supplier purchases</h2><p>Outstanding purchase A/P: <strong>KES {money(recent.reduce((n,o)=>n+Number(o.balance_due||0),0))}</strong></p></div><div className="flex flex-wrap gap-3"><input aria-label="Search purchases" placeholder="Reference, supplier or location" className={`${field} sm:max-w-xs`} value={listSearch} onChange={e=>{setListSearch(e.target.value);setPage(1);}}/><select aria-label="Filter purchases" className={`${field} sm:max-w-48`} value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}}>{[['all','All purchases'],['unpaid','Outstanding bills'],['delivered','Received'],['pending','Pending'],['approved','Approved'],['cancelled','Cancelled']].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><button className={button} onClick={()=>downloadCsv('purchases.csv',[['Reference','Supplier','Date','Location','Status','Payment status','Total','Paid','Due'],...filtered.map(o=>[o.reference_no||`#${o.id}`,o.supplier_name,String(o.purchase_date||o.created_at).slice(0,10),o.location_name,o.status,o.payment_status,o.total,o.paid_amount,o.balance_due])])}>Export CSV</button></div><div className="overflow-auto"><table className="w-full text-sm"><thead><tr>{['Reference','Supplier','Date / Due','Location','Status','Payment','Total','Paid','Due',''].map((h,i)=><th className="text-left p-2 whitespace-nowrap" key={i}>{h}</th>)}</tr></thead><tbody>{visible.map(o=><tr key={o.id} className="border-t"><td className="p-2">{o.reference_no||`#${o.id}`}</td><td className="p-2">{o.supplier_name}</td><td className="p-2 whitespace-nowrap">{String(o.purchase_date||o.created_at).slice(0,10)}<span className="block text-xs text-gray-500">{o.due_date?`Due ${String(o.due_date).slice(0,10)}`:'Due on receipt'}</span></td><td className="p-2">{o.location_name}</td><td className="p-2">{o.status==='delivered'?'Received':o.status}</td><td className="p-2">{o.payment_status==='not_due'?'Not due':o.payment_status}</td><td className="p-2 tabular-nums">{money(Number(o.total))}</td><td className="p-2 tabular-nums">{money(Number(o.paid_amount||0))}</td><td className="p-2 tabular-nums font-medium">{money(Number(o.balance_due||0))}</td><td className="p-2"><button disabled={saving} className={button} onClick={()=>openPurchase(o.id)}>View</button></td></tr>)}{!visible.length&&<tr><td className="p-8 text-center text-gray-500" colSpan={10}>No purchases found.</td></tr>}</tbody></table></div><div className="flex justify-between items-center text-sm"><span>{filtered.length} purchases | Page {Math.min(page,pages)} of {pages}</span><div className="flex gap-2"><button className={button} disabled={page<=1} onClick={()=>setPage(n=>n-1)}>Previous</button><button className={button} disabled={page>=pages} onClick={()=>setPage(n=>n+1)}>Next</button></div></div></section>}
    {view&&<PurchaseView key={view.id} purchase={view} treasury={treasury} busy={saving} onClose={()=>setView(null)} onChange={p=>{setView(p);loadOrders().catch(()=>toast.error('Payment recorded; refresh the list to see the updated balance.'));}} onStatus={changeStatus} onEdit={editPurchase}/>}
    <Dialog.Root open={modal !== null} onOpenChange={open => { if (!open && !creating) setModal(null); }}><Dialog.Portal><Dialog.Overlay className="fixed inset-0 bg-black/40 z-[60]"/><Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-[calc(100%_-_2rem)] max-w-lg max-h-[90vh] overflow-auto rounded-sm bg-white p-6 "><Dialog.Title className="text-lg font-semibold">{modal === 'product' ? 'Add new product' : 'Add new supplier'}</Dialog.Title><Dialog.Description className="text-sm text-gray-500 mt-1">{modal === 'product' ? 'Create a product at the selected location and add it to this purchase.' : 'Create a supplier and select it for this purchase.'}</Dialog.Description><Dialog.Close disabled={creating} aria-label="Close" className="absolute right-4 top-4">Close</Dialog.Close>
      <form onSubmit={createInline} className="mt-5 space-y-4"><fieldset disabled={creating} className="space-y-4"><label className="block text-sm">Name *<input className={`${field} mt-1`} name="name" required pattern=".*\S.*" maxLength={150} defaultValue={modal === 'product' ? search : supplierSearch}/></label>
      {modal === 'product' ? <><div className="grid grid-cols-2 gap-3"><label className="text-sm">SKU<input className={`${field} mt-1`} name="sku" maxLength={100}/></label><label className="text-sm">Barcode<input className={`${field} mt-1`} name="barcode" maxLength={100}/></label></div><div className="space-y-3"><label className="text-sm block">Category (optional)<span className="mt-1 flex gap-2"><select className={field} name="categoryId" defaultValue=""><option value="">No category</option>{categories.map(c => <option key={c.id} value={c.id}>{c.parent_name ? `${c.parent_name} / ${c.name}` : c.name}</option>)}</select><button type="button" aria-label="Add category" className={button} onClick={() => createReference('categories')}>Add</button></span></label><label className="text-sm block">Unit *<span className="mt-1 flex gap-2"><select className={field} name="unitId" required defaultValue=""><option value="">Select unit</option>{units.map(u => <option key={u.id} value={u.id}>{u.name}{u.short_name ? ` (${u.short_name})` : ''}</option>)}</select><button type="button" aria-label="Add unit" className={button} onClick={() => createReference('units')}>Add</button></span></label><label className="text-sm block">Brand<span className="mt-1 flex gap-2"><select className={field} name="brandId" defaultValue=""><option value="">No brand</option>{brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><button type="button" aria-label="Add brand" className={button} onClick={() => createReference('brands')}>Add</button></span></label></div><div className="grid grid-cols-2 gap-3"><label className="text-sm">Unit cost<input className={`${field} mt-1`} type="number" name="cost" min={0} max={10000000} step="0.01" defaultValue={0} required/></label><label className="text-sm">Selling price<input className={`${field} mt-1`} type="number" name="price" min={0} max={100000000} step="0.01" defaultValue={0} required/></label></div></> : <><label className="block text-sm">Email<input className={`${field} mt-1`} name="email" type="email"/></label><label className="block text-sm">Phone<input className={`${field} mt-1`} name="phone" type="tel"/></label><label className="block text-sm">Address<textarea className={`${field} mt-1`} name="address" maxLength={1000}/></label></>}
      <button className="w-full rounded-sm bg-emerald-600 p-3 text-sm font-semibold text-white" type="submit">{creating ? 'Creating...' : modal === 'product' ? 'Create and add product' : 'Create supplier'}</button></fieldset></form>
    </Dialog.Content></Dialog.Portal></Dialog.Root>
  </main></>;
}
