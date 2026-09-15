'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { FileText, Plus, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import Navbar from '../../components/Navbar';
import { authApi, customersApi, inventoryApi, locationsApi, salesDocumentsApi } from '../../lib/api';

type DocType = 'quotation' | 'sales_order' | 'proforma' | 'invoice' | 'credit_note';
type Product = { id: number; name: string; sku?: string; barcode?: string; stock: number; price: number; unit: string };
type Customer = { id: number; name: string; phone?: string; balance?: number; credit_limit?: number };
type Line = { product: Product; quantity: number; unitPrice: number; discountPercent: number; taxPercent: number };

const meta: Record<DocType, { title: string; label: string }> = {
  quotation: { title: 'Quotations', label: 'Quotation' },
  sales_order: { title: 'Sales Orders', label: 'Sales Order' },
  proforma: { title: 'Proforma Invoices', label: 'Proforma' },
  invoice: { title: 'Invoices', label: 'Invoice' },
  credit_note: { title: 'Credit Notes', label: 'Credit Note' },
};

const field = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';
const money = (n: number) => n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
function calc(line: Line) {
  const gross = line.quantity * line.unitPrice;
  const discount = gross * line.discountPercent / 100;
  const subtotal = gross - discount;
  const tax = subtotal * line.taxPercent / 100;
  return { subtotal, tax, total: subtotal + tax };
}

