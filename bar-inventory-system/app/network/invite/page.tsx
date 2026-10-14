'use client';
import {useEffect,useState} from 'react';
import Navbar from '../../components/Navbar';
import api,{authApi} from '../../lib/api';
import {toast} from 'sonner';
export default function NetworkInvitePage(){
  const [user,setUser]=useState<any>(null),[code,setCode]=useState(''),[busy,setBusy]=useState(false);
  useEffect(()=>{authApi.me().then(({data})=>setUser(data)).catch(()=>{});},[]);
  async function createInvite(){setBusy(true);try{const {data}=await api.post('/owner-network/invite');setCode(data.code);}catch(error:any){toast.error(error.response?.data?.message||'Could not create invitation');}finally{setBusy(false);}}
  async function copy(){try{await navigator.clipboard.writeText(code);toast.success('Invite code copied');}catch{toast.error('Select the code and copy it manually');}}
  return <div className="min-h-screen bg-gray-50"><Navbar user={user}/><main className="max-w-2xl mx-auto p-8"><div className="bg-white border rounded-2xl p-8 space-y-5"><h1 className="text-2xl font-semibold">Invite a trusted owner</h1><p className="text-sm text-gray-500">Verified members can create an invitation valid for seven days. The recipient must still complete business verification.</p><button disabled={busy} onClick={createInvite} className="bg-green-600 text-white px-4 py-2 rounded-lg disabled:opacity-50">{busy?'Creating…':'Create invitation'}</button>{code&&<div className="flex gap-2"><input aria-label="Invitation code" readOnly value={code} className="border rounded-lg p-3 flex-1 min-w-0"/><button onClick={copy} className="border rounded-lg px-3">Copy</button></div>}</div></main></div>;
}
