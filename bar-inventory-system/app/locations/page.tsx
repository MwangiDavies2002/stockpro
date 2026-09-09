'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { Plus, MapPin, Edit2, Trash2, TrendingUp, Package, AlertTriangle } from 'lucide-react';
import Navbar from '../components/Navbar';
import { locationsApi, authApi, treasuryApi } from '../lib/api';
import { toast } from 'sonner';

interface Location {
  id: number;
  name: string;
  address: string | null;
  active: boolean;
}

interface Summary {
  totalProducts: number;
  lowStockCount: number;
  revenue30d: number;
  sales30d: number;
}

const EMPTY = { name: '', address: '', invoiceSchemePos:'Default', invoiceLayoutPos:'Default', invoiceSchemeSale:'Default', invoiceLayoutSale:'Default', locationType:'selling', paymentOptions: { Cash: '', Mpesa: '', Card: '', Cheque: '', 'Bank Transfer': '' } };

export default function LocationsPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; role: string; email: string } | null>(null);

  const [locations, setLocations] = useState<Location[]>([]);
  const [summaries, setSummaries] = useState<Record<number, Summary>>({});
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editLoc, setEditLoc] = useState<Location | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [treasuries, setTreasuries] = useState<any[]>([]);

  useEffect(() => {
    const token = Cookies.get('token');
    if (!token) { router.push('/login'); return; }
    authApi.me()
      .then((res) => {
        setUser(res.data);
        if (res.data.role !== 'admin') router.push('/pos');
      })
      .catch(() => { Cookies.remove('token'); router.push('/login'); });
  }, []);

  useEffect(() => {
    loadLocations();
    treasuryApi.getAll().then(r => setTreasuries(r.data)).catch(() => setTreasuries([]));
  }, []);

  async function loadLocations() {
    setLoading(true);
    try {
      const { data } = await locationsApi.getAll();
      setLocations(data);
      const summaryEntries = await Promise.all(
        data.map(async (loc: Location) => {
          try {
            const res = await locationsApi.getSummary(loc.id);
            return [loc.id, res.data] as const;
          } catch {
            return [loc.id, null] as const;
          }
        })
      );
      setSummaries(Object.fromEntries(summaryEntries.filter(([, v]) => v)));
    } catch {
      toast.error('Failed to load locations');
    } finally {
      setLoading(false);
    }
  }

  function openAdd() { setEditLoc(null); setForm(EMPTY); setModalOpen(true); }
  function openEdit(loc: Location) {
    setEditLoc(loc);
    setForm({ ...EMPTY, name: loc.name, address: loc.address || '', paymentOptions: (loc as any).payment_options || EMPTY.paymentOptions });
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return toast.error('Name is required');
    setSaving(true);
    try {
      if (editLoc) {
        await locationsApi.update(editLoc.id, { ...form, active: editLoc.active });
        toast.success('Location updated');
      } else {
        await locationsApi.create(form);
        toast.success('Location added');
      }
      setModalOpen(false);
      await loadLocations();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to save location');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this location?')) return;
    try {
      await locationsApi.delete(id);
      toast.success('Location deleted');
      await loadLocations();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to delete location');
    }
  }

  if (!user) return <div className="min-h-screen bg-gray-50" />;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-base font-semibold text-gray-900">Locations</h1>
            <p className="text-xs text-gray-500 mt-0.5">Manage your branches / outlets</p>
          </div>
          <button onClick={openAdd} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-2 rounded-lg">
            <Plus className="w-3.5 h-3.5" /> Add Location
          </button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-sm text-gray-400">Loading...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {locations.map((loc) => {
              const s = summaries[loc.id];
              return (
                <div key={loc.id} className="bg-white border border-gray-200 rounded-xl p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-green-600" />
                      <div>
                        <p className="font-medium text-gray-900">{loc.name}</p>
                        {loc.address && <p className="text-xs text-gray-500">{loc.address}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => openEdit(loc)} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {loc.id !== 1 && (
                        <button onClick={() => handleDelete(loc.id)} className="p-1.5 rounded-md hover:bg-red-50 text-red-400">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {s && (
                    <div className="grid grid-cols-3 gap-2 mt-4">
                      <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                        <Package className="w-3.5 h-3.5 text-gray-400 mx-auto mb-1" />
                        <p className="text-sm font-semibold">{s.totalProducts}</p>
                        <p className="text-[10px] text-gray-500">Products</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mx-auto mb-1" />
                        <p className="text-sm font-semibold">{s.lowStockCount}</p>
                        <p className="text-[10px] text-gray-500">Low Stock</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-2.5 text-center">
                        <TrendingUp className="w-3.5 h-3.5 text-green-600 mx-auto mb-1" />
                        <p className="text-sm font-semibold">KSh {(s.revenue30d / 1000).toFixed(1)}k</p>
                        <p className="text-[10px] text-gray-500">Revenue 30d</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-sm w-full p-6 space-y-4">
            <h2 className="text-lg font-semibold">{editLoc ? 'Edit Location' : 'Add Location'}</h2>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Name</label>
              <input type="text" placeholder="e.g. Westlands Branch" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div className="grid grid-cols-2 gap-3 border-t pt-3">
              {([['invoiceSchemePos','POS invoice scheme'],['invoiceLayoutPos','POS invoice layout'],['invoiceSchemeSale','Sales invoice scheme'],['invoiceLayoutSale','Sales invoice layout']] as const).map(([key,label]) => <label key={key} className="text-xs font-medium text-gray-600">{label}<select value={(form as any)[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} className="mt-1 w-full rounded-lg border px-2 py-2"><option>Default</option></select></label>)}
              <label className="text-xs font-medium text-gray-600">Type<select value={form.locationType} onChange={e => setForm({ ...form, locationType: e.target.value })} className="mt-1 w-full rounded-lg border px-2 py-2"><option value="selling">Selling</option><option value="both">Selling & purchasing</option></select></label>
            </div>
            <div className="border-t pt-3"><p className="mb-2 text-sm font-semibold">Payment options and default treasury accounts</p>{Object.keys(form.paymentOptions).map(method => <label key={method} className="mb-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={!!(form.paymentOptions as any)[method]} onChange={e => setForm({ ...form, paymentOptions: { ...form.paymentOptions, [method]: e.target.checked ? ((treasuries[0]?.id || '') as any) : '' } })}/><span className="w-28">{method}</span><select value={(form.paymentOptions as any)[method]} onChange={e => setForm({ ...form, paymentOptions: { ...form.paymentOptions, [method]: e.target.value } })} className="flex-1 rounded border px-2 py-1"><option value="">Select treasury account</option>{treasuries.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>)}</div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Address (optional)</label>
              <input type="text" placeholder="e.g. Waiyaki Way, Nairobi" value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm disabled:opacity-50">
                {saving ? 'Saving...' : editLoc ? 'Save Changes' : 'Add Location'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
