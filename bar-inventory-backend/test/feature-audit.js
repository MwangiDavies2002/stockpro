// HTTP workflow audit against an empty, disposable schema cloned from the installed schema.
// No production records are copied. No payment provider requests are sent.
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const mysql = require('mysql2/promise');
const express = require('express');
const crypto = require('node:crypto');
const mounts = {
  auth: 'auth', inventory: 'inventory', orders: 'orders', reports: 'reports',
  'owner-network': 'ownerNetwork', suppliers: 'suppliers', mpesa: 'mpesa', sales: 'sales',
  users: 'users', shifts: 'shifts', locations: 'locations', customers: 'customers',
  accounts: 'accountRoutes', treasury: 'treasuryRoutes', 'accounting-settings': 'settingRoutes',
  'journal-entries': 'journalEntryRoutes', 'reference-data': 'referenceData',
  'sales-documents': 'salesDocuments', discounts: 'discounts', etims: 'etims',
  'business-settings': 'businessSettings', subscriptions: 'subscriptions', loyalty: 'loyalty',notifications:'notifications',
};
const checks = [];
let base, token, database, server, admin, schema;
async function request(method, url, body, auth = token) {
  const response = await fetch(`${base}/api${url}`, {
    method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(url === '/inventory/import' ? 120000 : 15000),
  });
  const text = await response.text();
  let data; try { data = JSON.parse(text); } catch { data = text.slice(0, 200); }
  return { status: response.status, data };
}
async function ok(method, url, body, expected, auth) {
  const result = await request(method, url, body, auth);
  assert.ok(expected ? result.status === expected : result.status >= 200 && result.status < 300,
    `${method} ${url}: HTTP ${result.status} ${JSON.stringify(result.data).slice(0, 400)}`);
  return result.data;
}
async function check(name, fn) {
  try { const details = await fn(); checks.push({ name, status: 'pass', ...(details ? { details } : {}) }); }
  catch (error) { checks.push({ name, status: 'fail', error: error.message }); }
  console.log(`${checks.at(-1).status.toUpperCase()}: ${name}${checks.at(-1).error ? ' — ' + checks.at(-1).error : ''}`);
}
async function main() {
  const source = process.env.DB_NAME || 'barstockpro';
  schema = `stockpro_audit_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const identifier = value => { assert.match(value, /^[a-zA-Z0-9_]+$/); return '`' + value + '`'; };
  admin = await mysql.createConnection({ host: process.env.DB_HOST || 'localhost', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', port: Number(process.env.DB_PORT || 3306), ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined });
  await admin.query(`CREATE DATABASE ${identifier(schema)}`);
  const [tables] = await admin.query(`SHOW FULL TABLES FROM ${identifier(source)} WHERE Table_type='BASE TABLE'`);
  for (const row of tables) {
    const table = Object.values(row)[0];
    await admin.query(`CREATE TABLE ${identifier(schema)}.${identifier(table)} LIKE ${identifier(source)}.${identifier(table)}`);
  }
  process.env.DB_NAME = schema;
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  process.env.SUBSCRIPTION_APPROVER_EMAILS = 'audit@example.invalid';
  database = require('../src/config/db');
  const app = express(); app.use(express.json({ limit: '1mb' }));
  for (const [prefix, file] of Object.entries(mounts)) app.use(`/api/${prefix}`, require(`../src/routes/${file}`));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
  server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  base = `http://127.0.0.1:${server.address().port}`;
  const password = 'AuditOnlyStrong123!';
  let locationId, product, customer, supplier, employeeToken, otherToken, otherLocation;
  const register = email => ({ business: { name: 'Disposable audit shop', currency: 'KES', country: 'Kenya', state: 'Nairobi', city: 'Nairobi', zipCode: '00100', landmark: 'Test only', timezone: 'Africa/Nairobi' }, settings: { defaultBusinessLocation: 'Audit branch', businessType: 'Retail' }, owner: { firstName: 'Audit', username: email.split('@')[0], email, password, confirmPassword: password } });
  await check('Business onboarding and owner login', async () => {
    const created = await ok('POST', '/auth/business-registration', register('audit@example.invalid'), 201, null);
    token = created.token; locationId = created.locationId;
    assert.equal((await ok('GET', '/auth/me')).business_id, created.businessId);
    const login = await ok('POST', '/auth/login', { email: 'audit@example.invalid', password }, 200, null);
    assert.ok(login.token); token = login.token;
    await ok('POST', '/auth/login', { email: 'audit@example.invalid', password: 'wrong' }, 401, null);
    const second = await ok('POST', '/auth/business-registration', register('other@example.invalid'), 201, null);
    otherToken = second.token; otherLocation = second.locationId;
  });
  if (!token) throw new Error('Onboarding failed: remaining workflow checks require a test account');
  // Seed bookkeeping prerequisites directly in this isolated schema so stock and payment
  // workflows remain independently testable when the accounts UI endpoints fail.
  for (const [key, code, name, type, normal] of [['inventory_asset','1200','Inventory','Assets','Debit'],['inventory_adjustment','5200','Stock adjustment','Expenses','Debit'],['sales_receivable','1100','Receivables','Assets','Debit'],['sales_revenue','4000','Revenue','Income','Credit'],['inventory_cogs','5000','Cost of sales','Expenses','Debit'],['purchases_payable','2000','Payables','Liabilities','Credit'],['purchases_expense','5100','Purchases','Expenses','Debit'],['opening_balance_equity','3000','Opening Balance Equity','Equity','Credit']]) {
    const { insertId } = await database.query('INSERT INTO chart_of_accounts (business_id,account_code,account_name,account_type,normal_balance,active) VALUES (1,?,?,?,?,TRUE)', [code, name, type, normal]);
    await database.query('INSERT INTO accounting_settings (setting_key,account_id) VALUES (?,?)', [key, insertId]);
  }
  const { insertId: auditTreasury } = await database.query("INSERT INTO treasury (business_id,name,type,current_balance,opening_balance,status,linked_gl_account) VALUES (1,'Audit cash','Cash',100,100,'active',1)");
  await database.query("INSERT INTO accounting_settings (setting_key,treasury_id) VALUES ('payment_cash',?)", [auditTreasury]);
  await check('Unauthenticated access rejected for protected modules', async () => {
    const exposed = [];
    for (const url of ['/inventory', '/orders', '/suppliers', '/sales', '/users', '/locations', '/customers', '/accounts', '/treasury', '/accounting-settings', '/journal-entries', '/reports/ledger']) {
      const response = await request('GET', url, undefined, null);
      if (response.status !== 401) exposed.push(`${url}: ${response.status}`);
    }
    assert.deepEqual(exposed, [], `Missing access controls: ${exposed.join(', ')}`);
  });
  await check('Locations and reference data create/read/edit/delete', async () => {
    const location = await ok('POST', '/locations', { name: 'Extra branch', address: 'Test' }, 201);
    await ok('PUT', `/locations/${location.id}`, { name: 'Updated branch', active: true });
    await ok('GET', `/locations/${location.id}/summary`);
    for (const type of ['units', 'categories', 'brands']) {
      const ref = await ok('POST', `/reference-data/${type}`, { name: `Test ${type}`, locationId }, 201);
      assert.ok((await ok('GET', `/reference-data/${type}?locationId=${locationId}`)).some(row => row.id === ref.id));
      await ok('PUT', `/reference-data/${type}/${ref.id}`, { name: `Updated ${type}`, locationId });
      await ok('DELETE', `/reference-data/${type}/${ref.id}`);
    }
    await ok('DELETE', `/locations/${location.id}`);
  });
  await check('Suppliers create/read/edit/delete', async () => {
    supplier = await ok('POST', '/suppliers', { name: 'Audit supplier', email: 'supplier@example.invalid', phone: '', address: '' }, 201);
    await ok('GET', `/suppliers/${supplier.id}`);
    await ok('PUT', `/suppliers/${supplier.id}`, { name: 'Updated supplier', email: 'supplier@example.invalid', phone: '', address: '' });
    const disposable = await ok('POST', '/suppliers', { name: 'Delete supplier' }, 201);
    await ok('DELETE', `/suppliers/${disposable.id}`);
  });
  for (const type of ['units', 'categories', 'brands']) {
    await check(`Reference ${type}: create → list → edit → delete`, async () => {
      const ref = await ok('POST', `/reference-data/${type}`, { name: `Audit ${type}`, locationId }, 201);
      assert.ok((await ok('GET', `/reference-data/${type}?locationId=${locationId}`)).some(row => row.id === ref.id));
      await ok('PUT', `/reference-data/${type}/${ref.id}`, { name: `Updated ${type}`, locationId });
      await ok('DELETE', `/reference-data/${type}/${ref.id}`);
    });
  }
  await check('Inventory blank-category create/edit, stock movements and delete', async () => {
    product = await ok('POST', '/inventory', { name: 'Audit product', category: '', unit: 'Pieces', locationId, stock: 100, threshold: 0, cost: 10, price: 20, sku: 'AUDIT-PART' }, 201);
    assert.equal(product.category, '');
    product = await ok('PUT', `/inventory/${product.id}`, { name: 'Audit product edited', category: '', unit: 'Pieces', locationId, stock: 100, threshold: 0, cost: 10, price: 20 });
    await ok('PATCH', `/inventory/${product.id}/restock`, { quantity: 5 });
    await ok('PATCH', `/inventory/${product.id}/adjustment`, { quantity: -2, reason: 'Audit count' });
    assert.equal(Number((await ok('GET', `/inventory/${product.id}`)).stock), 103);
    assert.ok((await ok('GET', `/inventory/${product.id}/history`)).length >= 2);
    const disposable = await ok('POST', '/inventory', { name: 'Delete item', unit: 'Pieces', locationId }, 201);
    await ok('DELETE', `/inventory/${disposable.id}`);
  });
  await check('Excel master workbook HTTP import: all 1590 items including blank categories', async () => {
    const XLSX = require('../../bar-inventory-system/node_modules/xlsx');
    const ts = require('../../bar-inventory-system/node_modules/typescript');
    const sourceText = fs.readFileSync(path.join(__dirname, '../../bar-inventory-system/app/lib/inventoryImport.ts'), 'utf8');
    const mod = { exports: {} }; new Function('exports', ts.transpileModule(sourceText, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(mod.exports);
    const workbook = XLSX.readFile(process.argv[2]);
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]).map(mod.exports.mapInventoryImportRow);
    const started = Date.now();
    const requestId = 'audit-master-workbook';
    const result = await ok('POST', '/inventory/import', { items: rows, requestId }, 201);
    const elapsedMs = Date.now() - started;
    const retry = await ok('POST', '/inventory/import', { items: rows, requestId }, 201);
    assert.equal(retry.replayed, true);
    const duplicate = await ok('POST', '/inventory/import', { items: rows, requestId: 'audit-new-attempt' }, 201);
    assert.equal(duplicate.createdCount, 0);
    assert.equal(duplicate.skippedCount, rows.length);
    const { rows: blankRows } = await database.query("SELECT COUNT(*) count FROM inventory_items WHERE business_id=1 AND category='' AND sku<>'AUDIT-PART'");
    assert.equal(Number(blankRows[0].count), rows.filter(row => !row.category).length);
    checks.push({ name: 'Excel import observed counts', status: 'pass', details: { attempted: rows.length, created: result.createdCount, rejected: result.errorCount, blankCategoryRows: rows.filter(row => !row.category).length, firstErrors: result.errors.slice(0, 3) } });
    assert.equal(result.createdCount, rows.length); assert.equal(result.errorCount, 0);
    return { products: rows.length, blankCategories: rows.filter(row => !row.category).length, elapsedMs, retryReplayed: true, duplicateSkusSkipped: duplicate.skippedCount };
  });
  await check('Customers create/read/edit', async () => {
    customer = await ok('POST', '/customers', { name: 'Audit customer', creditLimit: 1000 }, 201);
    await ok('PUT', `/customers/${customer.id}`, { name: 'Updated audit customer', creditLimit: 2000, active: true });
    await ok('GET', `/customers/${customer.id}/statement`);
  });
  await check('Accounts, treasury creation, accounting mappings and opening equity', async () => {
    const accounts = {};
    for (const [key, code, name, type, normal] of [['inventory_asset','1200','Inventory','Assets','Debit'],['sales_receivable','1100','Receivables','Assets','Debit'],['sales_revenue','4000','Revenue','Income','Credit'],['inventory_cogs','5000','Cost of sales','Expenses','Debit'],['purchases_payable','2000','Payables','Liabilities','Credit'],['purchases_expense','5100','Purchases','Expenses','Debit']]) {
      const account = await ok('POST', '/accounts', { account_code: `AUDIT-${code}`, account_name: name, account_type: type, normal_balance: normal }, 201);
      assert.ok(account?.id, 'Account creation returned HTTP 201 without the created account');
      accounts[key] = account.id; await ok('PUT', `/accounting-settings/${key}`, { account_id: account.id });
    }
    await ok('POST', '/accounts/opening-balance-equity', {});
    const cash = await ok('POST', '/treasury', { name: 'Audit cash', type: 'Cash', opening_balance: 100 }, 201);
    await ok('PUT', '/accounting-settings/payment_cash', { treasury_id: cash.id });
    await ok('POST', `/treasury/${cash.id}/deposit`, { amount: 50, reference: 'AUDIT', description: 'Audit deposit' });
    const withdrawn = await ok('POST', `/treasury/${cash.id}/withdraw`, { amount: 20, reference: 'AUDIT', description: 'Audit withdrawal' });
    assert.equal(Number(withdrawn.current_balance), 130);
    await ok('GET', `/treasury/${cash.id}/transactions`);
  });
  await check('Purchase create → approve → receive → stock and accounting', async () => {
    const before = Number((await ok('GET', `/inventory/${product.id}`)).stock);
    const order = await ok('POST', '/orders', { supplierId: supplier.id, locationId, purchaseDate: '2026-10-14', status: 'pending', items: [{ itemId: product.id, quantity: 2, unitPrice: 10, costBeforeDiscount: 10, discountPercent: 0, taxPercent: 0, profitMargin: 100, accountType: 'asset' }] }, 201);
    await ok('PATCH', `/orders/${order.id}/status`, { status: 'approved' });
    await ok('PATCH', `/orders/${order.id}/status`, { status: 'delivered' });
    assert.equal(Number((await ok('GET', `/inventory/${product.id}`)).stock), before + 2);
    await ok('GET', `/orders/${order.id}`);
    await ok('PATCH', `/orders/${order.id}/status`, { status: 'delivered' }, 400);
  });
  await check('Shift open → cash sale → close and cash reconciliation', async () => {
    const shift = await ok('POST', '/shifts', { openingFloat: 100 }, 201);
    const sale = await ok('POST', '/sales', { locationId, items: [{ itemId: product.id, quantity: 2, unitPrice: 20 }], paymentMethod: 'cash' }, 201);
    await ok('GET', `/sales/${sale.sale.id}`);
    const closed = await ok('PATCH', `/shifts/${shift.id}/close`, { actualCash: 140 });
    assert.equal(Number(closed.closing_expected), 140); assert.equal(Number(closed.variance), 0);
  });
  await check('Credit sale → customer payment → statement', async () => {
    await ok('POST', '/sales', { locationId, customerId: customer.id, items: [{ itemId: product.id, quantity: 1, unitPrice: 20 }], paymentMethod: 'credit' }, 201);
    assert.equal(Number((await ok('GET', `/customers/${customer.id}`)).balance), 20);
    await ok('POST', `/customers/${customer.id}/payments`, { amount: 20, method: 'cash' }, 201);
    assert.equal(Number((await ok('GET', `/customers/${customer.id}/statement`)).customer.balance), 0);
  });
  await check('Quotation → invoice → payment → credit note', async () => {
    const quotation = await ok('POST', '/sales-documents', { type: 'quotation', locationId, customerId: customer.id, items: [{ itemId: product.id, quantity: 1, unitPrice: 20 }] }, 201);
    const invoice = await ok('POST', `/sales-documents/${quotation.id}/convert`, { targetType: 'invoice' }, 201);
    await ok('POST', `/sales-documents/${invoice.id}/payments`, { amount: 20, method: 'cash' }, 201);
    await ok('POST', '/sales-documents', { type: 'credit_note', locationId, customerId: customer.id, referenceInvoiceId: invoice.id, items: [{ itemId: product.id, quantity: 1, unitPrice: 20 }] }, 201);
  });
  await check('Discounts create/edit/delete', async () => {
    const payload = { name: 'Audit discount', locationId, discountType: 'percent', value: 10, appliesTo: 'product', productId: product.id, active: true };
    const discount = await ok('POST', '/discounts', payload, 201);
    await ok('PUT', `/discounts/${discount.id}`, { ...payload, value: 15 });
    await ok('DELETE', `/discounts/${discount.id}`);
  });
  await check('Business settings and disabled eTIMS configuration roundtrip', async () => {
    await ok('PUT', '/business-settings', { receiptFooter: 'Audit footer' });
    assert.equal((await ok('GET', '/business-settings')).receiptFooter, 'Audit footer');
    await ok('PUT', '/etims/config', { enabled: false, mode: 'sandbox' });
    assert.equal(Number((await ok('GET', '/etims/config')).etims_enabled), 0);
  });
  await check('eTIMS disabled sandbox settings save/read', async () => {
    await ok('PUT', '/etims/config', { enabled: false, mode: 'sandbox' });
    assert.equal(Number((await ok('GET', '/etims/config')).etims_enabled), 0);
    await ok('PUT', '/etims/config', { enabled: false, mode: 'invalid' }, 400);
  });
  await check('Offline subscription request → approval → current status', async () => {
    const subscription = await ok('POST', '/subscriptions', { plan: 'basic', amount: 100, paymentMethod: 'offline' }, 201);
    await ok('PATCH', `/subscriptions/${subscription.id}/approve`, {});
    assert.equal((await ok('GET', '/subscriptions/current')).status, 'approved');
  });
  await check('Owner network consent and invitation eligibility', async () => {
    await ok('POST', '/owner-network', { region: 'Nairobi', segment: 'retail', optedIn: true });
    assert.equal(Number((await ok('GET', '/owner-network')).opted_in), 1);
    await ok('POST', '/owner-network/invite', {}, 403);
  });
  await check('Staff create/login and admin-only access', async () => {
    const staff = await ok('POST', '/users', { name: 'Audit staff', email: 'staff@example.invalid', password, role: 'employee' }, 201);
    employeeToken = (await ok('POST', '/auth/login', { email: 'staff@example.invalid', password }, 200, null)).token;
    await ok('GET', '/users', undefined, 403, employeeToken);
    await ok('POST', '/inventory/import', { items: [{ name: 'Not allowed' }] }, 403, employeeToken);
    await ok('PATCH', `/users/${staff.id}/toggle-active`, {});
    await ok('GET', '/inventory', undefined, 401, employeeToken);
  });
  await check('Tenant isolation: journals, account books and treasury operations', async () => {
    const ownJournals = await ok('GET', '/journal-entries');
    const otherJournals = await ok('GET', '/journal-entries', undefined, undefined, otherToken);
    assert.ok(ownJournals.length > 0);
    assert.equal(otherJournals.length, 0, 'Second shop can see first shop journals');
  });
  await check('Tenant isolation: inventory, customers and suppliers', async () => {
    await ok('GET', `/inventory/${product.id}`, undefined, 404, otherToken);
    await ok('GET', `/customers/${customer.id}`, undefined, 404, otherToken);
    await ok('GET', `/suppliers/${supplier.id}`, undefined, 404, otherToken);
  });
  await check('Balanced manual journal create → read', async () => {
    const journal = await ok('POST', '/journal-entries', { journalDate: '2026-10-14', description: 'Balanced audit entry', lines: [{ accountId: 1, debit: 10, credit: 0 }, { accountId: 2, debit: 0, credit: 10 }] }, 201);
    assert.equal((await ok('GET', `/journal-entries/${journal.id}`)).lines.length, 2);
  });
  await check('Sales order and proforma create/read; stock unchanged', async () => {
    const before = Number((await ok('GET', `/inventory/${product.id}`)).stock);
    for (const type of ['sales_order', 'proforma']) {
      const document = await ok('POST', '/sales-documents', { type, locationId, customerId: customer.id, items: [{ itemId: product.id, quantity: 1, unitPrice: 20 }] }, 201);
      await ok('GET', `/sales-documents/${document.id}`);
    }
    assert.equal(Number((await ok('GET', `/inventory/${product.id}`)).stock), before);
  });
  await check('POS document checkout: payment, stock and sale record', async () => {
    const before = Number((await ok('GET', `/inventory/${product.id}`)).stock);
    const document = await ok('POST', '/sales-documents', { type: 'pos', locationId, payment: { amount: 20, method: 'cash' }, items: [{ itemId: product.id, quantity: 1, unitPrice: 20 }] }, 201);
    assert.equal(Number(document.paid_amount), 20);
    assert.equal(Number((await ok('GET', `/inventory/${product.id}`)).stock), before - 1);
  });
  await check('POS checkout in second shop using its selected location', async () => {
    const item = await ok('POST', '/inventory', { name: 'Second shop item', unit: 'Pieces', locationId: otherLocation, stock: 5, price: 20 }, 201, otherToken);
    await ok('POST', '/sales-documents', { type: 'pos', locationId: otherLocation, payment: { amount: 20, method: 'cash' }, items: [{ itemId: item.id, quantity: 1, unitPrice: 20 }] }, 201, otherToken);
    await ok('POST', '/sales-documents', { type: 'pos', locationId: 1, payment: { amount: 20, method: 'cash' }, items: [{ itemId: item.id, quantity: 1, unitPrice: 20 }] }, 400, otherToken);
  });
  await check('POS duplicate lines cannot oversell', async () => {
    const item = await ok('POST', '/inventory', { name: 'Oversell probe', unit: 'Pieces', locationId, stock: 2, cost: 1, price: 2 }, 201);
    await ok('POST', '/sales', { locationId, items: [{ itemId: item.id, quantity: 2 }, { itemId: item.id, quantity: 2 }] }, 400);
    assert.equal(Number((await ok('GET', `/inventory/${item.id}`)).stock), 2);
  });
  await check('Customer overpayment rejected', async () => {
    await ok('POST', `/customers/${customer.id}/payments`, { amount: 10000, method: 'cash' }, 400);
  });
  await check('Concurrent sales cannot oversell the last unit',async()=>{
    const product=await ok('POST','/inventory',{name:'Concurrent stock audit',unit:'Pieces',locationId,stock:1,cost:5,price:10},201);
    const results=await Promise.all(Array.from({length:8},(_,index)=>request('POST','/sales-documents',{type:'pos',requestId:`concurrent-sale-${index}`,locationId,payment:{amount:10,method:'cash'},items:[{itemId:product.id,quantity:1,unitPrice:10}]})));
    assert.equal(results.filter(result=>result.status===201).length,1);
    assert.ok(results.filter(result=>result.status!==201).every(result=>result.status===400));
    assert.equal(Number((await ok('GET',`/inventory/${product.id}`)).stock),0);
  });
  await check('Concurrent retries post one sale and one stock deduction',async()=>{
    const product=await ok('POST','/inventory',{name:'Concurrent retry audit',unit:'Pieces',locationId,stock:10,cost:5,price:10},201);
    const body={type:'pos',requestId:'concurrent-same-request',locationId,payment:{amount:10,method:'cash'},items:[{itemId:product.id,quantity:1,unitPrice:10}]};
    const results=await Promise.all(Array.from({length:8},()=>request('POST','/sales-documents',body)));
    assert.ok(results.every(result=>result.status===201),JSON.stringify(results));
    assert.equal(new Set(results.map(result=>result.data.id)).size,1);
    assert.equal(Number((await ok('GET',`/inventory/${product.id}`)).stock),9);
  });
  await check('Concurrent shift open and close each succeed once',async()=>{
    const opens=await Promise.all(Array.from({length:6},()=>request('POST','/shifts',{openingFloat:0})));
    assert.equal(opens.filter(result=>result.status===201).length,1,JSON.stringify(opens));
    const shift=opens.find(result=>result.status===201).data;
    const closes=await Promise.all(Array.from({length:6},()=>request('PATCH',`/shifts/${shift.id}/close`,{actualCash:0})));
    assert.equal(closes.filter(result=>result.status===200).length,1,JSON.stringify(closes));
    assert.equal(Number(closes.find(result=>result.status===200).data.variance),0);
    assert.equal((await ok('GET','/shifts/current')),null);
  });
  await check('Concurrent document conversion creates one invoice and rejects invoice reconversion',async()=>{
    const item=await ok('POST','/inventory',{name:'Conversion retry item',unit:'Pieces',locationId,stock:5,cost:2,price:10},201);
    const quote=await ok('POST','/sales-documents',{type:'quotation',locationId,customerId:customer.id,items:[{itemId:item.id,quantity:1,unitPrice:10}]},201);
    const results=await Promise.all(Array.from({length:6},()=>request('POST',`/sales-documents/${quote.id}/convert`,{targetType:'invoice'})));
    assert.ok(results.every(result=>result.status===201),JSON.stringify(results));assert.equal(new Set(results.map(result=>result.data.id)).size,1);
    assert.equal(Number((await ok('GET',`/inventory/${item.id}`)).stock),4);
    await ok('POST',`/sales-documents/${results[0].data.id}/convert`,{targetType:'invoice'},400);
  });
  await check('M-Pesa verified callback, duplicate callback and interrupted-post recovery (mock provider)',async()=>{
    const provider=require('../src/services/mpesa');const original={initiate:provider.initiate,verify:provider.verify};let calls=0,code=0;
    provider.initiate=async()=>({ResponseCode:'0',CheckoutRequestID:`audit-checkout-${++calls}`});provider.verify=async()=>({ResultCode:code});
    const notify=(id,amount,result=0)=>request('POST','/mpesa/callback',{Body:{stkCallback:{CheckoutRequestID:id,ResultCode:result,CallbackMetadata:{Item:[{Name:'Amount',Value:amount},{Name:'PhoneNumber',Value:254712345678},{Name:'MpesaReceiptNumber',Value:`AUDIT-${id}`}]}}}},null);
    try{
      const product=await ok('POST','/inventory',{name:'Mock payment item',unit:'Pieces',locationId,stock:3,cost:5,price:10},201);
      const create=(key=crypto.randomUUID())=>ok('POST','/mpesa/stk-push',{phone:'0712345678',amount:10,purpose:'sale',sale:{type:'pos',requestId:key,locationId,items:[{itemId:product.id,quantity:1,unitPrice:10}]}});
      const first=await create('mock-first-stk');const repeat=await create('mock-first-stk');assert.equal(repeat.checkoutRequestId,first.checkoutRequestId);assert.equal(calls,1);
      assert.equal((await notify(first.checkoutRequestId,10)).status,200);
      const saved=(await ok('GET',`/mpesa/status/${first.checkoutRequestId}`));assert.equal(saved.status,'completed');assert.ok(saved.reference_id);
      assert.equal((await notify(first.checkoutRequestId,10)).status,200);assert.equal(Number((await ok('GET',`/inventory/${product.id}`)).stock),2);
      const payment=(await database.query('SELECT * FROM mpesa_payments WHERE transaction_id=?',[first.checkoutRequestId])).rows[0];
      await database.query('UPDATE mpesa_payments SET reference_id=NULL WHERE id=?',[payment.id]);
      const recovery=await ok('POST',`/mpesa/payments/${payment.id}/recover`,{});assert.equal(recovery.documentId,saved.reference_id);assert.equal(Number((await ok('GET',`/inventory/${product.id}`)).stock),2);assert.equal(calls,1);
      await ok('POST',`/mpesa/payments/${payment.id}/recover`,{},404,otherToken);
      const second=await create();assert.equal((await notify(second.checkoutRequestId,99)).status,400);assert.equal((await ok('GET',`/mpesa/status/${second.checkoutRequestId}`)).status,'pending');
      assert.equal((await notify(second.checkoutRequestId,10,1032)).status,503);code=1032;assert.equal((await notify(second.checkoutRequestId,10,1032)).status,200);assert.equal((await ok('GET',`/mpesa/status/${second.checkoutRequestId}`)).status,'failed');code=0;
      const third=await create();await database.query('UPDATE inventory_items SET stock=0 WHERE id=?',[product.id]);assert.equal((await notify(third.checkoutRequestId,10)).status,200);
      assert.equal((await ok('GET',`/mpesa/status/${third.checkoutRequestId}`)).status,'needs_action');
      const failed=(await database.query('SELECT id FROM mpesa_payments WHERE transaction_id=?',[third.checkoutRequestId])).rows[0];await database.query('UPDATE inventory_items SET stock=1 WHERE id=?',[product.id]);
      await ok('POST',`/mpesa/payments/${failed.id}/recover`,{});assert.equal((await ok('GET',`/mpesa/status/${third.checkoutRequestId}`)).status,'completed');assert.equal(Number((await ok('GET',`/inventory/${product.id}`)).stock),0);assert.equal(calls,3);
      const subscriptionPayment=await ok('POST','/mpesa/stk-push',{requestId:'mock-subscription-stk',phone:'0712345678',amount:1000,purpose:'subscription',plan:'basic'});
      const subscriptionBody={plan:'basic',paymentMethod:'mpesa',phone:'0712345678',checkoutRequestId:subscriptionPayment.checkoutRequestId};
      const subscription=await ok('POST','/subscriptions',subscriptionBody,201);assert.equal(subscription.status,'pending');
      assert.equal((await notify(subscriptionPayment.checkoutRequestId,1000)).status,200);
      const retrySubscription=await ok('POST','/subscriptions',subscriptionBody,201);assert.equal(retrySubscription.id,subscription.id);assert.equal(retrySubscription.status,'approved');assert.equal(retrySubscription.replayed,true);
    }finally{Object.assign(provider,original);}
  });
  await check('Unbalanced manual journal rejected', async () => {
    await ok('POST', '/journal-entries', { journalDate: '2026-10-14', description: 'Invalid audit entry', lines: [{ accountId: 1, debit: 100, credit: 0 }] }, 400);
  });
  await check('Treasury negative deposit rejected', async () => {
    await ok('POST', `/treasury/${auditTreasury}/deposit`, { amount: -100, reference: 'INVALID', description: 'Invalid amount probe' }, 400);
  });
  await check('Treasury deposit → withdrawal → transfer → transaction history', async () => {
    const destination = await database.query("INSERT INTO treasury (business_id,name,type,current_balance,opening_balance,status,linked_gl_account) VALUES (1,'Destination','Cash',0,0,'active',1)");
    const before = (await database.query('SELECT current_balance FROM treasury WHERE id=?', [auditTreasury])).rows[0].current_balance;
    await ok('POST', `/treasury/${auditTreasury}/deposit`, { amount: 50, reference: 'AUDIT', description: 'Deposit' });
    await ok('POST', `/treasury/${auditTreasury}/withdraw`, { amount: 20, reference: 'AUDIT', description: 'Withdrawal' });
    await ok('POST', '/treasury/transfer', { fromTreasuryId: auditTreasury, toTreasuryId: destination.insertId, amount: 10, reference: 'AUDIT', description: 'Transfer' });
    const saved = (await database.query('SELECT current_balance FROM treasury WHERE id=?', [auditTreasury])).rows[0];
    assert.equal(Number(saved.current_balance), Number(before) + 20);
    await ok('GET', `/treasury/${auditTreasury}/transactions`);
  });
  await check('Cross-shop treasury withdrawal rejected', async () => {
    await ok('POST', `/treasury/${auditTreasury}/deposit`, { amount: 100, reference: 'CROSS', description: 'Probe' }, undefined, token);
    await ok('POST', `/treasury/${auditTreasury}/withdraw`, { amount: 1, reference: 'CROSS', description: 'Probe' }, 404, otherToken);
  });
  await check('Cross-shop shift list contains no other shop shifts', async () => {
    assert.equal((await ok('GET', '/shifts', undefined, undefined, otherToken)).length, 0);
  });
  await check('Loyalty customer totals and insufficient points rejection', async () => {
    await ok('GET', '/loyalty/customers'); await ok('GET', '/loyalty/redemptions');
    await ok('POST', '/loyalty/redeem', { customerId: customer.id, reward: 'Test reward', points: 999999 }, 400);
  });
  for (const url of ['/inventory', '/inventory/low-stock', '/orders', '/suppliers', '/sales', '/users', '/shifts', '/shifts/current', '/locations', '/customers', '/accounts', '/treasury', '/accounting-settings', '/journal-entries', '/sales-documents', '/discounts', '/subscriptions', '/mpesa/payments', '/mpesa/groups', ...['stock','usage','sale-size-groups','sales-trend','hourly-sales','benchmarks','product-pairs','loss-alerts','staff-performance','ledger','owner-intelligence'].map(name => `/reports/${name}`)]) {
    await check(`Module read endpoint GET ${url}`, () => ok('GET', url).then(() => undefined));
  }
  await check('M-Pesa missing-input validation (no provider request)', () => ok('POST', '/mpesa/stk-push', {}, 400).then(() => undefined));
  await check('Gross profit report uses sale cost snapshots, discounts, tax exclusion and returns', async () => {
    const item = await ok('POST', '/inventory', { name: 'Profit audit part', unit: 'Pieces', locationId, stock: 10, cost: 60, price: 100 }, 201);
    const invoice = await ok('POST', '/sales-documents', { type: 'invoice', locationId, customerId: customer.id, items: [{ itemId: item.id, quantity: 2, unitPrice: 100, discountPercent: 10, taxPercent: 16 }] }, 201);
    await ok('PUT', `/inventory/${item.id}`, { name: item.name, category: '', unit: 'Pieces', locationId, stock: 8, threshold: 0, cost: 80, price: 100 });
    const beforeReturn = (await ok('GET', '/reports/profit?days=7')).items.find(row => row.item_id === item.id);
    assert.equal(beforeReturn.net_revenue, 180); assert.equal(beforeReturn.recorded_cost, 120); assert.equal(beforeReturn.gross_profit, 60);
    await ok('POST', '/sales-documents', { type: 'credit_note', locationId, referenceInvoiceId: invoice.id, items: [{ itemId: item.id, quantity: 1, unitPrice: 100, discountPercent: 10, taxPercent: 16 }] }, 201);
    const afterReturn = (await ok('GET', '/reports/profit?days=7')).items.find(row => row.item_id === item.id);
    assert.equal(afterReturn.net_revenue, 90); assert.equal(afterReturn.recorded_cost, 60); assert.equal(afterReturn.gross_profit, 30);
    await ok('GET', '/reports/profit?days=-1', undefined, 400);
    await ok('GET', '/reports/profit', undefined, 401, employeeToken);
  });
  await check('KRA initialization, item mapping, invoice receipt and uncertain-response protection (mock provider)',async()=>{
    const etims=require('../src/services/etims'),original=etims.transport.post;let sends=0,timeout=false;
    etims.transport.post=async(url)=>{if(url.endsWith('/selectInitOsdcInfo'))return{data:{resultCd:'000',data:{info:{cmcKey:'audit-device-key'}}}};sends++;if(timeout)throw new Error('Mock network response lost');return{data:{resultCd:'000',data:{rcptNo:sends,intrlData:'AUDIT'}}};};
    try{
      await ok('PUT','/etims/config',{enabled:true,mode:'sandbox',kraPin:'P000000000A',apiUrl:'https://etims-sbx.kra.go.ke',deviceSerial:'AUDIT-DEVICE',branchId:'00'});
      await ok('POST','/etims/initialize',{});
      const config=await ok('GET','/etims/config');assert.equal(!!config.etims_initialized,true);assert.equal(config.etims_password_encrypted,undefined);
      const product=await ok('POST','/inventory',{name:'KRA audit item',unit:'Pieces',locationId,stock:3,cost:5,price:10},201);
      await ok('PUT',`/etims/items/${product.id}`,{itemCode:'AUDIT-ITEM',classCode:'123',taxCategory:'B',qtyUnit:'U',pkgUnit:'NT'});
      const invoice=await ok('POST','/sales-documents',{type:'pos',locationId,payment:{amount:11.6,method:'cash'},items:[{itemId:product.id,quantity:1,unitPrice:10,taxPercent:16}]},201);
      const job=(await ok('GET','/etims/jobs')).find(job=>job.reference_id===invoice.id);
      await ok('POST',`/etims/jobs/${job.id}/submit`,{});assert.equal(sends,1);
      assert.equal((await ok('POST',`/etims/jobs/${job.id}/submit`,{})).replayed,true);assert.equal(sends,1);
      const stored=await ok('GET',`/sales-documents/${invoice.id}`);assert.ok(stored.etims_receipt_json);assert.equal(Number(stored.etims_invoice_number),1);
      const next=await ok('POST','/sales-documents',{type:'pos',locationId,payment:{amount:10,method:'cash'},items:[{itemId:product.id,quantity:1,unitPrice:10}]},201);
      const uncertain=(await ok('GET','/etims/jobs')).find(job=>job.reference_id===next.id);timeout=true;
      await ok('POST',`/etims/jobs/${uncertain.id}/submit`,{},500);
      assert.equal((await ok('GET','/etims/jobs')).find(job=>job.id===uncertain.id).status,'unknown');
      await ok('POST',`/etims/jobs/${uncertain.id}/submit`,{},400);assert.equal(sends,2);
    }finally{etims.transport.post=original;await database.query('UPDATE businesses SET etims_enabled=FALSE WHERE id=1');}
  });
  await check('Saved notifications are scoped and can be marked read',async()=>{
    const result=await database.query("INSERT INTO notifications(business_id,type,title,message) VALUES (1,'audit','Audit notification','Test-only notification')");
    const saved=await ok('GET','/notifications');assert.ok(saved.some(row=>row.id===result.insertId));
    await ok('PATCH',`/notifications/${result.insertId}/read`,{});assert.ok((await ok('GET','/notifications')).find(row=>row.id===result.insertId).read_at);
    assert.ok(!(await ok('GET','/notifications',undefined,undefined,otherToken)).some(row=>row.id===result.insertId));
    await ok('PATCH',`/notifications/${result.insertId}/read`,{},404,otherToken);
  });
  await check('Logout response', () => ok('POST', '/auth/logout', {}).then(() => undefined));
}
main().catch(error => { checks.push({ name: 'Audit setup/completion', status: 'fail', error: error.message }); console.error(error.message); }).finally(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (database) await database.db.end();
  if (admin) {
    if (schema && /^stockpro_audit_\d+_[a-f0-9]{6}$/.test(schema)) await admin.query(`DROP DATABASE \`${schema}\``);
    await admin.end();
  }
  const output = path.join(__dirname, '../../audit-results.json');
  fs.writeFileSync(output, JSON.stringify({ date: '2026-10-14', environment: 'Isolated cloned MySQL schema; real HTTP routes, authentication, controllers and SQL; no production records', checks }, null, 2));
  console.log(`Audit complete: ${checks.filter(row => row.status === 'pass').length} passed, ${checks.filter(row => row.status === 'fail').length} failed`);
  process.exitCode = checks.some(row => row.status === 'fail') ? 1 : 0;
});
