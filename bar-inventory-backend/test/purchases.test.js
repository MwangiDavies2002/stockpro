require('dotenv').config();
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { calculateLine } = require('../src/utils/purchaseMath');
const database = require('../src/config/db');
let connection, controller, inventory, suppliers, referenceData;
const tables = ['chart_of_accounts', 'units', 'categories', 'brands', 'inventory_items', 'orders', 'order_items', 'suppliers', 'locations', 'inventory_stock_log', 'accounting_settings', 'journal_entries', 'journal_entry_lines'];
const run = async (sql, params = []) => {
  const [result] = await connection.query(sql.replace(/\$\d+/g, '?').replace(new RegExp('\\b(' + tables.join('|') + ')\\b', 'g'), 'test_purchase_$1'), params);
  return { rows: Array.isArray(result) ? result : [], insertId: result.insertId, rowCount: result.affectedRows };
};
before(async () => {
  connection = await database.db.getConnection();
  // All controller SQL is redirected to connection-local temporary tables; no real records are touched.
  for (const table of tables) await connection.query(`CREATE TEMPORARY TABLE test_purchase_${table} LIKE ${table}`);
  for (const column of ['category_id INT NULL', 'unit_id INT NULL', 'brand_id INT NULL']) {
    const name = column.split(' ')[0];
    const [existing] = await connection.query(`SHOW COLUMNS FROM test_purchase_inventory_items LIKE '${name}'`);
    if (!existing.length) await connection.query(`ALTER TABLE test_purchase_inventory_items ADD COLUMN ${column}`);
  }
  database.query = run;
  database.getClient = async () => ({ query: run, release() {} });
  controller = require('../src/controllers/orderController');
  inventory = require('../src/controllers/inventoryController');
  suppliers = require('../src/controllers/supplierController');
  referenceData = require('../src/controllers/referenceDataController');
});
after(async () => { if (connection) { await connection.rollback(); connection.release(); } await database.db.end(); });
beforeEach(async () => {
  for (const table of tables) await run(`DELETE FROM ${table}`);
  await run("INSERT INTO suppliers (id,business_id,name) VALUES (1,1,'Test supplier')");
  await run("INSERT INTO locations (id,business_id,name) VALUES (1,1,'Test location'),(2,1,'Other location')");
  await run("INSERT INTO inventory_items (id,business_id,name,category,unit,stock,cost,price,location_id,sku,barcode) VALUES (1,1,'Test lager','Beers','Bottles',10,50,90,1,'SKU-TEST','123456789'),(2,1,'Other item','Beers','Bottles',2,10,20,2,'OTHER','987654321')");
  await run(`INSERT INTO chart_of_accounts (id,account_code,account_name,account_type,normal_balance,active)
             VALUES (1,'1200','Inventory Asset','Assets','Debit',TRUE),
                    (2,'2000','Accounts Payable','Liabilities','Credit',TRUE),
                    (3,'5100','Purchase Expense','Expenses','Debit',TRUE)`);
  await run("INSERT INTO accounting_settings (setting_key,account_id) VALUES ('inventory_asset',1),('purchases_payable',2),('purchases_expense',3)");
});
const payload = (status = 'delivered') => ({ supplierId: 1, locationId: 1, purchaseDate: '2026-09-07', referenceNo: 'TEST-PURCHASE', status, items: [{ itemId: 1, quantity: 2, costBeforeDiscount: 100, discountPercent: 10, taxPercent: 16, profitMargin: 25, accountType: 'asset' }] });
async function invoke(fn, body, params = {}, query = {}) {
  let code = 200, result, failure;
  const response = { status(n) { code = n; return this; }, json(data) { result = data; return this; } };
  await fn({ body, params, query, user: { id: 1, business_id: 1 } }, response, err => { failure = err; });
  if (failure) throw failure;
  return { code, result };
}
test('discount, tax, margin and zero-cost selling price', () => {
  const line = calculateLine(payload().items[0]);
  assert.equal(line.unitPrice, 90); assert.equal(line.subtotal, 180); assert.equal(line.netCost, 208.8); assert.equal(line.sellingPrice, 130.5);
  assert.equal(calculateLine({ ...payload().items[0], sellingPrice: 156.6 }).margin, 50);
  assert.equal(calculateLine({ ...payload().items[0], costBeforeDiscount: 0, sellingPrice: 10 }).sellingPrice, 10);
  for (const override of [{ quantity: -1 }, { quantity: 1.5 }, { discountPercent: 101 }, { taxPercent: -1 }, { costBeforeDiscount: NaN }, { sellingPrice: -1 }]) assert.throws(() => calculateLine({ ...payload().items[0], ...override }));
});
test('received purchase persists calculations, updates stock/references and posts balanced journal', async () => {
  const { code, result } = await invoke(controller.create, payload());
  assert.equal(code, 201); assert.equal(Number(result.total), 208.8); assert.equal(result.items.length, 1);
  assert.equal(Number(result.items[0].net_cost), 208.8);
  const { rows: [item] } = await run('SELECT * FROM inventory_items WHERE id=1');
  assert.equal(item.stock, 12); assert.equal(Number(item.previous_unit_price), 100); assert.equal(Number(item.previous_discount), 10); assert.equal(Number(item.price), 130.5);
  const { rows: [journal] } = await run('SELECT SUM(debit) debit, SUM(credit) credit FROM journal_entry_lines');
  assert.equal(Number(journal.debit), 208.8); assert.equal(Number(journal.credit), 208.8);
});
test('pending purchase receives once through status transitions', async () => {
  const { result } = await invoke(controller.create, payload('pending'));
  assert.equal((await run('SELECT stock FROM inventory_items WHERE id=1')).rows[0].stock, 10);
  await invoke(controller.updateStatus, { status: 'approved' }, { id: result.id });
  await invoke(controller.updateStatus, { status: 'delivered' }, { id: result.id });
  const repeated = await invoke(controller.updateStatus, { status: 'delivered' }, { id: result.id });
  assert.equal(repeated.code, 400);
  assert.equal((await run('SELECT stock FROM inventory_items WHERE id=1')).rows[0].stock, 12);
});
test('missing purchase accounting settings are mapped before receipt', async () => {
  await run("DELETE FROM accounting_settings WHERE setting_key='purchases_payable'");
  await invoke(controller.create, payload());
  const payable = (await run("SELECT account_id FROM accounting_settings WHERE setting_key='purchases_payable'")).rows[0];
  assert.equal(payable.account_id, 2);
  const item = (await run('SELECT * FROM inventory_items WHERE id=1')).rows[0];
  assert.equal(item.stock, 12); assert.equal(Number(item.previous_unit_price), 100);
});
test('wrong location and missing product roll back the entire purchase', async () => {
  for (const itemId of [2, 999]) {
    const data = payload(); data.items.push({ ...data.items[0], itemId });
    await assert.rejects(invoke(controller.create, data), /location|exists/);
    assert.equal((await run('SELECT * FROM orders')).rows.length, 0);
    assert.equal((await run('SELECT stock FROM inventory_items WHERE id=1')).rows[0].stock, 10);
  }
});
test('expense classification posts to the expense account', async () => {
  const data = payload(); data.items[0].accountType = 'expense';
  await invoke(controller.create, data);
  const { rows } = await run('SELECT * FROM journal_entry_lines WHERE account_id=3');
  assert.equal(Number(rows[0].debit), 208.8);
});
test('product search matches name, SKU and barcode at selected location', async () => {
  for (const search of ['lager','SKU-TEST','123456789']) {
    const { result } = await invoke(inventory.getAll, {}, {}, { search, locationId: 1 });
    assert.equal(result.length, 1); assert.equal(result[0].id, 1);
  }
  assert.equal((await invoke(inventory.getAll, {}, {}, { search: 'OTHER', locationId: 1 })).result.length, 0);
});
test('inline supplier and zero-stock product creation persist identifiers', async () => {
  const supplier = await invoke(suppliers.create, { name: 'Inline supplier' });
  assert.equal(supplier.code, 201);
  const product = await invoke(inventory.create, { name: 'Inline product', category: 'Beers', unit: 'Unit', locationId: 1, sku: 'INLINE', barcode: '000123', stock: 0 });
  assert.equal(product.code, 201); assert.equal(product.result.stock, 0); assert.equal(product.result.barcode, '000123');
});

