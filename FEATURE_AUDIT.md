# StockPro feature audit and work list

Date: 14 October 2026 (Africa/Nairobi)

## Current implementation and verification

Deployment preference: the web app is now the default (`npm run dev`, `npm run build`, `npm start`). Electron is retained as an explicit optional edition (`npm run start:desktop`, `npm run dist:desktop`) for offline/local installation customers. See `DEPLOYMENT.md` for setup and data boundaries.

This section supersedes the historical findings below. Changes are in the working tree; live browser appearance and external-provider acceptance have not been certified.

The reported Excel error came from the client's ten-second request limit. Imports now allow 120 seconds and insert rows in batches, validate the longer category values in the supplied workbook, accept blank categories, and use the selected business location. A file fingerprint identifies retries; saved requests replay their result and existing SKUs are skipped. Failed or partially failed imports retain explicit error feedback.

Successful imports and completed sales now show a green **DONE!** toast at the top right for **2 seconds**. Pending, failed and locally queued sales do not claim completion. The Add Item dialog scrolls inside its viewport, with Save/Cancel accessible. Purchase and selling prices feed historical-cost gross-profit reports.

| Report change | Implemented behavior | Evidence or remaining verification |
|---|---|---|
| Financial-route authentication and tenant isolation | Authenticated admin access, scoped accounts/settings/journals/treasury/shifts and current account-status checks | HTTP audit passed authorization and cross-shop checks |
| Desktop authentication and password exposure | Authenticated local sessions, role checks, current-user redaction | Desktop audit passed; broader penetration review remains outside these checks |
| Excel validation, timeout, categories and retries | Batch inserts, optional/long categories, 120-second timeout, replay protection and SKU skipping | All 1,590 workbook rows imported, including 836 blank categories; repeat request replayed; independent repeat skipped all 1,590 SKUs |
| Branch selection and location maintenance | Shop-owned locations in POS/import; repaired update/delete routes | HTTP location CRUD and second-shop POS passed |
| Accounting setup, journals, treasury and customer balances | Per-shop mappings, balanced journals, positive amount validation, treasury GL postings, customer-overpayment rejection | HTTP workflow checks passed |
| Ledger, migrations and settings | Scoped ledger SQL, versioned baseline/additive migrations, JSON setting values | HTTP ledger/settings checks passed; empty-database migration available through `npm --prefix bar-inventory-backend run migrate` |
| Stock concurrency and duplicate submissions | Sale stock row locks, duplicate-line checks and saved request results | Duplicate-line overselling rejected; full stress/concurrency tests remain |
| Discounts and POS totals | Real target selection, matching-rule calculation and discounted checkout totals | Backend discount CRUD and sales-math tests passed; actual cashier UI remains untested |
| Offline sync | Queues scoped by shop/cashier/branch; common POS document posting and request identifiers | Desktop transaction tests passed; browser disconnect/reconnect flow remains untested |
| Desktop feature support | Added authenticated transaction/report/settings/reference handlers and static renderer delivery | 41 checks passed, including endpoint-reachability probes; these are not 41 complete UI workflows |
| Desktop native runtime | Electron-compatible SQLite built separately from the Node test dependency | Development and packaged Windows app launches reported `DESKTOP_RENDERER_READY` and exited successfully; installer deployment remains untested |
| Backup and restore | SQLite online backup, integrity validation, staged restore and recovery copy | Temporary-database export/restore/recovery/invalid-file tests passed |
| Owner network | Saved consent, real backend invitations and redemption; no fabricated membership or invite codes | HTTP consent/invitation eligibility passed; online verification still administered separately |
| Notifications | Stored shop-scoped stock/order notifications and notification reads | Email/SMS intentionally skipped at the user's request |
| Safaricom M-Pesa | STK initiation, provider query verification, scoped status, verified subscription/sale posting and pending-payment POS feedback | No credentials found; only local validation tested. Real callbacks, interrupted posting/recovery and refunds still require dedicated verification |
| KRA eTIMS | Device initialization, encrypted key, item-code mapping, queued invoices, ordered submission, stable numbering and uncertain-acceptance protection | Payload/encryption tests passed; registered KRA device configuration and live acceptance are still missing |

