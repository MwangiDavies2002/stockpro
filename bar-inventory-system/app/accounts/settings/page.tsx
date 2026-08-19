'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { Settings } from 'lucide-react';
import Navbar from '../../components/Navbar';
import { settingsApi, accountsApi, treasuryApi, authApi } from '../../lib/api';
import { toast } from 'sonner';

const SETTING_GROUPS = [
  {
    title: 'Opening Balances',
    items: [
      { key: 'opening_balance_equity', label: 'Opening Balance Equity', type: 'account' },
    ]
  },
  {
    title: 'Sales Mappings',
    items: [
      { key: 'sales_revenue', label: 'Revenue Account', type: 'account' },
      { key: 'sales_receivable', label: 'Accounts Receivable', type: 'account' },
      { key: 'sales_vat_output', label: 'VAT Output', type: 'account' },
    ]
  },
  {
    title: 'Inventory Mappings',
    items: [
      { key: 'inventory_asset', label: 'Inventory Asset', type: 'account' },
      { key: 'inventory_cogs', label: 'Cost of Goods Sold', type: 'account' },
      { key: 'inventory_adjustment', label: 'Inventory Adjustment', type: 'account' },
    ]
  },
  {
    title: 'Purchases Mappings',
    items: [
      { key: 'purchases_payable', label: 'Accounts Payable', type: 'account' },
      { key: 'purchases_vat_input', label: 'VAT Input', type: 'account' },
    ]
  },
  {
    title: 'Payment Mappings (Treasury)',
    items: [
      { key: 'payment_cash', label: 'Cash Treasury', type: 'treasury' },
      { key: 'payment_bank', label: 'Bank Treasury', type: 'treasury' },
      { key: 'payment_mobile', label: 'Mobile Money Treasury', type: 'treasury' },
    ]
  }
];

export default function AccountingSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; role: string; email: string } | null>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [treasuries, setTreasuries] = useState<any[]>([]);
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = Cookies.get('token');
    if (!token) { router.push('/login'); return; }
    authApi.me().then(res => setUser(res.data)).catch(() => router.push('/login'));
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [sRes, aRes, tRes] = await Promise.all([
        settingsApi.getAll(),
        accountsApi.getAll(),
        treasuryApi.getAll()
      ]);
      
      const settingsMap: Record<string, any> = {};
      sRes.data.forEach((s: any) => {
        settingsMap[s.setting_key] = s;
      });
      
      setSettings(settingsMap);
      setAccounts(aRes.data);
      setTreasuries(tRes.data);
    } catch (err) {
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(key: string, value: any, type: 'account' | 'treasury') {
    try {
      const payload = type === 'account' ? { account_id: Number(value) } : { treasury_id: Number(value) };
      await settingsApi.update(key, payload);
      setSettings({ ...settings, [key]: { ...settings[key], ...payload } });
      toast.success('Setting updated');
    } catch {
      toast.error('Failed to update setting');
    }
  }

  async function handleEnsureOpeningBalanceEquity() {
    try {
      await accountsApi.ensureOpeningBalanceEquity();
      await loadData();
      toast.success('Opening Balance Equity account is ready');
    } catch {
      toast.error('Failed to set up Opening Balance Equity');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="w-6 h-6 text-brand" />
            Accounting Settings
          </h1>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
          </div>
        ) : (
          <div className="space-y-6">
            {SETTING_GROUPS.map((group) => (
              <div key={group.title} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="font-bold text-gray-900">{group.title}</h2>
                    {group.title === 'Opening Balances' && (
                      <button onClick={handleEnsureOpeningBalanceEquity} className="text-sm font-medium text-brand hover:underline">
                        Create default equity account
                      </button>
                    )}
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  {group.items.map((item) => (
                    <div key={item.key} className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                      <label className="text-sm font-medium text-gray-700">{item.label}</label>
                      <select
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                        value={item.type === 'account' ? settings[item.key]?.account_id || '' : settings[item.key]?.treasury_id || ''}
                        onChange={(e) => handleUpdate(item.key, e.target.value, item.type as any)}
                      >
                        <option value="">-- Not Mapped --</option>
                        {item.type === 'account' 
                          ? accounts.filter(a => item.key !== 'opening_balance_equity' || a.account_type === 'Equity').map(a => <option key={a.id} value={a.id}>{a.account_code} - {a.account_name}</option>)
                          : treasuries.map(t => <option key={t.id} value={t.id}>{t.name} (KES {t.current_balance})</option>)
                        }
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
