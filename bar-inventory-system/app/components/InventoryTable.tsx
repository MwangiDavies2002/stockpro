/** biome-ignore-all lint/a11y/useButtonType: <explanation> */

'use client';

import { useState } from 'react';
import { Edit2, Trash2, Plus, RefreshCw, AlertTriangle } from 'lucide-react';

export interface InventoryItem {
  id: number;
  name: string;
  category: string;
  unit: string;
  stock: number;
  threshold: number;
  price: number;
  sold: number;
  supplierId?: number;
}

interface InventoryTableProps {
  items: InventoryItem[];
  isAdmin: boolean;
  onEdit: (item: InventoryItem) => void;
  onDelete: (id: number) => void;
  onRestock: (item: InventoryItem) => void;
  onSell: (id: number) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  Beers:     'bg-blue-50 text-blue-700',
  Spirits:   'bg-purple-50 text-purple-700',
  Wines:     'bg-pink-50 text-pink-700',
  Mixers:    'bg-teal-50 text-teal-700',
  Garnishes: 'bg-yellow-50 text-yellow-700',
};

/**
 * InventoryTable - presents inventory items in a sortable table (desktop)
 * and stacked cards (mobile). Accepts callbacks for edit/delete/restock/sell.
 */
export default function InventoryTable({
  items, isAdmin, onEdit, onDelete, onRestock, 
}: InventoryTableProps) {
  const [sortKey, setSortKey] = useState<keyof InventoryItem>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  /** Toggle sorting key/direction for table columns. */
  function toggleSort(key: keyof InventoryItem) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  const sorted = [...items].sort((a, b) => {
    const av = a[sortKey]; const bv = b[sortKey];
    if (typeof av === 'string' && typeof bv === 'string')
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === 'asc' ? Number(av) - Number(bv) : Number(bv) - Number(av);
  });

  /** Small helper to render current sort direction for a column. */
  function SortIcon({ col }: { col: keyof InventoryItem }) {
    if (sortKey !== col) return <span className="ml-1 text-gray-300">↕</span>;
    return <span className="ml-1 text-brand">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  /** Renders a compact stock status bar and badge for an item. */
  function StockStatus({ item }: { item: InventoryItem }) {
    const pct = Math.min(100, Math.round((item.stock / Math.max(item.threshold * 3, 1)) * 100));
    const critical = item.stock <= Math.floor(item.threshold / 2);
    const low = item.stock <= item.threshold;
    const color = critical ? 'bg-red-500' : low ? 'bg-amber-400' : 'bg-brand';
    const badge = critical ? 'bg-red-50 text-red-700' : low ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700';
    const label = critical ? 'Critical' : low ? 'Low' : 'OK';
    return (
      <div className="flex items-center gap-2">
        <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full stock-bar-fill ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge} ${critical ? 'low-stock-pulse' : ''}`}>
          {label}
        </span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">No inventory items found.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Desktop / wide screens: table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            {[
              { key: 'name',      label: 'Item'         },
              { key: 'category',  label: 'Category'     },
              { key: 'unit',      label: 'Unit'         },
              { key: 'stock',     label: 'Stock'        },
              { key: 'threshold', label: 'Threshold'    },
              { key: 'price',     label: 'Price (KES)'  },
              { key: 'sold',      label: 'Total Sold'   },
            ].map(({ key, label }) => (
              <th
                key={key}
                onClick={() => toggleSort(key as keyof InventoryItem)}
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 cursor-pointer hover:text-gray-700 whitespace-nowrap select-none"
              >
                {label}<SortIcon col={key as keyof InventoryItem} />
              </th>
            ))}
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((item) => {
            const catClass = CATEGORY_COLORS[item.category] || 'bg-gray-100 text-gray-700';
            const isLow = item.stock <= item.threshold;
            return (
              <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${isLow ? 'bg-red-50/30' : ''}`}>
                <td className="px-4 py-3 font-medium text-gray-900">
                  {isLow && <AlertTriangle className="inline w-3 h-3 text-amber-500 mr-1" />}
                  {item.name}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${catClass}`}>
                    {item.category}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{item.unit}</td>
                <td className="px-4 py-3 font-medium">{item.stock}</td>
                <td className="px-4 py-3 text-gray-500">{item.threshold}</td>
                <td className="px-4 py-3 text-gray-700">KES {item.price.toLocaleString()}</td>
                <td className="px-4 py-3 text-gray-700">{item.sold.toLocaleString()}</td>
                <td className="px-4 py-3"><StockStatus item={item} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {isAdmin && (
                      <button
                        onClick={() => onRestock(item)}
                        title="Restock"
                        className="p-1.5 rounded-md hover:bg-green-50 text-green-600 transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    )}
                                       {isAdmin && (
                      <>
                        <button
                          onClick={() => onEdit(item)}
                          title="Edit"
                          className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDelete(item.id)}
                          title="Delete"
                          className="p-1.5 rounded-md hover:bg-red-50 text-red-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards */}
      <div className="sm:hidden space-y-3">
        {sorted.map((item) => {
          const catClass = CATEGORY_COLORS[item.category] || 'bg-gray-100 text-gray-700';
          const isLow = item.stock <= item.threshold;
          return (
            <div key={item.id} className={`bg-white border border-gray-200 rounded-lg p-3 flex items-start justify-between ${isLow ? 'ring-2 ring-amber-200' : ''}`}>
              <div>
                <div className="flex items-center gap-2">
                  <div className="font-medium text-gray-900">{item.name}</div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${catClass}`}>{item.category}</span>
                </div>
                <div className="text-xs text-gray-500 mt-1">{item.unit} • KES {item.price.toLocaleString()}</div>
                <div className="mt-2 text-sm">
                  <span className="font-semibold">Stock:</span> {item.stock} &nbsp; <span className="text-gray-500">Sold: {item.sold}</span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-1">
                  {isAdmin && (
                    <button onClick={() => onRestock(item)} title="Restock" className="p-2 rounded-md hover:bg-green-50 text-green-600">
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  )}
                  
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => onEdit(item)} title="Edit" className="p-2 rounded-md hover:bg-gray-100 text-gray-500">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => onDelete(item.id)} title="Delete" className="p-2 rounded-md hover:bg-red-50 text-red-500">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// micro component used above
/** Simple SVG package icon used in empty state. */
function Package({ className }: { className?: string }) {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: <explanation>
<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
    </svg>
  );
}