Latest evidence:

- **69 HTTP checks passed, 0 failed**, using a disposable MySQL schema. The actual workbook import and its retry checks passed. This audit includes module reads as well as transaction workflows.
- **18 backend regression tests passed**, covering purchases, sales documents, historical profit, KRA payload math and encrypted credentials; frontend TypeScript passed.
- **41 desktop checks passed, 0 failed**, plus the full workbook import and backup/restore tests in temporary SQLite databases.
- The desktop static renderer build produced **45 pages**. Both the development Electron app and packaged `dist/win-unpacked/StockPro.exe` loaded the renderer in hidden audit mode and exited successfully. This does not certify printed receipts, scanners, UI interaction or installation through the Windows installer.
- The browser-automation inventory still returned no apps or browsers. No claim is made that the popup placement/timing, dialog scrolling, receipt printing or offline synchronization was observed live.

Remaining work requiring configuration or live verification:

1. Connect the running StockPro browser for actual cashier, import, modal, chart/export, discount, network and offline/reconnect workflows.
2. Configure Safaricom backend environment credentials and callback URL, then verify success/cancellation, duplicate callbacks, posting recovery, reconciliation and refunds. Credentials were not present in the inspected environment.
3. Configure the registered KRA PIN/device/branch/API URL and product codes, initialize the device, reconcile invoice numbering and verify original invoices/credit notes against KRA. Both inspected businesses had eTIMS disabled and their configuration fields empty.
4. Complete full concurrent-sale/shift-close stress tests, desktop rule-parity flows, installer deployment and receipt printer/barcode scanner tests. Passing endpoint probes do not replace these tests.
5. Add email/SMS later, as instructed by the user.

## Historical audit snapshots

The sections below record the original failures before the implementation above. Their old failure counts and work lists are retained for traceability and are not the current test result.

## Add Item scrolling and profit update

The supplied screenshot shows the form extending past the viewport. The Add/Edit Item dialog now has a viewport-bound height, a scrolling field area, and a fixed header and Save/Cancel footer. It includes a close button and Escape handling. Purchase and selling price labels explicitly say “per unit”, allow cents, reject negative values and show an expected gross profit per unit. Categories remain optional. The inventory table uses the same purchase/selling terminology.

Reports now includes **Gross Profit on Items Sold**, with net units sold, net revenue, recorded purchase cost, gross profit and margin for 7/14/30 days. Its Excel export includes a Gross Profit worksheet. Sale lines record the purchase cost at posting time; later product-cost edits do not rewrite previous profit. Sales-document discounts and separately recorded sales tax are accounted for, and credit notes reverse cost using the referenced invoice's original cost. Costs that were never captured on legacy sales remain explicitly unknown, rather than using today's item cost. This reports gross profit before operating expenses, not net business profit. The additive profit-column migration was applied to the installed MySQL schema without rewriting existing records.

Verification after this update:

- 15 backend regression tests passed, including historic cost preservation, discounts/tax, credit notes and missing-cost handling.
- Frontend TypeScript passed and all 43 live page routes returned HTTP 200.
- The expanded isolated HTTP audit has **51 passing checks and 18 failures**. The new profit flow passed: purchase cost 60, selling price 100, two units with a 10% discount gives net revenue 180, cost 120 and gross profit 60; after returning one unit, the figures are 90, 60 and 30 even after changing current purchase cost to 80.
- Desktop cost snapshot/report regression passed using a disposable SQLite database. The earlier broad desktop audit remains below; the desktop Reports screen still depends on other unsupported report endpoints.
- The running service at `localhost:5052` returns HTTP 200 for health and HTTP 401 for an unauthenticated profit request. The live Inventory and Reports page shells at `localhost:3000` return HTTP 200.

**Interactive browser testing remains blocked.** Although browser automation was enabled by the user, the tool returned no connected browsers; opening Chrome returned “Browser is not available”. No form scrolling, clicks, saves, screenshots, authenticated report screen or download was verified through a browser in this update. The screenshot was used to diagnose the layout, and HTTP route checks were not counted as UI tests.

