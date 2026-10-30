'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import { authApi, inventoryApi } from '../lib/api';

type Product = {id:number;name:string;sku?:string;barcode?:string;category?:string;unit?:string;stock:number;threshold:number;cost:number;price:number;not_for_selling?:number};
const shortcuts=[
  {href:'/pos',title:'Open checkout',detail:'Scan products and complete a customer sale.'},
  {href:'/inventory',title:'Manage products',detail:'Add products, barcodes, prices and stock.'},
  {href:'/purchases',title:'Receive stock',detail:'Create supplier purchases and update inventory.'},
  {href:'/discounts',title:'Promotions',detail:'Set up discounts for eligible products.'},
  {href:'/reports',title:'Sales reports',detail:'Review sales, stock and business performance.'},
  {href:'/loyalty',title:'Customer loyalty',detail:'Manage rewards and customer points.'},
];

export default function SupermarketPage(){
  const [user,setUser]=useState<any>(null);const [products,setProducts]=useState<Product[]>([]);const [query,setQuery]=useState('');const [loading,setLoading]=useState(true);const [error,setError]=useState('');
  useEffect(()=>{authApi.me().then(r=>setUser(r.data)).catch(()=>{});inventoryApi.getAll().then(r=>setProducts(Array.isArray(r.data)?r.data:[])).catch(e=>setError(e?.response?.data?.message||'Could not load product stock.')).finally(()=>setLoading(false));},[]);
  const visible=useMemo(()=>{const q=query.trim().toLowerCase();return products.filter(p=>!p.not_for_selling&&(!q||[p.name,p.sku,p.barcode,p.category].some(v=>String(v||'').toLowerCase().includes(q)))).slice(0,12);},[products,query]);
  const low=products.filter(p=>Number(p.stock)<=Number(p.threshold));const totalUnits=products.reduce((n,p)=>n+Number(p.stock||0),0);const stockValue=products.reduce((n,p)=>n+Number(p.stock||0)*Number(p.cost||0),0);
  return <div className="min-h-screen bg-gray-50"><Navbar user={user}/><main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-emerald-700">Supermarket Pro</p><h1 className="mt-1 text-2xl font-semibold text-gray-900">Store operations</h1><p className="mt-1 text-sm text-gray-500">A single workspace for checkout, product stock, purchasing and retail reporting.</p></div><Link href="/pos" className="rounded-sm bg-emerald-700 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-800">Start checkout</Link></header>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Store summary">
      {[['Products',products.length.toLocaleString()],['Units in stock',totalUnits.toLocaleString()],['Reorder alerts',low.length.toLocaleString()],['Stock at cost',`KES ${stockValue.toLocaleString(undefined,{maximumFractionDigits:2})}`]].map(([label,value])=><article key={label} className="rounded-sm border bg-white p-5"><p className="text-sm text-gray-500">{label}</p><p className="mt-2 text-2xl font-semibold text-gray-900">{loading?'…':value}</p></article>)}
    </section>
    <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="rounded-sm border bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-5"><div><h2 className="font-semibold">Product finder</h2><p className="mt-1 text-xs text-gray-500">Search by product, SKU or barcode.</p></div><input aria-label="Search products" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&visible.length===1)location.href='/pos';}} placeholder="Scan barcode or search" className="w-full rounded-sm border px-3 py-2 text-sm sm:max-w-xs"/></div>
        {error&&<p role="alert" className="m-4 rounded-sm bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="text-xs text-gray-500"><th className="px-5 py-3">Product</th><th className="px-5 py-3">SKU / Barcode</th><th className="px-5 py-3">Stock</th><th className="px-5 py-3">Retail price</th></tr></thead><tbody className="divide-y">{visible.map(p=><tr key={p.id}><td className="px-5 py-3"><span className="font-medium">{p.name}</span><span className="block text-xs text-gray-500">{p.category||'Uncategorised'}</span></td><td className="px-5 py-3 text-gray-600">{p.sku||p.barcode||'—'}</td><td className={`px-5 py-3 ${Number(p.stock)<=Number(p.threshold)?'font-medium text-amber-700':''}`}>{p.stock} {p.unit||'units'}</td><td className="px-5 py-3">KES {Number(p.price||0).toLocaleString()}</td></tr>)}</tbody></table>{!loading&&!visible.length&&<p className="p-8 text-center text-sm text-gray-500">{products.length?'No matching products.':'Add products to start using store operations.'}</p>}</div>
        <div className="border-t px-5 py-3"><Link href="/inventory" className="text-sm font-medium text-emerald-700 hover:underline">View full product catalog →</Link></div>
      </div>
      <div className="space-y-6"><section className="rounded-sm border bg-white"><div className="flex items-center justify-between border-b p-5"><div><h2 className="font-semibold">Reorder alerts</h2><p className="mt-1 text-xs text-gray-500">Products at or below their minimum stock.</p></div><Link href="/inventory" className="text-sm text-emerald-700">Manage stock</Link></div><div className="divide-y">{low.slice(0,6).map(p=><div key={p.id} className="flex items-center justify-between gap-3 px-5 py-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{p.name}</p><p className="text-xs text-gray-500">Minimum {p.threshold} {p.unit||'units'}</p></div><span className="shrink-0 rounded-sm bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">{p.stock} left</span></div>)}{!loading&&!low.length&&<p className="p-5 text-sm text-gray-500">No products need reordering right now.</p>}</div></section>
      <section className="rounded-sm border bg-white p-5"><h2 className="font-semibold">Store workflows</h2><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">{shortcuts.map(s=><Link key={s.href} href={s.href} className="rounded-sm border p-3 hover:border-emerald-600 hover:bg-emerald-50"><span className="block text-sm font-medium text-gray-900">{s.title}</span><span className="mt-1 block text-xs text-gray-500">{s.detail}</span></Link>)}</div></section></div>
    </section>
  </main></div>;
}
