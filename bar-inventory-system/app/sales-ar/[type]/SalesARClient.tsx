'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { FileText, Plus, Search, Trash2 } from '../../components/TextMark';
import { toast } from 'sonner';
import Link from 'next/link';
import DocumentView from '../../components/sales/DocumentView';
import {documentMeta,documentNumber,statusLabel,canEdit,nextTypes} from '../../lib/salesDocuments';
import {downloadCsv} from '../../lib/csv';
import Navbar from '../../components/Navbar';
import { authApi, customersApi, inventoryApi, locationsApi, salesDocumentsApi } from '../../lib/api';

type DocType = 'quotation' | 'sales_order' | 'proforma' | 'invoice' | 'credit_note';
type Product = { id: number; name: string; sku?: string; barcode?: string; stock: number; price: number; unit: string };
type Customer = { id: number; name: string; phone?: string; balance?: number; credit_limit?: number };
type Line = { product: Product; quantity: number; unitPrice: number; discountPercent: number; discountAmount: number; discountType: 'fixed' | 'percentage'; taxPercent: number };

const meta: Record<DocType, { title: string; label: string }> = {
  quotation: { title: 'Quotations', label: 'Quotation' },
  sales_order: { title: 'Sales Orders', label: 'Sales Order' },
  proforma: { title: 'Proforma Invoices', label: 'Proforma' },
  invoice: { title: 'Invoices', label: 'Invoice' },
  credit_note: { title: 'Credit Notes', label: 'Credit Note' },
};

const field = 'w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';
const money = (n: number) => n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
function calc(line: Line) {
  const round=(n:number)=>Math.round(n*100)/100;
  const gross = round(line.quantity * line.unitPrice);
  const discount = line.discountType === 'percentage' 
    ? round(gross * line.discountPercent / 100)
    : round(line.discountAmount);
  const subtotal = round(gross - discount);
  const tax = round(subtotal * line.taxPercent / 100);
  return { subtotal, tax, total: round(subtotal + tax) };
}

