'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../../components/Navbar';
import { authApi, locationsApi, reportsApi } from '../../lib/api';
import Cookies from 'js-cookie';

export default function InsightActionsPage(){
  const router=useRouter();
  const [user,setUser]=useState<any>(null);
  const [stock,setStock]=useState<any[]>([]);
  const [top,setTop]=useState<any[]>([]);
  const [locations,setLocations]=useState<any[]>([]);
  const [selected,setSelected]=useState<number[]>([]);
  const [locationId,setLocationId]=useState('');
  const location=Number(locationId)||null;
  const shopStock=useMemo(()=>stock.filter(item=>location&&Number(item.location_id)===location),[stock,location]);
  const shopOptions=useMemo(()=>locations.filter(place=>stock.some(item=>Number(item.location_id)===Number(place.id))),[locations,stock]);
  const selectedHere=shopStock.filter(item=>selected.includes(Number(item.id)));

  useEffect(()=>{
    if(!Cookies.get('token'))return;
    authApi.me().then(r=>setUser(r.data)).catch(()=>{});
    locationsApi.getAll().then(r=>setLocations(r.data||[])).catch(()=>{});
    Promise.all([reportsApi.getStock(),reportsApi.getUsage(30)]).then(([s,u])=>{
      const low=s.data.filter((item:any)=>Number(item.stock)<=Number(item.threshold));
      setStock(low);
      const firstShop=low.find((item:any)=>item.location_id)?.location_id;
      if(firstShop)setLocationId(String(firstShop));
      setTop(u.data.slice(0,8));
    }).catch(()=>{});
  },[]);

  function toggleItem(id:number){setSelected(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id]);}
  function toggleAll(){
    const ids=shopStock.map(item=>Number(item.id));
    setSelected(current=>ids.length&&ids.every(id=>current.includes(id))?current.filter(id=>!ids.includes(id)):[...new Set([...current,...ids])]);
  }
  function createPurchase(){
    if(!selectedHere.length||!location)return;
    router.push(`/purchases/create?${new URLSearchParams({purchaseItems:selectedHere.map(item=>item.id).join(','),locationId:String(location)})}`);
  }

  return <div className="min-h-screen bg-gray-50"><Navbar user={user}/><main className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6">
    <header><h1 className="text-2xl font-semibold">Insight Actions</h1><p className="mt-1 text-sm text-gray-500">Select products to replenish and start a purchase with those items ready to edit.</p></header>
    <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="rounded-sm border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Replenish stock</h2><p className="mt-1 text-xs text-gray-500">A purchase can include several products from the same shop.</p></div>{selectedHere.length>0&&<button type="button" onClick={()=>setSelected([])} className="text-xs text-gray-600 underline">Clear selection</button>}</div>
        <label className="mt-4 block text-sm font-medium">Shop<select aria-label="Shop for purchase" value={locationId} onChange={event=>{setLocationId(event.target.value);setSelected([]);}} className="mt-1 w-full rounded-sm border bg-white px-3 py-2"><option value="">Choose shop</option>{shopOptions.map(place=><option key={place.id} value={place.id}>{place.name}</option>)}</select></label>
        {shopStock.length>0&&<div className="mt-4 flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-gray-600">{selectedHere.length} of {shopStock.length} selected</span><button type="button" onClick={toggleAll} className="rounded-sm border px-3 py-2 text-sm hover:border-emerald-500">{shopStock.every(item=>selected.includes(Number(item.id)))?'Deselect all':'Select all at this shop'}</button></div>}
        <div className="mt-4 space-y-3">{shopStock.map(item=>{const id=Number(item.id),checked=selected.includes(id);return <label key={id} className={`flex cursor-pointer items-center gap-3 rounded-sm border p-3 ${checked?'border-emerald-600':'border-gray-200 hover:border-emerald-500'}`}><input type="checkbox" checked={checked} onChange={()=>toggleItem(id)} className="h-5 w-5 shrink-0 accent-emerald-700"/><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{item.name}</span><span className="block text-xs text-gray-500">{item.stock} in stock · reorder threshold {item.threshold}</span></span><span className="text-xs font-medium text-emerald-700">{checked?'Selected':'Select'}</span></label>;})}{!stock.length&&<p className="text-sm text-gray-500">No replenishment actions needed.</p>}{stock.length>0&&!location&&<p className="text-sm text-gray-500">Choose a shop to see its low-stock products.</p>}{location&&!shopStock.length&&<p className="text-sm text-gray-500">No low-stock products at this shop.</p>}</div>
        {selectedHere.length>0&&<button type="button" onClick={createPurchase} className="mt-4 w-full rounded-sm bg-emerald-700 px-4 py-3 text-sm font-semibold text-white">Create purchase with {selectedHere.length} item{selectedHere.length===1?'':'s'}</button>}
        {shopOptions.length>1&&<p className="mt-3 text-xs text-gray-500">To order items for another shop, change the shop selection and create a separate purchase.</p>}
      </div>
      <div className="rounded-sm border bg-white p-5"><h2 className="font-semibold">Promote top sellers</h2><div className="mt-4 space-y-3">{top.map(item=><div key={item.id} className="flex items-center justify-between border-b pb-3"><div><p className="text-sm font-medium">{item.name}</p><p className="text-xs text-gray-500">{Number(item.units_sold).toLocaleString()} units sold</p></div><button type="button" onClick={()=>router.push('/pos')} className="rounded-sm border border-purple-300 px-3 py-1.5 text-xs text-purple-700">Open POS</button></div>)}</div></div>
    </section>
  </main></div>;
}
