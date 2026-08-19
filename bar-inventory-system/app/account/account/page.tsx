'use client';
import React, { useState, useEffect } from 'react';
import { Plus, Search, FileText, Printer, Eye, Book, Send, Download, Power, Edit, BookOpen, List, ChevronDown } from 'lucide-react';
import Navbar from '../../components/Navbar';
import { treasuryApi, accountsApi, mpesaApi } from '../../lib/api';
import EditAccountModal from '../../components/treasury/EditAccountModal';
import Link from 'next/link';

export default function TreasuryPage() {
  const [activeTab, setActiveTab] = useState('accounts');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('Active');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [unlinkedCount, setUnlinkedCount] = useState(0);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: treasuryData } = await treasuryApi.getAll();
      setAccounts(treasuryData);
      
      // Check for unlinked payments
      // Generic check for payments without account_id
      const { data: payments } = await mpesaApi.getPayments();
      // Assuming 'payments' is an array of objects
      const unlinked = Array.isArray(payments) ? payments.filter((p: any) => !p.account_id).length : 0;
      setUnlinkedCount(unlinked || 0);
    } catch (error) {
      console.error('Error fetching accounts:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredAccounts = accounts.filter(acc => 
    (acc.name?.toLowerCase().includes(search.toLowerCase()) || 
     acc.account_number?.toLowerCase().includes(search.toLowerCase())) &&
    (status === 'All' || acc.status?.toLowerCase() === status.toLowerCase())
  );

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(val);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Red Alert Banner */}
        {unlinkedCount > 0 && (
          <div className="bg-red-600 text-white px-4 py-3 rounded-md mb-6 flex justify-between items-center">
            <span>Total {unlinkedCount} payments not linked with any account.</span>
            <Link href="/payments/unlinked" className="underline font-medium">View Details</Link>
          </div>
        )}

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Treasury</h1>
          <p className="text-gray-600">Manage your account</p>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6">
          <button
            onClick={() => setActiveTab('accounts')}
            className={`flex items-center gap-2 px-6 py-3 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'accounts' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            Accounts
          </button>
          <button
            onClick={() => setActiveTab('types')}
            className={`flex items-center gap-2 px-6 py-3 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'types' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <List className="w-4 h-4" />
            Account Types
          </button>
        </div>

        {/* Toolbar 1 */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="relative">
            <select 
              value={status} 
              onChange={(e) => setStatus(e.target.value)}
              className="bg-white border border-gray-300 rounded-md px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option>Active</option>
              <option>Inactive</option>
              <option>Closed</option>
            </select>
          </div>
          <button 
            className="flex items-center gap-2 bg-[#2563eb] text-white px-6 py-2 rounded-full text-sm font-medium hover:bg-blue-700 transition-colors"
            onClick={() => { setSelectedAccount(null); setEditModalOpen(true); }}
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </div>

        {/* Toolbar 2 */}
        <div className="bg-white p-4 rounded-t-lg border-x border-t border-gray-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            Show 
            <select className="border border-gray-300 rounded px-2 py-1">
              <option>25</option>
              <option>50</option>
              <option>100</option>
            </select>
            entries
          </div>

          <div className="flex items-center gap-1">
            {['CSV', 'Excel', 'Print', 'Column visibility', 'PDF'].map(btn => (
              <button key={btn} className="px-3 py-1 border border-gray-300 rounded text-xs font-medium text-gray-600 hover:bg-gray-50">
                {btn === 'Column visibility' ? btn : `Export ${btn}`}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border-x border-b border-gray-200 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-y border-gray-200">
              <tr>
                <th className="px-4 py-3 font-semibold text-gray-700">Name</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Account Type</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Account Sub Type</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Account Number</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Note</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Balance</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Account details</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Added By</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">Loading accounts...</td></tr>
              ) : filteredAccounts.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">No accounts found</td></tr>
              ) : (
                filteredAccounts.map((acc) => (
                  <tr key={acc.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{acc.name}</td>
                    <td className="px-4 py-3 text-gray-600">{acc.type}</td>
                    <td className="px-4 py-3 text-gray-600">-</td>
                    <td className="px-4 py-3 text-gray-600">{acc.account_number}</td>
                    <td className="px-4 py-3 text-gray-600">{acc.notes}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{formatCurrency(acc.current_balance)}</td>
                    <td className="px-4 py-3 text-gray-600">-</td>
                    <td className="px-4 py-3 text-gray-600">Davies</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button 
                            className="p-1.5 border border-purple-400 text-purple-600 rounded-full hover:bg-purple-50"
                            onClick={() => { setSelectedAccount(acc); setEditModalOpen(true); }}
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <Link href={`/treasury/${acc.id}/book`} className="p-1.5 border border-yellow-400 text-yellow-600 rounded-full hover:bg-yellow-50">
                          <Book className="w-3.5 h-3.5" />
                        </Link>
                        <button className="p-1.5 border border-blue-400 text-blue-600 rounded-full hover:bg-blue-50">
                          <Send className="w-3.5 h-3.5" />
                        </button>
                        <button className="p-1.5 border border-green-400 text-green-600 rounded-full hover:bg-green-50">
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button className="p-1.5 border border-red-400 text-red-600 rounded-full hover:bg-red-50">
                          <Power className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td colSpan={5} className="px-4 py-3 text-right font-semibold">Total:</td>
                <td colSpan={4} className="px-4 py-3 font-bold">{formatCurrency(filteredAccounts.reduce((sum, a) => sum + (parseFloat(a.current_balance) || 0), 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="mt-4 flex justify-between items-center text-sm text-gray-600">
          <div>Showing 1 to {filteredAccounts.length} of {filteredAccounts.length} entries</div>
          <div className="flex gap-1">
            <button className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50">Previous</button>
            <button className="px-3 py-1 bg-blue-600 text-white rounded">1</button>
            <button className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50">Next</button>
          </div>
        </div>
      </main>

      {editModalOpen && (
        <EditAccountModal 
          account={selectedAccount} 
          onClose={() => setEditModalOpen(false)} 
          onSave={fetchData} 
        />
      )}
    </div>
  );
}
