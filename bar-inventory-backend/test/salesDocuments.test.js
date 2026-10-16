require('dotenv').config();
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const database = require('../src/config/db');
const {runForBusiness}=require('../src/utils/tenant');

let connection, salesDocuments, reports;
const tables = ['sales_document_events','operation_requests','chart_of_accounts','users','treasury','treasury_transactions','businesses','integration_jobs','sales_documents', 'sales_document_items', 'sales_document_payments', 'discounts', 'sales', 'sale_items', 'customers', 'inventory_items', 'locations', 'inventory_stock_log', 'accounting_settings', 'journal_entries', 'journal_entry_lines'];
const run = async (sql, params = []) => {
  const [result] = await connection.query(sql.replace(/\$\d+/g, '?').replace(new RegExp('\\b(' + tables.join('|') + ')\\b', 'g'), 'test_ar_$1'), params);
  return { rows: Array.isArray(result) ? result : [], insertId: result.insertId, rowCount: result.affectedRows };
};

before(async () => {
  connection = await database.db.getConnection();
  for (const table of tables) await connection.query(`CREATE TEMPORARY TABLE test_ar_${table} LIKE ${table}`);
  database.query = run;
  database.getClient = async () => ({ query: run, release() {} });
  salesDocuments = require('../src/controllers/salesDocumentController');
  reports = require('../src/controllers/reportController');
});

after(async () => { if (connection) { await connection.rollback(); connection.release(); } await database.db.end(); });

beforeEach(async () => {
  for (const table of tables) await run(`DELETE FROM ${table}`);
  await run("INSERT INTO users(id,business_id,name,email,password,role,active) VALUES (1,1,'Test cashier','invoice@test.invalid','unused','admin',TRUE)");
  await run("INSERT INTO businesses(id,name,currency,country,state,city,zip_code,landmark,timezone) VALUES (1,'Test shop','KES','Kenya','Nairobi','Nairobi','00100','Test','Africa/Nairobi')");
  for(const [id,type,normal] of [[1,'Assets','Debit'],[2,'Income','Credit'],[3,'Expenses','Debit'],[4,'Assets','Debit'],[5,'Liabilities','Credit']])await run('INSERT INTO chart_of_accounts(id,business_id,account_name,account_code,account_type,normal_balance,active) VALUES (?,1,?,?,?,?,TRUE)',[id,'Test '+id,String(id),type,normal]);
  await run("INSERT INTO locations (id,business_id,name) VALUES (1,1,'Main')");
  await run("INSERT INTO customers (id,business_id,name,credit_limit,balance,active) VALUES (1,1,'Walk-in',100000,0,TRUE)");
  await run("INSERT INTO inventory_items (id,business_id,name,category,unit,stock,cost,price,location_id,sku,barcode) VALUES (1,1,'Test product','General','Unit',10,40,100,1,'SKU1','BAR1')");
  await run("INSERT INTO accounting_settings (setting_key,account_id) VALUES ('sales_receivable',1),('sales_revenue',2),('inventory_cogs',3),('inventory_asset',4),('payment_cash',1),('sales_vat_output',5)");
});

async function invoke(fn, body, params = {}, query = {}) {
  let code = 200, result, failure;
  const response = { status(n) { code = n; return this; }, json(data) { result = data; return this; } };
  await runForBusiness(1,()=>fn({ body, params, query, user: { id: 1, business_id: 1 } }, response, err => { failure = err; }));
  if (failure) throw failure;
  return { code, result };
}

const payload = (type = 'quotation') => ({
  type,
  customerId: 1,
  locationId: 1,
  date: '2026-09-07',
  referenceNo: 'AR-TEST',
  items: [{ itemId: 1, quantity: 2, unitPrice: 100, discountPercent: 10, taxPercent: 16 }],
});

test('quotation converts to invoice and only invoice deducts stock', async () => {
  const quote = await invoke(salesDocuments.create, payload());
  assert.equal(quote.code, 201);
  assert.equal(Number(quote.result.total), 208.8);
  assert.equal((await run('SELECT stock FROM inventory_items WHERE id=1')).rows[0].stock, 10);

  const invoice = await invoke(salesDocuments.convert, { targetType: 'invoice' }, { id: quote.result.id });
  assert.equal(invoice.code, 201);
  assert.equal(invoice.result.type, 'invoice');
  assert.equal(invoice.result.converted_from_id, quote.result.id);
  assert.equal((await run('SELECT stock FROM inventory_items WHERE id=1')).rows[0].stock, 8);
  assert.equal((await run('SELECT * FROM sales')).rows.length, 1);
});

test('credit note must reference an invoice and reverses stock', async () => {
  const invoice = await invoke(salesDocuments.create, payload('invoice'));
  assert.equal((await run('SELECT stock FROM inventory_items WHERE id=1')).rows[0].stock, 8);
  await assert.rejects(invoke(salesDocuments.create, payload('credit_note')), /reference/);
  const credit = await invoke(salesDocuments.create, { ...payload('credit_note'), referenceInvoiceId: invoice.result.id });
  assert.equal(credit.result.type, 'credit_note');
  assert.equal((await run('SELECT stock FROM inventory_items WHERE id=1')).rows[0].stock, 10);
  await assert.rejects(invoke(salesDocuments.create, { ...payload('credit_note'), referenceInvoiceId: invoice.result.id }), /exceeds/);
});