export default function SalesARPage() {
  const params = useParams<{ type: DocType }>();
  const router = useRouter();
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
    if (!locationId) return;
    const { data } = await salesDocumentsApi.getAll({ type, locationId: Number(locationId) });
    setDocuments(data);
    if (type === 'credit_note') {
      const invoices = await salesDocumentsApi.getAll({ type: 'invoice', locationId: Number(locationId) });
      setInvoiceOptions(invoices.data);
    }
  }
  useEffect(() => { loadDocuments().catch(() => {}); }, [type, locationId]);

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
  useEffect(() => {
    const exact = customers.find(c => c.name.toLowerCase() === customerSearch.toLowerCase());
    setCustomerId(exact ? String(exact.id) : '');
  }, [customerSearch, customers]);
  const totals = useMemo(() => lines.reduce((sum, line) => sum + calc(line).total, 0), [lines]);

  function addProduct(product: Product) {
    setLines(current => current.some(l => l.product.id === product.id)
      ? current.map(l => l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l)
      : [...current, { product, quantity: 1, unitPrice: Number(product.price), discountPercent: 0, taxPercent: 0 }]);
    setProductSearch(''); setResults([]);
  }

  function editLine(index: number, key: keyof Omit<Line, 'product'>, value: number) {
    setLines(current => current.map((line, i) => i === index ? { ...line, [key]: value } : line));
  }

  async function addCustomer(e: FormEvent) {
    e.preventDefault();
    const { data } = await customersApi.create(newCustomer);
    setCustomers(current => [data, ...current]);
    setCustomerId(String(data.id)); setCustomerSearch(data.name);
    setNewCustomerOpen(false); setNewCustomer({ name: '', phone: '', creditLimit: 0 });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (saving || !locationId || !lines.length) return;
    if (type === 'credit_note' && !referenceInvoiceId) return toast.error('Select the invoice this credit note applies to');
    setSaving(true);
    try {
      const { data } = await salesDocumentsApi.create({
        type,
        customerId: customerId ? Number(customerId) : null,
        referenceNo,
        date,
        locationId: Number(locationId),
        status: type === 'invoice' ? 'issued' : status,
        referenceInvoiceId: referenceInvoiceId ? Number(referenceInvoiceId) : null,
        payment: type === 'invoice' && paymentAmount > 0 ? { amount: paymentAmount, method: paymentMethod } : undefined,
        items: lines.map(l => ({ itemId: l.product.id, quantity: l.quantity, unitPrice: l.unitPrice, discountPercent: l.discountPercent, taxPercent: l.taxPercent })),
      });
      toast.success(`${meta[type].label} #${data.id} saved`);
      setLines([]); setReferenceNo(''); setPaymentAmount(0); await loadDocuments();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save document');
    } finally { setSaving(false); }
  }

  async function convert(id: number, targetType: 'sales_order' | 'invoice') {
    try {
      const { data } = await salesDocumentsApi.convert(id, targetType);
      toast.success(`Created ${targetType.replace('_', ' ')} #${data.id}`);
      await loadDocuments();
    } catch (err: any) { toast.error(err.response?.data?.message || 'Conversion failed'); }
  }

  if (!user) return <div className="min-h-screen bg-gray-50" />;
  return <div className="min-h-screen bg-gray-50"><Navbar user={user} /><main className="p-4 lg:p-8 space-y-6">
    <div className="flex items-center justify-between gap-3 flex-wrap"><div><h1 className="text-2xl font-semibold">{meta[type].title}</h1><p className="text-sm text-gray-500">Shared Sales A/R document workflow</p></div></div>
    <form onSubmit={save} className="space-y-5">
      <section className="rounded-lg border bg-white p-5 grid gap-4 md:grid-cols-3">
        <label className="text-sm">Customer *<span className="mt-1 flex gap-2"><input className={field} required={type !== 'credit_note'} value={customerSearch} onChange={e => { setCustomerSearch(e.target.value); setCustomerId(''); }} placeholder="Search customer" list="customer-list"/><button type="button" className="rounded-md border px-3" onClick={() => setNewCustomerOpen(true)}><Plus size={16}/></button></span></label>
        <datalist id="customer-list">{customerMatches.map(c => <option key={c.id} value={c.name}/>)}</datalist>
        <label className="text-sm">Reference No<input className={`${field} mt-1`} value={referenceNo} maxLength={100} onChange={e => setReferenceNo(e.target.value)}/></label>
        <label className="text-sm">Date<input type="date" className={`${field} mt-1`} value={date} onChange={e => setDate(e.target.value)}/></label>
        <label className="text-sm">Business Location<select className={`${field} mt-1`} value={locationId} disabled={lines.length > 0} onChange={e => setLocationId(e.target.value)}>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label className="text-sm">Status<select className={`${field} mt-1`} value={status} onChange={e => setStatus(e.target.value)}><option value="draft">Draft</option><option value="sent">Sent</option><option value="accepted">Accepted</option></select></label>
        {type === 'credit_note' && <label className="text-sm">Reference Invoice<select required className={`${field} mt-1`} value={referenceInvoiceId} onChange={e => setReferenceInvoiceId(e.target.value)}><option value="">Select invoice</option>{invoiceOptions.map(d => <option key={d.id} value={d.id}>#{d.id} {d.customer_name} KES {money(Number(d.total))}</option>)}</select></label>}
      </section>
      <section className="rounded-lg border bg-white p-5 space-y-4">
        <div className="relative"><Search className="absolute left-3 top-3 text-gray-400" size={17}/><input className={`${field} pl-10`} placeholder="Enter Product name / SKU / Scan barcode" value={productSearch} onChange={e => setProductSearch(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (results[0]) addProduct(results[0]); } }}/>{!!results.length && <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-white shadow-lg">{results.map(p => <button key={p.id} type="button" className="block w-full p-3 text-left hover:bg-emerald-50" onClick={() => addProduct(p)}><span className="block text-sm font-medium">{p.name}</span><span className="text-xs text-gray-500">{p.sku || p.barcode || p.unit} · Stock: {p.stock} · KES {money(Number(p.price))}</span></button>)}</div>}</div>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-xs text-gray-600"><tr>{['Product','Qty','Unit Price','Discount %','Tax %','Line Total',''].map(h => <th className="p-3 text-left" key={h}>{h}</th>)}</tr></thead><tbody>{!lines.length && <tr><td colSpan={7} className="p-10 text-center text-gray-400"><FileText className="mx-auto mb-2"/>Search or scan a product</td></tr>}{lines.map((line, i) => <tr key={line.product.id} className="border-t"><td className="p-3"><p className="font-medium">{line.product.name}</p><p className="text-xs text-gray-500">Stock: {line.product.stock} {line.product.unit}</p></td><td className="p-3"><input className={field} type="number" min={1} value={line.quantity} onChange={e => editLine(i, 'quantity', Number(e.target.value))}/></td><td className="p-3"><input className={field} type="number" min={0} step="0.01" value={line.unitPrice} onChange={e => editLine(i, 'unitPrice', Number(e.target.value))}/></td><td className="p-3"><input className={field} type="number" min={0} max={100} value={line.discountPercent} onChange={e => editLine(i, 'discountPercent', Number(e.target.value))}/></td><td className="p-3"><input className={field} type="number" min={0} max={100} value={line.taxPercent} onChange={e => editLine(i, 'taxPercent', Number(e.target.value))}/></td><td className="p-3 font-medium">KES {money(calc(line).total)}</td><td className="p-3"><button type="button" className="text-red-600 p-2 rounded hover:bg-red-50" onClick={() => setLines(current => current.filter((_, n) => n !== i))}><Trash2 size={16}/></button></td></tr>)}</tbody></table></div>
        <div className="flex items-center justify-between border-t pt-4"><span>Total Items: <strong>{lines.reduce((s,l) => s + l.quantity, 0)}</strong></span><span>Net Total Amount: <strong className="text-xl text-emerald-700">KES {money(totals)}</strong></span></div>
      </section>
      {type === 'invoice' && <section className="rounded-lg border bg-white p-5 grid gap-3 md:grid-cols-2"><label className="text-sm">Payment Amount<input className={`${field} mt-1`} type="number" min={0} max={totals} value={paymentAmount} onChange={e => setPaymentAmount(Number(e.target.value))}/></label><label className="text-sm">Payment Method<select className={`${field} mt-1`} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="bank">Bank</option></select></label></section>}
      <button disabled={saving || !lines.length || !locationId} className="rounded-md bg-emerald-600 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving...' : `Save ${meta[type].label}`}</button>
    </form>
    <section className="rounded-lg border bg-white p-5"><h2 className="mb-3 font-semibold">Recent {meta[type].title}</h2><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Ref','Customer','Date','Status','Total',''].map(h => <th key={h} className="p-2 text-left">{h}</th>)}</tr></thead><tbody>{documents.map(d => <tr key={d.id} className="border-t"><td className="p-2">{d.reference_no || `#${d.id}`}</td><td className="p-2">{d.customer_name || '-'}</td><td className="p-2">{String(d.document_date).slice(0,10)}</td><td className="p-2">{d.status}</td><td className="p-2">KES {money(Number(d.total))}</td><td className="p-2 text-right">{type === 'quotation' && <><button type="button" onClick={() => convert(d.id, 'sales_order')} className="mr-2 rounded border px-2 py-1 text-xs">To Order</button><button type="button" onClick={() => convert(d.id, 'invoice')} className="rounded border px-2 py-1 text-xs">To Invoice</button></>}{['sales_order','proforma'].includes(type) && <button type="button" onClick={() => convert(d.id, 'invoice')} className="rounded border px-2 py-1 text-xs">To Invoice</button>}</td></tr>)}</tbody></table></div></section>
    {newCustomerOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><form onSubmit={addCustomer} className="w-full max-w-sm rounded-lg bg-white p-6 space-y-3"><h2 className="font-semibold">Add Customer</h2><input className={field} required placeholder="Customer name" value={newCustomer.name} onChange={e => setNewCustomer({...newCustomer, name: e.target.value})}/><input className={field} placeholder="Phone" value={newCustomer.phone} onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})}/><input className={field} type="number" placeholder="Credit limit" value={newCustomer.creditLimit} onChange={e => setNewCustomer({...newCustomer, creditLimit: Number(e.target.value)})}/><div className="flex gap-2"><button type="button" onClick={() => setNewCustomerOpen(false)} className="flex-1 rounded border px-3 py-2">Cancel</button><button className="flex-1 rounded bg-emerald-600 px-3 py-2 text-white">Save</button></div></form></div>}
  </main></div>;
}
