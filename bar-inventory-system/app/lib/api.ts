import axios from 'axios';
import Cookies from 'js-cookie';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = Cookies.get('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Global response error handler
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
export const authApi = {
  register: (data: { name: string; email: string; password: string; role: string }) =>
    api.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
};

/* ── Inventory ─────────────────────────────────────────── */
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
  getLowStock: () => api.get('/inventory/low-stock'),
};

/* ── Orders ────────────────────────────────────────────── */
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

/* ── Suppliers ─────────────────────────────────────────── */
const suppliersApi = {
  getAll: () => api.get('/suppliers'),
  getOne: (id: number) => api.get(`/suppliers/${id}`),
  create: (data: SupplierPayload) => api.post('/suppliers', data),
  update: (id: number, data: Partial<SupplierPayload>) =>
    api.put(`/suppliers/${id}`, data),
  delete: (id: number) => api.delete(`/suppliers/${id}`),
};

/* ── Reports ───────────────────────────────────────────── */
const reportsApi = {
  getStock: () => api.get('/reports/stock'),
  getUsage: (params?: { days?: number }) =>
    api.get('/reports/usage', { params }),
  getMpesaGroups: () => api.get('/reports/mpesa-groups'),
  getSalesTrend: (days: number) =>
    api.get('/reports/sales-trend', { params: { days } }),
};

/* ── M-Pesa ────────────────────────────────────────────── */
const mpesaApi = {
  getPayments: (params?: { period?: string }) =>
    api.get('/mpesa/payments', { params }),
  getGroups: () => api.get('/mpesa/groups'),
  initiateSTK: (data: { phone: string; amount: number; itemId: number }) =>
    api.post('/mpesa/stk-push', data),
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

export default api;
