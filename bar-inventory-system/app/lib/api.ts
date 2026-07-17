import axios from 'axios';
import Cookies from 'js-cookie';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5050';

const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
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

/* ── Auth ──────────────────────────────────────────────── */
/**
 * Auth API helpers
 */
export const authApi = {
  register: (data: { name: string; email: string; password: string; role: string }) =>
    api.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
};

/* ── Inventory ─────────────────────────────────────────── */
/**
 * Inventory API helpers
 */
const inventoryApi = {
  getAll: (params?: { category?: string; search?: string }) =>
    api.get('/inventory', { params }),
  getOne: (id: number) => api.get(`/inventory/${id}`),
  create: (data: InventoryItemPayload) => api.post('/inventory', data),
  update: (id: number, data: Partial<InventoryItemPayload>) =>
    api.put(`/inventory/${id}`, data),
  delete: (id: number) => api.delete(`/inventory/${id}`),
  restock: (id: number, qty: number) =>
    api.patch(`/inventory/${id}/restock`, { quantity: qty }),
  sell: (id: number, qty: number) =>
    api.patch(`/inventory/${id}/sell`, { quantity: qty }),
  getLowStock: () => api.get('/inventory/low-stock'),
  bulkImport: (items: any[]) => api.post('/inventory/import', { items }),
};

/* ── Orders ────────────────────────────────────────────── */
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
/* ── Suppliers ─────────────────────────────────────────── */
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

/* ── Reports ───────────────────────────────────────────── */
/**
 * Reports API helpers
 */
const reportsApi = {
  getStock: () => api.get('/reports/stock'),
  getUsage: (days?: number) => api.get('/reports/usage', { params: { days } }),
  getMpesaGroups: () => api.get('/reports/sale-size-groups'),
  getSalesTrend: (days: number) =>
    api.get('/reports/sales-trend', { params: { days } }),
};

/* ── M-Pesa ────────────────────────────────────────────── */
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

/* ── Types ─────────────────────────────────────────────── */
export interface InventoryItemPayload {
  name: string;
  category: string;
  unit: string;
  stock: number;
  threshold: number;
  price: number;
  supplierId?: number;
}

export interface OrderPayload {
  supplierId: number;
  items: { itemId: number; quantity: number; unitPrice: number }[];
  notes?: string;
  status?: string;
}

export interface SupplierPayload {
  name: string;
  email: string;
  phone: string;
  address?: string;
  itemsSupplied?: string[];
}

export { inventoryApi, ordersApi, suppliersApi, reportsApi, mpesaApi, salesApi, usersApi, shiftsApi };
export default api;
