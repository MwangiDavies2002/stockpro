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