test('profit uses cost at sale, discounts, tax exclusion and original cost on returns', async () => {
  const invoice = await invoke(salesDocuments.create, payload('invoice'));
  await run('UPDATE inventory_items SET cost=70 WHERE id=1');
  const first = (await invoke(reports.getProfit, {}, {}, { days: 7 })).result;
  assert.equal(first.summary.netRevenue, 180);
  assert.equal(first.summary.recordedCost, 80);
  assert.equal(first.summary.grossProfit, 100);
  const credit = await invoke(salesDocuments.create, { ...payload('credit_note'), referenceNo: 'RETURN-PROFIT', referenceInvoiceId: invoice.result.id, items: [{ itemId: 1, quantity: 1, unitPrice: 100, discountPercent: 10, taxPercent: 16 }] });
  assert.equal(Number(credit.result.items[0].unit_cost), 40);
  const afterReturn = (await invoke(reports.getProfit, {}, {}, { days: 7 })).result;
  assert.equal(afterReturn.summary.netRevenue, 90);
  assert.equal(afterReturn.summary.recordedCost, 40);
  assert.equal(afterReturn.summary.grossProfit, 50);
  assert.equal(afterReturn.items[0].units_sold, 1);
  await run('UPDATE sales SET business_id=2');
  await run('UPDATE sales_documents SET business_id=2');
  assert.equal((await invoke(reports.getProfit, {}, {}, { days: 7 })).result.items.length, 0);
});

test('legacy costs stay unknown and invalid report periods are rejected', async () => {
  const sale = await run("INSERT INTO sales (business_id,total,payment_method) VALUES (1,100,'cash')");
  await run("INSERT INTO sale_items (sale_id,item_id,item_name,quantity,unit_price) VALUES (?,1,'Legacy item',1,100)", [sale.insertId]);
  const report = (await invoke(reports.getProfit, {}, {}, { days: 7 })).result;
  assert.equal(report.summary.netRevenue, 100);
  assert.equal(report.summary.missingCostLines, 1);
  assert.equal(report.summary.grossProfit, null);
  assert.equal(report.items[0].gross_profit, null);
  assert.equal((await invoke(reports.getProfit, {}, {}, { days: -1 })).code, 400);
});


test('quotation to proforma to draft invoice retains details and issues once',async()=>{
 const quote=(await invoke(salesDocuments.create,{...payload(),notes:'Customer note',staffNotes:'Private note',terms:'Pay within 7 days',validUntil:'2026-10-16'})).result;
 const pro=(await invoke(salesDocuments.convert,{targetType:'proforma'},{id:quote.id})).result;
 assert.equal(pro.notes,'Customer note');assert.equal(pro.staff_notes,'Private note');assert.equal(pro.customer.name,'Walk-in');
 const draft=(await invoke(salesDocuments.convert,{targetType:'invoice',status:'draft'},{id:pro.id})).result;
 assert.equal(draft.status,'draft');assert.equal((await run('SELECT stock FROM inventory_items WHERE id=1')).rows[0].stock,10);assert.equal((await run('SELECT * FROM sales')).rows.length,0);
 await run("UPDATE customers SET name='Changed buyer' WHERE id=1");
 const issued=(await invoke(salesDocuments.issue,{payment:{amount:50,method:'cash'}},{id:draft.id})).result;
 assert.equal(issued.status,'partial');assert.equal(issued.customer.name,'Walk-in');assert.equal(Number(issued.balance_due),158.8);assert.equal(issued.payments.length,1);assert.ok(issued.activity.some(e=>e.action==='issued'));
 const repeat=(await invoke(salesDocuments.issue,{}, {id:draft.id})).result;assert.equal(repeat.replayed,true);assert.equal((await run('SELECT * FROM sales')).rows.length,1);assert.equal((await run('SELECT stock FROM inventory_items WHERE id=1')).rows[0].stock,8);
 const payment=(await invoke(salesDocuments.addPayment,{amount:158.8,requestId:'settlement'}, {id:draft.id})).result;assert.equal(payment.status,'paid');assert.equal(payment.payments.length,2);
 const again=(await invoke(salesDocuments.addPayment,{amount:158.8,requestId:'settlement'}, {id:draft.id})).result;assert.equal(again.replayed,true);assert.equal((await run('SELECT * FROM sales_document_payments')).rows.length,2);
 const lines=(await run('SELECT * FROM journal_entry_lines')).rows;assert.equal(lines.filter(l=>l.account_id===5).reduce((n,l)=>n+Number(l.credit),0),28.8);assert.equal(lines.filter(l=>l.account_id===2).reduce((n,l)=>n+Number(l.credit),0),180);
 await assert.rejects(invoke(salesDocuments.update,payload('invoice'),{id:draft.id}),/cannot be edited/);
 await assert.rejects(invoke(salesDocuments.convert,{targetType:'proforma'},{id:pro.id}),/cannot be converted/);
});
test('preliminary payments, overpayments and credit-limit violations roll back',async()=>{
 await assert.rejects(invoke(salesDocuments.create,{...payload(),payment:{amount:10}}),/after issuing/);
 await assert.rejects(invoke(salesDocuments.create,{...payload('invoice'),payment:{amount:999}}),/amount due/);
 await run('UPDATE customers SET credit_limit=0 WHERE id=1');
 await assert.rejects(invoke(salesDocuments.create,payload('invoice')),/credit limit/);assert.equal((await run('SELECT * FROM sales')).rows.length,0);
 const paid=(await invoke(salesDocuments.create,{...payload('invoice'),payment:{amount:208.8,method:'cash'}})).result;
 await assert.rejects(invoke(salesDocuments.addPayment,{amount:1},{id:paid.id}),/amount due/);
});
