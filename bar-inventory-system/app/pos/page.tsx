'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Cookies from 'js-cookie';
import { Search, X, Banknote, Smartphone, CreditCard, Trash2, WifiOff, CloudUpload, Plus, ScanLine } from '../components/TextMark';
import Navbar from '../components/Navbar';
import {useAccess} from '../components/AccessBoundary';
import {canAct} from '../lib/access';
import Receipt from '../components/Receipt';
import { inventoryApi, salesDocumentsApi, authApi, shiftsApi, customersApi, locationsApi, discountsApi, mpesaApi } from '../lib/api';
import {showDone} from '../lib/feedback';
import { toast } from 'sonner';
import {readQueue,appendQueue,removeSynced} from '../lib/offlineQueue';

interface Product {
  id: number;
  name: string;
  category: string;
  category_id?: number;
  unit: string;
  price: number;
  stock: number;
  sold?: number;
  barcode?: string;
  sku?: string;
  image_url?: string;
}

interface CartLine {
  id: number;
  name: string;
  unit: string;
  quantity: number;
  price: number; // editable price at point of sale
  maxStock: number;
}

const todayISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export default function POSPage() {
  const router = useRouter();
  const {access}=useAccess();
  const [user, setUser] = useState<{ id: number; business_id: number; name: string; role: string; email: string } | null>(null);
  const [locations, setLocations] = useState<Array<{id:number;name:string;active:boolean|number}>>([]);
  const [locationId,setLocationId] = useState('');
  const queueKey = user && locationId ? `pos_pending_sales:${user.business_id}:${user.id}:${locationId}` : null;
  const cacheKey = user && locationId ? `pos_products_cache:${user.business_id}:${user.id}:${locationId}` : null;
  const syncLock = useRef(false);
  const checkoutRequestId = useRef<string|null>(null);
  const pendingMpesa=useRef<{id:string;requestId:string}|null>(null);
  const [mpesaPhone,setMpesaPhone]=useState('');

  const [products, setProducts] = useState<Product[]>([]);
  const [discountRules,setDiscountRules]=useState<any[]>([]);
  useEffect(()=>{if(!locationId)return;discountsApi.getAll({locationId:Number(locationId)}).then(({data})=>setDiscountRules(data)).catch(()=>setDiscountRules([]));},[locationId]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [cart, setCart]         = useState<CartLine[]>([]);
  const [checkingOut, setCheckingOut] = useState(false);
  const checkoutLockRef = useRef(false);

  const [shift, setShift] = useState<any>(null);
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [openingFloat, setOpeningFloat] = useState(0);
  const [closingCash, setClosingCash] = useState(0);
  const [receiptData, setReceiptData] = useState<any>(null);

  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [newCustomerModalOpen, setNewCustomerModalOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', creditLimit: 0 });
  const [ageVerified, setAgeVerified] = useState(false);
  const [ageModalOpen, setAgeModalOpen] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<'cash' | 'mpesa' | 'card' | 'credit' | null>(null);

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
    if (!queueKey) return;
    try{setPendingSales(readQueue(localStorage,queueKey));}
    catch(error:any){setPendingSales([]);toast.error(error.message);}
    try{const raw=localStorage.getItem(`${queueKey}:mpesa`);if(raw){const payment=JSON.parse(raw);if(typeof payment.id==='string'&&typeof payment.requestId==='string'&&Array.isArray(payment.cart)){pendingMpesa.current={id:payment.id,requestId:payment.requestId};checkoutRequestId.current=payment.requestId;setCart(payment.cart);setMpesaPhone(payment.phone||'');toast.info('Pending M-Pesa payment restored. Continue M-Pesa checkout to check it.');}}}catch{toast.error('Saved M-Pesa checkout requires payment review');}
  }, [queueKey]);

  // Auto-sync queued sales the moment we're back online
  useEffect(() => {
    if (isOnline && pendingSales.length && !syncing) {
      syncPendingSales();
    }
  }, [isOnline, queueKey, pendingSales.length]);

  async function syncPendingSales() {
    if (!pendingSales.length || syncLock.current || !queueKey) return;
    syncLock.current = true;
    setSyncing(true);
    const remaining: any[] = [];
    const accepted:string[]=[];
    let syncedCount = 0;

    for (const queued of pendingSales) {
      try {
        if (queued.businessId !== user?.business_id || queued.userId !== user?.id || queued.payload.locationId !== Number(locationId)) throw new Error('Queued sale belongs to a different shop, cashier or branch');
        await salesDocumentsApi.create(queued.payload);
        accepted.push(queued.localId);
        syncedCount++;
      } catch {
        remaining.push(queued); // keep it queued, try again next time
      }
    }

    try{setPendingSales(removeSynced(localStorage,queueKey,accepted));}
    catch(error:any){toast.error(`Could not update the offline queue: ${error.message}. Retrying remains safe.`);}
    setSyncing(false);
    syncLock.current = false;

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
    if (creditModalOpen && !customers.length) {
      customersApi.getAll().then((res) => setCustomers(res.data)).catch(() => {});
    }
  }, [creditModalOpen]);

  useEffect(() => {
    shiftsApi.getCurrent().then((res) => setShift(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    locationsApi.getAll().then(res=>{const active=res.data.filter((row:any)=>row.active!==false&&Number(row.active)!==0);setLocations(active);setLocationId(active[0]?String(active[0].id):'');}).catch(()=>toast.error('Failed to load business locations'));
  }, [user?.id]);
  useEffect(() => { if (user && locationId) {setCart([]);void loadProducts();} },[user?.id,locationId]);

  async function loadProducts() {
    setLoading(true);
    try {
      const { data } = await inventoryApi.getAll({locationId:Number(locationId)});
      setProducts(data);
      if (cacheKey) localStorage.setItem(cacheKey, JSON.stringify(data));
    } catch {
      // If the request failed because we're offline, fall back to the
      // last known product list instead of showing an empty grid.
      const cached = cacheKey ? localStorage.getItem(cacheKey) : null;
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
    ).sort((a, b) =>
      Number(b.stock > 0) - Number(a.stock > 0) ||
      Number(b.sold || 0) - Number(a.sold || 0) ||
      a.name.localeCompare(b.name)
    );
  }, [products, catFilter, search]);
  const topSellers = useMemo(() =>
    filtered.filter((product) => product.stock > 0 && Number(product.sold) > 0).slice(0, 6),
    [filtered]
  );
  const categories = useMemo(() => ['All', ...Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort()], [products]);

  function addToCart(product: Product) {
    if(pendingMpesa.current)return toast.error('Resolve the pending M-Pesa payment before editing this cart');
    checkoutRequestId.current=null;
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
    if(pendingMpesa.current)return toast.error('Resolve the pending M-Pesa payment before editing this cart');
    checkoutRequestId.current=null;
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
    if(!canAct(access,'sales','price'))return toast.error('Your role cannot change selling prices');
    if(pendingMpesa.current)return toast.error('Resolve the pending M-Pesa payment before editing this cart');
    checkoutRequestId.current=null;
    setCart((prev) => prev.map((l) => {
      if (l.id !== id) return l;
      if (price < 0) return l;
      return { ...l, price };
    }));
  }

  function removeLine(id: number) {
    if(pendingMpesa.current)return toast.error('Resolve the pending M-Pesa payment before editing this cart');
    checkoutRequestId.current=null;
    setCart((prev) => prev.filter((l) => l.id !== id));
  }

  function clearCart() {
    if(pendingMpesa.current)return toast.error('Resolve the pending M-Pesa payment before clearing this cart');
    checkoutRequestId.current=null;
    setCart([]);
  }

  const itemCount = cart.reduce((sum, l) => sum + l.quantity, 0);
  function discountFor(line:CartLine, customerId?:number){
    const product=products.find(product=>product.id===line.id);
    return Math.max(0,...discountRules.filter(rule=>rule.active&&Number(rule.location_id)===Number(locationId)&&((rule.applies_to==='product'&&Number(rule.product_id)===line.id)||(rule.applies_to==='category'&&product?.category_id&&Number(rule.category_id)===Number(product.category_id))||(rule.applies_to==='customer'&&customerId&&Number(rule.customer_id)===customerId))).map(rule=>rule.discount_type==='percent'?Number(rule.value):Math.min(100,Number(rule.value)/line.price*100)));
  }
  const saleTotal=(customerId?:number)=>Number(cart.reduce((sum,line)=>{const gross=Number((line.quantity*line.price).toFixed(2));return sum+gross-Number((gross*discountFor(line,customerId)/100).toFixed(2));},0).toFixed(2));
  const subtotal = saleTotal();

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

  async function checkout(method: 'cash' | 'mpesa' | 'card' | 'credit', customerId?: number) {
    if(pendingMpesa.current&&method!=='mpesa')return toast.error('Resolve the pending M-Pesa payment before using another payment method');
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
      type: 'pos' as const,
      requestId: checkoutRequestId.current ||= crypto.randomUUID(),
      locationId: Number(locationId),
      date: todayISO(),
      payment: method === 'credit' ? undefined : { amount: saleTotal(customerId), method },
      items: cart.map((l) => ({ itemId: l.id, quantity: l.quantity, unitPrice: l.price, discountPercent:discountFor(l,customerId) })),
      paymentMethod: method,
      customerId: method === 'credit' ? customerId : undefined,
    };

    if (!ageVerified) {
      setPendingPayment(method);
      setAgeModalOpen(true);
      setCheckingOut(false);
      checkoutLockRef.current = false;
      return;
    }

    // Credit sales need a live server check against the customer's
    // balance/limit, so they can't be queued offline like cash/M-Pesa can.
    if ((method === 'credit'||method === 'mpesa') && !isOnline) {
      toast.error(`${method === 'mpesa'?'M-Pesa':'Credit'} sales require an internet connection`);
      setCheckingOut(false);
      checkoutLockRef.current = false;
      return;
    }

    // -- Offline path: queue locally instead of hitting the API --
    if (!isOnline) {
      const queuedSale = {
        localId: salePayload.requestId,
        businessId: user?.business_id,
        userId: user?.id,
        payload: salePayload,
        queuedAt: new Date().toISOString(),
      };
      try{if(!queueKey)throw new Error('Select a shop and location before saving an offline sale');setPendingSales(appendQueue(localStorage,queueKey,queuedSale));}
      catch(error:any){toast.error(`Sale was not saved: ${error.message}`);setCheckingOut(false);checkoutLockRef.current=false;return;}

      // Optimistically deduct stock locally so the cashier sees it reflected,
      // even though the server hasn't confirmed it yet.
      setProducts((prev) =>
        prev.map((p) => {
          const line = cart.find((l) => l.id === p.id);
          return line ? { ...p, stock: p.stock - line.quantity, sold: Number(p.sold || 0) + line.quantity } : p;
        })
      );

      setReceiptData({
        saleId: queuedSale.localId,
        items: cart.map((l) => ({ item_name: l.name, quantity: l.quantity, unit_price: l.price,line_total:Number((l.quantity*l.price-Number((l.quantity*l.price*discountFor(l,customerId)/100).toFixed(2))).toFixed(2)) })),
        total: subtotal,
        paymentMethod: method,
        cashierName: user?.name,
        offline: true,
      });
      toast.warning('Offline — sale saved locally, will sync when connection returns');
      clearCart();
      setAgeVerified(false);
      setCheckingOut(false);
      checkoutLockRef.current = false;
      return;
    }

    // -- Online path: normal atomic sale --
    try {
      let data:any;
      if(method==='mpesa'){
        if(!/^\+?(?:254|0)[17]\d{8}$/.test(mpesaPhone))throw new Error('Enter a valid M-Pesa phone number');
        if(!Number.isInteger(salePayload.payment?.amount))throw new Error('M-Pesa requires a whole-shilling total. Use another payment method for this sale.');
        if(pendingMpesa.current&&pendingMpesa.current.requestId!==salePayload.requestId)throw new Error('Resolve the previous M-Pesa payment before changing this cart');
        if(!pendingMpesa.current){const response=await mpesaApi.initiateSTK({phone:mpesaPhone,amount:salePayload.payment!.amount,purpose:'sale',sale:salePayload});pendingMpesa.current={id:response.data.checkoutRequestId,requestId:salePayload.requestId};try{if(queueKey)localStorage.setItem(`${queueKey}:mpesa`,JSON.stringify({...pendingMpesa.current,cart,phone:mpesaPhone}));}catch{toast.warning('Keep this page open until payment is resolved; checkout could not be saved locally');}}
        toast.info('Confirm the M-Pesa request on your phone. Waiting for verified payment.');
        let documentId:number|undefined;
        for(let attempt=0;attempt<45;attempt++){
          const response=await mpesaApi.getStatus(pendingMpesa.current.id);
          if(response.data.status==='failed'){pendingMpesa.current=null;checkoutRequestId.current=null;if(queueKey)localStorage.removeItem(`${queueKey}:mpesa`);throw new Error('M-Pesa payment failed or was cancelled');}
          if(response.data.status==='needs_action')throw new Error('Payment received; sale needs review. Do not charge the customer again.');
          if(response.data.status==='completed'&&response.data.reference_id){documentId=response.data.reference_id;break;}
          await new Promise(resolve=>setTimeout(resolve,2000));
        }
        if(!documentId)throw new Error('Payment is still pending. Retry this unchanged cart to check the same payment request.');
        data=(await salesDocumentsApi.getOne(documentId)).data;
        pendingMpesa.current=null;if(queueKey)localStorage.removeItem(`${queueKey}:mpesa`);showDone();
      }else data=(await salesDocumentsApi.create(salePayload)).data;
      setReceiptData({
        saleId: data.sale_id || data.saleId || data.id,
        items: data.items.map((item: any) => ({ item_name: item.item_name, quantity: item.quantity, unit_price: item.unit_price,line_total:Number(item.line_total) })),
        total: Number(data.total),
        paymentMethod: method,
        cashierName: user?.name,
      });
      clearCart();
      setAgeVerified(false);
      await loadProducts();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Sale failed');
    } finally {
      setCheckingOut(false);
      checkoutLockRef.current = false;
    }
  }

  function scanBarcode() {
    const code = barcodeInput.trim().toLowerCase();
    if (!code) return;
    const match = products.find((p) => p.barcode?.toLowerCase() === code || p.sku?.toLowerCase() === code);
    if (!match) { toast.error('No product found for that barcode/SKU'); return; }
    addToCart(match);
    setBarcodeInput('');
  }

  async function handleAddCustomer() {
    if (!newCustomer.name.trim()) {
      toast.error('Customer name is required');
      return;
    }
    try {
      const { data } = await customersApi.create(newCustomer);
      setCustomers(prev => [data, ...prev]);
      setSelectedCustomerId(data.id);
      setNewCustomerModalOpen(false);
      setNewCustomer({ name: '', phone: '', creditLimit: 0 });
      toast.success('Customer added and selected');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to add customer');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar user={user} />

      <div className="max-w-[1600px] mx-auto px-4 pt-3 space-y-2">
        <label className="block text-sm font-medium">Business location<select aria-label="POS business location" value={locationId} disabled={!!cart.length || syncing || !!pendingSales.length} onChange={event=>setLocationId(event.target.value)} className="ml-3 rounded-sm border border-gray-300 p-2"><option value="">Choose location</option>{locations.map(location=><option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        {!isOnline && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-sm px-4 py-2 text-sm text-red-800">
            <WifiOff className="w-4 h-4" />
            You're offline — sales will be saved locally and synced automatically when you're back online.
          </div>
        )}
        {isOnline && pendingSales.length > 0 && (
          <div className="flex items-center justify-between gap-2 bg-blue-50 border border-blue-200 rounded-sm px-4 py-2 text-sm text-blue-800">
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
          <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-sm px-4 py-2 text-sm">
            <span className="text-green-800">
              Shift open · Float: KSh {Number(shift.opening_float).toLocaleString()}
            </span>
            <button onClick={() => setShiftModalOpen(true)} className="text-green-700 font-medium hover:underline">
              Close Shift
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-sm px-4 py-2 text-sm">
            <span className="text-amber-800">No shift open — sales won't be tracked in cash reconciliation</span>
            <button onClick={() => setShiftModalOpen(true)} className="text-amber-700 font-medium hover:underline">
              Open Shift
            </button>
          </div>
        )}
      </div>

      <main className="max-w-[1600px] mx-auto px-4 py-4 grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4">
        {/* -- Left: Cart ------------------------------- */}
        <div className="bg-white rounded-sm border border-gray-200 flex flex-col">
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
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase text-gray-400">Price</label>
                    <input
                      type="number"
                      min={0}
                      disabled={!canAct(access,'sales','price')} value={line.price}
                      onChange={(e) => updatePrice(line.id, parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
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
                className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-sm"
              >
                <Banknote className="w-4 h-4" /> Cash
              </button>
              <button
                onClick={() => checkout('card')}
                disabled={checkingOut || !cart.length}
                className="flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-sm"
              >
                <CreditCard className="w-4 h-4" /> Card
              </button>
              <button
                onClick={() => checkout('mpesa')}
                disabled={checkingOut || !cart.length}
                className="flex items-center justify-center gap-2 bg-green-800 hover:bg-green-900 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-sm"
              >
                <Smartphone className="w-4 h-4" /> M-Pesa
              </button>
            </div>
            <label className="block text-xs text-gray-600">M-Pesa phone number<input type="tel" placeholder="07XXXXXXXX" value={mpesaPhone} onChange={event=>setMpesaPhone(event.target.value)} disabled={checkingOut} className="mt-1 w-full border rounded-sm px-3 py-2 text-sm"/></label>
            <button
              onClick={() => setCreditModalOpen(true)}
              disabled={checkingOut || !cart.length}
              className="w-full flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-sm"
            >
              Credit / Tab
            </button>
            <button
              onClick={clearCart}
              disabled={!cart.length}
              className="w-full flex items-center justify-center gap-2 text-gray-500 hover:text-red-500 text-xs py-1.5 disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear cart
            </button>
          </div>
        </div>

        {/* -- Right: Product grid ------------------------- */}
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative w-full flex gap-2">
              <ScanLine className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input type="text" placeholder="Scan barcode or enter SKU..." value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') scanBarcode(); }}
                className="flex-1 pl-10 pr-4 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              <button onClick={scanBarcode} className="px-4 py-2 rounded-sm bg-gray-900 text-white text-sm">Scan / Add</button>
            </div>
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => setCatFilter(c)}
                  className={`px-3 py-1.5 rounded-sm text-xs font-medium border ${
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

          {!loading && topSellers.length > 0 && (
            <section className="rounded-sm border border-green-200 bg-green-50 p-3" aria-label="Top selling product suggestions">
              <h2 className="text-sm font-semibold text-green-900">Suggested top sellers</h2>
              <p className="text-xs text-green-700 mt-1">Ranked by total units sold. Tap to add to your cart.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                {topSellers.map((product, index) => (
                  <button key={product.id} onClick={() => addToCart(product)}
                    className="rounded-sm border border-green-200 bg-white p-3 text-left hover:border-green-500  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500">
                    <span className="text-[11px] font-semibold text-green-700">#{index + 1} best seller</span>
                    <p className="text-sm font-medium text-gray-900 line-clamp-2 mt-1">{product.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{Number(product.sold).toLocaleString()} sold · {product.stock} in stock</p>
                    <p className="text-sm font-semibold text-green-700 mt-2">KSh {Number(product.price).toLocaleString()}</p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {loading ? (
            <div className="text-center py-16 text-sm text-gray-400">Loading products...</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filtered.map((product) => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  disabled={product.stock <= 0}
                  className="bg-white border border-gray-200 rounded-sm p-3 text-left hover:border-green-500  transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {product.image_url && <img src={product.image_url} alt="" className="w-full h-28 object-cover rounded-sm mb-2" />}
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

      {/* -- Credit sale: customer picker ------------------- */}
      {ageModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded-sm max-w-sm w-full p-6 space-y-4">
            <h2 className="text-lg font-semibold">Age verification required</h2>
            <p className="text-sm text-gray-600">Confirm the customer is legally permitted to purchase alcohol before completing this sale.</p>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ageVerified} onChange={(e) => setAgeVerified(e.target.checked)} /> Customer is of legal drinking age</label>
            <div className="flex gap-2"><button onClick={() => { setAgeModalOpen(false); setPendingPayment(null); }} className="flex-1 border rounded-sm py-2 text-sm">Cancel</button>
              <button disabled={!ageVerified} onClick={() => { setAgeModalOpen(false); const method = pendingPayment; setPendingPayment(null); if (method) checkout(method); }} className="flex-1 bg-green-600 disabled:opacity-50 text-white rounded-sm py-2 text-sm">Verify & Continue</button></div>
          </div>
        </div>
      )}

      {creditModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-sm max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Sell on Credit</h2>
              <button onClick={() => { setCreditModalOpen(false); setSelectedCustomerId(null); setCustomerSearch(''); }}>
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search customer..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <button
                onClick={() => setNewCustomerModalOpen(true)}
                className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-sm text-sm "
                title="Add New Customer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto space-y-1.5">
              {customers
                .filter((c) => c.name.toLowerCase().includes(customerSearch.toLowerCase()))
                .map((c) => {
                  const over = Number(c.balance) > Number(c.credit_limit);
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelectedCustomerId(c.id)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-sm border text-left ${
                        selectedCustomerId === c.id ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">{c.name}</p>
                        <p className="text-xs text-gray-500">
                          Balance: KSh {Number(c.balance).toLocaleString()} / KSh {Number(c.credit_limit).toLocaleString()}
                        </p>
                        <p className="text-[11px] text-green-700 mt-1">{Number(c.points || 0).toLocaleString()} loyalty points · {c.tier || 'Member'}</p>
                      </div>
                      {over && <span className="text-[10px] text-red-600 font-medium">OVER LIMIT</span>}
                    </button>
                  );
                })}
              {!customers.length && <p className="text-xs text-gray-400 text-center py-4">No customers yet — add one on the Customers page</p>}
            </div>
            <button
              onClick={() => {
                if (!selectedCustomerId) {
                  toast.error('Select a customer first');
                  return;
                }
                setCreditModalOpen(false);
                checkout('credit', selectedCustomerId);
                setSelectedCustomerId(null);
                setCustomerSearch('');
              }}
              disabled={!selectedCustomerId}
              className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-sm text-sm font-medium"
            >
              Confirm Credit Sale
            </button>
            <Link href="/loyalty/rewards" className="block text-center text-xs text-green-700 hover:underline">Open rewards for this customer</Link>
          </div>
        </div>
      )}

      {/* -- Add Customer Modal ------------------- */}
      {newCustomerModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-sm max-w-sm w-full p-6 space-y-4">
            <h2 className="text-lg font-semibold">Add New Customer</h2>
            <div className="space-y-3">
              <div>
                <label htmlFor="pos-customer-name" className="text-xs font-medium text-gray-600 mb-1 block">Customer name</label>
                <input id="pos-customer-name"
                  type="text"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label htmlFor="pos-customer-phone" className="text-xs font-medium text-gray-600 mb-1 block">Mobile number</label>
                <input id="pos-customer-phone"
                  type="text"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label htmlFor="pos-customer-credit" className="text-xs font-medium text-gray-600 mb-1 block">Credit Limit (KSh)</label>
                <input id="pos-customer-credit"
                  type="number"
                  value={newCustomer.creditLimit}
                  onChange={(e) => setNewCustomer({ ...newCustomer, creditLimit: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setNewCustomerModalOpen(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-sm text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleAddCustomer}
                className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-sm text-sm font-medium"
              >
                Save & Select
              </button>
            </div>
          </div>
        </div>
      )}

      {/* -- Shift open/close modal ----------------------- */}
      {shiftModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-sm max-w-sm w-full p-6 space-y-4">
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShiftModalOpen(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-sm text-sm">Cancel</button>
                  <button onClick={closeShift} className="flex-1 px-4 py-2 bg-green-600 text-white rounded-sm text-sm">Close Shift</button>
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShiftModalOpen(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-sm text-sm">Cancel</button>
                  <button onClick={openShift} className="flex-1 px-4 py-2 bg-green-600 text-white rounded-sm text-sm">Open Shift</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* -- Receipt after successful checkout --------------- */}
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
