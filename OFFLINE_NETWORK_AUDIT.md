# StockPro network-call audit

Audit date: 2026-09-09

## Renderer calls

- [x] `bar-inventory-system/app/lib/api.ts` creates one Axios client with base URL `NEXT_PUBLIC_API_URL || http://localhost:5050`.
- [x] Request interceptor reads the `token` cookie and sends `Authorization: Bearer ...`.
- [x] Response interceptor handles HTTP 401 by deleting the cookie and redirecting to `/login`.
- [x] Auth: register, business-registration, login, logout, me.
- [x] Inventory: list, detail, create, update, delete, restock, adjustment, sell, low-stock, import.
- [x] Orders: list, detail, create, update, delete, status.
- [x] Shifts: current, list, open, close.
- [x] Suppliers, reports, sales, users, locations, customers.
- [x] Accounts, journal entries, treasury, accounting settings.
- [x] Reference data, sales documents, discounts, eTIMS settings, business settings.
- [x] POS uses `navigator.onLine` and a `localStorage` queue (`pos_pending_sales`). This is replaced by direct SQLite writes in Electron; browser/PWA behavior remains unchanged.
- [x] No `fetch`, XMLHttpRequest, WebSocket, socket.io, or direct network calls were found in the frontend.

## Browser deployment network configuration

- [x] `next.config.js` rewrites `/api/:path*` to the configured REST backend. This remains enabled for PWA/browser deployment.
- [x] PWA manifest/service-worker assets are local; they do not provide server-side persistence.

## Server-side/live integrations

- [x] Backend REST routes are the source for all calls listed above.
- [x] `bar-inventory-backend/src/controllers/mpesaController.js` uses Axios for Safaricom OAuth and STK Push. M-Pesa/eTIMS and multi-device/multi-location synchronization require a live service and are intentionally flagged as online-only in the desktop build.
