'use client';

import {useAccess} from './AccessBoundary';
import {canAct} from '../lib/access';
import { useState, useEffect } from 'react';
import { AlertTriangle } from './TextMark';

export interface InventoryItem {
  id: number;
  name: string;
  category: string;
  unit: string;
  stock: number;
  threshold: number;
  cost: number;
  price: number;
  sold: number;
  supplierId?: number;
  sku?: string;
  barcode?: string;
  brand?: string;
  location_id?: number;
  location_name?: string;
  image_url?: string;
}

interface InventoryTableProps {
  items: InventoryItem[];
  isAdmin: boolean;
  onEdit: (item: InventoryItem) => void;
  onDelete: (id: number) => void;
  onRestock: (item: InventoryItem) => void;
  onAdjust?: (item: InventoryItem) => void;
  onSell?: (id: number) => void;
  onView?: (item: InventoryItem) => void;
  onDuplicate?: (item: InventoryItem) => void;
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
  items, isAdmin, onEdit, onDelete, onRestock, onAdjust, onView, onDuplicate,
}: InventoryTableProps) {
  const {access}=useAccess();
  const [sortKey, setSortKey] = useState<keyof InventoryItem>('name');
  const [page,setPage]=useState(1);
  useEffect(()=>setPage(1),[items]);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');


  function ProductActions({ item }: { item: InventoryItem }) {
    return <select aria-label={`Actions for ${item.name}`} value="" className="max-w-40 rounded-sm border border-gray-300 bg-white p-2 text-sm" onChange={event => {
      const action = event.target.value;
      if (action === 'view') onView?.(item);
      if (action === 'edit') onEdit(item);
      if (action === 'restock') onRestock(item);
      if (action === 'adjust') onAdjust?.(item);
      if (action === 'duplicate') onDuplicate?.(item);
      if (action === 'delete') onDelete(item.id);
    }}>
      <option value="" disabled>Actions</option>
      {onView && <option value="view">View / Stock history</option>}
      {canAct(access,'inventory','update') && <option value="edit">Edit product</option>}
      {canAct(access,'purchases','create') && <option value="restock">Receive purchase</option>}
      {canAct(access,'inventory','update') && onAdjust && <option value="adjust">Adjust stock</option>}
      {canAct(access,'inventory','create') && onDuplicate && <option value="duplicate">Duplicate product</option>}
      {canAct(access,'inventory','delete') && <option value="delete">Delete product</option>}
    </select>;
  }

  /** Toggle sorting key/direction for table columns. */
  function toggleSort(key: keyof InventoryItem) {
    setPage(1);
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  const sorted = [...items].sort((a, b) => {
    const av = a[sortKey]; const bv = b[sortKey];
    if (typeof av === 'string' && typeof bv === 'string')
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === 'asc' ? Number(av) - Number(bv) : Number(bv) - Number(av);
  });

  const pages=Math.max(1,Math.ceil(sorted.length/25)),currentPage=Math.min(page,pages),pageItems=sorted.slice((currentPage-1)*25,currentPage*25);

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
        <div className="w-16 h-1.5 bg-gray-100 rounded-sm overflow-hidden">
          <div className={`h-full rounded-sm stock-bar-fill ${color}`} style={{ width: `${pct}%` }} />
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-sm font-medium ${badge} ${critical ? 'low-stock-pulse' : ''}`}>
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
              { key: 'cost',      label: 'Purchase Price (KES)'   },
              { key: 'price',     label: 'Selling Price (KES)'  },
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
          {pageItems.map((item) => {
            const catClass = CATEGORY_COLORS[item.category] || 'bg-gray-100 text-gray-700';
            const isLow = item.stock <= item.threshold;
            return (
              <tr key={item.id} className={`hover:bg-gray-50  ${isLow ? 'bg-red-50/30' : ''}`}>
                <td className="px-4 py-3 font-medium text-gray-900">
                  <button type="button" onClick={() => onView?.(item)} className="text-left hover:text-brand hover:underline">
                  {item.image_url ? <img src={item.image_url} alt="" className="inline-block w-8 h-8 rounded-sm object-cover mr-2 align-middle" /> : null}
                  {isLow && <AlertTriangle className="inline w-3 h-3 text-amber-500 mr-1" />}
                  {item.name}<span className="block text-xs font-normal text-gray-500">{item.sku}{item.location_name&&` | ${item.location_name}`}{item.brand&&` | ${item.brand}`}</span>
                  </button>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-sm font-medium ${catClass}`}>
                    {item.category}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600">{item.unit}</td>
                <td className="px-4 py-3 font-medium">{item.stock}</td>
                <td className="px-4 py-3 text-gray-500">{item.threshold}</td>
                <td className="px-4 py-3 text-gray-700">KES {item.cost.toLocaleString()}</td>
                <td className="px-4 py-3 text-gray-700">KES {item.price.toLocaleString()}</td>
                <td className="px-4 py-3 text-gray-700">{item.sold.toLocaleString()}</td>
                <td className="px-4 py-3"><StockStatus item={item} /></td>
                <td className="px-4 py-3">
                  <ProductActions item={item} />
                </td>
              </tr>
            );
          })}
        </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards */}
      <div className="sm:hidden space-y-3">
        {pageItems.map((item) => {
          const catClass = CATEGORY_COLORS[item.category] || 'bg-gray-100 text-gray-700';
          const isLow = item.stock <= item.threshold;
          return (
            <div key={item.id} className={`bg-white border border-gray-200 rounded-sm p-3 flex items-start justify-between ${isLow ? 'ring-2 ring-amber-200' : ''}`}>
              <div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => onView?.(item)} className="font-medium text-gray-900 text-left hover:text-brand hover:underline">{item.image_url && <img src={item.image_url} alt="" className="w-10 h-10 rounded-sm object-cover inline-block mr-2 align-middle" />}{item.name}</button>
                  <span className={`text-xs px-2 py-0.5 rounded-sm font-medium ${catClass}`}>{item.category}</span>
                </div>
                <div className="text-xs text-gray-500 mt-1">{item.unit} • KES {item.price.toLocaleString()}</div>
                <div className="mt-2 text-sm space-y-1">
                  <div><span className="font-semibold">Stock:</span> {item.stock}</div>
                  <div><span className="font-semibold">Purchase price:</span> KES {item.cost.toLocaleString()}</div>
                  <div className="text-gray-500">Sold: {item.sold}</div>
                </div>
              </div>
              <ProductActions item={item} />
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex justify-between items-center gap-3 text-sm"><span>{items.length} products | Page {currentPage} of {pages}</span><div className="flex gap-2"><button type="button" disabled={currentPage<=1} className="border rounded-sm px-3 py-2 disabled:opacity-50" onClick={()=>setPage(n=>n-1)}>Previous</button><button type="button" disabled={currentPage>=pages} className="border rounded-sm px-3 py-2 disabled:opacity-50" onClick={()=>setPage(n=>n+1)}>Next</button></div></div>
    </div>
  );
}

// micro component used above
/** Simple SVG package icon used in empty state. */
function Package({ className }: { className?: string }) {
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: false positive
<svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
    </svg>
  );
}
