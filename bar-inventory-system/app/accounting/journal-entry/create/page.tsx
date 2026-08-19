'use client';
import React, { useState, useEffect } from 'react';
import { Plus, Info, Calendar, Trash2 } from 'lucide-react';
import Navbar from '../../../components/Navbar';
import { accountsApi, journalEntryApi } from '../../../lib/api';
import { toast } from 'sonner';

export default function CreateJournalEntryPage() {
  const [formData, setFormData] = useState({
    referenceNo: '',
    journalDate: new Date().toISOString().slice(0, 16),
    notes: ''
  });
  const [lines, setLines] = useState([
    { accountId: '', debit: 0, credit: 0 },
    { accountId: '', debit: 0, credit: 0 },
    { accountId: '', debit: 0, credit: 0 },
    { accountId: '', debit: 0, credit: 0 },
    { accountId: '', debit: 0, credit: 0 },
    { accountId: '', debit: 0, credit: 0 }
  ]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const { data } = await accountsApi.getAll();
      setAccounts(data);
    } catch (error) {
      console.error('Error fetching accounts:', error);
    }
  };

  const handleLineChange = (index: number, field: string, value: any) => {
    const newLines = [...lines];
    newLines[index] = { ...newLines[index], [field]: value };
    setLines(newLines);
  };

  const totalDebit = lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);
  const isBalanced = totalDebit === totalCredit && totalDebit > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isBalanced) {
      toast.error('Journal entry must be balanced (Total Debit = Total Credit) and greater than zero.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        ...formData,
        lines: lines.filter(l => l.accountId && (l.debit > 0 || l.credit > 0))
      };
      await journalEntryApi.create(payload);
      toast.success('Journal entry created successfully');
      // Reset form
      setFormData({
        referenceNo: '',
        journalDate: new Date().toISOString().slice(0, 16),
        notes: ''
      });
      setLines(Array(6).fill(null).map(() => ({ accountId: '', debit: 0, credit: 0 })));
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to create journal entry');
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { label: 'Accounting', icon: 'A' },
    { label: 'Chart of accounts', href: '/account/account' },
    { label: 'Journal Entry', active: true },
    { label: 'Transfer' },
    { label: 'Transactions' },
    { label: 'Budget' },
    { label: 'Reports' },
    { label: 'Settings' }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Sub-navigation Tabs */}
        <div className="flex border-b border-gray-200 mb-8 overflow-x-auto">
          {tabs.map((tab, idx) => (
            <button
              key={idx}
              className={`px-6 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                tab.active 
                  ? 'border-blue-600 text-blue-600' 
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.icon && <span className="mr-2 inline-flex items-center justify-center w-5 h-5 bg-gray-200 rounded-full text-[10px] text-gray-600">{tab.icon}</span>}
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Journal Entry</h2>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                Reference No:
                <Info className="w-3.5 h-3.5 text-blue-500 cursor-help" />
              </label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                value={formData.referenceNo}
                onChange={e => setFormData({ ...formData, referenceNo: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Journal Date:*</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input
                  type="datetime-local"
                  required
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={formData.journalDate}
                  onChange={e => setFormData({ ...formData, journalDate: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="mb-8">
            <label className="block text-sm font-medium text-gray-700 mb-1">Additional notes</label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
              rows={3}
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
            ></textarea>
          </div>

          <div className="overflow-x-auto mb-6">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-y border-gray-200 text-xs uppercase text-gray-500 font-semibold">
                  <th className="px-4 py-3 w-12 text-center">#</th>
                  <th className="px-4 py-3 min-w-[300px]">Account</th>
                  <th className="px-4 py-3 w-48 text-right">Debit</th>
                  <th className="px-4 py-3 w-48 text-right">Credit</th>
                  <th className="px-4 py-3 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {lines.map((line, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-3 text-center text-sm text-gray-500">{idx + 1}</td>
                    <td className="px-2 py-2">
                      <select
                        className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none text-sm"
                        value={line.accountId}
                        onChange={e => handleLineChange(idx, 'accountId', e.target.value)}
                      >
                        <option value="">Please Select</option>
                        {accounts.map(acc => (
                          <option key={acc.id} value={acc.id}>{acc.account_code} - {acc.account_name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none text-sm text-right"
                        value={line.debit || ''}
                        onChange={e => handleLineChange(idx, 'debit', parseFloat(e.target.value) || 0)}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        className="w-full px-3 py-2 border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:outline-none text-sm text-right"
                        value={line.credit || ''}
                        onChange={e => handleLineChange(idx, 'credit', parseFloat(e.target.value) || 0)}
                      />
                    </td>
                    <td className="px-4 py-3">
                        <button 
                            type="button" 
                            onClick={() => {
                                const newLines = lines.filter((_, i) => i !== idx);
                                setLines(newLines);
                            }}
                            className="text-gray-400 hover:text-red-500"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-b border-gray-200">
                <tr>
                    <td colSpan={2} className="px-4 py-3 text-right font-bold text-gray-700">Total:</td>
                    <td className="px-4 py-3 text-right font-bold text-blue-600">{totalDebit.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-bold text-blue-600">{totalCredit.toLocaleString()}</td>
                    <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex justify-between items-center">
            <button
              type="button"
              onClick={() => setLines([...lines, { accountId: '', debit: 0, credit: 0 }])}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Plus className="w-4 h-4" />
              Add Row
            </button>
            <div className="flex items-center gap-4">
                {!isBalanced && totalDebit > 0 && (
                    <span className="text-sm text-red-600 font-medium">Entry is not balanced</span>
                )}
                <button
                    type="submit"
                    disabled={loading || !isBalanced}
                    className="px-8 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
                >
                    {loading ? 'Saving...' : 'Save'}
                </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
