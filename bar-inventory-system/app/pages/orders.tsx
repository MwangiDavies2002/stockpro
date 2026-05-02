'use client';

import { useState } from 'react';
import { Plus, Eye, CheckCircle, XCircle, Clock, Truck } from 'lucide-react';
import Navbar from '../components/Navbar';
import { toast } from 'sonner';

export interface OrderItem {
  itemId: number;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface Order {
  id: number;
  supplier: string;
  supplierId: number;
  items: OrderItem[];
  status: 'pending' | 'approved' | 'delivered' | 'cancelled';
  date: string;
  total: number;
  notes?: string;
}

const MOCK_ORDERS: Order[] = [
  {
    id: 1, supplier: 'EABL Kenya', supplierId: 1,
    items: [{ itemId:1, name:'Tusker Lager', quantity:48, unitPrice:160 }, { itemId:2, name:'White Cap', quantity:24, unitPrice:145 }],
    status: 'delivered', date: '2025-04-20', total: 11040, notes: 'Monthly restock',
  },
  {
    id: 2, supplier: 'Diageo Kenya', supplierId: 2,
    items: [{ itemId:3, name:'Johnnie Walker Black', quantity:6, unitPrice:1900 }],
    status: 'approved', date: '2025-04-22', total: 11400,
  },
  {
    id: 3, supplier: 'Beverage World', supplierId: 3,
    items: [{ itemId:6, name:'Soda Water', quantity:48, unitPrice:40 }, { itemId:10, name:'Red Bull', quantity:24, unitPrice:290 }],
    status: 'pending', date: '2025-04-25', total: 8880,
  },
  {
    id: 4, supplier: 'EABL Kenya', supplierId: 1,
    items: [{ itemId:9, name:'Pilsner Urquell', quantity:24, unitPrice:180 }],
    status: 'cancelled', date: '2025-04-18', total: 4320,
  },
];

const MOCK_SUPPLIERS = [
  { id:1, name:'EABL Kenya' },
  { id:2, name:'Diageo Kenya' },
  { id:3, name:'Beverage World' },
  { id:4, name:'Wine World KE' },
];

const STATUS_CONFIG = {
  pending:   { label:'Pending',   color:'bg-amber-50 text-amber-700',  icon: Clock       },
  approved:  { label:'Approved',  color:'bg-blue-50 text-blue-700',    icon: CheckCircle },
  delivered: { label:'Delivered', color:'bg-green-50 text-green-700',  icon: Truck       },
  cancelled: { label:'Cancelled', color:'bg-red-50 text-red-700',      icon: XCircle     },
};

const EMPTY_ORDER = { supplierId: 1, notes: '', items: [{ itemId:0, name:'', quantity:1, unitPrice:0 }] };

export default function OrdersPage() {
  const user = { name:'Admin', role:'admin', email:'admin@bar.co.ke' };
  const [orders, setOrders]         = useState<Order[]>(MOCK_ORDERS);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [modalOpen, setModalOpen]   = useState(false);
  const [viewOrder, setViewOrder]   = useState<Order | null>(null);
  const [newOrder, setNewOrder]     = useState(EMPTY_ORDER);

  const filtered = orders.filter(o => statusFilter === 'all' || o.status === statusFilter);

  function addOrderLine() {
    setNewOrder(o => ({ ...o, items: [...o.items, { itemId:0, name:'', quantity:1, unitPrice:0 }] }));
  }

  function updateLine(idx: number, field: string, value: any) {
    setNewOrder(o => ({
      ...o,
      items: o.items.map((item, i) => i === idx ? { ...item, [field]: value } : item),
    }));
  }

  function handleCreateOrder() {
    const supplier = MOCK_SUPPLIERS.find(s => s.id === newOrder.supplierId);
    if (!supplier) return;
    const total = newOrder.items.reduce((a,i) => a + i.quantity * i.unitPrice, 0);
    const order: Order = {
      id: Date.now(),
      supplier: supplier.name,
      supplierId: newOrder.supplierId,
      items: newOrder.items,
      status: 'pending',
      date: new Date().toISOString().split('T')[0],
      total,
      notes: newOrder.notes,
    };
    setOrders(prev => [order, ...prev]);
    setModalOpen(false);
    setNewOrder(EMPTY_ORDER);
    toast.success('Order created successfully');
  }

  function updateStatus(id: number, status: Order['status']) {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    toast.success(`Order marked as ${status}`);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-base font-semibold text-gray-900">Order Management</h1>
          <button onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 bg-brand hover:bg-brand-dark text-white text-sm px-3 py-2 rounded-lg transition-colors">
            <Plus className="w-3.5 h-3.5" /> New Order
          </button>
        </div>

        {/* Status filter */}
        <div className="flex gap-1.5 flex-wrap">
          {['all','pending','approved','delivered','cancelled'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors
                ${statusFilter===s ? 'bg-brand text-white' : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
              {s}
            </button>
          ))}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-3">
          {(['pending','approved','delivered','cancelled'] as Order['status'][]).map(s => {
            const cfg = STATUS_CONFIG[s];
            const count = orders.filter(o => o.status === s).length;
            return (
              <div key={s} className="bg-white border border-gray-200 rounded-xl p-4 text-center">
                <div className="text-xl font-semibold">{count}</div>
                <div className={`text-xs mt-1 px-2 py-0.5 rounded-full inline-block font-medium ${cfg.color}`}>{cfg.label}</div>
              </div>
            );
          })}
        </div>

        {/* Orders table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Order #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Supplier</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Items</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(order => {
                  const cfg = STATUS_CONFIG[order.status];
                  const Icon = cfg.icon;
                  return (
                    <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">ORD-{order.id}</td>
                      <td className="px-4 py-3 text-gray-700">{order.supplier}</td>
                      <td className="px-4 py-3 text-gray-500">{order.items.length} item{order.items.length !== 1 ? 's' : ''}</td>
                      <td className="px-4 py-3 font-medium">KES {order.total.toLocaleString()}</td>
                      <td className="px-4 py-3 text-gray-500">{order.date}</td>
                      <td className="px-4 py-3">
                        <span className={`flex items-center gap-1 w-fit text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>
                          <Icon className="w-3 h-3" />{cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setViewOrder(order)}
                            className="text-xs border border-gray-300 px-2 py-1 rounded-md hover:bg-gray-50 flex items-center gap-1">
                            <Eye className="w-3 h-3" /> View
                          </button>
                          {order.status === 'pending' && (
                            <button onClick={() => updateStatus(order.id, 'approved')}
                              className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-md hover:bg-blue-100">
                              Approve
                            </button>
                          )}
                          {order.status === 'approved' && (
                            <button onClick={() => updateStatus(order.id, 'delivered')}
                              className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded-md hover:bg-green-100">
                              Mark Delivered
                            </button>
                          )}
                          {order.status === 'pending' && (
                            <button onClick={() => updateStatus(order.id, 'cancelled')}
                              className="text-xs bg-red-50 text-red-600 px-2 py-1 rounded-md hover:bg-red-100">
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">No orders found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* View Order Modal */}
      {viewOrder && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 border border-gray-200 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-base font-semibold">Order ORD-{viewOrder.id}</h2>
              <button onClick={() => setViewOrder(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
              <div><span className="text-gray-500">Supplier:</span> <span className="font-medium">{viewOrder.supplier}</span></div>
              <div><span className="text-gray-500">Date:</span> <span className="font-medium">{viewOrder.date}</span></div>
              <div><span className="text-gray-500">Status:</span> <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_CONFIG[viewOrder.status].color}`}>{STATUS_CONFIG[viewOrder.status].label}</span></div>
              <div><span className="text-gray-500">Total:</span> <span className="font-semibold text-brand">KES {viewOrder.total.toLocaleString()}</span></div>
            </div>
            {viewOrder.notes && <p className="text-xs text-gray-500 mb-4 bg-gray-50 p-2 rounded-lg">{viewOrder.notes}</p>}
            <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Item</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Qty</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Unit Price</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {viewOrder.items.map((item, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2">{item.name}</td>
                    <td className="px-3 py-2">{item.quantity}</td>
                    <td className="px-3 py-2">KES {item.unitPrice}</td>
                    <td className="px-3 py-2 font-medium">KES {(item.quantity * item.unitPrice).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end mt-4">
              <button onClick={() => setViewOrder(null)} className="border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* New Order Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 border border-gray-200 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-base font-semibold">Create Purchase Order</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Supplier</label>
                <select value={newOrder.supplierId}
                  onChange={e => setNewOrder(o => ({ ...o, supplierId: +e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                  {MOCK_SUPPLIERS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-700">Order Items</label>
                  <button onClick={addOrderLine} className="text-xs text-brand hover:underline flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Add line
                  </button>
                </div>
                {newOrder.items.map((line, i) => (
                  <div key={i} className="grid grid-cols-3 gap-2 mb-2">
                    <input placeholder="Item name" value={line.name}
                      onChange={e => updateLine(i, 'name', e.target.value)}
                      className="col-span-3 sm:col-span-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                    <input type="number" placeholder="Qty" min={1} value={line.quantity}
                      onChange={e => updateLine(i, 'quantity', +e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                    <input type="number" placeholder="Unit price" min={0} value={line.unitPrice}
                      onChange={e => updateLine(i, 'unitPrice', +e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                  </div>
                ))}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notes (optional)</label>
                <textarea value={newOrder.notes} onChange={e => setNewOrder(o => ({ ...o, notes: e.target.value }))}
                  rows={2} placeholder="e.g. Monthly restock"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              </div>
              <div className="text-sm font-medium text-right text-brand">
                Total: KES {newOrder.items.reduce((a,l) => a + l.quantity * l.unitPrice, 0).toLocaleString()}
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-5">
              <button onClick={() => setModalOpen(false)} className="border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={handleCreateOrder} className="bg-brand text-white px-4 py-2 rounded-lg text-sm hover:bg-brand-dark">Create Order</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
