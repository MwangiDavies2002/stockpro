'use client';
import React, { useState, useEffect } from 'react';
import { X, Globe, Plus, Trash2 } from 'lucide-react';
import { accountsApi } from '../../lib/api';

interface EditAccountModalProps {
  account: any;
  onClose: () => void;
  onSave: () => void;
}

export default function EditAccountModal({ account, onClose, onSave }: EditAccountModalProps) {
  const [formData, setFormData] = useState({
    account_name: '',
    account_number: '',
    account_type: '',
    currency: 'KES',
    notes: '',
    details: [] as { label: string; value: string }[]
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (account) {
      // Initialize with existing account data
      let detailsArray = [];
      try {
        const detailsJson = typeof account.details === 'string' ? JSON.parse(account.details) : account.details;
        if (Array.isArray(detailsJson)) {
            detailsArray = detailsJson;
        } else if (detailsJson && typeof detailsJson === 'object') {
            detailsArray = Object.entries(detailsJson).map(([label, value]) => ({ label, value: String(value) }));
        }
      } catch (e) {
        console.error("Error parsing details JSON", e);
      }

      // Ensure at least some empty rows if needed, but the spec says 6 rows of 2 empty text inputs
      while (detailsArray.length < 6) {
        detailsArray.push({ label: '', value: '' });
      }

      setFormData({
        account_name: account.name || account.account_name || '',
        account_number: account.account_number || '',
        account_type: account.type || account.account_type || '',
        currency: 'KES',
        notes: account.notes || '',
        details: detailsArray.slice(0, 6)
      });
    } else {
      // New account - 6 empty rows
      setFormData({
        account_name: '',
        account_number: '',
        account_type: '',
        currency: 'KES',
        notes: '',
        details: Array(6).fill(null).map(() => ({ label: '', value: '' }))
      });
    }
  }, [account]);

  const handleDetailChange = (index: number, field: 'label' | 'value', value: string) => {
    const newDetails = [...formData.details];
    newDetails[index][field] = value;
    setFormData({ ...formData, details: newDetails });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Convert details array back to a simpler object or keep as array based on backend needs
      // The spec says "This must save as JSON."
      const detailsJson = formData.details.filter(d => d.label.trim() || d.value.trim());
      
      const payload = {
        ...formData,
        details: detailsJson
      };

      if (account?.id) {
        await accountsApi.update(account.id, payload);
      } else {
        await accountsApi.create(payload);
      }
      onSave();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-xl font-bold text-gray-900">{account ? 'Edit Account' : 'Add Account'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded border border-red-200 text-sm">{error}</div>}
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name:*</label>
              <input
                type="text"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                value={formData.account_name}
                onChange={(e) => setFormData({ ...formData, account_name: e.target.value })}
                placeholder="e.g. NCBA"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Account Number:*</label>
              <input
                type="text"
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                value={formData.account_number}
                onChange={(e) => setFormData({ ...formData, account_number: e.target.value })}
                placeholder="e.g. 100107"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Account Type:</label>
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                value={formData.account_type}
                onChange={(e) => setFormData({ ...formData, account_type: e.target.value })}
              >
                <option value="">Please Select</option>
                <option value="NCBA">NCBA</option>
                <option value="KCB Account">KCB Account</option>
                <option value="Petty Cash">Petty Cash</option>
                <option value="Secondary Petty Cash">Secondary Petty Cash</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency:*</label>
              <div className="relative">
                <Globe className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <select
                  required
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                >
                  <option value="KES">Kenya - Kenyan shilling(KES)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Account details:</label>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="text-xs font-medium text-gray-500 uppercase">Label</div>
                <div className="text-xs font-medium text-gray-500 uppercase">Value</div>
              </div>
              <div className="space-y-2">
                {formData.details.map((detail, idx) => (
                  <div key={idx} className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="Label"
                      value={detail.label}
                      onChange={(e) => handleDetailChange(idx, 'label', e.target.value)}
                    />
                    <input
                      type="text"
                      className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="Value"
                      value={detail.value}
                      onChange={(e) => handleDetailChange(idx, 'value', e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Note:</label>
              <textarea
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                rows={3}
                placeholder="Note"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              ></textarea>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