export default function SalesARPage() {
  const params = useParams<{ type: DocType }>();
  const router = useRouter();
  const query=useSearchParams();
  const [editor,setEditor]=useState(false),[editingId,setEditingId]=useState<number|null>(null),[saveId,setSaveId]=useState(''),[view,setView]=useState<any>(null),[printToken,setPrintToken]=useState(0),[actionBusy,setActionBusy]=useState(false),[viewLoading,setViewLoading]=useState(false),[listLoading,setListLoading]=useState(false),[listError,setListError]=useState(''),[search,setSearch]=useState(''),[filterStatus,setFilterStatus]=useState(''),[page,setPage]=useState(1),[pageSize,setPageSize]=useState(25);
  const[notes,setNotes]=useState(''),[staffNotes,setStaffNotes]=useState(''),[terms,setTerms]=useState(''),[dueDate,setDueDate]=useState(''),[validUntil,setValidUntil]=useState(''),[invoiceStatus,setInvoiceStatus]=useState('draft');
  const mutation=useRef(false),viewVersion=useRef(0),listVersion=useRef(0),autoOpenedNew=useRef<string|null>(null);
  const type = params.type;
  const [user, setUser] = useState<any>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [invoiceOptions, setInvoiceOptions] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [locationId, setLocationId] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [date, setDate] = useState(today);
  const [status, setStatus] = useState('draft');
  const [referenceInvoiceId, setReferenceInvoiceId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [saving, setSaving] = useState(false);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', creditLimit: 0 });
  const version = useRef(0);

  useEffect(() => {
    if (!Object.keys(meta).includes(type)) router.replace('/sales');
  }, [router, type]);

  useEffect(() => {
    let live = true;
    (async () => {
      const [me, c, l] = await Promise.all([authApi.me(), customersApi.getAll(), locationsApi.getAll()]);
      if (!live) return;
      setUser(me.data); setCustomers(c.data);
      const active = l.data.filter((x: any) => x.active !== false && Number(x.active) !== 0);
      setLocations(active); if (active[0]) setLocationId(String(active[0].id));
    })().catch(() => router.replace('/login'));
    return () => { live = false; };
  }, [router]);

  async function loadDocuments() {
    if(!locationId)return;const version=++listVersion.current;setListLoading(true);
    try{const {data}=await salesDocumentsApi.getAll({type,locationId:Number(locationId)});if(version===listVersion.current){setDocuments(data);setListError('');}if(type==='credit_note')setInvoiceOptions((await salesDocumentsApi.getAll({type:'invoice',locationId:Number(locationId)})).data.filter((d:any)=>d.status!=='draft'));}
    catch(e:any){if(version===listVersion.current)setListError(e.response?.data?.message||'Unable to load documents');}
    finally{if(version===listVersion.current)setListLoading(false);}
  }
  useEffect(()=>{loadDocuments();},[type,locationId]);
  useEffect(()=>{setEditor(false);setLines([]);setView(null);setFilterStatus('');setPage(1);},[type]);
  useEffect(()=>{const id=Number(query.get('view'));if(id>0)openView(id);},[query,type]);
  useEffect(()=>{setPage(1);},[search,filterStatus,pageSize,locationId]);
  async function openView(id:number,print=false){const v=++viewVersion.current;setViewLoading(true);try{const d=(await salesDocumentsApi.getOne(id)).data;if(v===viewVersion.current){setView(d);if(d.location_id)setLocationId(String(d.location_id));setPrintToken(n=>print?n+1:0);}}catch(e:any){toast.error(e.response?.data?.message||'Unable to open document');}finally{if(v===viewVersion.current)setViewLoading(false);}}
  function closeView(){viewVersion.current++;setView(null);setPrintToken(0);if(query.get('view'))router.replace('/sales-ar/'+type);}
  function newDocument(){
    setEditingId(null);
    setSaveId(crypto.randomUUID());
    setLines([]);
    setNotes('');
    setStaffNotes('');
    setTerms('');
    setDueDate(type === 'invoice' ? today() : '');
    setValidUntil('');
    setReferenceNo('');
    setDate(today());
    setStatus(type === 'quotation' ? 'quotation' : type === 'proforma' ? 'proforma' : 'draft');
    setInvoiceStatus(type === 'invoice' ? 'issued' : 'draft');
    setReferenceInvoiceId(type === 'credit_note' ? query.get('invoice') || '' : '');
    setPaymentAmount(0);
    setEditor(true);
    setCustomerId(type === 'invoice' ? 'walkin' : '');
    setCustomerSearch('');
  }
  useEffect(()=>{
    if(query.get('new')!=='1'){autoOpenedNew.current=null;return;}
    if(!locationId||!['invoice','quotation','credit_note'].includes(type))return;
    const invoiceId=type==='credit_note'?query.get('invoice'):null;
    if(type==='credit_note'&&!invoiceId)return;
    const openKey=`${type}:${invoiceId||''}`;
    if(autoOpenedNew.current===openKey)return;
    autoOpenedNew.current=openKey;
    newDocument();
    if(type==='credit_note'&&invoiceId) salesDocumentsApi.getOne(Number(invoiceId)).then(({data})=>{
      setCustomerId(String(data.customer_id||''));
      setCustomerSearch(data.customer_name||'');
      if(data.location_id)setLocationId(String(data.location_id));
    }).catch(e=>toast.error(e.response?.data?.message||'Unable to load the invoice for this credit note'));
    router.replace('/sales-ar/'+type);
  },[locationId,query,router,type]);
  async function editDocument(doc:any){try{const d=doc.items?doc:(await salesDocumentsApi.getOne(doc.id)).data;const products=(await inventoryApi.getAll({locationId:Number(d.location_id)})).data;setLocationId(String(d.location_id));setCustomerId(String(d.customer_id||''));setCustomerSearch(d.customer_name||'');setDate(String(d.document_date).slice(0,10));setReferenceNo(d.reference_no||'');setStatus(d.status);setInvoiceStatus('draft');setNotes(d.notes||'');setStaffNotes(d.staff_notes||'');setTerms(d.terms||'');setDueDate(d.due_date?String(d.due_date).slice(0,10):'');setValidUntil(d.valid_until?String(d.valid_until).slice(0,10):'');setEditingId(d.id);setSaveId(crypto.randomUUID());setLines(d.items.map((l:any)=>({product:products.find((p:any)=>p.id===l.item_id)||{id:l.item_id,name:l.item_name,stock:0,unit:l.unit||'',price:l.unit_price},quantity:Number(l.quantity),unitPrice:Number(l.unit_price),discountPercent:Number(l.discount_percent),taxPercent:Number(l.tax_percent)})));closeView();setEditor(true);}catch(e:any){toast.error(e.response?.data?.message||'Unable to edit draft');}}
  function navigate(d:any){setView(null);setPrintToken(0);router.push('/sales-ar/'+d.type+'?view='+d.id);}
  async function documentAction(action:'issue'|'payment',data:any){if(!view||mutation.current)return false;mutation.current=true;setActionBusy(true);try{const result=action==='issue'?await salesDocumentsApi.issue(view.id,data):await salesDocumentsApi.addPayment(view.id,data);setView(result.data);toast.success(action==='issue'?'Invoice issued':'Payment recorded');await loadDocuments();return true;}catch(e:any){toast.error(e.response?.data?.message||e.response?.data?.error||'Unable to complete this action');return false;}finally{mutation.current=false;setActionBusy(false);}}

  useEffect(() => {
    const current = ++version.current;
    if (!productSearch.trim() || !locationId) { setResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const { data } = await inventoryApi.getAll({ search: productSearch.trim(), locationId: Number(locationId) });
        if (current === version.current) setResults(data);
      } catch {}
    }, 200);
    return () => { clearTimeout(timer); ++version.current; };
  }, [productSearch, locationId]);

  const customerMatches = customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()));
  const totals = useMemo(() => lines.reduce((sum, line) => sum + calc(line).total, 0), [lines]);

  function addProduct(product: Product) {
    const existing=lines.find(line=>line.product.id===product.id);
    if(type==='invoice'&&invoiceStatus==='issued'&&Number(product.stock)<(existing?.quantity||0)+1){toast.error(`Cannot issue this invoice: ${product.name} has only ${product.stock} in stock`);return;}
    setLines(current => current.some(l => l.product.id === product.id)
      ? current.map(l => l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l)
      : [...current, { product, quantity: 1, unitPrice: Number(product.price), discountPercent: 0, discountAmount: 0, discountType: 'percentage', taxPercent: 0 }]);
    setProductSearch(''); setResults([]);
  }

  function editLine(index: number, key: keyof Omit<Line, 'product' | 'discountType'>, value: number | string) {
    setLines(current => current.map((line, i) => i === index ? { ...line, [key]: value } : line));
  }
  function setDiscountType(index: number, type: 'fixed' | 'percentage') {
    setLines(current => current.map((line, i) => i === index ? { ...line, discountType: type } : line));
  }

  async function addCustomer(e:FormEvent){e.preventDefault();if(mutation.current)return;mutation.current=true;setActionBusy(true);try{const {data}=await customersApi.create(newCustomer);setCustomers(current=>[data,...current]);setCustomerId(String(data.id));setCustomerSearch(data.name);setNewCustomerOpen(false);setNewCustomer({name:'',phone:'',creditLimit:0});toast.success('Customer added');}catch(e:any){toast.error(e.response?.data?.error||e.response?.data?.message||'Unable to add customer');}finally{mutation.current=false;setActionBusy(false);}}
  async function save(e:FormEvent){e.preventDefault();if(mutation.current||!locationId||!lines.length)return;if(type!=='credit_note'&&!customerId)return toast.error('Choose a customer from the list');if(type==='credit_note'&&!referenceInvoiceId)return toast.error('Select the original invoice');if(type==='invoice'&&invoiceStatus==='issued'){const unavailable=lines.find(line=>Number(line.product.stock)<line.quantity);if(unavailable)return toast.error(`Cannot issue this invoice: ${unavailable.product.name} has ${unavailable.product.stock} in stock but ${unavailable.quantity} requested`);}mutation.current=true;setSaving(true);
    try{const payload={type,customerId:customerId&&customerId!=='walkin'?Number(customerId):null,referenceNo,date,locationId:Number(locationId),status:type==='invoice'?invoiceStatus:type==='credit_note'?'issued':type==='proforma'?'proforma':type==='quotation'?'quotation':status,referenceInvoiceId:referenceInvoiceId?Number(referenceInvoiceId):null,notes,staffNotes,terms,dueDate,validUntil,requestId:saveId,payment:type==='invoice'&&invoiceStatus==='issued'&&paymentAmount>0?{amount:paymentAmount,method:paymentMethod}:undefined,items:lines.map(l=>({itemId:l.product.id,quantity:l.quantity,unitPrice:l.unitPrice,discountPercent:l.discountType==='percentage'?l.discountPercent:0,discountAmount:l.discountType==='fixed'?l.discountAmount:0,taxPercent:l.taxPercent}))};const {data}=editingId?await salesDocumentsApi.update(editingId,payload):await salesDocumentsApi.create(payload);toast.success(documentNumber(data)+' saved');setEditor(false);setLines([]);setEditingId(null);setPrintToken(0);setView(data);await loadDocuments();}catch(e:any){toast.error(e.response?.data?.message||e.response?.data?.error||'Unable to save document');}finally{mutation.current=false;setSaving(false);}}
  async function convert(id:number,targetType:string){if(mutation.current)return;mutation.current=true;setActionBusy(true);try{const {data}=await salesDocumentsApi.convert(id,targetType,{status:targetType==='invoice'?'draft':undefined});toast.success(documentNumber(data)+' created');setPrintToken(0);setView(data);router.push('/sales-ar/'+data.type+'?view='+data.id);}catch(e:any){toast.error(e.response?.data?.message||'Conversion failed');}finally{mutation.current=false;setActionBusy(false);}}
  const filtered=documents.filter(d=>(!filterStatus||d.status===filterStatus)&&[documentNumber(d),d.reference_no,d.customer_name,d.customer_phone].join(' ').toLowerCase().includes(search.toLowerCase()));
  const pages=Math.max(1,Math.ceil(filtered.length/pageSize)),currentPage=Math.min(page,pages),shown=filtered.slice((currentPage-1)*pageSize,currentPage*pageSize);
  function exportCsv(){downloadCsv(type+'-documents.csv',[['Document','Customer reference','Date','Customer','Status','Total','Paid','Due'],...filtered.map(d=>[documentNumber(d),d.reference_no,String(d.document_date).slice(0,10),d.customer_name,statusLabel(d.status),d.total,d.paid_amount,d.balance_due])]);}

  if(!user)return <p role="status" className="p-8">Loading sales workspace...</p>;
  if(!meta[type])return null;
  return <div className="min-h-screen bg-gray-50"><Navbar user={user}/><main className="p-4 lg:p-8 space-y-6">
    <nav aria-label="Sales documents" className="flex flex-wrap gap-5 border-b pb-4 text-sm">{Object.entries(meta).map(([key,value])=><Link key={key} href={'/sales-ar/'+key} className={key===type?'font-bold underline':''}>{value.title}</Link>)}</nav>
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">{meta[type].title}</h1><p className="text-sm text-gray-600 mt-2">{type==='invoice'?'Prepare a draft, review it, then issue once. Track payments against the same invoice.':'Create, review and carry agreed details into the next document.'}</p></div><button className="bg-brand text-white px-4 py-2" onClick={newDocument}>Add {meta[type].label.toLowerCase()}</button></header>
    {editor&&<section className="border bg-white p-5 space-y-4">    <form onSubmit={save} className="space-y-5"><h2 className="text-xl">{editingId?'Edit':'New'} {meta[type].label.toLowerCase()}</h2>
      <fieldset disabled={saving} className="contents"><section className="rounded-sm border bg-white p-5 grid gap-4 md:grid-cols-3">
        <label className="text-sm">Customer *<span className="mt-1 flex gap-2"><select className={field} required={type!=='credit_note'} value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">Choose customer (or Walk-in)</option><option value="walkin">Walk-in Customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.name}{c.phone?' / '+c.phone:''}</option>)}</select><button type="button" className="border px-3" onClick={()=>setNewCustomerOpen(true)}>Add customer</button></span></label>
        <label className="text-sm">Reference No<input className={`${field} mt-1`} value={referenceNo} maxLength={100} onChange={e => setReferenceNo(e.target.value)}/></label>
        <label className="text-sm">Date<input type="date" className={`${field} mt-1`} value={date} onChange={e => setDate(e.target.value)}/></label>
        <label className="text-sm">Business Location<select className={`${field} mt-1`} value={locationId} disabled={lines.length > 0} onChange={e => setLocationId(e.target.value)}>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        {type==='invoice'?<label className="text-sm">Save as<select className={`${field} mt-1`} value={invoiceStatus} onChange={e=>setInvoiceStatus(e.target.value)}><option value="draft">Draft / review before issue</option>{!editingId&&<option value="issued">Issue now / deduct stock</option>}</select></label>:type!=='credit_note'&&<label className="text-sm">Status<select className={`${field} mt-1`} value={status} onChange={e=>setStatus(e.target.value)}><option value="draft">Draft</option><option value="sent">Sent</option><option value="accepted">Accepted</option></select></label>}
        {type==='invoice'?<label className="text-sm">Due date<input className={`${field} mt-1`} type="date" min={date} value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label>:type!=='credit_note'&&<label className="text-sm">Valid until<input className={`${field} mt-1`} type="date" min={date} value={validUntil} onChange={e=>setValidUntil(e.target.value)}/></label>}
        {type === 'credit_note' && <label className="text-sm">Reference Invoice<select required className={`${field} mt-1`} value={referenceInvoiceId} onChange={e => setReferenceInvoiceId(e.target.value)}><option value="">Select invoice</option>{invoiceOptions.map(d => <option key={d.id} value={d.id}>#{d.id} {d.customer_name} KES {money(Number(d.total))}</option>)}</select></label>}
      </section>
      <section className="rounded-sm border bg-white p-5 space-y-4">
        <div className="relative"><Search className="absolute left-3 top-3 text-gray-400" size={17}/><input className={`${field} pl-10`} placeholder="Enter Product name / SKU / Scan barcode" value={productSearch} onChange={e => setProductSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (results[0]) addProduct(results[0]); } }}/>{!!results.length && <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-sm border bg-white ">{results.map(p => {const unavailable=type==='invoice'&&invoiceStatus==='issued'&&Number(p.stock)<=0;return <button key={p.id} type="button" disabled={unavailable} className="block w-full p-3 text-left hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => addProduct(p)}><span className="block text-sm font-medium">{p.name}{unavailable&&<span className="ml-2 text-red-600">Out of stock</span>}</span><span className="text-xs text-gray-500">{p.sku || p.barcode || p.unit} · Stock: {p.stock} · KES {money(Number(p.price))}</span></button>;})}</div>}</div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-xs text-gray-600"><tr>{['Product','Qty','Unit Price','Discount','Tax %','Line Total',''].map(h => <th className="p-3 text-left" key={h}>{h}</th>)}</tr></thead><tbody>{!lines.length && <tr><td colSpan={7} className="p-10 text-center text-gray-400"><FileText className="mx-auto mb-2"/>Search or scan a product</td></tr>}{lines.map((line, i) => <tr key={line.product.id} className="border-t"><td className="p-3"><p className="font-medium">{line.product.name}</p><p className="text-xs text-gray-500">Stock: {line.product.stock} {line.product.unit}</p></td><td className="p-3"><input className={field} type="number" min={1} value={line.quantity} onChange={e => editLine(i, 'quantity', e.target.value === '' ? '' : Number(e.target.value))}/></td><td className="p-3"><input className={field} type="number" min={0} step="0.01" value={line.unitPrice} onChange={e => editLine(i, 'unitPrice', e.target.value === '' ? '' : Number(e.target.value))}/></td><td className="p-3"><div className="flex flex-col gap-1"><select className="text-[10px] border p-1 rounded-sm" value={line.discountType} onChange={e=>setDiscountType(i, e.target.value as any)}><option value="percentage">Percentage (%)</option><option value="fixed">Fixed (KES)</option></select>{line.discountType==='percentage'?<input className={field} type="number" min={0} max={100} value={line.discountPercent} onChange={e => editLine(i, 'discountPercent', e.target.value === '' ? '' : Number(e.target.value))}/>:<input className={field} type="number" min={0} value={line.discountAmount} onChange={e => editLine(i, 'discountAmount', e.target.value === '' ? '' : Number(e.target.value))}/>}</div></td><td className="p-3"><input className={field} type="number" min={0} max={100} value={line.taxPercent} onChange={e => editLine(i, 'taxPercent', e.target.value === '' ? '' : Number(e.target.value))}/></td><td className="p-3 font-medium">KES {money(calc(line).total)}</td><td className="p-3"><button type="button" className="text-red-600 p-2 rounded-sm hover:bg-red-50" onClick={() => setLines(current => current.filter((_, n) => n !== i))}>Remove</button></td></tr>)}</tbody></table></div>
        <div className="flex items-center justify-between border-t pt-4"><span>Total Items: <strong>{lines.reduce((s,l) => s + l.quantity, 0)}</strong></span><span>Net Total Amount: <strong className="text-xl text-emerald-700">KES {money(totals)}</strong></span></div>
      </section>
      {type === 'invoice' && invoiceStatus!=='draft' && <section className="rounded-sm border bg-white p-5 grid gap-3 md:grid-cols-2"><label className="text-sm"><span className="flex items-center justify-between">Payment Amount<button type="button" className="text-xs text-emerald-700 underline disabled:text-gray-400" disabled={totals<=0} onClick={()=>setPaymentAmount(totals)}>Fill total (KES {money(totals)})</button></span><input className={`${field} mt-1`} type="number" min={0} step="0.01" max={totals} value={paymentAmount} onChange={e => setPaymentAmount(Number(e.target.value))}/></label><label className="text-sm">Payment Method<select className={`${field} mt-1`} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="bank">Bank</option></select></label></section>}
      <section className="grid sm:grid-cols-2 gap-4"><label className="text-sm">Customer note<textarea className={`${field} mt-1`} maxLength={4000} value={notes} onChange={e=>setNotes(e.target.value)}/></label><label className="text-sm">Internal staff note / not printed<textarea className={`${field} mt-1`} maxLength={4000} value={staffNotes} onChange={e=>setStaffNotes(e.target.value)}/></label><label className="text-sm">Terms<textarea className={`${field} mt-1`} maxLength={4000} value={terms} onChange={e=>setTerms(e.target.value)}/></label></section>
      <button type="button" className="border px-4 py-3 mr-3" disabled={saving} onClick={()=>setEditor(false)}>Cancel</button><button disabled={saving || !lines.length || !locationId} className="rounded-sm bg-emerald-600 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving...' : `Save ${meta[type].label}`}</button>
      </fieldset>
    </form>
