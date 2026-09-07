require('dotenv').config();
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const database = require('../src/config/db');

let connection, salesDocuments;
const tables = ['sales_documents', 'sales_document_items', 'sales_document_payments', 'discounts', 'sales', 'sale_items', 'customers', 'inventory_items', 'locations', 'inventory_stock_log', 'accounting_settings', 'journal_entries', 'journal_entry_lines'];
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
});

after(async () => { if (connection) { await connection.rollback(); connection.release(); } await database.db.end(); });

beforeEach(async () => {
  for (const table of tables) await run(`DELETE FROM ${table}`);
  await run("INSERT INTO locations (id,name) VALUES (1,'Main')");
  await run("INSERT INTO customers (id,name,credit_limit,balance,active) VALUES (1,'Walk-in',100000,0,TRUE)");
  await run("INSERT INTO inventory_items (id,name,category,unit,stock,cost,price,location_id,sku,barcode) VALUES (1,'Test product','General','Unit',10,40,100,1,'SKU1','BAR1')");
  await run("INSERT INTO accounting_settings (setting_key,account_id) VALUES ('sales_receivable',1),('sales_revenue',2),('inventory_cogs',3),('inventory_asset',4),('payment_cash',1)");
});

async function invoke(fn, body, params = {}, query = {}) {
  let code = 200, result, failure;
  const response = { status(n) { code = n; return this; }, json(data) { result = data; return this; } };
  await fn({ body, params, query, user: { id: 1 } }, response, err => { failure = err; });
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
