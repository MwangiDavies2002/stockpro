 'use client';
import {useState} from 'react';
import Cookies from 'js-cookie';
import api from '../lib/api';
import {toast} from 'sonner';
import {useTheme} from './ThemeProvider';
import {validColor,onColor} from '../lib/theme';
const presets=[['Blue','#2459a6'],['Terracotta','#9a4d32'],['Forest','#354f43'],['Plum','#70405f'],['Ochre','#b07b16'],['Charcoal','#39414b']];
export default function ThemePicker(){
 const {color,choose}=useTheme();const [draft,setDraft]=useState(''),[busy,setBusy]=useState(false);
 async function save(){const selected=draft||color;if(!validColor(selected))return toast.error('Enter a color such as #2459a6');setBusy(true);try{if(Cookies.get('token'))await api.put('/auth/theme',{color:selected});choose(selected);setDraft('');toast.success(Cookies.get('token')?'Theme saved to your account':'Theme saved on this device');}catch(e:any){toast.error(e.response?.data?.message||'Could not save theme');}finally{setBusy(false);}}
 return <details className="theme-picker text-sm"><summary className="cursor-pointer border px-3 py-2">Theme</summary><section className="theme-options border p-4 space-y-4 bg-white"><p className="font-medium">Choose any theme color</p><div className="flex gap-3 items-center"><input aria-label="Theme color" type="color" value={color} onChange={e=>{choose(e.target.value);setDraft(e.target.value);}} className="w-12 h-10 border p-1"/><label className="text-xs">Hex color<input aria-label="Hex theme color" value={draft||color} onChange={e=>{setDraft(e.target.value);if(validColor(e.target.value))choose(e.target.value);}} maxLength={7} placeholder="#2459a6" className="block mt-1 w-28 border px-2 py-1"/></label></div><div className="grid grid-cols-2 gap-2">{presets.map(([name,hex])=><button type="button" key={hex} onClick={()=>{choose(hex);setDraft(hex);}} style={{backgroundColor:hex,color:onColor(hex)}} className="px-3 py-2 text-xs">{name}</button>)}</div><button type="button" disabled={busy} onClick={save} className="w-full bg-brand px-4 py-2 text-sm">{busy?'Saving...':'Save theme'}</button></section></details>;
}
