"use client";
import {useId,useState} from 'react';
export function filterDetailTypes(options:string[],query:string,value='') {
  const term=query.trim().toLowerCase();
  return options.filter(option=>option===value||option.toLowerCase().includes(term));
}
export default function AccountDetailSelect({options,value,onChange,disabled=false}:{options:string[];value:string;onChange:(value:string)=>void;disabled?:boolean}) {
  const id=useId();
  const [query,setQuery]=useState('');
  const visible=filterDetailTypes(options,query,value);
  return <div className="space-y-2">
    <label htmlFor={id} className="block text-sm font-medium">Detail type *</label>
    <label className="block text-xs text-gray-600">Find a detail type
      <input type="search" disabled={disabled} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search detail types" className="block w-full border p-2 mt-1 text-sm"/>
    </label>
    <select id={id} required disabled={disabled} value={value} onChange={e=>onChange(e.target.value)} className="block w-full border p-2 text-sm">
      <option value="">Please select</option>
      {visible.map(option=><option key={option} value={option}>{option}</option>)}
    </select>
    {!disabled&&!visible.length&&<p role="status" className="text-xs text-gray-600">No matching detail types. Clear the search to see all choices.</p>}
  </div>;
}
