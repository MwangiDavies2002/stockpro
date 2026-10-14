'use client';
import {useEffect,useState} from 'react';
import Navbar from '../components/Navbar';
import api,{authApi,reportsApi,subscriptionsApi} from '../lib/api';
import {toast} from 'sonner';
export default function NotificationsPage(){
  const [user,setUser]=useState<any>(null),[alerts,setAlerts]=useState<any[]>([]),[loading,setLoading]=useState(true),[incomplete,setIncomplete]=useState(false);
  useEffect(()=>{authApi.me().then(({data})=>setUser(data)).catch(()=>{});load();},[]);
  async function load(){
    setLoading(true);
    const results=await Promise.allSettled([api.get('/notifications'),reportsApi.getStock(),reportsApi.getLossAlerts(),subscriptionsApi.getCurrent()]);
    const data=results.map(result=>result.status==='fulfilled'?result.value.data:null),next:any[]=[];
    (data[0]||[]).forEach((alert:any)=>next.push({id:alert.id,title:alert.title,text:alert.message,read:!!alert.read_at}));
    (data[1]||[]).filter((item:any)=>item.stock<=item.threshold).slice(0,10).forEach((item:any)=>{const title=`Low stock: ${item.name}`;if(!next.some(alert=>alert.title===title))next.push({title,text:`${item.stock} left; threshold ${item.threshold}`});});
    (data[2]||[]).slice(0,10).forEach((item:any)=>next.push({title:`Below-cost sale: ${item.item_name}`,text:`Estimated loss KES ${Number(item.estimated_loss).toLocaleString()}`}));
    if(data[3]?.end_date){const days=Math.ceil((new Date(data[3].end_date).getTime()-Date.now())/86400000);if(days<=7)next.push({title:days<0?'Subscription expired':'Subscription expires soon',text:days<0?'Renew your plan':`${days} days remaining`});}
    setAlerts(next);setIncomplete(results.some(result=>result.status==='rejected'));setLoading(false);
  }
  async function read(id:number){try{await api.patch(`/notifications/${id}/read`);setAlerts(current=>current.map(alert=>alert.id===id?{...alert,read:true}:alert));}catch{toast.error('Could not mark notification as read');}}
  return <div className="min-h-screen bg-gray-50"><Navbar user={user}/><main className="max-w-4xl mx-auto p-6 space-y-4"><div className="flex justify-between"><h1 className="text-2xl font-semibold">Notifications</h1><button onClick={load} className="border rounded px-4 py-2">Refresh</button></div>{incomplete&&<p className="bg-amber-50 text-amber-800 border rounded p-3 text-sm">Some alerts could not be loaded. Your available notifications are shown below.</p>}<div className="bg-white border rounded-xl divide-y">{alerts.map((alert,index)=><div key={alert.id?`saved-${alert.id}`:`computed-${index}`} className="p-5 flex justify-between gap-3"><div><p className="font-medium text-sm">{alert.title}</p><p className="text-xs text-gray-500 mt-1">{alert.text}</p></div>{alert.id&&!alert.read&&<button onClick={()=>read(alert.id)} className="text-sm text-green-700 shrink-0">Mark read</button>}</div>)}{!alerts.length&&<p className="p-10 text-center text-gray-500">{loading?'Loading notifications…':incomplete?'Notifications are temporarily unavailable.':'No urgent notifications.'}</p>}</div></main></div>;
}