What is working in the verified backend flows: blank-category inventory, purchase receiving, cash/credit sales, invoice payments and credit notes, reference data, supplier/customer operations, and the new cost-based profit calculations. What is still failing: accounting access controls and shop isolation, disabled-user session invalidation, multi-shop POS branch selection, location editing routes, account setup responses, business-setting readback, ledger SQL, missing M-Pesa/network tables, overpayment/negative-amount validation, and nine overlong-category import rows. These remain prioritized in the work list below.

## Category change completed

Categories can be blank when importing, creating or editing inventory, and when creating a product from Purchases. The forms show “Category (optional)” and “No category”. A missing category is stored as an empty string; a category reference is optional. Product names remain required. Unit and location requirements in the browser forms remain in place.

Verified with real MySQL create/edit/import tests and a disposable desktop SQLite database. All **836 blank-category rows** in `POS Master Data.xlsx` imported successfully in the HTTP audit. The complete file has **1,590 products**: MySQL created **1,581** and rejected **nine** because their nonblank category text exceeds the installed column size. SQLite accepted all 1,590. The remaining nine failures are a separate database-length issue, not a requirement to enter categories.

## What was tested

| Check | Result | Meaning |
| --- | --- | --- |
| Existing backend regression suite, including blank-category and profit cases | 15 passed | Real MySQL controllers, transaction calculations and stock changes |
| Frontend TypeScript check | Passed | Application types compile |
| Prior production renderer build | Passed in the earlier audit | Not repeated for this update; current TypeScript and page compilation checks passed |
| Page route audit | 43/43 returned HTTP 200 | Page shells render; this does not prove client interactions work |
| Browser backend workflow audit | 51 passed, 18 failed | Real HTTP requests through application routers, authentication, controllers and MySQL |
| Prior desktop backend workflow/endpoint audit | 3 passed, 41 failed | Cash-sale and purchase flows work; many frontend endpoints are unsupported |
| Excel parser and desktop import regression | Passed | Headers map correctly; blank categories, SKUs and numeric values persist |

The HTTP audit used a new, empty database cloned from the installed schema. Only test records were created; no production records were copied or changed. The test database was dropped afterward. Desktop tests used temporary databases. Bookkeeping prerequisites were seeded directly in the isolated HTTP database so transaction tests could run independently of broken account setup routes. Cloned tables do not retain foreign keys, so the audit is not proof of production referential integrity.

Browser automation was unavailable in this session. Actual clicks, screenshots, downloads, print dialogs, hardware and provider integrations were **not** verified. This is a broad backend workflow and page-rendering audit, not a complete interactive UI certification.

## Prioritized work list

P0 = access or data isolation defects. P1 = broken business workflows or invalid data accepted. P2 = completeness and verification work.

