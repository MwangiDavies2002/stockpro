'use client';
import { useEffect, useState } from 'react';
import Navbar from '../../components/Navbar';
import { businessSettingsApi, etimsApi } from '../../lib/api';
import { toast } from 'sonner';

const sections = ['Business','Tax','Product','Contact','Sale','Point Of Sale','Display Screen','Purchases A/P','Payment','Dashboard','System','Prefixes','eTIMS'];
const defaults: Record<string, any> = { invoiceSchemePos:'Default', invoiceLayoutPos:'Default', invoiceSchemeSale:'Default', invoiceLayoutSale:'Default', locationType:'selling', defaultUnit:'Pieces', defaultTaxRate:0, saleTax:'VAT', enableInlineTax:true, allowOverselling:false, enableSalesOrder:true, paymentMethods:['Cash','Mpesa','Card'], journalPrefix:'JE', salePrefix:'INV', purchasePrefix:'PO', stockTransferPrefix:'ST', stockAdjustmentPrefix:'SA', showHelpText:true };

export default function BusinessSettingsPage() {
  const [section, setSection] = useState('Business');
  const [settings, setSettings] = useState(defaults);
  const [etims, setEtims] = useState<any>({ enabled:false, mode:'sandbox', kraPin:'', username:'', password:'', apiUrl:'' });
  useEffect(() => { businessSettingsApi.get().then(r => setSettings({ ...defaults, ...r.data })).catch(() => {}); etimsApi.getConfig().then(r => setEtims({ ...etims, ...r.data })).catch(() => {}); }, []);
  const set = (key:string, value:any) => setSettings((s) => ({ ...s, [key]: value }));
  async function save() { try { await businessSettingsApi.update(settings); if (section === 'eTIMS') await etimsApi.updateConfig({ ...etims, kraPin: etims.kra_pin || etims.kraPin, enabled: !!etims.enabled, mode: etims.mode || 'sandbox' }); toast.success('Settings saved'); } catch (e:any) { toast.error(e.response?.data?.message || 'Could not save settings'); } }
  const input = (label:string, key:string, type='text') => <label className="text-sm font-medium text-gray-700">{label}<input type={type} value={settings[key] ?? ''} onChange={e => set(key, type === 'number' ? Number(e.target.value) : e.target.value)} className="mt-1 w-full rounded border px-3 py-2" /></label>;
  return <div className="min-h-screen bg-gray-50"><Navbar /><main className="mx-auto max-w-7xl p-6"><h1 className="mb-5 text-2xl font-bold">Business Settings</h1><div className="grid gap-5 md:grid-cols-[240px_1fr] rounded-xl bg-white p-4 shadow-sm"><div className="flex flex-col">{sections.map(s => <button key={s} onClick={() => setSection(s)} className={`border-b px-4 py-3 text-left ${section === s ? 'bg-blue-600 text-white' : 'hover:bg-gray-50'}`}>{s}</button>)}</div><div className="grid gap-4 p-4 md:grid-cols-2">
    {section === 'Business' && <>{input('Default POS invoice scheme','invoiceSchemePos')}{input('Default POS invoice layout','invoiceLayoutPos')}{input('Default sales invoice scheme','invoiceSchemeSale')}{input('Default sales invoice layout','invoiceLayoutSale')}{input('Location type','locationType')}</>}
    {section === 'Tax' && <>{input('Tax name','saleTax')}{input('Default tax rate %','defaultTaxRate','number')}<label><input type="checkbox" checked={!!settings.enableInlineTax} onChange={e=>set('enableInlineTax',e.target.checked)}/> Enable inline tax</label></>}
    {section === 'Product' && <>{input('Default unit','defaultUnit')}<p className="text-sm text-gray-500">Categories, units, brands, and product types are created per shop under Setup.</p></>}
    {section === 'Sale' && <>{input('Sale prefix','salePrefix')}{input('Default sale tax','saleTax')}<label><input type="checkbox" checked={!!settings.allowOverselling} onChange={e=>set('allowOverselling',e.target.checked)}/> Allow overselling</label></>}
    {section === 'Purchases A/P' && <>{input('Purchase prefix','purchasePrefix')}{input('Stock transfer prefix','stockTransferPrefix')}{input('Stock adjustment prefix','stockAdjustmentPrefix')}</>}
    {section === 'Payment' && <><p className="col-span-2 text-sm text-gray-600">Payment methods are mapped to accounts when configuring each location.</p>{(settings.paymentMethods || []).map((m:string,i:number)=><input key={i} value={m} onChange={e=>set('paymentMethods',settings.paymentMethods.map((x:string,j:number)=>j===i?e.target.value:x))} className="rounded border px-3 py-2" />)}</>}
    {section === 'Prefixes' && <>{input('Journal entry prefix','journalPrefix')}{input('Sale prefix','salePrefix')}{input('Purchase prefix','purchasePrefix')}</>}
    {section === 'eTIMS' && <><label className="col-span-2"><input type="checkbox" checked={!!etims.enabled} onChange={e=>setEtims({...etims,enabled:e.target.checked})}/> Enable KRA eTIMS</label><label>KRA PIN<input value={etims.kraPin || etims.kra_pin || ''} onChange={e=>setEtims({...etims,kraPin:e.target.value})} className="mt-1 w-full rounded border px-3 py-2" /></label><label>Mode<select value={etims.mode || 'sandbox'} onChange={e=>setEtims({...etims,mode:e.target.value})} className="mt-1 w-full rounded border px-3 py-2"><option>sandbox</option><option>production</option></select></label><label>Username<input value={etims.username || ''} onChange={e=>setEtims({...etims,username:e.target.value})} className="mt-1 w-full rounded border px-3 py-2" /></label><label>Password<input type="password" value={etims.password || ''} onChange={e=>setEtims({...etims,password:e.target.value})} className="mt-1 w-full rounded border px-3 py-2" /></label></>}
    {!['Business','Tax','Product','Sale','Purchases A/P','Payment','Prefixes','eTIMS'].includes(section) && <p className="text-sm text-gray-500">{section} settings are ready for configuration and will be stored per shop.</p>}
    <div className="col-span-2"><button onClick={save} className="rounded bg-emerald-600 px-5 py-2 text-white">Update Settings</button></div>
  </div></div></main></div>;
}
