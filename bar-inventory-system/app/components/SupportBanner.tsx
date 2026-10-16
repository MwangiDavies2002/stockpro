 'use client';
import {useState} from 'react';
import Cookies from 'js-cookie';
import api from '../lib/api';
import {toast} from 'sonner';
export default function SupportBanner({session}:{session:any}){
 const [busy,setBusy]=useState(false);
 async function exit(){setBusy(true);try{await api.post('/auth/support-session/end');const token=sessionStorage.getItem('stockpro_superadmin_token');sessionStorage.removeItem('stockpro_superadmin_token');if(token){Cookies.set('token',token,{expires:7});window.location.assign('/superadmin');}else{Cookies.remove('token');window.location.assign('/login');}}catch(e:any){toast.error(e.response?.data?.message||'Could not end support session');setBusy(false);}}
 return <aside role="status" className="border-b border-brand bg-brand text-white px-5 py-3 flex flex-wrap gap-4 items-center justify-between text-sm"><span>Support access: {session.businessName}. Acting as the owner; administrative changes are logged.</span><button disabled={busy} onClick={exit} className="border border-white px-3 py-1 text-white">{busy?'Returning...':'Return to Superadmin'}</button></aside>;
}