| Priority | Work needed | Confirmed evidence | Done when |
| --- | --- | --- | --- |
| P0 | Authenticate and authorize accounting, treasury, journal and accounting-setting routes | Requests without a token returned 200 for these modules. The route files do not install authentication middleware. | Unauthenticated requests return 401; staff permissions are enforced for every read and write. |
| P0 | Enforce shop ownership on treasury deposits, withdrawals, transfers and books | A second shop could withdraw from the first shop's treasury by ID. | Cross-shop operations return 404/403 and leave balances unchanged. |
| P0 | Scope journal entries, account books, shifts and accounting mappings to the shop | The second shop saw seven first-shop journals and another shop's shift. Accounting settings and journal SQL lack business scope. | Every shop sees and changes only its own financial records and shifts; mapping storage is per shop. |
| P0 | Revoke access when a staff member is deactivated | The staff login token still fetched inventory after the account was disabled. | Existing tokens stop working immediately after deactivation or access changes. |
| P0 | Implement authenticated desktop sessions and redact password hashes | Desktop `/auth/me` returned the first active user without authentication and included the stored password hash. IPC does not verify a session. | IPC verifies the current user and permissions; user responses never include password hashes. |
| P1 | Expand category storage and handle large Excel imports reliably | Nine workbook rows failed with “Data too long for column 'category'”. An earlier audit request exceeded 15 seconds; the frontend timeout is 10 seconds. | All 1,590 rows import without lost text; progress and errors remain visible; retries do not create unintended duplicates. |
| P1 | Use the shop's actual branch in POS checkout and inventory imports | POS sends `locationId: 1`; checkout for a second shop returned “Business location does not exist”. Import SQL does not set the selected shop location. | Newly registered shops and multiple branches can sell and import into the correct branch. |
| P1 | Align location update/delete routes with frontend requests | Frontend calls PUT/DELETE; backend registers two POST handlers on the same `/:id` path. PUT returned 404. | Location create, edit and delete work through the UI and enforce ownership. |
| P1 | Repair account and treasury setup responses | Account creation returned HTTP 201 without the created account because no user was attached and business scoping used null. Opening-equity setup also failed in an earlier run. | Setup returns the saved account, correct shop and linked treasury; equity setup is repeatable. |
| P1 | Validate balanced journals on the server | A manual entry with debit 100 and no credit was accepted with HTTP 201. Desktop also accepted an unbalanced entry. | Both backends reject unbalanced/invalid entries atomically. |
| P1 | Validate treasury amounts and accounting effects | A negative deposit was accepted and decreased the balance. Deposit/withdraw/transfer balance flows ran, but their journal effects still need reconciliation testing. | Only positive finite amounts are accepted; balances and GL postings reconcile atomically. |
| P1 | Define and validate customer overpayments | A payment of 10,000 against a zero balance was accepted and changed balance to -10,000. | Overpayments are rejected or recorded explicitly as a supported customer credit, with matching ledger entries. |
| P1 | Fix ledger SQL for the installed MySQL version | `/reports/ledger` returned HTTP 500 with a syntax error around the `lines` alias. | Ledger loads and reconciles with journal entries. |
| P1 | Install and version missing schema migrations | `mpesa_payments` and `owner_network_members` were absent in the installed schema; related endpoints returned HTTP 500. | A repeatable migration command brings an empty or existing installation to the current schema; modules open without missing-table errors. |
| P1 | Read business settings JSON correctly | Saving a receipt footer succeeded, but reading settings returned no saved footer. MySQL JSON may already be an object; the controller always attempts `JSON.parse`. | Saved settings survive reload for every shop. |
| P1 | Validate duplicate POS lines and concurrent stock changes | Duplicate item lines requesting four units from stock of two returned a database-check error (500), rather than a validation response. The transaction rolled back. | Lines are aggregated/validated, stock is locked or conditionally updated, and invalid requests return clear 400 responses. |
| P1 | Complete desktop endpoint support | 34 probed frontend endpoints reported “Offline IPC endpoint not implemented”, covering reference data, sales documents, reports, customers, setup and more. | The same advertised workflows work in desktop and browser mode, or unsupported features are clearly unavailable in desktop. |
| P1 | Make desktop sales and stock rules match the browser | Desktop accepted negative sale quantities and credit sales without a customer; filters were ignored and restocking did not append stock history. | Invalid quantities/payments are rejected; search/location filtering and stock-history records are correct. |
| P1 | Fix the desktop renderer build/package path | `build:renderer` succeeds as a Next.js server build, but does not produce `out/index.html`, which Electron loads. A dynamic treasury page also requires server rendering. | A clean desktop build produces the renderer assets Electron actually loads, and an installed app starts successfully. |
| P2 | Finish discount selection and application | API discount CRUD passed. Code review found the discount form does not choose a target product/category/customer, and POS checkout does not load reusable rules. | Users select a target and see the correct discount at checkout, on receipts and in journals. |
| P2 | Test and harden offline queue synchronization | Source uses browser localStorage and replays queued sales through the older `/sales` path, while online POS uses sales documents. Interactive reconnect testing was unavailable. | Queue survives reload/reconnect, prevents duplicate posting, preserves shop/user/branch, and reconciles stock and receipts. |
| P2 | Complete M-Pesa, eTIMS, subscription and notification integrations | Disabled eTIMS configuration, offline subscription approval and M-Pesa missing-input checks passed. No real payment/provider calls were made. Notifications currently log to the console. | Sandbox payment/callback/refund and tax-submission lifecycles pass; subscription activation requires the intended proof; notification delivery is verified. |
| P2 | Verify backup restore and packaged upgrades | Backup export code exists; no restore workflow was exercised and no installer was launched. | Export → restore → reopen preserves records, with tested schema upgrades and recovery from a failed upgrade. |
| P2 | Complete interactive UI, export, receipt and hardware testing | Every page shell returned 200, but browser automation was unavailable. | Run admin/staff click-throughs, form validation, mobile layout, Excel/CSV exports, image handling, receipts/printers and barcode scanning in the actual browser and installed desktop app. |

