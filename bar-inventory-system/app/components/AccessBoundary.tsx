 'use client';
import {createContext,useContext,useEffect,useState} from 'react';
import {usePathname} from 'next/navigation';
import Link from 'next/link';
import Cookies from 'js-cookie';
import {authApi} from '../lib/api';
import {Access,canVisit} from '../lib/access';
import LoadingSheet from './LoadingSheet';
import SupportBanner from './SupportBanner';
import {AccountTheme} from './ThemeProvider';
const Context=createContext<{user:any;access:Access|undefined}>({user:null,access:undefined});
export const useAccess=()=>useContext(Context);
const publicPages=['/login','/register','/register-business','/terms','/privacy'];
export default function AccessBoundary({children}:{children:React.ReactNode}){
 const pathname=usePathname().replace(/\/$/,'')||'/';const [state,setState]=useState<{path:string;user:any;error:string}>({path:'',user:null,error:''});
 const publicPage=publicPages.includes(pathname);
 useEffect(()=>{if(publicPage)return;let active=true;const refresh=()=>{if(!Cookies.get('token')){window.location.assign('/login');return;}authApi.me().then(r=>{if(active)setState({path:pathname,user:r.data,error:''});}).catch(e=>{if(active)setState({path:pathname,user:null,error:e.response?.data?.message||'Could not check your access. Please reload.'});});};refresh();window.addEventListener('focus',refresh);return()=>{active=false;window.removeEventListener('focus',refresh);};},[pathname,publicPage]);
 if(publicPage)return <>{children}</>;
 if(state.path!==pathname)return <main className="max-w-5xl mx-auto p-6"><LoadingSheet label="Checking your workspace access" /></main>;
 if(state.error)return <main className="p-8"><h1 className="text-2xl mb-4">Could not open this page</h1><p>{state.error}</p><button onClick={()=>window.location.reload()} className="mt-4 border px-4 py-2">Try again</button></main>;
 const access=state.user?.access as Access|undefined;
 if(!canVisit(access,pathname)){const home=['/','/pos','/inventory','/sales','/customers','/reports'].find(path=>canVisit(access,path));return <><AccountTheme color={access?.themeColor}/>{access?.supportSession&&<SupportBanner session={access.supportSession}/>}<main className="max-w-3xl mx-auto p-8 space-y-4"><h1 className="text-3xl">This page is outside your access</h1><p>Your package and role determine which pages you can use. Your current package is {access?.plan.name}.</p>{home&&<Link href={home} className="underline">Go to your workspace</Link>}{access?.owner&&<p><Link href="/subscription" className="underline">Compare packages</Link></p>}</main></>;}
 return <Context.Provider value={{user:state.user,access}}><AccountTheme color={access?.themeColor}/>{access?.supportSession&&<SupportBanner session={access.supportSession}/>}<div key={access?.supportSession?.id||'workspace'}>{children}</div></Context.Provider>;
}
