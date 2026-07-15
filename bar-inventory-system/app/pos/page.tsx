'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { Search, X, Banknote, Smartphone, Trash2 } from 'lucide-react';
import Navbar from '../components/Navbar';
import { inventoryApi, salesApi, authApi } from '../lib/api';
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
    loadProducts();
  }, []);

  async function loadProducts() {
    setLoading(true);
    try {
      const { data } = await inventoryApi.getAll();
      setProducts(data);
    } catch {
      toast.error('Failed to load products');
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
          price: Number(product.price),
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
    try {
      await salesApi.create({
        items: cart.map((l) => ({ itemId: l.id, quantity: l.quantity, unitPrice: l.price })),
        paymentMethod: method,
      });
      toast.success(
        `Sale recorded (${method === 'cash' ? 'Cash' : 'M-Pesa'}) — KSh ${subtotal.toLocaleString()}`
      );
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
    </div>
  );
}
