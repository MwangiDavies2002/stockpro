'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { Search, X, Banknote, Smartphone, Trash2, WifiOff, CloudUpload } from 'lucide-react';
import Navbar from '../components/Navbar';
import Receipt from '../components/Receipt';
import { inventoryApi, salesApi, authApi, shiftsApi } from '../lib/api';
import { toast } from 'sonner';

interface Product {
  id: number;
  name: string;
  category: string;
  unit: string;
  price: number;
  stock: number;
}

interface CartLine {
  id: number;
  name: string;
  unit: string;
  quantity: number;
  price: number; // editable price at point of sale
  maxStock: number;
}

const CATEGORIES = ['All', 'Beers', 'Spirits', 'Wines', 'Mixers', 'Garnishes'];

export default function POSPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; role: string; email: string } | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [cart, setCart]         = useState<CartLine[]>([]);
  const [checkingOut, setCheckingOut] = useState(false);
  const checkoutLockRef = useRef(false);

  const [shift, setShift] = useState<any>(null);
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [openingFloat, setOpeningFloat] = useState(0);
  const [closingCash, setClosingCash] = useState(0);
  const [receiptData, setReceiptData] = useState<any>(null);

  const [isOnline, setIsOnline] = useState(true);
  const [pendingSales, setPendingSales] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);

  // Track connection status
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  // Load any queued offline sales from previous sessions
  useEffect(() => {
    const stored = localStorage.getItem('pos_pending_sales');
    if (stored) {
      try {
        setPendingSales(JSON.parse(stored));
      } catch {
        localStorage.removeItem('pos_pending_sales');
      }
    }
  }, []);

  // Persist pending sales to localStorage whenever the queue changes
  useEffect(() => {
    if (pendingSales.length) {
      localStorage.setItem('pos_pending_sales', JSON.stringify(pendingSales));
    } else {
      localStorage.removeItem('pos_pending_sales');
    }
  }, [pendingSales]);

  // Auto-sync queued sales the moment we're back online
  useEffect(() => {
    if (isOnline && pendingSales.length && !syncing) {
      syncPendingSales();
    }
  }, [isOnline]);

  async function syncPendingSales() {
    if (!pendingSales.length) return;
    setSyncing(true);
    const remaining: any[] = [];
    let syncedCount = 0;

    for (const queued of pendingSales) {
      try {
        await salesApi.create(queued.payload);
        syncedCount++;
      } catch {
        remaining.push(queued); // keep it queued, try again next time
      }
    }

    setPendingSales(remaining);
    setSyncing(false);

    if (syncedCount > 0) {
      toast.success(`Synced ${syncedCount} offline sale(s)`);
      await loadProducts(); // refresh real stock counts now that they're server-side
    }
    if (remaining.length > 0) {
      toast.error(`${remaining.length} sale(s) still couldn't sync — will retry`);
    }
  }

  useEffect(() => {
    const token = Cookies.get('token');
    if (!token) {
      router.push('/login');
      return;
    }
    authApi.me()
      .then((res) => setUser(res.data))
      .catch(() => {
        Cookies.remove('token');
        router.push('/login');
      });
  }, []);

  useEffect(() => {
    shiftsApi.getCurrent().then((res) => setShift(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    setLoading(true);
    try {
      const { data } = await inventoryApi.getAll();
      setProducts(data);
      localStorage.setItem('pos_products_cache', JSON.stringify(data));
    } catch {
      // If the request failed because we're offline, fall back to the
      // last known product list instead of showing an empty grid.
      const cached = localStorage.getItem('pos_products_cache');
      if (cached) {
        try {
          setProducts(JSON.parse(cached));
          toast.warning('Offline — showing last known stock levels');
        } catch {
          toast.error('Failed to load products');
        }
      } else {
        toast.error('Failed to load products');
      }
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    return products.filter((p) =>
      (catFilter === 'All' || p.category === catFilter) &&
      p.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [products, catFilter, search]);

  function addToCart(product: Product) {
    if (product.stock <= 0) {
      toast.error(`${product.name} is out of stock`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((l) => l.id === product.id);
      if (existing) {
        if (existing.quantity + 1 > product.stock) {
          toast.error(`Only ${product.stock} in stock`);
          return prev;
        }
        return prev.map((l) =>
          l.id === product.id ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      return [
        ...prev,
        {
          id: product.id,
          name: product.name,
          unit: product.unit,
          quantity: 1,
          price: product.price,
          maxStock: product.stock,
        },
      ];
    });
  }

  function updateQuantity(id: number, qty: number) {
    setCart((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        if (qty < 1) return l;
        if (qty > l.maxStock) {
          toast.error(`Only ${l.maxStock} in stock`);
          return { ...l, quantity: l.maxStock };
        }
        return { ...l, quantity: qty };
      })
    );
  }

  function updatePrice(id: number, price: number) {
    setCart((prev) => prev.map((l) => {
      if (l.id !== id) return l;
      if (price < 0) return l;
      return { ...l, price };
    }));
  }

  function removeLine(id: number) {
    setCart((prev) => prev.filter((l) => l.id !== id));
  }

  function clearCart() {
    setCart([]);
  }

  const itemCount = cart.reduce((sum, l) => sum + l.quantity, 0);
  const subtotal  = cart.reduce((sum, l) => sum + l.quantity * l.price, 0);

  async function openShift() {
    try {
      const { data } = await shiftsApi.open(openingFloat);
      setShift(data);
      setShiftModalOpen(false);
      toast.success('Shift opened');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to open shift');
    }
  }

  async function closeShift() {
    if (!shift) return;
    try {
      const { data } = await shiftsApi.close(shift.id, closingCash);
      const variance = Number(data.variance);
      if (variance === 0) {
        toast.success('Shift closed — cash matches exactly!');
      } else if (variance > 0) {
        toast.warning(`Shift closed — KSh ${variance.toFixed(2)} over`);
      } else {
        toast.warning(`Shift closed — KSh ${Math.abs(variance).toFixed(2)} short`);
      }
      setShift(null);
      setShiftModalOpen(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to close shift');
    }
  }

  async function checkout(method: 'cash' | 'mpesa') {
    if (checkoutLockRef.current) return;
    if (!cart.length) {
      toast.error('Cart is empty');
      return;
    }
    const invalidLine = cart.find((l) => l.price <= 0 || l.quantity <= 0);
    if (invalidLine) {
      toast.error(`${invalidLine.name}: price and quantity must be greater than 0`);
      return;
    }
    checkoutLockRef.current = true;
    setCheckingOut(true);

    const salePayload = {
      items: cart.map((l) => ({ itemId: l.id, quantity: l.quantity, unitPrice: l.price })),
      paymentMethod: method,
    };

    // ── Offline path: queue locally instead of hitting the API ──
    if (!isOnline) {
      const queuedSale = {
        localId: `offline-${Date.now()}`,
        payload: salePayload,
        queuedAt: new Date().toISOString(),
      };
      setPendingSales((prev) => [...prev, queuedSale]);

      // Optimistically deduct stock locally so the cashier sees it reflected,
      // even though the server hasn't confirmed it yet.
      setProducts((prev) =>
        prev.map((p) => {
          const line = cart.find((l) => l.id === p.id);
          return line ? { ...p, stock: p.stock - line.quantity } : p;
        })
      );

      setReceiptData({
        saleId: queuedSale.localId,
        items: cart.map((l) => ({ item_name: l.name, quantity: l.quantity, unit_price: l.price })),
        total: subtotal,
        paymentMethod: method,
        cashierName: user?.name,
        offline: true,
      });
      toast.warning('Offline — sale saved locally, will sync when connection returns');
      clearCart();
      setCheckingOut(false);
      checkoutLockRef.current = false;
      return;
    }

    // ── Online path: normal atomic sale ──
    try {
      const { data } = await salesApi.create(salePayload);
      setReceiptData({
        saleId: data.sale.id,
        items: data.items,
        total: Number(data.sale.total),
        paymentMethod: method,
        cashierName: user?.name,
      });
      clearCart();
      await loadProducts();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Sale failed');
    } finally {
      setCheckingOut(false);
      checkoutLockRef.current = false;
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />

      <div className="max-w-[1600px] mx-auto px-4 pt-3 space-y-2">
        {!isOnline && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-800">
            <WifiOff className="w-4 h-4" />
            You're offline — sales will be saved locally and synced automatically when you're back online.
          </div>
        )}
        {isOnline && pendingSales.length > 0 && (
          <div className="flex items-center justify-between gap-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-800">
            <span className="flex items-center gap-2">
              <CloudUpload className="w-4 h-4" />
              {syncing ? 'Syncing offline sales...' : `${pendingSales.length} offline sale(s) waiting to sync`}
            </span>
            {!syncing && (
              <button onClick={syncPendingSales} className="text-blue-700 font-medium hover:underline">
                Sync now
              </button>
            )}
          </div>
        )}
        {shift ? (
          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm">
            <span className="text-green-800">
              Shift open · Float: KSh {Number(shift.opening_float).toLocaleString()}
            </span>
            <button onClick={() => setShiftModalOpen(true)} className="text-green-700 font-medium hover:underline">
              Close Shift
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm">
            <span className="text-amber-800">No shift open — sales won't be tracked in cash reconciliation</span>
            <button onClick={() => setShiftModalOpen(true)} className="text-amber-700 font-medium hover:underline">
              Open Shift
            </button>
          </div>
        )}
      </div>

      <main className="max-w-[1600px] mx-auto px-4 py-4 grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4">
        {/* ── Left: Cart ─────────────────────────────── */}
        <div className="bg-white rounded-lg border border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <h1 className="text-base font-semibold text-gray-900">New Sale</h1>
            <p className="text-xs text-gray-500 mt-0.5">{itemCount} item(s) in cart</p>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[55vh] divide-y divide-gray-100">
            {cart.length === 0 && (
              <div className="p-8 text-center text-sm text-gray-400">
                Click a product on the right to add it here
              </div>
            )}
            {cart.map((line) => (
              <div key={line.id} className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{line.name}</p>
                    <p className="text-xs text-gray-500">{line.unit}</p>
                  </div>
                  <button
                    onClick={() => removeLine(line.id)}
                    className="text-gray-400 hover:text-red-500 shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] uppercase text-gray-400">Qty</label>
                    <input
                      type="number"
                      min={1}
                      max={line.maxStock}
                      value={line.quantity}
                      onChange={(e) => updateQuantity(line.id, parseInt(e.target.value) || 1)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-gray-400">Price</label>
                    <input
                      type="number"
                      min={0}
                      value={line.price}
                      onChange={(e) => updatePrice(line.id, parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-gray-400">Subtotal</label>
                    <div className="px-2 py-1.5 text-sm font-medium text-gray-900">
                      {(line.quantity * line.price).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-gray-200 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Items</span>
              <span className="font-medium text-gray-900">{itemCount}</span>
            </div>
            <div className="flex items-center justify-between text-base font-semibold">
              <span>Total</span>
              <span>KSh {subtotal.toLocaleString()}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => checkout('cash')}
                disabled={checkingOut || !cart.length}
                className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg"
              >
                <Banknote className="w-4 h-4" /> Cash
              </button>
              <button
                onClick={() => checkout('mpesa')}
                disabled={checkingOut || !cart.length}
                className="flex items-center justify-center gap-2 bg-green-800 hover:bg-green-900 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg"
              >
                <Smartphone className="w-4 h-4" /> M-Pesa
              </button>
            </div>
            <button
              onClick={clearCart}
              disabled={!cart.length}
              className="w-full flex items-center justify-center gap-2 text-gray-500 hover:text-red-500 text-xs py-1.5 disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear cart
            </button>
          </div>
        </div>

        {/* ── Right: Product grid ───────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCatFilter(c)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                    catFilter === c
                      ? 'bg-green-600 text-white border-green-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="text-center py-16 text-sm text-gray-400">Loading products...</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filtered.map((product) => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  disabled={product.stock <= 0}
                  className="bg-white border border-gray-200 rounded-lg p-3 text-left hover:border-green-500 hover:shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <p className="text-sm font-medium text-gray-900 line-clamp-2">{product.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{product.category}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm font-semibold text-green-700">
                      KSh {product.price.toLocaleString()}
                    </span>
                    <span className={`text-[11px] ${product.stock <= 5 ? 'text-red-500' : 'text-gray-400'}`}>
                      {product.stock} in stock
                    </span>
                  </div>
                </button>
              ))}
              {!filtered.length && (
                <div className="col-span-full text-center py-16 text-sm text-gray-400">
                  No products match your search
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ── Shift open/close modal ─────────────────────── */}
      {shiftModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-sm w-full p-6 space-y-4">
            {shift ? (
              <>
                <h2 className="text-lg font-semibold">Close Shift</h2>
                <p className="text-sm text-gray-600">
                  Opening float: KSh {Number(shift.opening_float).toLocaleString()}
                </p>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Actual Cash Counted</label>
                  <input
                    type="number"
                    min={0}
                    value={closingCash}
                    onChange={(e) => setClosingCash(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShiftModalOpen(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
                  <button onClick={closeShift} className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm">Close Shift</button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold">Open Shift</h2>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Starting Cash Float</label>
                  <input
                    type="number"
                    min={0}
                    value={openingFloat}
                    onChange={(e) => setOpeningFloat(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShiftModalOpen(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
                  <button onClick={openShift} className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm">Open Shift</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Receipt after successful checkout ─────────────── */}
      {receiptData && (
        <Receipt
          saleId={receiptData.saleId}
          items={receiptData.items}
          total={receiptData.total}
          paymentMethod={receiptData.paymentMethod}
          cashierName={receiptData.cashierName}
          offline={receiptData.offline}
          onClose={() => setReceiptData(null)}
        />
      )}
    </div>
  );
}