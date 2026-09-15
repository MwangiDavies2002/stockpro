'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Download, Edit2, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
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
const field = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';
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

  useEffect(() => {
    if (!['units', 'categories', 'brands'].includes(type)) router.replace('/inventory');
  }, [router, type]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [me, locs] = await Promise.all([authApi.me(), locationsApi.getAll()]);
        if (!live) return;
        if (me.data.role !== 'admin') { router.replace('/pos'); return; }
        const active = locs.data.filter((l: Location) => l.active !== false && Number(l.active) !== 0);
        setUser(me.data);
        setLocations(active);
        setLocationId(active[0] ? String(active[0].id) : '');
      } catch {
        router.replace('/login');
      }
    })();
    return () => { live = false; };
  }, [router]);

  async function loadRows() {
    if (!locationId) return;
    try {
      const { data } = await referenceDataApi.getAll(type, { locationId: Number(locationId) });
      setRows(data);
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
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

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
      allowDecimal: !!row.allow_decimal,
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
    if (!locationId || saving) return;
    setSaving(true);
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
      toast.success(`${titles[type].slice(0, -1)} saved`);
      setModalOpen(false);
      await loadRows();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: RecordRow) {
    if (!confirm(`Delete ${row.name}?`)) return;
    try {
      await referenceDataApi.delete(type, row.id);
      setRows(current => current.filter(item => item.id !== row.id));
      toast.success('Deleted');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to delete');
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
    const csv = [header, ...body].map(line => line.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${type}-${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!user) return <div className="min-h-screen bg-gray-50" />;

  return <div className="min-h-screen bg-gray-50"><Navbar user={user} /><main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div><h1 className="text-base font-semibold text-gray-900">{titles[type]}</h1><p className="text-xs text-gray-500 mt-0.5">User-defined setup data for this business location</p></div>
      <div className="flex gap-2">
        <button type="button" onClick={exportCSV} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"><Download size={15}/>Export</button>
        <button type="button" onClick={openAdd} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700"><Plus size={15}/>Add</button>
      </div>
    </div>
    <div className="flex gap-3 flex-wrap">
      <select className={`${field} max-w-xs`} value={locationId} onChange={e => setLocationId(e.target.value)}>{locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
      <input className={`${field} flex-1 min-w-60`} placeholder={`Search ${titles[type].toLowerCase()}...`} value={search} onChange={e => setSearch(e.target.value)} />
    </div>
    <section className="rounded-lg border bg-white overflow-hidden">
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-xs text-gray-600"><tr>
        {(type === 'units' ? ['Name','Short Name','Allow Decimal','Base Unit','Multiplier',''] : type === 'categories' ? ['Name','Code','Parent','Description',''] : ['Name','Description','']).map(h => <th className="text-left p-3" key={h}>{h}</th>)}
      </tr></thead><tbody>
        {!pageRows.length && <tr><td className="p-8 text-center text-gray-400" colSpan={6}>No records found.</td></tr>}
        {pageRows.map(row => <tr key={row.id} className="border-t">
          <td className="p-3 font-medium">{row.name}</td>
          {type === 'units' && <><td className="p-3">{row.short_name || '-'}</td><td className="p-3">{row.allow_decimal ? 'Yes' : 'No'}</td><td className="p-3">{row.base_unit_name || '-'}</td><td className="p-3">{row.multiplier || '-'}</td></>}
          {type === 'categories' && <><td className="p-3">{row.code || '-'}</td><td className="p-3">{row.parent_name || '-'}</td><td className="p-3">{row.description || '-'}</td></>}
          {type === 'brands' && <td className="p-3">{row.description || '-'}</td>}
          <td className="p-3 text-right"><button type="button" aria-label={`Edit ${row.name}`} onClick={() => openEdit(row)} className="p-2 rounded hover:bg-gray-100"><Edit2 size={16}/></button><button type="button" aria-label={`Delete ${row.name}`} onClick={() => remove(row)} className="p-2 rounded text-red-600 hover:bg-red-50"><Trash2 size={16}/></button></td>
        </tr>)}
      </tbody></table></div>
      <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-gray-500"><span>{filtered.length} records</span><div className="flex items-center gap-2"><button type="button" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="rounded border px-2 py-1 disabled:opacity-50">Previous</button><span>Page {page} of {pageCount}</span><button type="button" disabled={page === pageCount} onClick={() => setPage(p => Math.min(pageCount, p + 1))} className="rounded border px-2 py-1 disabled:opacity-50">Next</button></div></div>
    </section>
    {modalOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><form onSubmit={save} className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl"><div className="flex items-start justify-between gap-4"><h2 className="text-lg font-semibold">{editRow ? 'Edit' : 'Add'} {titles[type].slice(0, -1)}</h2><button type="button" onClick={() => setModalOpen(false)} aria-label="Close"><X size={18}/></button></div>
      <div className="mt-5 space-y-3">
        <label className="block text-sm">Name *<input className={`${field} mt-1`} required maxLength={150} value={form.name} onChange={e => setForm({...form, name: e.target.value})}/></label>
        {type === 'units' && <><label className="block text-sm">Short name / abbreviation<input className={`${field} mt-1`} maxLength={30} value={form.shortName} onChange={e => setForm({...form, shortName: e.target.value})}/></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.allowDecimal} onChange={e => setForm({...form, allowDecimal: e.target.checked})}/>Allow decimal</label><label className="block text-sm">Base unit<select className={`${field} mt-1`} value={form.baseUnitId} onChange={e => setForm({...form, baseUnitId: e.target.value})}><option value="">None</option>{rows.filter(r => r.id !== editRow?.id).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>{form.baseUnitId && <label className="block text-sm">Multiplier<input className={`${field} mt-1`} type="number" min={0.000001} step="any" required value={form.multiplier} onChange={e => setForm({...form, multiplier: e.target.value})}/></label>}</>}
        {type === 'categories' && <><label className="block text-sm">Category code<input className={`${field} mt-1`} maxLength={50} value={form.code} onChange={e => setForm({...form, code: e.target.value})}/></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.parentId} onChange={e => setForm({...form, parentId: e.target.checked ? rows.find(r => r.id !== editRow?.id)?.id?.toString() || '' : ''})}/>Add as sub taxonomy</label>{form.parentId && <label className="block text-sm">Parent category<select className={`${field} mt-1`} required value={form.parentId} onChange={e => setForm({...form, parentId: e.target.value})}>{rows.filter(r => r.id !== editRow?.id).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>}<label className="block text-sm">Description<textarea className={`${field} mt-1`} rows={3} value={form.description} onChange={e => setForm({...form, description: e.target.value})}/></label></>}
        {type === 'brands' && <label className="block text-sm">Short description / note<textarea className={`${field} mt-1`} rows={3} value={form.description} onChange={e => setForm({...form, description: e.target.value})}/></label>}
      </div>
      <div className="mt-5 flex gap-2"><button type="button" onClick={() => setModalOpen(false)} className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50">Cancel</button><button disabled={saving} className="flex-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button></div>
    </form></div>}
  </main></div>;
}