Recommended sequence: fix access and shop isolation first; then the Excel import, POS branch selection and financial validation; then desktop packaging and missing endpoints; finally integrations and the interactive acceptance pass.

## Workflow coverage

| Feature | Tested flow and outcome | Remaining coverage |
| --- | --- | --- |
| Registration and login | New shop → owner → login → current user; wrong password rejected | Interactive form steps, recovery and session expiry |
| Staff | Create → login; admin-only endpoints reject staff; deactivation failed to invalidate token | Edit/delete UI and role-change sessions |
| Inventory | Blank-category create/edit → restock → signed adjustment → history → delete passed | Image upload, Excel preview, branch/reference linking |
| Excel import | Actual master workbook parsed and posted over HTTP; all blank-category rows saved | Nine long-category failures; timeout/retry behavior |
| Units, categories and brands | Independent create → list → edit → delete flows passed | Inline dialogs, hierarchy and delete-in-use rules |
| Locations | Create and summary work; update route fails | Edit/delete UI after route repair |
| Suppliers | Create → detail → edit → delete passed | UI searches and linked-record delete behavior |
| Purchases | Pending → approved → received; stock increases; duplicate receipt rejected | Edit/cancel/delete UI, printed purchase documents |
| Cash POS | POS document payment and stock deduction passed; second-shop frontend payload failed | Actual cart, payment dialogs and receipt print |
| Shifts | Open → cash sale → close reconciled to 140 with zero variance | Cross-shop visibility repair and concurrent close |
| Credit sales | Sale → balance 20 → payment → balance zero passed | Overpayment policy and credit concurrency |
| Sales documents | Quotation → invoice → payment → credit note passed; sales order/proforma leave stock unchanged | Document UI and print/export |
| Discounts | Create → edit → delete passed | Target selection and automatic application |
| Accounts and journals | Balanced journal saved/read; unbalanced journal incorrectly accepted; account setup failed | Per-shop mappings and reconciled books |
| Treasury | Deposit → withdrawal → transfer balances passed using seeded prerequisites | Amount validation, shop authorization and GL reconciliation |
| Reports and insights | Stock, usage, size groups, sales trend, hourly sales, benchmarks, pairs, loss alerts, staff performance and owner-intelligence reads passed; ledger failed | Numerical reconciliation, exports and visual charts |
| Customers and loyalty | Customer create/edit/statement, loyalty reads and insufficient-points rejection passed | Successful redemption, reversal and UI |
| Settings and eTIMS | Disabled sandbox configuration roundtrip passed; receipt-footer readback failed | Tax submission and credentials lifecycle |
| Subscriptions | Offline request → approval → current status passed | Provider-backed payment verification and access gating |
| Network | Consent endpoint failed due to missing tables | Migration, invitations, verification and anonymized benchmarks |
| Desktop | Blank-category import, cash sale/shift/journal and purchase receipt passed | Session security, 34 unsupported endpoints, rule parity and packaging |

## Reproduce the audit

Run from the repository directory. The HTTP audit needs local MySQL access and clones the currently installed schema into a uniquely named disposable database. It creates test-only accounts and transactions, then drops that database. It exits with code 1 while confirmed defects remain.

```powershell
npm run test:all
npm --prefix bar-inventory-backend run migrate:profit
npm run test:import -- "C:/Users/win/Downloads/POS Master Data.xlsx"
npm run audit:web -- "C:/Users/win/Downloads/POS Master Data.xlsx"
npm run audit:desktop
# With a local frontend server running:
npm run audit:pages -- http://localhost:3000
```

Raw evidence is saved in `audit-results.json`, `desktop-audit-results.json` and `page-audit-results.json`. They contain test records and observed responses, not production exports. The HTTP “pass” count includes an observation recording Excel import counts; pass counts alone do not certify a feature.
