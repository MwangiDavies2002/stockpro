'use client';
import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Book, Filter, Calendar, Search, ArrowLeft } from 'lucide-react';
import Navbar from '../../../components/Navbar';
import { accountsApi, treasuryApi } from '../../../lib/api';

import Link from 'next/link';

export default function AccountBookPage() {
  const { id } = useParams();
  const [account, setAccount] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    startDate: '',
    endDate: '',
    transactionType: 'All'
  });

  useEffect(() => {
    fetchAccountData();
    fetchTransactions();
  }, [id, filters]);

  const fetchAccountData = async () => {
    if (!id) return;
    const numericId = Number(id);
    try {
      // Trying to find if it is a treasury or chart of account
      // Usually the book is for a chart of account in the accounting sense
      const { data } = await accountsApi.getOne(numericId);
      setAccount(data);
    } catch (error) {
      if (Number.isNaN(numericId)) {
        console.error('Invalid account id:', id);
        return;
      }
      try {
        const { data } = await treasuryApi.getOne(numericId);
        setAccount(data);
      } catch (e) {
        console.error('Error fetching account:', e);
      }
    }
  };

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const { data } = await accountsApi.getBook(id as string, filters);
      setTransactions(data);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES' }).format(val);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-4 mb-6">
            <Link href="/account/account" className="p-2 hover:bg-gray-100 rounded-full">
                <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Account Book</h1>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="grid grid-cols-2 gap-y-3 text-sm">
              <span className="text-gray-500">Account Name:</span>
              <span className="font-semibold">{account?.account_name || account?.name || 'N/A'}</span>
              
              <span className="text-gray-500">Account Type:</span>
              <span>{account?.account_type || account?.type || 'N/A'}</span>
              
              <span className="text-gray-500">Account Number:</span>
              <span>{account?.account_code || account?.account_number || 'N/A'}</span>
              
              <span className="text-gray-500">Balance:</span>
              <span className="font-bold text-blue-600">{formatCurrency(account?.current_balance || 0)}</span>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="w-4 h-4 text-gray-500" />
              <h3 className="font-semibold text-gray-700">Filters:</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Date Range:</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="MM/DD/YYYY - MM/DD/YYYY"
                    className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Transaction Type:</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={filters.transactionType}
                  onChange={(e) => setFilters({ ...filters, transactionType: e.target.value })}
                >
                  <option value="All">All</option>
                  <option value="Debit">Debit</option>
                  <option value="Credit">Credit</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Toolbar same as Treasury */}
        <div className="bg-white p-4 rounded-t-lg border-x border-t border-gray-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            Show 
            <select className="border border-gray-300 rounded px-2 py-1">
              <option>25</option>
              <option>50</option>
            </select>
            entries
          </div>

          <div className="flex items-center gap-1 text-xs">
            {['CSV', 'Excel', 'Print', 'Column visibility', 'PDF'].map(btn => (
              <button key={btn} className="px-3 py-1 border border-gray-300 rounded font-medium text-gray-600 hover:bg-gray-50">
                {btn}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
            />
          </div>
        </div>

        {/* Transactions Table */}
        <div className="bg-white border-x border-b border-gray-200 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-y border-gray-200">
              <tr>
                <th className="px-4 py-3 font-semibold text-gray-700">Date</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Description</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Payment Method</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Payment details</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Note</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Added By</th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-right">Debit</th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-right">Credit</th>
                <th className="px-4 py-3 font-semibold text-gray-700 text-right">Balance</th>
                <th className="px-4 py-3 font-semibold text-gray-700">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-500">Loading transactions...</td></tr>
              ) : transactions.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-500">No transactions found</td></tr>
              ) : (
                transactions.map((tx, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-600">{new Date(tx.date).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        <div className="text-gray-900">{tx.description}</div>
                        {tx.customer_name && <div className="text-xs"><strong>Customer:</strong> {tx.customer_name}</div>}
                        {tx.invoice_no && <div className="text-xs"><strong>Invoice No.:</strong> <span className="text-blue-600 cursor-pointer">{tx.invoice_no}</span></div>}
                        {tx.reference && <div className="text-xs"><strong>Pay reference no.:</strong> {tx.reference}</div>}
                        <div className="text-xs"><strong>Added By:</strong> {tx.added_by || 'Davies'}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{tx.payment_method || 'Cash'}</td>
                    <td className="px-4 py-3 text-gray-600">-</td>
                    <td className="px-4 py-3 text-gray-600">{tx.note}</td>
                    <td className="px-4 py-3 text-gray-600">{tx.added_by || 'Davies'}</td>
                    <td className="px-4 py-3 text-right font-medium text-green-600">{tx.debit > 0 ? tx.debit.toLocaleString() : ''}</td>
                    <td className="px-4 py-3 text-right font-medium text-red-600">{tx.credit > 0 ? tx.credit.toLocaleString() : ''}</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">{formatCurrency(tx.balance)}</td>
                    <td className="px-4 py-3 text-gray-400">...</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
