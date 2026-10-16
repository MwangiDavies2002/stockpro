'use client';
import {canVisit,canAct} from '../../lib/access';

import { FormEvent, useEffect, useMemo, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Download, Edit2, Plus, Trash2, X } from '../../components/TextMark';
import { toast } from 'sonner';
import {downloadCsv} from '../../lib/csv';
import Navbar from '../../components/Navbar';
import { authApi, locationsApi, referenceDataApi, ReferenceType } from '../../lib/api';

type Location = { id: number; name: string; active?: boolean };
type RecordRow = {
  id: number;
  location_id: number;
  name: string;
  short_name?: string | null;
  allow_decimal?: boolean | number;
  base_unit_id?: number | null;
  base_unit_name?: string | null;
  multiplier?: number | null;
  code?: string | null;
  description?: string | null;
  parent_id?: number | null;
  parent_name?: string | null;
};

const titles: Record<ReferenceType, string> = { units: 'Units', categories: 'Categories', brands: 'Brands' };
const field = 'w-full rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';
const blank = { name: '', shortName: '', allowDecimal: false, baseUnitId: '', multiplier: '', code: '', description: '', parentId: '' };

function csvEscape(value: unknown) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default function ReferenceDataPage() {
  const params = useParams<{ type: ReferenceType }>();
  const router = useRouter();
  const type = params.type;
  const [user, setUser] = useState<any>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState('');
  const [rows, setRows] = useState<RecordRow[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editRow, setEditRow] = useState<RecordRow | null>(null);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const version=useRef(0),savingLock=useRef(false);
  const [initialError,setInitialError]=useState('');
  const singular={units:'Unit',categories:'Category',brands:'Brand'}[type];
  const message=(e:any)=>e.response?.data?.message||e.response?.data?.error||e.message||'Unable to complete the request';

  useEffect(() => {
    if (!['units', 'categories', 'brands'].includes(type)) router.replace('/inventory');
  }, [router, type]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const me=await authApi.me();const locs=await locationsApi.getAll();
        if (!live) return;
        if (!canVisit(me.data.access,window.location.pathname)) { router.replace('/pos'); return; }
        const active = locs.data.filter((l: Location) => l.active !== false && Number(l.active) !== 0);
        setUser(me.data);
        setLocations(active);
        setLocationId(active[0] ? String(active[0].id) : '');
      } catch(e) {
        setInitialError(message(e));
      }
    })();
    return () => { live = false; };
  }, [router]);

  async function loadRows() {
    const current=++version.current;setRows([]);if (!locationId) return;
    try {
      const { data } = await referenceDataApi.getAll(type, { locationId: Number(locationId) });
      if(current===version.current)setRows(data);
    } catch {
      toast.error(`Failed to load ${titles[type].toLowerCase()}`);
    }
  }

  useEffect(() => { void loadRows(); }, [type, locationId]);

  const filtered = useMemo(() => rows.filter(row => {
    const term = search.toLowerCase();
    return [row.name, row.short_name, row.code, row.description, row.parent_name, row.base_unit_name].some(value => String(value || '').toLowerCase().includes(term));
  }), [rows, search]);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage=Math.min(page,pageCount);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => setPage(1), [search, type, locationId]);

  function openAdd() {
    setEditRow(null);
    setForm(blank);
    setModalOpen(true);
  }

  function openEdit(row: RecordRow) {
    setEditRow(row);
    setForm({
      name: row.name || '',
      shortName: row.short_name || '',
      allowDecimal: false,
      baseUnitId: row.base_unit_id ? String(row.base_unit_id) : '',
      multiplier: row.multiplier ? String(row.multiplier) : '',
      code: row.code || '',
      description: row.description || '',
      parentId: row.parent_id ? String(row.parent_id) : '',
    });
    setModalOpen(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!locationId || savingLock.current) return;
    savingLock.current=true;setSaving(true);
    const payload = {
      locationId: Number(locationId),
      name: form.name.trim(),
      shortName: form.shortName.trim(),
      allowDecimal: !!form.allowDecimal,
      baseUnitId: form.baseUnitId ? Number(form.baseUnitId) : null,
      multiplier: form.baseUnitId ? Number(form.multiplier) : null,
      code: form.code.trim(),
      description: form.description.trim(),
      parentId: form.parentId ? Number(form.parentId) : null,
    };
    try {
      if (editRow) await referenceDataApi.update(type, editRow.id, payload);
      else await referenceDataApi.create(type, payload);
      toast.success(`${singular} saved`);
      setModalOpen(false);
      await loadRows();
    } catch (err: any) {
      toast.error(message(err));
    } finally {
      setSaving(false);savingLock.current=false;
    }
  }

  async function remove(row: RecordRow) {
    if (!confirm(`Delete ${row.name}?`)) return;
    try {
      await referenceDataApi.delete(type, row.id);
      setRows(current => current.filter(item => item.id !== row.id));
      toast.success('Deleted');
    } catch (err: any) {
      toast.error(message(err));
    }
  }

  function exportCSV() {
    const header = type === 'units' ? ['Name','Short Name','Allow Decimal','Base Unit','Multiplier'] : type === 'categories' ? ['Name','Code','Parent','Description'] : ['Name','Description'];
    const body = filtered.map(row => type === 'units'
      ? [row.name, row.short_name, row.allow_decimal ? 'Yes' : 'No', row.base_unit_name, row.multiplier]
      : type === 'categories'
        ? [row.name, row.code, row.parent_name, row.description]
        : [row.name, row.description]
    );
    downloadCsv(`${type}.csv`,[header,...body]);
  }

  if (!user) return <div className="p-8">{initialError||"Loading product setup..."}{initialError&&<button className="border ml-3 p-2" onClick={()=>window.location.reload()}>Retry</button>}</div>;

  return <div className="min-h-screen bg-gray-50"><Navbar user={user} /><main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div><h1 className="text-base font-semibold text-gray-900">{titles[type]}</h1><p className="text-xs text-gray-500 mt-0.5">User-defined setup data for this business location</p></div>
      <div className="flex gap-2">
        <button disabled={!canAct(user.access,'inventory','export')} type="button" onClick={exportCSV} className="inline-flex items-center gap-2 rounded-sm border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"><Download size={15}/>Export</button>
        <button disabled={!locationId||!canAct(user.access,'inventory','create')} type="button" onClick={openAdd} className="inline-flex items-center gap-2 rounded-sm bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700"><Plus size={15}/>Add</button>
      </div>
    </div>
    <div className="flex gap-3 flex-wrap">
      <select aria-label="Business location" className={`${field} max-w-xs`} value={locationId} onChange={e => setLocationId(e.target.value)}>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
      <input className={`${field} flex-1 min-w-60`} placeholder={`Search ${titles[type].toLowerCase()}...`} value={search} onChange={e => setSearch(e.target.value)} />
    </div>
    <section className="rounded-sm border bg-white overflow-hidden">
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-xs text-gray-600"><tr>
        {(type === 'units' ? ['Name','Short Name','Allow Decimal','Base Unit','Multiplier',''] : type === 'categories' ? ['Name','Code','Parent','Description',''] : ['Name','Description','']).map(h => <th className="text-left p-3" key={h}>{h}</th>)}
      </tr></thead><tbody>
        {!pageRows.length && <tr><td className="p-8 text-center text-gray-400" colSpan={6}>No records found.</td></tr>}
        {pageRows.map(row => <tr key={row.id} className="border-t">
          <td className="p-3 font-medium">{row.name}</td>
          {type === 'units' && <><td className="p-3">{row.short_name || '-'}</td><td className="p-3">{row.allow_decimal ? 'Yes' : 'No'}</td><td className="p-3">{row.base_unit_name || '-'}</td><td className="p-3">{row.multiplier || '-'}</td></>}
          {type === 'categories' && <><td className="p-3">{row.code || '-'}</td><td className="p-3">{row.parent_name || '-'}</td><td className="p-3">{row.description || '-'}</td></>}
          {type === 'brands' && <td className="p-3">{row.description || '-'}</td>}
          <td className="p-3 text-right"><button type="button" disabled={!canAct(user.access,'inventory','update')} aria-label={`Edit ${row.name}`} onClick={() => openEdit(row)} className="p-2 rounded-sm hover:bg-gray-100">Edit</button><button type="button" disabled={!canAct(user.access,'inventory','delete')} aria-label={`Delete ${row.name}`} onClick={() => remove(row)} className="p-2 rounded-sm text-red-600 hover:bg-red-50">Delete</button></td>
        </tr>)}
      </tbody></table></div>
      <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-gray-500"><span>{filtered.length} records</span><div className="flex items-center gap-2"><button type="button" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="rounded-sm border px-2 py-1 disabled:opacity-50">Previous</button><span>Page {currentPage} of {pageCount}</span><button type="button" disabled={currentPage === pageCount} onClick={() => setPage(p => Math.min(pageCount, p + 1))} className="rounded-sm border px-2 py-1 disabled:opacity-50">Next</button></div></div>
    </section>
    {modalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><form onSubmit={save} className="w-full max-w-lg max-h-[90vh] overflow-auto rounded-sm bg-white p-6 "><div className="flex items-start justify-between gap-4"><h2 className="text-lg font-semibold">{editRow ? 'Edit' : 'Add'} {singular}</h2><button type="button" onClick={() => setModalOpen(false)} aria-label="Close">Close</button></div>
      <fieldset disabled={saving} className="mt-5 space-y-3">
        <label className="block text-sm">Name *<input className={`${field} mt-1`} required maxLength={type==='units'?30:150} value={form.name} onChange={e => setForm({...form, name: e.target.value})}/></label>
        {type === 'units' && <><label className="block text-sm">Short name / abbreviation<input className={`${field} mt-1`} maxLength={30} value={form.shortName} onChange={e => setForm({...form, shortName: e.target.value})}/></label><p className="text-xs text-gray-500">Stock uses whole units. Base unit and multiplier are reference information; quantities stay in the product stock unit.</p><label className="block text-sm">Base unit<select className={`${field} mt-1`} value={form.baseUnitId} onChange={e => setForm({...form, baseUnitId: e.target.value})}><option value="">None</option>{rows.filter(r => r.id !== editRow?.id).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>{form.baseUnitId && <label className="block text-sm">Multiplier<input className={`${field} mt-1`} type="number" min={0.000001} step="any" required value={form.multiplier} onChange={e => setForm({...form, multiplier: e.target.value})}/></label>}</>}
        {type === 'categories' && <><label className="block text-sm">Category code<input className={`${field} mt-1`} maxLength={50} value={form.code} onChange={e => setForm({...form, code: e.target.value})}/></label><label className="block text-sm">Parent category<select className={`${field} mt-1`} value={form.parentId} onChange={e => setForm({...form, parentId: e.target.value})}><option value="">None (top-level category)</option>{rows.filter(r => r.id !== editRow?.id).map(r => <option key={r.id} value={r.id}>{r.parent_name?`${r.parent_name} / `:''}{r.name}</option>)}</select></label><label className="block text-sm">Description<textarea className={`${field} mt-1`} rows={3} value={form.description} onChange={e => setForm({...form, description: e.target.value})}/></label></>}
        {type === 'brands' && <label className="block text-sm">Short description / note<textarea className={`${field} mt-1`} rows={3} value={form.description} onChange={e => setForm({...form, description: e.target.value})}/></label>}
      </fieldset>
      <div className="mt-5 flex gap-2"><button type="button" onClick={() => setModalOpen(false)} className="flex-1 rounded-sm border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50">Cancel</button><button disabled={saving} className="flex-1 rounded-sm bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button></div>
    </form></div>}
  </main></div>;
}
