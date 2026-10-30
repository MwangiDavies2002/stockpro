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
import { inventoryApi, salesDocumentsApi, salesApi, authApi, shiftsApi, customersApi, locationsApi, discountsApi, mpesaApi, businessSettingsApi } from '../lib/api';
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
  not_for_selling?: boolean | number;
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
const shiftCloseTime=(shift:any)=>{if(!shift?.opened_at)return null;const opened=new Date(String(shift.opened_at).replace(' ','T'));if(!Number.isFinite(opened.getTime()))return null;return new Date(opened.getTime()+Number(shift.duration_hours||12)*3600000).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});};

export default function POSPage() {
  const router = useRouter();
  const {access}=useAccess();
  const supermarketCheckout=!!access?.plan?.modules.includes('supermarket');
  const [user, setUser] = useState<{ id: number; business_id: number; name: string; role: string; email: string; business?: { businessType?: string } } | null>(null);
  const businessType = String(user?.business?.businessType || '').trim().toLowerCase();
  const requiresAgeVerification = businessType === 'bar' || businessType === 'club';
  const [locations, setLocations] = useState<Array<{id:number;name:string;active:boolean|number}>>([]);
  const [locationId,setLocationId] = useState('');
  const queueKey = user && locationId ? `pos_pending_sales:${user.business_id}:${user.id}:${locationId}` : null;
  const cacheKey = user && locationId ? `pos_products_cache:${user.business_id}:${user.id}:${locationId}` : null;
  const syncLock = useRef(false);
  const checkoutRequestId = useRef<string|null>(null);
  const pendingMpesa=useRef<{id:string;requestId:string}|null>(null);
  const [mpesaPhone,setMpesaPhone]=useState('');

  const [products, setProducts] = useState<Product[]>([]);
  const [posSettings, setPosSettings] = useState<any>({ posShortcuts:{}, disableExpressCheckout:false, hideProductSuggestions:false, disableDiscount:false, enableTransactionDate:true, disableCreditSaleButton:false });
  const [transactionDate, setTransactionDate] = useState(todayISO());
  const [paymentPickerOpen, setPaymentPickerOpen] = useState(false);
  const [cashReceived,setCashReceived]=useState('');
  const [multiPayOpen,setMultiPayOpen]=useState(false),[paymentRows,setPaymentRows]=useState<Array<{method:'cash'|'card';amount:string;referenceNo:string}>>([{method:'cash',amount:'0',referenceNo:''}]);
  const [cardModalOpen,setCardModalOpen]=useState(false),[cardReference,setCardReference]=useState(''),[cardBrand,setCardBrand]=useState('Visa');
  const [recentOpen,setRecentOpen]=useState(false),[recentSales,setRecentSales]=useState<any[]>([]),[recentLoading,setRecentLoading]=useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const productSearchRef = useRef<HTMLInputElement>(null);
  const [discountRules,setDiscountRules]=useState<any[]>([]);
  useEffect(()=>{businessSettingsApi.get().then(({data})=>setPosSettings((current:any)=>({...current,...data,posShortcuts:{...(current.posShortcuts||{}),...(data.posShortcuts||{})}}))).catch(()=>{});},[]);
  useEffect(()=>{if(!locationId)return;discountsApi.getAll({locationId:Number(locationId)}).then(({data})=>setDiscountRules(data)).catch(()=>setDiscountRules([]));},[locationId]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const barcodeInputRef=useRef<HTMLInputElement>(null);
  const [catFilter, setCatFilter] = useState('All');
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const categoryMenuRef = useRef<HTMLDivElement>(null);
  const [cart, setCart]         = useState<CartLine[]>([]);
  const [checkingOut, setCheckingOut] = useState(false);
  const checkoutLockRef = useRef(false);

  const [shift, setShift] = useState<any>(null);
  const shiftRef=useRef<any>(null);
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [shiftStatusChecked, setShiftStatusChecked] = useState(false);
  const [shiftStatusError, setShiftStatusError] = useState('');
  const [openingFloat, setOpeningFloat] = useState<number | ''>(0);
  const [closingCash, setClosingCash] = useState<number | ''>(0);
  const [receiptData, setReceiptData] = useState<any>(null);

  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [newCustomerModalOpen, setNewCustomerModalOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', creditLimit: 0 });
  const [ageVerified, setAgeVerified] = useState(false);
  const [ageModalOpen, setAgeModalOpen] = useState(false);
  const [pendingPayment, setPendingPayment] = useState<'cash' | 'mpesa' | 'card' | 'bank' | 'credit' | null>(null);
  const pendingSplitCheckout=useRef<{method:'cash'|'mpesa'|'card'|'bank'|'credit';rows:Array<{method:'cash'|'card';amount:number;referenceNo?:string}>;label?:string}|null>(null);

  const [isOnline, setIsOnline] = useState(true);
  const [pendingSales, setPendingSales] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);
  useEffect(()=>{if(supermarketCheckout&&locationId&&!loading&&!shiftModalOpen){barcodeInputRef.current?.focus();barcodeInputRef.current?.select();}},[supermarketCheckout,locationId,loading,shiftModalOpen,receiptData]);

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

  useEffect(() => {
    const normalizeKey=(key:string)=>key.toLowerCase().replace('escape','esc').replace(' ','space').replace('arrowup','up').replace('arrowdown','down').replace('arrowleft','left').replace('arrowright','right');
    const matches=(event:KeyboardEvent,shortcut:string)=>{
      const parts=String(shortcut||'').toLowerCase().split('+').filter(Boolean);
      if(!parts.length)return false;
      const modifiers=new Set(parts.filter(part=>['ctrl','alt','shift','meta'].includes(part)));
      const key=parts.find(part=>!['ctrl','alt','shift','meta'].includes(part));
      if(!key)return false;
      return event.ctrlKey===modifiers.has('ctrl')&&event.altKey===modifiers.has('alt')&&event.shiftKey===modifiers.has('shift')&&event.metaKey===modifiers.has('meta')&&normalizeKey(event.key)===normalizeKey(key);
    };
    const onShortcut=(event:KeyboardEvent)=>{
      const target=event.target;
      if(!shift||!shiftStatusChecked||shiftModalOpen||ageModalOpen||creditModalOpen||newCustomerModalOpen||paymentPickerOpen||target instanceof HTMLElement&&(target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(target.tagName)))return;
      const shortcuts=posSettings.posShortcuts||{};
      const action=Object.entries(shortcuts).find(([,value])=>matches(event,String(value||'')))?.[0];
      if(!action)return;
      event.preventDefault();
      if(action==='expressCheckout'&&!posSettings.disableExpressCheckout)void checkout('cash');
      else if(action==='payCheckout')setPaymentPickerOpen(true);
      else if(action==='cancel')clearCart();
      else if(action==='quantity')document.querySelector<HTMLInputElement>('[data-pos-quantity]')?.focus();
      else if(action==='addNewProduct')productSearchRef.current?.focus();
    };
    window.addEventListener('keydown',onShortcut);
    return()=>window.removeEventListener('keydown',onShortcut);
  },[shift,shiftStatusChecked,shiftModalOpen,ageModalOpen,creditModalOpen,newCustomerModalOpen,paymentPickerOpen,posSettings,cart,products,locationId]);

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

  useEffect(() => { void loadShiftStatus();const timer=window.setInterval(()=>{if(!document.hidden)void loadShiftStatus();},60_000);return()=>window.clearInterval(timer); }, []);

  async function loadShiftStatus() {
    setShiftStatusError('');
    try {
      const { data } = await shiftsApi.getCurrent();
      const result=data&&typeof data==='object'&&'shift' in data?data:{shift:data,autoClosed:false};
      const hadOpenShift=!!shiftRef.current;shiftRef.current=result.shift||null;setShift(result.shift||null);
      if(!result.shift)setShiftModalOpen(true);
      if(result.autoClosed||(!result.shift&&hadOpenShift))toast.warning('Your shift reached its time limit and was closed. Cash count was not recorded; open a new shift to continue.');
    } catch (err: any) {
      setShiftStatusError(err?.response?.data?.message || 'Could not verify whether a shift is already open.');
      setShiftModalOpen(true);
    } finally {
      setShiftStatusChecked(true);
    }
  }

  useEffect(() => {
    if (!user) return;
    locationsApi.getAll().then(res=>{const active=res.data.filter((row:any)=>row.active!==false&&Number(row.active)!==0);setLocations(active);const preferenceKey=`pos_last_location:${user.business_id}:${user.id}`,saved=localStorage.getItem(preferenceKey),preferred=active.find((row:any)=>String(row.id)===saved);setLocationId(String(preferred?.id??active[0]?.id??''));}).catch(()=>toast.error('Failed to load business locations'));
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
    return products.filter((p) => !p.not_for_selling &&
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

  useEffect(() => {
    if (!categoriesOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !categoryMenuRef.current?.contains(event.target)) setCategoriesOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setCategoriesOpen(false); };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', closeOnEscape); };
  }, [categoriesOpen]);

  function addToCart(product: Product) {
    if (product.not_for_selling) { toast.error(`${product.name} is marked not for selling`); return; }
    if (!shift) { setShiftModalOpen(true); toast.error('Open a shift before starting a sale'); return; }
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
    if(supermarketCheckout)requestAnimationFrame(()=>barcodeInputRef.current?.focus());
  }

  function updateQuantity(id: number, qty: number) {
    if(pendingMpesa.current)return toast.error('Resolve the pending M-Pesa payment before editing this cart');
    checkoutRequestId.current=null;
    setCart((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        if (qty < 0) return l;
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
    if(posSettings.disableDiscount)return 0;
    const product=products.find(product=>product.id===line.id);
    return Math.max(0,...discountRules.filter(rule=>rule.active&&Number(rule.location_id)===Number(locationId)&&(!rule.customer_restriction_id||(customerId&&Number(rule.customer_restriction_id)===customerId))&&((rule.applies_to==='product'&&Number(rule.product_id)===line.id)||(rule.applies_to==='category'&&product?.category_id&&Number(rule.category_id)===Number(product.category_id))||(rule.applies_to==='customer'&&customerId&&Number(rule.customer_id)===customerId))).map(rule=>rule.discount_type==='percent'?Number(rule.value):Math.min(100,Number(rule.value)/line.price*100)));
  }
  const saleTotal=(customerId?:number)=>Number(cart.reduce((sum,line)=>{const gross=Number((line.quantity*line.price).toFixed(2));return sum+gross-Number((gross*discountFor(line,customerId)/100).toFixed(2));},0).toFixed(2));
  const subtotal = saleTotal();
  useEffect(()=>{if(paymentPickerOpen)setCashReceived(String(subtotal));},[paymentPickerOpen,subtotal]);
  const grossSubtotal=Number(cart.reduce((sum,line)=>sum+line.quantity*line.price,0).toFixed(2));
  const discountSavings=Number(Math.max(0,grossSubtotal-subtotal).toFixed(2));

  async function openShift() {
    try {
      const { data } = await shiftsApi.open(Number(openingFloat || 0));
      shiftRef.current=data;setShift(data);
      setShiftStatusError('');
      setShiftModalOpen(false);
      toast.success('Shift opened');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to open shift');
    }
  }

  async function closeShift() {
    if (!shift) return;
    try {
      const { data } = await shiftsApi.close(shift.id, Number(closingCash || 0));
      const variance = Number(data.variance);
      if (variance === 0) {
        toast.success('Shift closed — cash matches exactly!');
      } else if (variance > 0) {
        toast.warning(`Shift closed — KSh ${variance.toFixed(2)} over`);
      } else {
        toast.warning(`Shift closed — KSh ${Math.abs(variance).toFixed(2)} short`);
      }
      shiftRef.current=null;setShift(null);
      setShiftModalOpen(true);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to close shift');
    }
  }

  function openMultiplePay(){setPaymentRows([{method:'cash',amount:subtotal.toFixed(2),referenceNo:''}]);setMultiPayOpen(true);}
  function addPaymentRow(){setPaymentRows(rows=>[...rows,{method:'cash',amount:'0',referenceNo:''}]);}
  async function openRecentTransactions(){setRecentOpen(true);setRecentLoading(true);try{const {data}=await salesApi.getAll();setRecentSales(data.filter((sale:any)=>!locationId||Number(sale.location_id)===Number(locationId)).slice(0,50));}catch(e:any){toast.error(e?.response?.data?.message||'Could not load recent transactions');}finally{setRecentLoading(false);}}
  function finalizeMultiplePay(){
    const rows=paymentRows.map(row=>({...row,amount:Number(row.amount)}));
    if(rows.some(row=>!Number.isFinite(row.amount)||row.amount<=0)){toast.error('Enter an amount greater than zero for every payment row');return;}
    if(rows.some(row=>row.method==='card'&&!row.referenceNo.trim())){toast.error('Enter the card terminal approval reference for each card payment');return;}
    const paid=Number(rows.reduce((sum,row)=>sum+row.amount,0).toFixed(2));
    if(Math.abs(paid-subtotal)>0.009){toast.error(`Payment rows must total KSh ${subtotal.toLocaleString()}`);return;}
    setMultiPayOpen(false);void checkout('cash',undefined,rows);
  }

  async function checkout(method: 'cash' | 'mpesa' | 'card' | 'bank' | 'credit', customerId?: number, splitPayments?:Array<{method:'cash'|'card';amount:number;referenceNo?:string}>, paymentLabel?:string) {
    if (!shift) { setShiftModalOpen(true); return toast.error('Open a shift before completing a sale'); }
    if(pendingMpesa.current&&method!=='mpesa')return toast.error('Resolve the pending M-Pesa payment before using another payment method');
    if (checkoutLockRef.current) return;
    if (!cart.length) {
      toast.error('Cart is empty');
      return;
    }
    const invalidLine = cart.find((l) => l.price <= 0 || l.quantity < 1);
    if (invalidLine) {
      toast.error(`${invalidLine.name}: price and quantity must be greater than 0`);
      return;
    }
    checkoutLockRef.current = true;
    setCheckingOut(true);

    const payments=splitPayments?.map(row=>({amount:Number(row.amount),method:row.method==='card'?'bank':row.method,referenceNo:row.referenceNo||undefined}));
    const normalizedMethod=method==='card'?'bank':method;
    const salePayload = {
      type: 'pos' as const,
      requestId: checkoutRequestId.current ||= crypto.randomUUID(),
      locationId: Number(locationId),
      date: transactionDate || todayISO(),
      payment: method === 'credit' ? undefined : payments?.length?{amount:Number(payments.reduce((sum,row)=>sum+row.amount,0).toFixed(2)),method:payments[0].method,referenceNo:payments[0].referenceNo}:{ amount: saleTotal(customerId), method:normalizedMethod },
      payments:payments?.length?payments:undefined,
      items: cart.map((l) => ({ itemId: l.id, quantity: l.quantity, unitPrice: l.price, discountPercent:discountFor(l,customerId) })),
      paymentMethod: normalizedMethod,
      customerId: method === 'credit' ? customerId : undefined,
    };

    if (requiresAgeVerification && !ageVerified) {
      if(splitPayments)pendingSplitCheckout.current={method,rows:splitPayments,label:paymentLabel};
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
        paymentMethod: paymentLabel|| (splitPayments?'Multiple':method==='bank'?'Card':method),
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
        paymentMethod: paymentLabel|| (splitPayments?'Multiple':method==='bank'?'Card':method),
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
    const match = products.find((p) => !p.not_for_selling && (p.barcode?.toLowerCase() === code || p.sku?.toLowerCase() === code));
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
    <div className="min-h-screen bg-gray-50 text-slate-900 pb-24">
      <Navbar user={user} compactForPOS hideHelpAssistant />

      <div className="mx-3 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-200 bg-white px-4 py-3 shadow-sm sm:mx-5">
        <div className="flex flex-wrap items-center gap-3"><label className="text-sm font-semibold">Location<select aria-label="POS business location" value={locationId} disabled={!!cart.length || syncing || !!pendingSales.length} onChange={event=>{setLocationId(event.target.value);if(user)localStorage.setItem(`pos_last_location:${user.business_id}:${user.id}`,event.target.value);}} className="ml-3 border border-gray-300 bg-white px-3 py-2 text-sm font-normal"><option value="">Choose location</option>{locations.map(location=><option key={location.id} value={location.id}>{location.name}</option>)}</select></label>{posSettings.enableTransactionDate&&<input aria-label="Transaction date" type="date" value={transactionDate} max={todayISO()} onChange={event=>setTransactionDate(event.target.value)} className="border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800"/>}<span className={`rounded-md px-3 py-2 text-xs font-medium ${shift?'bg-gray-100 text-gray-700':'bg-amber-50 text-amber-800'}`}>{shift?`Shift open · Float KSh ${Number(shift.opening_float).toLocaleString()}${shiftCloseTime(shift)?` · closes at ${shiftCloseTime(shift)}`:''}`:'No shift open'}</span></div>
        <div className="flex flex-wrap items-center gap-2">{cart.length>0&&<input aria-label="M-Pesa phone number" type="tel" placeholder="M-Pesa phone 07XXXXXXXX" value={mpesaPhone} onChange={event=>setMpesaPhone(event.target.value)} className="w-52 border border-gray-300 bg-white px-3 py-2 text-sm"/>}<button onClick={()=>setShiftModalOpen(true)} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50">{shift?'Close shift':'Open shift'}</button><button onClick={()=>setPaymentPickerOpen(true)} disabled={!cart.length||!shift} className="rounded-md bg-[#354f43] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#496456] disabled:opacity-50">{supermarketCheckout?'Checkout':'Point of Sale'}</button></div>
      </div>

      {!shiftStatusChecked && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" role="status" aria-live="polite">
          <div className="rounded-sm bg-white p-6 text-sm text-gray-700 shadow-xl">Checking the current shift before opening the POS…</div>
        </div>
      )}

      <div className="max-w-[1600px] mx-auto px-4 pt-2 space-y-2">
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
          <div className="flex flex-col items-start justify-between gap-2 bg-amber-50 border border-amber-200 rounded-sm px-3 py-2 text-sm sm:flex-row sm:items-center sm:px-4">
            <span className="text-amber-800">No shift open — sales won't be tracked in cash reconciliation</span>
            <button onClick={() => setShiftModalOpen(true)} className="text-amber-700 font-medium hover:underline">
              Open Shift
            </button>
          </div>
        )}
      </div>

      {supermarketCheckout&&<div className="mx-3 mt-2 rounded-sm border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900 sm:mx-5"><strong>Supermarket checkout</strong><span className="ml-2 text-emerald-800">Scan or search items, confirm the basket and take payment.</span></div>}
      <main className={`w-full min-w-0 max-w-[1800px] mx-auto px-2 py-2 pb-28 sm:px-4 grid grid-cols-1 ${supermarketCheckout?'lg:grid-cols-[minmax(0,1.35fr)_minmax(380px,0.85fr)]':'lg:grid-cols-[minmax(0,1.45fr)_minmax(380px,0.95fr)]'} gap-3 sm:gap-4`}>
        {/* -- Left: Cart ------------------------------- */}
        <div className={`min-h-[52vh] lg:h-[calc(100vh-255px)] rounded-md border border-gray-200 bg-white shadow-sm flex flex-col ${supermarketCheckout?'order-2 lg:order-2':'order-1'}`}>
          <div className="p-3 sm:p-4 border-b border-gray-200">
            <button type="button" onClick={() => setMobileCartOpen(value => !value)} aria-expanded={mobileCartOpen} className="flex w-full items-center justify-between text-left lg:pointer-events-none">
              <span><span className="block text-base font-semibold text-gray-900">{supermarketCheckout?'Customer basket':'New Sale'}</span><span className="mt-0.5 block text-xs text-gray-500">{itemCount} item(s) · {cart.length} line(s)</span></span>
              <span className="text-xs font-medium text-green-700 lg:hidden">{mobileCartOpen?'Hide cart':'View cart'}</span>
            </button>
            {posSettings.enableTransactionDate && <label className={`${mobileCartOpen?'':'hidden'} lg:block mt-3 text-xs font-medium text-gray-600`}>Transaction date<input type="date" value={transactionDate} max={todayISO()} onChange={event=>setTransactionDate(event.target.value)} className="mt-1 block w-full rounded-sm border border-gray-300 px-2 py-1.5 text-sm" /></label>}
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_55px_65px_70px_24px] border-b border-gray-200 px-3 py-3 text-[10px] font-semibold uppercase tracking-wide text-gray-500 sm:grid-cols-[minmax(0,1.4fr)_90px_100px_100px_30px] lg:grid-cols-[minmax(0,1.4fr)_110px_120px_120px_36px]"><span>Product</span><span>Qty</span><span>Price</span><span>Subtotal</span><span></span></div>
          <div className={`${mobileCartOpen?'':'hidden'} lg:block flex-1 overflow-y-auto max-h-[55vh] lg:max-h-none divide-y divide-gray-100`}>
            {cart.length === 0 && (
              <div className="p-8 text-center text-sm text-gray-400">
                {supermarketCheckout?'Scan a barcode or select a product to start the basket.':'Click a product on the right to add it here'}
              </div>
            )}
            {cart.map((line) => (
              <div key={line.id} className="grid grid-cols-[minmax(0,1fr)_55px_65px_70px_24px] items-center gap-1 p-3 sm:grid-cols-[minmax(0,1.4fr)_90px_100px_100px_30px] sm:gap-2 lg:grid-cols-[minmax(0,1.4fr)_110px_120px_120px_36px]">
                <div className="min-w-0">
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
                  <div>
                    <input
                      type="number"
                      data-pos-quantity
                      min={1}
                      max={line.maxStock}
                      value={line.quantity || ''}
                      onChange={(e) => updateQuantity(line.id, parseInt(e.target.value) || 0)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      min={0}
                      disabled={!canAct(access,'sales','price')} value={line.price || ''}
                      onChange={(e) => updatePrice(line.id, parseFloat(e.target.value) || 0)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div>
                    <div className="px-2 py-1.5 text-sm font-medium text-gray-900">
                      {(line.quantity * line.price * (1-discountFor(line)/100)).toLocaleString()}
                    </div>
                    {discountFor(line)>0&&<div className="px-2 text-[11px] text-gray-500 line-through">{(line.quantity*line.price).toLocaleString()}</div>}
                  </div>
              </div>
            ))}
          </div>

          <div className={`${supermarketCheckout?'p-4 border-t border-gray-200 space-y-3':'hidden p-4 border-t border-gray-200 space-y-3'}`}>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Items</span>
              <span className="font-medium text-gray-900">{itemCount}</span>
            </div>
            {supermarketCheckout&&<>
              <div className="flex items-center justify-between text-sm"><span className="text-gray-500">Subtotal</span><span>KSh {grossSubtotal.toLocaleString()}</span></div>
              <div className="flex items-center justify-between text-sm"><span className="text-gray-500">Promotions</span><span className={discountSavings?'text-emerald-700':''}>{discountSavings?`− KSh ${discountSavings.toLocaleString()}`:'KSh 0'}</span></div>
            </>}
            <div className="flex items-center justify-between text-base font-semibold">
              <span>{supermarketCheckout?'Amount due':'Total'}</span>
              <span>KSh {subtotal.toLocaleString()}</span>
            </div>

            {supermarketCheckout&&<button type="button" onClick={()=>setPaymentPickerOpen(true)} disabled={checkingOut||!cart.length||!shift} className="w-full rounded-sm bg-emerald-700 py-3 text-base font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">{checkingOut?'Processing…':'Take payment'}</button>}

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
            {!posSettings.disableCreditSaleButton && <button
              onClick={() => setCreditModalOpen(true)}
              disabled={checkingOut || !cart.length}
              className="w-full flex items-center justify-center gap-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-sm"
            >
              Credit / Tab
            </button>}
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
        <div className={`min-w-0 min-h-[52vh] lg:h-[calc(100vh-255px)] space-y-3 flex flex-col ${supermarketCheckout?'order-1 lg:order-1':'order-2'}`}>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative w-full flex gap-2">
              <ScanLine className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input ref={barcodeInputRef} type="text" aria-label="Scan product barcode or SKU" placeholder="Scan barcode or enter SKU..." value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') scanBarcode(); }}
                className="min-w-0 flex-1 pl-10 pr-4 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
              <button onClick={scanBarcode} className="shrink-0 px-4 py-2 rounded-sm bg-gray-900 text-white text-sm">Scan / Add</button>
            </div>
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input
                ref={productSearchRef}
                type="text"
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div className="relative w-fit" ref={categoryMenuRef}>
              <button
                type="button"
                aria-expanded={categoriesOpen}
                aria-controls="pos-category-options"
                onClick={() => setCategoriesOpen(open => !open)}
                className={`inline-flex min-h-[42px] flex-1 items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium ${categoriesOpen || catFilter !== 'All' ? 'border-[#354f43] bg-[#354f43] text-white hover:bg-[#496456]' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
              >
                ▦ Category <span aria-hidden="true">{categoriesOpen ? '▲' : '▼'}</span>
                {catFilter !== 'All' && <span className="max-w-48 truncate rounded-sm bg-white/20 px-2 py-0.5 text-xs">{catFilter}</span>}
              </button>
              {categoriesOpen && (
                <div id="pos-category-options" className="absolute left-0 top-full z-30 mt-2 flex max-h-64 min-w-64 max-w-[min(90vw,48rem)] flex-wrap gap-1.5 overflow-y-auto rounded-sm border border-gray-200 bg-white p-3 shadow-lg">
                  {categories.map(category => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => { setCatFilter(category); setCategoriesOpen(false); }}
                      aria-pressed={catFilter === category}
                      className={`rounded-sm border px-3 py-1.5 text-xs font-medium ${catFilter === category ? 'border-[#354f43] bg-[#354f43] text-white hover:bg-[#496456]' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {!posSettings.hideProductSuggestions && !loading && topSellers.length > 0 && (
            <section className="rounded-md border border-gray-200 bg-white p-3" aria-label="Top selling product suggestions">
              <h2 className="text-sm font-semibold text-gray-800">Suggested top sellers</h2>
              <p className="text-xs text-gray-500 mt-1">Ranked by total units sold. Tap to add to your cart.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                {topSellers.map((product, index) => (
                  <button key={product.id} onClick={() => addToCart(product)}
                    className="min-h-28 rounded-sm border border-gray-200 bg-white p-3 text-left hover:border-[#9aada2] hover:bg-[#f5f8f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#53695f]">
                    <span className="text-[11px] font-medium text-gray-500">#{index + 1} best seller</span>
                    <p className="text-sm font-medium text-gray-900 line-clamp-2 mt-1">{product.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{Number(product.sold).toLocaleString()} sold · {product.stock} in stock</p>
                    <p className="text-sm font-semibold text-[#354f43] mt-2">KSh {Number(product.price).toLocaleString()}</p>
                  </button>
                ))}
              </div>
            </section>
          )}

          {loading ? (
            <div className="text-center py-16 text-sm text-gray-400">Loading products...</div>
          ) : (
            <div className="flex-1 overflow-y-auto rounded-md bg-gray-100 p-2"><div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
              {filtered.map((product) => (
                <button
                  key={product.id}
                  onClick={() => addToCart(product)}
                  disabled={product.stock <= 0}
                  className="min-h-36 rounded-md border border-gray-200 bg-white p-2.5 text-center hover:border-[#9aada2] hover:bg-[#f5f8f6] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {product.image_url ? <img src={product.image_url} alt="" className="mx-auto mb-2 h-16 w-16 object-cover" /> : <span aria-hidden="true" className="mx-auto mb-2 flex h-16 w-16 items-center justify-center bg-gray-100 text-2xl text-gray-400">▧</span>}
                  <p className="text-sm font-medium text-gray-900 line-clamp-2">{product.name}</p>
                  <p className="text-xs text-gray-500 mt-1">{product.category}</p>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-sm font-semibold text-[#354f43]">
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
            </div></div>
          )}
        </div>
      </main>

      <div className="pos-checkout-bar fixed bottom-0 left-0 right-0 z-40 hidden items-center gap-3 border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-4px_14px_rgba(0,0,0,.06)] lg:flex md:left-60">
        <div className="ml-auto text-right"><span className="block text-xs font-medium uppercase tracking-wide text-gray-500">Total payable</span><span className="text-xl font-semibold text-gray-900">KSh {subtotal.toLocaleString()}</span></div>
        <button onClick={()=>void openRecentTransactions()} className="rounded-md border border-gray-300 bg-white px-4 py-3 text-sm font-medium hover:bg-gray-50">Recent transactions</button>
      </div>

      <div className="fixed inset-x-0 bottom-14 z-40 border-t border-gray-300 bg-white/95 p-2 shadow-[0_-4px_12px_rgba(0,0,0,.08)] backdrop-blur-sm lg:hidden" style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom))' }}>
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <button type="button" onClick={() => setMobileCartOpen(value => !value)} aria-expanded={mobileCartOpen} className="min-h-12 flex-1 rounded-sm border border-gray-300 px-3 text-left text-sm font-medium text-gray-800"><span className="block">Cart · {itemCount} item(s)</span><span className="text-xs text-gray-500">KSh {subtotal.toLocaleString()}</span></button>
          <button type="button" onClick={openMultiplePay} disabled={!cart.length||!shift||checkingOut} className="min-h-12 rounded-sm border border-blue-300 px-3 text-sm font-semibold disabled:opacity-50">Split</button>
          <button type="button" onClick={() => setPaymentPickerOpen(true)} disabled={!cart.length || !shift || checkingOut} className="min-h-12 flex-1 rounded-sm bg-green-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{checkingOut?'Processing…':'Checkout'}</button>
        </div>
      </div>

      {/* -- Credit sale: customer picker ------------------- */}
      {paymentPickerOpen && <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="payment-picker-title"><div className="w-full max-w-sm space-y-3 rounded-sm bg-white p-6"><div className="flex items-center justify-between"><h2 id="payment-picker-title" className="text-lg font-semibold">Pay &amp; Checkout</h2><button onClick={()=>setPaymentPickerOpen(false)} aria-label="Close payment methods"><X className="h-4 w-4 text-gray-500"/></button></div><p className="text-sm text-gray-600">Amount due: <strong>KSh {subtotal.toLocaleString()}</strong></p>{supermarketCheckout&&<div className="rounded-sm bg-gray-50 p-3"><label className="block text-sm font-medium">Cash received<input aria-label="Cash received from customer" inputMode="decimal" type="number" min={subtotal} step="0.01" value={cashReceived} onChange={event=>setCashReceived(event.target.value)} className="mt-1 w-full rounded-sm border bg-white px-3 py-2 text-base"/></label><p className="mt-2 flex justify-between text-sm"><span>Change due</span><strong>KSh {Math.max(0,Number(cashReceived||0)-subtotal).toLocaleString()}</strong></p></div>}<button onClick={()=>{if(supermarketCheckout&&Number(cashReceived)<subtotal){toast.error('Cash received must cover the amount due');return;}setPaymentPickerOpen(false);void checkout('cash');}} disabled={!cart.length||checkingOut} className="w-full rounded-sm bg-green-600 py-2.5 text-sm font-medium text-white disabled:opacity-50">Cash{supermarketCheckout&&Number(cashReceived)>subtotal?` · give KSh ${(Number(cashReceived)-subtotal).toLocaleString()} change`:''}</button><button onClick={()=>{setPaymentPickerOpen(false);setCardReference('');setCardModalOpen(true);}} disabled={!cart.length||checkingOut} className="w-full rounded-sm bg-slate-700 py-2.5 text-sm font-medium text-white disabled:opacity-50">Card</button><button onClick={()=>{setPaymentPickerOpen(false);void checkout('mpesa');}} disabled={!cart.length||checkingOut} className="w-full rounded-sm bg-green-800 py-2.5 text-sm font-medium text-white disabled:opacity-50">M-Pesa</button>{!posSettings.disableCreditSaleButton&&<button onClick={()=>{setPaymentPickerOpen(false);setCreditModalOpen(true);}} disabled={!cart.length||checkingOut} className="w-full rounded-sm bg-amber-600 py-2.5 text-sm font-medium text-white disabled:opacity-50">Credit / Tab</button>}<button onClick={()=>setPaymentPickerOpen(false)} className="w-full rounded-sm border py-2 text-sm">Cancel</button></div></div>}
      {multiPayOpen&&<div className="fixed inset-0 z-[76] flex items-center justify-center bg-slate-950/70 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="multi-pay-title"><section className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-xl bg-[#d4e9ff] shadow-2xl"><header className="flex items-center justify-between border-b border-blue-200 px-6 py-4"><div><h2 id="multi-pay-title" className="text-xl font-semibold">Multiple payment</h2><p className="mt-1 text-sm text-slate-600">Split the sale across cash and card. Card payments should already be approved on your terminal.</p></div><button onClick={()=>setMultiPayOpen(false)} aria-label="Close multiple payment" className="p-2"><X/></button></header><div className="grid gap-5 p-5 md:grid-cols-[1fr_230px]"><div className="space-y-4">{paymentRows.map((row,index)=><div key={index} className="grid gap-3 rounded-lg bg-white/55 p-4 sm:grid-cols-[1fr_1fr_1.2fr_auto]"><label className="text-sm font-semibold">Amount<input type="number" min="0.01" step="0.01" value={row.amount} onChange={e=>setPaymentRows(rows=>rows.map((item,i)=>i===index?{...item,amount:e.target.value}:item))} className="mt-1 w-full border border-blue-200 bg-white px-3 py-2 font-normal"/></label><label className="text-sm font-semibold">Payment method<select value={row.method} onChange={e=>setPaymentRows(rows=>rows.map((item,i)=>i===index?{...item,method:e.target.value as 'cash'|'card'}:item))} className="mt-1 w-full border border-blue-200 bg-white px-3 py-2 font-normal"><option value="cash">Cash</option><option value="card">Card</option></select></label><label className="text-sm font-semibold">Terminal reference <span className="font-normal text-slate-500">(card only)</span><input value={row.referenceNo} onChange={e=>setPaymentRows(rows=>rows.map((item,i)=>i===index?{...item,referenceNo:e.target.value}:item))} disabled={row.method!=='card'} placeholder="Authorization reference" className="mt-1 w-full border border-blue-200 bg-white px-3 py-2 font-normal disabled:bg-slate-100"/></label><button type="button" disabled={paymentRows.length===1} onClick={()=>setPaymentRows(rows=>rows.filter((_,i)=>i!==index))} className="self-end px-3 py-2 text-rose-700 disabled:opacity-30">Remove</button></div>)}<button onClick={addPaymentRow} className="w-full rounded-lg bg-rose-700 px-4 py-3 text-sm font-semibold text-white">Add payment row</button><p className="text-xs text-slate-600">Payment accounts are taken from your accounting settings. Do not enter card numbers or security codes here.</p></div><aside className="h-fit rounded-lg bg-amber-600 p-5 text-white"><p className="text-sm font-semibold">Total payable</p><p className="mt-1 text-2xl font-bold">KSh {subtotal.toLocaleString()}</p><hr className="my-4 border-amber-800/50"/><p className="text-sm font-semibold">Total paying</p><p className="text-xl font-bold">KSh {paymentRows.reduce((sum,row)=>sum+(Number(row.amount)||0),0).toLocaleString()}</p><p className="mt-3 text-sm font-semibold">Remaining</p><p className="text-lg font-bold">KSh {Math.max(0,subtotal-paymentRows.reduce((sum,row)=>sum+(Number(row.amount)||0),0)).toLocaleString()}</p></aside></div><footer className="flex justify-end gap-3 border-t border-blue-200 px-5 py-4"><button onClick={()=>setMultiPayOpen(false)} className="rounded-lg border border-blue-300 px-5 py-2.5">Close</button><button onClick={finalizeMultiplePay} disabled={checkingOut||!shift} className="rounded-lg bg-rose-700 px-5 py-2.5 font-semibold text-white disabled:opacity-50">{checkingOut?'Processing…':'Finalize payment'}</button></footer></section></div>}
      {cardModalOpen&&<div className="fixed inset-0 z-[77] flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-labelledby="card-payment-title"><section className="w-full max-w-2xl rounded-xl bg-[#d4e9ff] shadow-2xl"><header className="flex items-center justify-between border-b border-blue-200 px-6 py-4"><h2 id="card-payment-title" className="text-xl font-semibold">Card transaction details</h2><button onClick={()=>setCardModalOpen(false)} aria-label="Close card payment"><X/></button></header><div className="grid gap-4 p-6 sm:grid-cols-2"><label className="text-sm font-semibold">Amount<input readOnly value={`KSh ${subtotal.toLocaleString()}`} className="mt-1 w-full border border-blue-200 bg-white px-3 py-2 font-normal"/></label><label className="text-sm font-semibold">Card type<select value={cardBrand} onChange={e=>setCardBrand(e.target.value)} className="mt-1 w-full border border-blue-200 bg-white px-3 py-2 font-normal"><option>Visa</option><option>Mastercard</option><option>American Express</option><option>Other</option></select></label><label className="text-sm font-semibold sm:col-span-2">Card transaction reference<input autoFocus required value={cardReference} onChange={e=>setCardReference(e.target.value)} placeholder="Enter the approval code from your card terminal" className="mt-1 w-full border border-blue-200 bg-white px-3 py-2 font-normal"/></label><p className="text-xs text-slate-600 sm:col-span-2">Take payment on your card terminal first, then enter its approval reference. This screen never asks for or stores a card number or security code.</p></div><footer className="flex justify-end gap-3 border-t border-blue-200 px-6 py-4"><button onClick={()=>setCardModalOpen(false)} className="rounded-lg border border-blue-300 px-5 py-2.5">Close</button><button onClick={()=>{if(!cardReference.trim()){toast.error('Enter the terminal approval reference');return;}const reference=`${cardBrand}: ${cardReference.trim()}`;setCardModalOpen(false);void checkout('bank',undefined,[{method:'card',amount:subtotal,referenceNo:reference}],'Card');}} disabled={checkingOut||!cart.length||!shift} className="rounded-lg bg-rose-700 px-5 py-2.5 font-semibold text-white disabled:opacity-50">{checkingOut?'Processing…':'Finalize payment'}</button></footer></section></div>}
      {recentOpen&&<div className="fixed inset-0 z-[78] flex items-center justify-center bg-slate-950/70 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="recent-transactions-title"><section className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-xl bg-[#d4e9ff] shadow-2xl"><header className="flex items-center justify-between border-b border-blue-200 px-6 py-4"><div><h2 id="recent-transactions-title" className="text-xl font-semibold">Recent transactions</h2><p className="mt-1 text-sm text-slate-600">Latest sales for the selected location.</p></div><button onClick={()=>setRecentOpen(false)} aria-label="Close recent transactions"><X/></button></header>{recentLoading?<p className="p-8 text-center">Loading recent transactions…</p>:<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-blue-200"><tr>{['Sale','Customer','Cashier','Payment','When','Total','Items'].map(label=><th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{recentSales.map(sale=><tr key={sale.id} className="border-b border-blue-100"><td className="px-4 py-3 font-semibold">{sale.id}</td><td className="px-4 py-3">{sale.customer_name||'Walk-in customer'}</td><td className="px-4 py-3">{sale.created_by_name||'—'}</td><td className="px-4 py-3 capitalize">{sale.payment_method||'—'}</td><td className="px-4 py-3 whitespace-nowrap">{new Date(sale.created_at).toLocaleString()}</td><td className="px-4 py-3 font-semibold">KSh {Number(sale.total).toLocaleString()}</td><td className="px-4 py-3">{sale.items?.reduce((sum:number,item:any)=>sum+Number(item.quantity),0)||0}</td></tr>)}</tbody></table>{!recentSales.length&&<p className="p-8 text-center text-slate-600">No sales found yet.</p>}</div>}<footer className="flex justify-between gap-3 border-t border-blue-200 px-5 py-4"><Link href="/sales" onClick={()=>setRecentOpen(false)} className="text-indigo-800 underline">Open sales history</Link><button onClick={()=>void openRecentTransactions()} className="rounded-lg border border-blue-300 px-4 py-2">Refresh</button></footer></section></div>}
      {ageModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[70]">
          <div className="bg-white rounded-sm max-w-sm w-full p-6 space-y-4">
            <h2 className="text-lg font-semibold">Age verification required</h2>
            <p className="text-sm text-gray-600">Confirm the customer is legally permitted to purchase alcohol before completing this sale.</p>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ageVerified} onChange={(e) => setAgeVerified(e.target.checked)} /> Customer is of legal drinking age</label>
              <div className="flex gap-2"><button onClick={() => { setAgeModalOpen(false); setPendingPayment(null);pendingSplitCheckout.current=null; }} className="flex-1 border rounded-sm py-2 text-sm">Cancel</button>
              <button disabled={!ageVerified} onClick={() => { setAgeModalOpen(false); const method = pendingPayment; setPendingPayment(null);const pending=pendingSplitCheckout.current;pendingSplitCheckout.current=null;if(pending)void checkout(pending.method,undefined,pending.rows,pending.label);else if(method)void checkout(method); }} className="flex-1 bg-green-600 disabled:opacity-50 text-white rounded-sm py-2 text-sm">Verify & Continue</button></div>
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
                  value={newCustomer.creditLimit || ''}
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
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[80]" role="dialog" aria-modal="true" aria-labelledby="shift-dialog-title">
          <div className="bg-white rounded-sm max-w-sm w-full p-6 space-y-4">
            {shiftStatusError ? (
              <>
                <h2 id="shift-dialog-title" className="text-lg font-semibold">Unable to check shift</h2>
                <p className="text-sm text-gray-600">{shiftStatusError} Selling stays locked until the shift status is confirmed.</p>
                <button onClick={loadShiftStatus} className="w-full px-4 py-2 bg-green-600 text-white rounded-sm text-sm">Retry</button>
              </>
            ) : shift ? (
              <>
                <h2 id="shift-dialog-title" className="text-lg font-semibold">Close Shift</h2>
                <p className="text-sm text-gray-600">
                  Opening float: KSh {Number(shift.opening_float).toLocaleString()}
                </p>
                <p className="text-xs text-gray-500">This shift automatically closes after {Number(shift.duration_hours||12)} hours{shiftCloseTime(shift)?`, at ${shiftCloseTime(shift)}`:''}. The duration is set in Business Settings → Point Of Sale.</p>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Actual Cash Counted</label>
                  <input
                    type="number"
                    min={0}
                    value={closingCash}
                    onChange={(e) => setClosingCash(e.target.value === '' ? '' : parseFloat(e.target.value))}
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
                <h2 id="shift-dialog-title" className="text-lg font-semibold">Open Shift to Start Selling</h2>
                <p className="text-sm text-gray-600">Start a cashier shift before accessing POS sales. Your opening float will be used for cash reconciliation.</p>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Starting Cash Float</label>
                  <input
                    type="number"
                    min={0}
                    value={openingFloat}
                    onChange={(e) => setOpeningFloat(e.target.value === '' ? '' : parseFloat(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div className="flex gap-2">
                  {shift && <button onClick={() => setShiftModalOpen(false)} className="flex-1 px-4 py-2 border border-gray-300 rounded-sm text-sm">Cancel</button>}
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
