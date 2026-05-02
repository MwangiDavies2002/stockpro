# BarStock Pro – Bar Inventory Management System

Full-stack bar inventory system with M-Pesa Daraja API integration, real-time low-stock alerts, price-group payment tracking, and Excel report exports.

---

## Tech Stack

| Layer      | Tech                                      |
|------------|-------------------------------------------|
| Frontend   | Next.js 14, TypeScript, Tailwind CSS, Shadcn UI, Recharts |
| Backend    | Node.js, Express.js                       |
| Database   | PostgreSQL (Supabase / AWS RDS)           |
| Auth       | JWT (jsonwebtoken + bcryptjs)             |
| Payments   | Safaricom Daraja STK Push API             |
| Export     | SheetJS (xlsx)                            |
| Deploy     | Vercel (frontend) · Railway/Heroku (backend) |

---

## Project Structure

```
bar-inventory-system/          ← Next.js frontend
├── app/
│   ├── components/
│   │   ├── Navbar.tsx          Navigation bar
│   │   ├── AuthForm.tsx        Login / Register
│   │   └── InventoryTable.tsx  Sortable inventory table
│   ├── pages/
│   │   ├── index.tsx           Dashboard
│   │   ├── inventory.tsx       Inventory management
│   │   ├── orders.tsx          Purchase orders
│   │   ├── reports.tsx         Reports + Excel export
│   │   ├── users.tsx           User management (admin)
│   │   └── login.tsx           Auth page
│   ├── lib/api.ts              Axios API client
│   ├── styles/globals.css      Tailwind + CSS vars
│   └── layout.tsx              Root layout

bar-inventory-backend/         ← Express REST API
├── server.js                   Entry point
├── src/
│   ├── config/
│   │   ├── db.js               PostgreSQL pool
│   │   └── schema.sql          DB schema + seed data
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── inventoryController.js
│   │   ├── orderController.js
│   │   ├── reportController.js
│   │   ├── supplierController.js
│   │   └── mpesaController.js  Daraja STK Push + callback
│   ├── models/
│   │   ├── User.js
│   │   ├── Item.js
│   │   ├── Order.js
│   │   └── Supplier.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── inventory.js
│   │   ├── orders.js
│   │   ├── reports.js
│   │   ├── suppliers.js
│   │   └── mpesa.js
│   ├── middleware/
│   │   ├── auth.js             JWT authenticate + adminOnly
│   │   └── error.js            Global error handler
│   └── utils/
│       └── notifications.js    Low-stock + order alerts
```

---

## Quick Start

### 1. Database

```bash
createdb bar_inventory
psql -U postgres -d bar_inventory -f bar-inventory-backend/src/config/schema.sql
```

### 2. Backend

```bash
cd bar-inventory-backend
cp .env .env.local          # fill in your values
npm install
npm run dev                 # http://localhost:5000
```

### 3. Frontend

```bash
cd bar-inventory-system
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:5000
npm install
npm run dev                 # http://localhost:3000
```

---

## API Endpoints

| Method | Endpoint                        | Auth        | Description              |
|--------|---------------------------------|-------------|--------------------------|
| POST   | /api/auth/register              | Public      | Register user            |
| POST   | /api/auth/login                 | Public      | Login, returns JWT       |
| GET    | /api/auth/me                    | JWT         | Current user profile     |
| GET    | /api/inventory                  | JWT         | List all items           |
| GET    | /api/inventory/low-stock        | JWT         | Items below threshold    |
| POST   | /api/inventory                  | Admin       | Add item                 |
| PUT    | /api/inventory/:id              | Admin       | Update item              |
| PATCH  | /api/inventory/:id/restock      | Admin       | Add stock                |
| PATCH  | /api/inventory/:id/sell         | JWT         | Reduce stock (+sold)     |
| GET    | /api/orders                     | JWT         | List orders              |
| POST   | /api/orders                     | JWT         | Create purchase order    |
| PATCH  | /api/orders/:id/status          | Admin       | Approve / deliver        |
| GET    | /api/reports/stock              | JWT         | Stock report             |
| GET    | /api/reports/usage?days=30      | JWT         | Usage by item            |
| GET    | /api/reports/sales-trend?days=14| JWT         | Daily revenue trend      |
| GET    | /api/suppliers                  | JWT         | List suppliers           |
| POST   | /api/mpesa/stk-push             | JWT         | Initiate STK Push        |
| POST   | /api/mpesa/callback             | Public      | Safaricom IPN callback   |
| GET    | /api/mpesa/payments             | JWT         | Payment history          |
| GET    | /api/mpesa/groups               | JWT         | Price group summary      |

---

## M-Pesa Price Groups

| Group  | Range (KES) | Color   |
|--------|-------------|---------|
| Micro  | 0 – 50      | Green   |
| Small  | 51 – 500    | Blue    |
| Medium | 501 – 1000  | Amber   |
| Large  | 1001 – 2500 | Orange  |

Every M-Pesa callback automatically classifies the payment into one of these groups, stored in `mpesa_payments.price_group`.

---

## Excel Report Contents

Exported via the Reports page (7 / 14 / 30 days):

- **Sheet 1 – M-Pesa Payments**: transaction ID, phone, item, amount, group, date
- **Sheet 2 – Inventory Snapshot**: item, category, stock, threshold, price, units sold, status
- **Sheet 3 – Price Groups**: group, range, transaction count, total KES
- **Sheet 4 – Daily Sales**: date, revenue, transaction count

---

## Deployment

**Frontend → Vercel**
```bash
vercel --prod
# Set env: NEXT_PUBLIC_API_URL=https://your-api.railway.app
```

**Backend → Railway / Heroku**
```bash
railway up
# Set all .env variables in Railway dashboard
# M-Pesa callback URL must be HTTPS (use Railway domain)
```