test('reference data is location scoped and can back product creation', async () => {
  const unit = await invoke(referenceData.create, { locationId: 1, name: 'Pieces', shortName: 'Pc', allowDecimal: false }, { type: 'units' });
  const box = await invoke(referenceData.create, { locationId: 1, name: 'Box', baseUnitId: unit.result.id, multiplier: 12 }, { type: 'units' });
  const parent = await invoke(referenceData.create, { locationId: 1, name: 'Hardware', code: 'HW' }, { type: 'categories' });
  const child = await invoke(referenceData.create, { locationId: 1, name: 'Fasteners', parentId: parent.result.id }, { type: 'categories' });
  const brand = await invoke(referenceData.create, { locationId: 1, name: 'Acme', description: 'Default supplier brand' }, { type: 'brands' });
  await invoke(referenceData.create, { locationId: 2, name: 'Pieces' }, { type: 'units' });

  assert.equal(box.result.base_unit_name, 'Pieces');
  assert.equal(child.result.parent_name, 'Hardware');
  assert.equal((await invoke(referenceData.getAll, {}, { type: 'units' }, { locationId: 1 })).result.length, 2);
  assert.equal((await invoke(referenceData.getAll, {}, { type: 'units' }, { locationId: 2 })).result.length, 1);

  const product = await invoke(inventory.create, { name: 'Bolt pack', locationId: 1, categoryId: child.result.id, unitId: unit.result.id, brandId: brand.result.id, stock: 0, threshold: 1, cost: 5, price: 10 });
  assert.equal(product.result.category, 'Fasteners');
  assert.equal(product.result.unit, 'Pieces');
  assert.equal(product.result.category_id, child.result.id);
  assert.equal(product.result.brand_id, brand.result.id);
});


