# Vercel deployment

Deploy the frontend and API as **two Vercel projects** from this repository:

| Project | Root Directory | Framework |
| --- | --- | --- |
| StockPro Web | `bar-inventory-system` | Next.js |
| StockPro API | `bar-inventory-backend` | Other / Node.js |

## Database

Vercel functions cannot use the local Laragon MySQL server. Create a managed MySQL database that accepts connections from Vercel, apply the base schema and `src/config/accounting_extension.sql`, then add the API variables shown in `bar-inventory-backend/.env.example` to the Vercel API project.

Use a strong, unique `JWT_SECRET`. Set `DB_SSL=true` when required by the provider. Do not add `.env` files to Git.

## API project

Import the repository in Vercel with `bar-inventory-backend` as its Root Directory. The API exports its Express application for Vercel and only listens on a port during local development. Set `FRONTEND_URL` to the deployed frontend origin; separate multiple allowed origins with commas.

After deployment, confirm `https://your-api.vercel.app/api/health` returns `status: ok`.

## Frontend project

Import the same repository again with `bar-inventory-system` as its Root Directory. Set `NEXT_PUBLIC_API_URL` to the API deployment origin, for example `https://your-api.vercel.app`, then redeploy. This variable is intentionally public because it contains only the API URL.

## Production check

Log in, create a test product, and confirm the browser can call the API without a CORS error. Then run the purchase and sale test cycle before entering live transactions.


## Purchase entry migration

Before deploying this version of the API, run `npm run migrate:purchases` from
`bar-inventory-backend` with the target database environment configured. The
repeatable migration adds SKU/barcode, previous purchase references, purchase
headers and line calculations, and widens line unit costs to four decimal places.
It preserves existing records.

Administrators can open `/purchases` from the left sidebar. Products are scoped
to the selected business location because the existing inventory model stores
each product row at one location. Received purchases update stock immediately;
pending purchases can be approved and received from the purchase list.
Receipt, weighted inventory cost, selling price, stock log and accounting entries
are committed together. The migration creates default purchase mappings when
they are missing: Inventory Asset, Accounts Payable, and Purchase Expense.
Administrators can still change those accounts in Accounting Settings. Tax is
included in the selected asset/expense amount.

Margin uses markup on discounted unit cost: selling price including tax equals
`discounted cost * (1 + margin / 100) * (1 + tax / 100)`. Editing selling price
recalculates the margin; zero-cost lines retain an editable selling price with
a zero reference margin. Quantities are whole units, matching existing stock.
Total Items sums quantities. Subtotals and line tax are rounded to two decimals.

Validation: `npm run test:purchases` in the backend runs eight database integration
tests against connection-local temporary tables, leaving business records untouched.
Run the migration first. `npm run build` in the frontend validates the production app.

## Sales A/R migration

Run `npm run migrate:sales-ar` from `bar-inventory-backend` after the reference
data migration. It creates the shared `sales_documents` structure for quotations,
sales orders, proformas, invoices, POS documents, and credit notes. Line items
are stored in `sales_document_items`, payments in `sales_document_payments`, and
discount rules in `discounts`.

Only invoices and POS documents post to accounting and deduct stock. Quotations,
sales orders, and proformas are non-posting documents that can be converted
forward through `converted_from_id`. Credit notes require `reference_invoice_id`,
restore stock, reduce the customer balance, and cannot credit a product quantity
above the original invoice quantity.
