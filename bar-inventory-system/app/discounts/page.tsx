'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Plus, Trash2 } from '../components/TextMark';
import { toast } from 'sonner';
import Navbar from '../components/Navbar';
import { authApi, discountsApi, locationsApi, inventoryApi, referenceDataApi, customersApi } from '../lib/api';

const field = 'w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';

export default function DiscountsPage() {
  const [user, setUser] = useState<any>(null);
  const [locations, setLocations] = useState<any[]>([]);
  const [locationId, setLocationId] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', discountType: 'percent', value: 0, appliesTo: 'product', targetIds: [] as string[], customerRestrictionId: '', active: true });
  const [targets,setTargets]=useState<Record<string,Array<{id:number;name:string}>>>({product:[],category:[],customer:[]});

  useEffect(() => {
    (async () => {
      const [me, locs] = await Promise.all([authApi.me(), locationsApi.getAll()]);
      setUser(me.data);
      const active = locs.data.filter((l: any) => l.active !== false && Number(l.active) !== 0);
      setLocations(active); if (active[0]) setLocationId(String(active[0].id));
    })().catch(() => {});
  }, []);

  async function load() {
    if (!locationId) return;
    const { data } = await discountsApi.getAll({ locationId: Number(locationId) });
    setRows(data);
    const [products,categories,customers]=await Promise.all([inventoryApi.getAll({locationId:Number(locationId)}),referenceDataApi.getAll('categories',{locationId:Number(locationId)}),customersApi.getAll()]);
    setTargets({product:products.data,category:categories.data,customer:customers.data});
  }
  useEffect(() => { load().catch(() => {}); }, [locationId]);

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      const targetIds=form.targetIds.map(Number);
      await Promise.all(targetIds.map(targetId=>discountsApi.create({ locationId: Number(locationId), name: form.name, discountType: form.discountType as any, value: Number(form.value), appliesTo: form.appliesTo as any, productId:form.appliesTo==='product'?targetId:null, categoryId:form.appliesTo==='category'?targetId:null, customerId:form.appliesTo==='customer'?targetId:null, customerRestrictionId:form.customerRestrictionId?Number(form.customerRestrictionId):null, active: form.active })));
      toast.success(targetIds.length>1?`Discount saved for ${targetIds.length} targets`:'Discount saved');
      setOpen(false); setForm({ name: '', discountType: 'percent', value: 0, appliesTo: 'product', targetIds:[], customerRestrictionId:'', active: true });
      await load();
    } catch (err: any) { toast.error(err.response?.data?.message || 'Failed to save discount'); }
  }

  async function remove(id: number) {
    if (!confirm('Delete this discount?')) return;
    await discountsApi.delete(id);
    setRows(current => current.filter(row => row.id !== id));
  }

  if (!user) return <div className="min-h-screen bg-gray-50" />;
  return <div className="min-h-screen bg-gray-50"><Navbar user={user}/><main className="p-4 lg:p-8 space-y-5">
    <div className="flex items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Discounts</h1><p className="text-sm text-gray-500">Reusable rules for sales documents</p></div><button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-sm bg-emerald-600 px-4 py-2 text-sm text-white"><Plus size={16}/>Add</button></div>
    <select className={`${field} max-w-xs`} value={locationId} onChange={e => setLocationId(e.target.value)}>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
    <section className="rounded-sm border bg-white overflow-hidden"><table className="w-full text-sm"><thead className="bg-gray-50 text-xs text-gray-600"><tr>{['Name','Type','Value','Applies To','Customer restriction','Status',''].map(h => <th className="p-3 text-left" key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-t"><td className="p-3 font-medium">{row.name}</td><td className="p-3">{row.discount_type}</td><td className="p-3">{Number(row.value).toLocaleString()}</td><td className="p-3">{row.product_name || row.category_name || row.customer_name || row.applies_to}</td><td className="p-3">{row.customer_restriction_name || 'All customers'}</td><td className="p-3">{row.active ? 'Active' : 'Inactive'}</td><td className="p-3 text-right"><button className="p-2 text-red-600" onClick={() => remove(row.id)}><Trash2 size={16}/></button></td></tr>)}</tbody></table></section>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><form onSubmit={save} className="w-full max-w-md rounded-sm bg-white p-6 space-y-3"><h2 className="font-semibold">Add Discount</h2><input className={field} required placeholder="Name" value={form.name} onChange={e => setForm({...form, name: e.target.value})}/><select className={field} value={form.discountType} onChange={e => setForm({...form, discountType: e.target.value})}><option value="percent">Percent</option><option value="fixed">Fixed amount per unit</option></select><input className={field} type="number" min={0} step="0.01" required value={form.value} onChange={e => setForm({...form, value: Number(e.target.value)})}/><select className={field} value={form.appliesTo} onChange={e => setForm({...form, appliesTo: e.target.value, targetIds: [] ,customerRestrictionId:''})}><option value="product">Products</option><option value="category">Category</option><option value="customer">Customer</option></select><label className="block text-sm">{form.appliesTo==='product'?'Products':form.appliesTo==='category'?'Category':'Customer'}<select aria-label="Discount target" className={`${field} min-h-24`} required multiple={form.appliesTo==='product'} value={form.targetIds} onChange={e=>setForm({...form,targetIds:Array.from(e.target.selectedOptions, option=>option.value)})}><option value="">Choose {form.appliesTo}</option>{targets[form.appliesTo].map(target=><option key={target.id} value={target.id}>{target.name}</option>)}</select>{form.appliesTo==='product'&&<span className="text-xs text-gray-500">Select one or more products (Ctrl-click to select several).</span>}</label>{form.appliesTo!=='customer'&&<label className="block text-sm">Customer restriction (optional)<select className={field} value={form.customerRestrictionId} onChange={e=>setForm({...form,customerRestrictionId:e.target.value})}><option value="">All customers</option>{targets.customer.map(customer=><option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={e => setForm({...form, active: e.target.checked})}/>Active</label><div className="flex gap-2"><button type="button" onClick={() => setOpen(false)} className="flex-1 rounded-sm border px-3 py-2">Cancel</button><button className="flex-1 rounded-sm bg-emerald-600 px-3 py-2 text-white">Save</button></div></form></div>}
  </main></div>;
}
