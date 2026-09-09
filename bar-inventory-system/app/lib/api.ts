import axios from 'axios';
import Cookies from 'js-cookie';

declare global {
  interface Window { stockpro?: { request: (request: unknown) => Promise<unknown> } }
}

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5050';

const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
  // Electron uses the secure preload bridge; browser/PWA keeps using REST.
  adapter: typeof window !== 'undefined' && window.stockpro
    ? async (config) => {
        const data = await window.stockpro!.request({
          method: config.method,
          url: config.url,
          data: config.data ? JSON.parse(config.data as string) : undefined,
          params: config.params,
        });
        return { data, status: 200, statusText: 'OK', headers: {}, config };
      }
    : undefined,
});

// Attach JWT token to every request
/**
 * Interceptor: attach JWT token from cookies to outgoing requests.
 */
api.interceptors.request.use((config) => {
  const token = Cookies.get('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Global response error handler
/**
 * Interceptor: handle global response errors (redirect on 401).
 */
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      Cookies.remove('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

/* â”€â”€ Auth â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
/**
 * Auth API helpers
 */
export const authApi = {
  register: (data: { name: string; email: string; password: string; role: string }) =>
    api.post('/auth/register', data),
  onboardBusiness: (data: BusinessRegistrationPayload) =>
    api.post('/auth/business-registration', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
};

/* â”€â”€ Inventory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
/**
 * Inventory API helpers
 */
const inventoryApi = {
  getAll: (params?: { category?: string; search?: string; locationId?: number }) =>
    api.get('/inventory', { params }),
  getOne: (id: number) => api.get(`/inventory/${id}`),
  create: (data: InventoryItemPayload) => api.post('/inventory', data),
  update: (id: number, data: Partial<InventoryItemPayload>) =>
    api.put(`/inventory/${id}`, data),
  delete: (id: number) => api.delete(`/inventory/${id}`),
  restock: (id: number, qty: number) =>
    api.patch(`/inventory/${id}/restock`, { quantity: qty }),
  adjustStock: (id: number, data: { quantity: number; reason: string }) =>
    api.patch(`/inventory/${id}/adjustment`, data),
  sell: (id: number, qty: number) =>
    api.patch(`/inventory/${id}/sell`, { quantity: qty }),
  getLowStock: () => api.get('/inventory/low-stock'),
  bulkImport: (items: InventoryItemPayload[]) => api.post('/inventory/import', { items }),
};

/* â”€â”€ Orders â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
/**
 * Orders API helpers
 */
const ordersApi = {
  getAll: (params?: { status?: string }) => api.get('/orders', { params }),
  getOne: (id: number) => api.get(`/orders/${id}`),
  create: (data: OrderPayload) => api.post('/orders', data),
  update: (id: number, data: Partial<OrderPayload>) =>
    api.put(`/orders/${id}`, data),
  delete: (id: number) => api.delete(`/orders/${id}`),
  updateStatus: (id: number, status: string) =>
    api.patch(`/orders/${id}/status`, { status }),
};
const shiftsApi = {
  getCurrent: () => api.get('/shifts/current'),
  open: (openingFloat: number) => api.post('/shifts', { openingFloat }),
  close: (id: number, actualCash: number) => api.patch(`/shifts/${id}/close`, { actualCash }),
  getAll: () => api.get('/shifts'),
};
/* â”€â”€ Suppliers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
/**
 * Suppliers API helpers
 */
const suppliersApi = {
  getAll: () => api.get('/suppliers'),
  getOne: (id: number) => api.get(`/suppliers/${id}`),
  create: (data: SupplierPayload) => api.post('/suppliers', data),
  update: (id: number, data: Partial<SupplierPayload>) =>
    api.put(`/suppliers/${id}`, data),
  delete: (id: number) => api.delete(`/suppliers/${id}`),
};

/* â”€â”€ Reports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
/**
 * Reports API helpers
 */
const reportsApi = {
  getStock: () => api.get('/reports/stock'),
  getUsage: (days?: number) => api.get('/reports/usage', { params: { days } }),
  getMpesaGroups: () => api.get('/reports/sale-size-groups'),
  getSalesTrend: (days: number) =>
    api.get('/reports/sales-trend', { params: { days } }),
  getLedger: () => api.get('/reports/ledger'),
};

/* â”€â”€ M-Pesa â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
/**
 * M-Pesa related API helpers
 */
const mpesaApi = {
  getPayments: (params?: { period?: string }) =>
    api.get('/mpesa/payments', { params }),
  getGroups: () => api.get('/mpesa/groups'),
  initiateSTK: (data: { phone: string; amount: number; itemId: number }) =>
    api.post('/mpesa/stk-push', data),
};

const salesApi = {
  create: (data: { items: { itemId: number; quantity: number; unitPrice?: number }[]; paymentMethod?: string; note?: string }) =>
    api.post('/sales', data),
  getAll: () => api.get('/sales'),
  getOne: (id: number) => api.get(`/sales/${id}`),
};

const usersApi = {
  getAll: () => api.get('/users'),
  getOne: (id: number) => api.get(`/users/${id}`),
  create: (data: { name: string; email: string; password: string; role: string; phone?: string }) =>
    api.post('/users', data),
  update: (id: number, data: any) => api.put(`/users/${id}`, data),
  toggleActive: (id: number) => api.patch(`/users/${id}/toggle-active`),
  delete: (id: number) => api.delete(`/users/${id}`),
};

const locationsApi = {
  getAll: () => api.get('/locations'),
  getSummary: (id: number) => api.get(`/locations/${id}/summary`),
  create: (data: { name: string; address?: string }) => api.post('/locations', data),
  update: (id: number, data: any) => api.put(`/locations/${id}`, data),
  delete: (id: number) => api.delete(`/locations/${id}`),
};
 
const customersApi = {
  getAll: () => api.get('/customers'),
  getOne: (id: number) => api.get(`/customers/${id}`),
  getStatement: (id: number) => api.get(`/customers/${id}/statement`),
  create: (data: { name: string; phone?: string; creditLimit?: number }) => api.post('/customers', data),
  update: (id: number, data: any) => api.put(`/customers/${id}`, data),
  recordPayment: (id: number, data: { amount: number; method?: string; notes?: string }) =>
    api.post(`/customers/${id}/payments`, data),
};

const accountsApi = {
  getAll: (params?: any) => api.get('/accounts', { params }),
  getOne: (id: string | number) => api.get(`/accounts/${id}`),
  getBook: (id: string | number, params?: any) => api.get(`/accounts/${id}/book`, { params }),
  create: (data: any) => api.post('/accounts', data),
  update: (id: number, data: any) => api.put(`/accounts/${id}`, data),
  delete: (id: number) => api.delete(`/accounts/${id}`),
  ensureOpeningBalanceEquity: () => api.post('/accounts/opening-balance-equity'),
};

const journalEntryApi = {
  getAll: () => api.get('/journal-entries'),
  getOne: (id: string | number) => api.get(`/journal-entries/${id}`),
  create: (data: any) => api.post('/journal-entries', data),
};

const treasuryApi = {
  getAll: () => api.get('/treasury'),
  getOne: (id: number) => api.get(`/treasury/${id}`),
  create: (data: any) => api.post('/treasury', data),
  update: (id: number, data: any) => api.put(`/treasury/${id}`, data),
  getTransactions: (id: number) => api.get(`/treasury/${id}/transactions`),
  deposit: (id: number, data: { amount: number; reference?: string; description?: string }) =>
    api.post(`/treasury/${id}/deposit`, data),
  withdraw: (id: number, data: { amount: number; reference?: string; description?: string }) =>
    api.post(`/treasury/${id}/withdraw`, data),
  transfer: (data: { fromTreasuryId: number; toTreasuryId: number; amount: number; reference?: string; description?: string }) =>
    api.post('/treasury/transfer', data),
};

const settingsApi = {
  getAll: () => api.get('/accounting-settings'),
  update: (key: string, data: { account_id?: number; treasury_id?: number }) =>
    api.put(`/accounting-settings/${key}`, data),
};

export const etimsApi = {
  getConfig: () => api.get('/etims/config'),
  updateConfig: (data: { kraPin?: string; enabled: boolean; mode: 'sandbox' | 'production'; apiUrl?: string; username?: string; password?: string }) => api.put('/etims/config', data),
};
export const businessSettingsApi = {
  get: () => api.get('/business-settings'),
  update: (data: Record<string, unknown>) => api.put('/business-settings', data),
};

const salesDocumentsApi = {
  getAll: (params?: { type?: string; locationId?: number }) => api.get('/sales-documents', { params }),
  getOne: (id: number) => api.get(`/sales-documents/${id}`),
  create: (data: SalesDocumentPayload) => api.post('/sales-documents', data),
  convert: (id: number, targetType: string) => api.post(`/sales-documents/${id}/convert`, { targetType }),
  addPayment: (id: number, data: { amount: number; method?: string; referenceNo?: string; notes?: string }) =>
    api.post(`/sales-documents/${id}/payments`, data),
};

const discountsApi = {
  getAll: (params?: { locationId?: number }) => api.get('/discounts', { params }),
  create: (data: DiscountPayload) => api.post('/discounts', data),
  update: (id: number, data: DiscountPayload) => api.put(`/discounts/${id}`, data),
  delete: (id: number) => api.delete(`/discounts/${id}`),
};

const referenceDataApi = {
  getAll: (type: ReferenceType, params?: { locationId?: number; search?: string }) =>
    api.get(`/reference-data/${type}`, { params }),
  create: (type: ReferenceType, data: ReferenceDataPayload) =>
    api.post(`/reference-data/${type}`, data),
  update: (type: ReferenceType, id: number, data: ReferenceDataPayload) =>
    api.put(`/reference-data/${type}/${id}`, data),
  delete: (type: ReferenceType, id: number) =>
    api.delete(`/reference-data/${type}/${id}`),
};
 
/* â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export interface BusinessRegistrationPayload {
  business: { name: string; startDate?: string; currency: string; logoUrl?: string; website?: string; contactNumber?: string; alternateContactNumber?: string; country: string; state: string; city: string; zipCode: string; landmark: string; timezone: string; locale?: string };
  settings: { businessType: string; businessTypeOther?: string; defaultTaxRate?: number; taxNumber?: string; sellingPriceTaxType: string; stockAccountingMethod: string; defaultBusinessLocation: string; defaultLowStockThreshold?: number; featurePosOffline?: boolean; featureMultiCurrencySales?: boolean; featureBarcodeScanning?: boolean; featureServiceRepair?: boolean; financialYearStartMonth: number };
  owner: { prefix?: string; firstName: string; lastName?: string; username: string; email: string; password: string; confirmPassword: string };
}

export interface InventoryItemPayload {
  sku?: string;
  barcode?: string;
  locationId?: number;
  categoryId?: number | null;
  unitId?: number | null;
  brandId?: number | null;
  name: string;
  category: string;
  unit: string;
  brand?: string;
  stock: number;
  threshold: number;
  cost: number;
  price: number;
  supplierId?: number;
}

export type ReferenceType = 'units' | 'categories' | 'brands';

export interface ReferenceDataPayload {
  locationId: number;
  name: string;
  shortName?: string;
  allowDecimal?: boolean;
  baseUnitId?: number | null;
  multiplier?: number | null;
  code?: string;
  description?: string;
  parentId?: number | null;
}

export interface OrderPayload {
  referenceNo?: string;
  purchaseDate?: string;
  status?: string;
  locationId?: number;
  payTerm?: string;
  supplierId?: number;
  items: { itemId: number; quantity: number; unitPrice: number; costBeforeDiscount?: number; discountPercent?: number; taxPercent?: number; profitMargin?: number; sellingPrice?: number; accountType?: string }[];
  notes?: string;
  transactionType?: 'purchase' | 'opening_stock';
}

export interface SupplierPayload {
  name: string;
  email: string;
  phone: string;
  address?: string;
  itemsSupplied?: string[];
}

export interface SalesDocumentPayload {
  type: 'quotation' | 'sales_order' | 'proforma' | 'invoice' | 'pos' | 'credit_note';
  customerId?: number | null;
  referenceNo?: string;
  date?: string;
  locationId: number;
  status?: string;
  convertedFromId?: number | null;
  referenceInvoiceId?: number | null;
  notes?: string;
  payment?: { amount: number; method?: string; referenceNo?: string };
  items: { itemId: number; quantity: number; unitPrice: number; discountPercent?: number; taxPercent?: number }[];
}

export interface DiscountPayload {
  locationId: number;
  name: string;
  discountType: 'percent' | 'fixed';
  value: number;
  appliesTo: 'product' | 'category' | 'customer';
  productId?: number | null;
  categoryId?: number | null;
  customerId?: number | null;
  active?: boolean;
}

export { inventoryApi, ordersApi, suppliersApi, reportsApi, mpesaApi, salesApi, salesDocumentsApi, discountsApi, usersApi, shiftsApi, locationsApi, customersApi, accountsApi, treasuryApi, settingsApi, journalEntryApi, referenceDataApi };
export default api;