</section>}
    <section className="bg-white border p-5 space-y-4"><div className="flex flex-wrap items-end gap-3"><label className="text-sm">Location<select className={`${field} mt-1`} value={locationId} disabled={editor&&lines.length>0} onChange={e=>setLocationId(e.target.value)}>{locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label><label className="text-sm">Search<input className={`${field} mt-1`} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Document, reference or customer"/></label><label className="text-sm">Status<select className={`${field} mt-1`} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}><option value="">All</option>{Array.from(new Set(documents.map(d=>d.status))).map(status=><option key={status} value={status}>{statusLabel(status)}</option>)}</select></label><button className="underline p-2" onClick={loadDocuments}>Refresh</button><button className="underline p-2" disabled={!filtered.length||listLoading} onClick={exportCsv}>Export CSV</button></div>
    {listError&&<p role="alert">{listError}</p>}{viewLoading&&<p role="status">Opening document...</p>}{listLoading?<p role="status">Loading documents...</p>:<><div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr>{['Actions','Document / reference','Date','Customer','Status','Total','Paid','Balance due'].map(h=><th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>{shown.map(d=><tr key={d.id} className="border-t"><td className="p-3"><details><summary className="cursor-pointer border px-3 py-2">Actions</summary><div className="min-w-44 space-y-1 py-2"><button disabled={actionBusy||viewLoading} onClick={()=>openView(d.id)} className="block underline p-1">View</button><button disabled={actionBusy||viewLoading} onClick={()=>openView(d.id,true)} className="block underline p-1">Print {meta[type].label.toLowerCase()}</button>{canEdit(d)&&<button disabled={actionBusy} onClick={()=>editDocument(d)} className="block underline p-1">Edit draft</button>}{nextTypes(d).map(t=><button disabled={actionBusy} key={t} onClick={()=>convert(d.id,t)} className="block underline p-1">Create {documentMeta[t].label.toLowerCase()}</button>)}{d.type==='invoice'&&d.status==='draft'&&<button onClick={()=>openView(d.id)} className="block underline p-1">Review and issue</button>}{d.type==='invoice'&&d.status!=='draft'&&<button disabled={actionBusy} onClick={()=>router.push(`/sales-ar/credit_note?new=1&invoice=${d.id}`)} className="block underline p-1">Create credit note</button>}{['invoice','pos'].includes(d.type)&&d.status!=='draft'&&<button onClick={()=>openView(d.id)} className="block underline p-1">{Number(d.balance_due)>0?'Record / view payments':'View payments'}</button>}{d.status.startsWith('converted_to_')&&<button onClick={()=>openView(d.id)} className="block underline p-1">View linked document</button>}</div></details></td><td className="p-3"><button className="underline" onClick={()=>openView(d.id)}>{documentNumber(d)}</button><span className="block text-xs text-gray-600">{d.reference_no}</span></td><td>{String(d.document_date).slice(0,10)}</td><td>{d.customer_name||'Walk-in customer'}</td><td>{statusLabel(d.status)}</td><td>KES {money(Number(d.total))}</td><td>{d.type==='invoice'&&d.status!=='draft'?money(Number(d.paid_amount)):'-'}</td><td>{d.type==='invoice'&&d.status!=='draft'?money(Number(d.balance_due)):'-'}</td></tr>)}</tbody></table>{!shown.length&&<p className="p-5">No documents match these filters.</p>}</div><footer className="flex flex-wrap justify-between gap-3 text-sm"><label>Show <select className="border p-1" value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}>{[25,50,100].map(n=><option key={n}>{n}</option>)}</select> entries</label><span>{filtered.length} documents</span><div className="space-x-3"><button disabled={currentPage<=1} onClick={()=>setPage(currentPage-1)}>Previous</button><span>{currentPage} / {pages}</span><button disabled={currentPage>=pages} onClick={()=>setPage(currentPage+1)}>Next</button></div></footer></>}
    </section>
    {view&&<DocumentView key={view.id} doc={view} printToken={printToken} busy={actionBusy} onClose={closeView} onEdit={()=>editDocument(view)} onConvert={target=>convert(view.id,target)} onNavigate={navigate} onAction={documentAction}/>}
    {newCustomerOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><form onSubmit={addCustomer} className="w-full max-w-sm rounded-sm bg-white p-6 space-y-3"><h2 className="font-semibold">Add Customer</h2><label className="block text-sm font-medium space-y-1"><span>Customer name *</span><input className={field} required placeholder="e.g. Caro" value={newCustomer.name} onChange={e => setNewCustomer({...newCustomer, name: e.target.value})}/></label><label className="block text-sm font-medium space-y-1"><span>Mobile number</span><input className={field} type="tel" placeholder="e.g. 0722369941" value={newCustomer.phone} onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})}/></label><label className="block text-sm font-medium space-y-1"><span>Credit limit (KSh)</span><input className={field} type="number" min="0" step="0.01" placeholder="0" value={newCustomer.creditLimit} onChange={e => setNewCustomer({...newCustomer, creditLimit: Number(e.target.value)})}/></label><p className="text-xs text-gray-600">Maximum unpaid balance allowed. Enter 0 to disable credit purchases.</p><div className="flex gap-2"><button type="button" onClick={() => setNewCustomerOpen(false)} className="flex-1 rounded-sm border px-3 py-2">Cancel</button><button disabled={actionBusy} className="flex-1 rounded-sm bg-emerald-600 px-3 py-2 text-white">Save</button></div></form></div>}
  </main></div>;
}
