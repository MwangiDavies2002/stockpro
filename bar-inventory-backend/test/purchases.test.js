require('dotenv').config();
const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { calculateLine } = require('../src/utils/purchaseMath');
const database = require('../src/config/db');
const {runForBusiness}=require('../src/utils/tenant');
let connection, controller, inventory, suppliers, referenceData;
const tables = ['sale_items','sales_document_items','purchase_events','purchase_payments','operation_requests','businesses','users','treasury','treasury_transactions','chart_of_accounts', 'units', 'categories', 'brands', 'inventory_items', 'orders', 'order_items', 'suppliers', 'locations', 'inventory_stock_log', 'accounting_settings', 'journal_entries', 'journal_entry_lines'];
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
  await run("INSERT INTO businesses(id,name,currency,country,state,city,zip_code,landmark,timezone) VALUES (1,'Purchase test','KES','Kenya','Nairobi','Nairobi','00100','Test','Africa/Nairobi')");
  await run("INSERT INTO users(id,business_id,name,email,password,role,active) VALUES (1,1,'Test buyer','buyer@test.invalid','unused','admin',TRUE)");
  await run("INSERT INTO suppliers (id,business_id,name) VALUES (1,1,'Test supplier')");
  await run("INSERT INTO locations (id,business_id,name) VALUES (1,1,'Test location'),(2,1,'Other location')");
  await run("INSERT INTO inventory_items (id,business_id,name,category,unit,stock,cost,price,location_id,sku,barcode) VALUES (1,1,'Test lager','Beers','Bottles',10,50,90,1,'SKU-TEST','123456789'),(2,1,'Other item','Beers','Bottles',2,10,20,2,'OTHER','987654321')");
  await run(`INSERT INTO chart_of_accounts (id,business_id,account_code,account_name,account_type,normal_balance,active)
             VALUES (1,1,'1200','Inventory Asset','Assets','Debit',TRUE),
                    (2,1,'2000','Accounts Payable','Liabilities','Credit',TRUE),
                    (3,1,'5100','Purchase Expense','Expenses','Debit',TRUE)`);
  await run("INSERT INTO accounting_settings (setting_key,account_id) VALUES ('inventory_asset',1),('purchases_payable',2),('purchases_expense',3)");
});
const payload = (status = 'delivered') => ({ supplierId: 1, locationId: 1, purchaseDate: '2026-09-07', referenceNo: 'TEST-PURCHASE', status, items: [{ itemId: 1, quantity: 2, costBeforeDiscount: 100, discountPercent: 10, taxPercent: 16, profitMargin: 25, accountType: 'asset' }] });
async function invoke(fn, body, params = {}, query = {}) {
  let code = 200, result, failure;
  const response = { status(n) { code = n; return this; }, json(data) { result = data; return this; } };
  await runForBusiness(1,()=>fn({ body, params, query, user: { id: 1, business_id: 1 } }, response, err => { failure = err; }));
  if (failure) throw failure;
  return { code, result };
}
test('stock history derives signed changes from balances and isolates businesses', async () => {
  await run("INSERT INTO inventory_stock_log (item_id,change_type,qty_change,before_stock,after_stock,note) VALUES (1,'sale',3,10,7,'Legacy positive sale'),(1,'adjustment',2,7,9,'Count correction')");
  const { result } = await invoke(inventory.getHistory, {}, { id: 1 });
  assert.equal(result.length, 2);
  assert.equal(Number(result.find(row => row.change_type === 'sale').qty_change), -3);
  assert.equal(Number(result.find(row => row.change_type === 'adjustment').qty_change), 2);
  assert.equal(result[0].note, 'Count correction');
  await run('UPDATE inventory_items SET business_id=2 WHERE id=1');
  assert.deepEqual((await invoke(inventory.getHistory, {}, { id: 1 })).result, []);
});

test('discount, tax, margin and zero-cost selling price', () => {
  const line = calculateLine(payload().items[0]);
  assert.equal(line.unitPrice, 90); assert.equal(line.subtotal, 180); assert.equal(line.netCost, 208.8); assert.equal(line.sellingPrice, 130.5);
  assert.equal(calculateLine({ ...payload().items[0], sellingPrice: 156.6 }).margin, 50);
  assert.equal(calculateLine({ ...payload().items[0], costBeforeDiscount: 0, sellingPrice: 10 }).sellingPrice, 10);
  for (const override of [{ quantity: -1 }, { quantity: 1.5 }, { discountPercent: 101 }, { taxPercent: -1 }, { costBeforeDiscount: NaN }, { sellingPrice: -1 }]) assert.throws(() => calculateLine({ ...payload().items[0], ...override }));
});
test('products can be created, edited and imported with blank categories', async () => {
  const { result: item, code } = await invoke(inventory.create, { name: 'Uncategorized part', category: '', unit: 'Pieces', stock: 0, price: 10, locationId: 1 });
  assert.equal(code, 201);
  assert.equal(item.category, '');
  assert.equal(item.category_id, null);
  const { result: edited } = await invoke(inventory.update, { name: item.name, category: '', unit: item.unit, stock: 0, threshold: 5, cost: 0, price: 12, locationId: 1 }, { id: item.id });
  assert.equal(edited.category, '');
  const imported = await invoke(inventory.bulkImport, { items: [{ name: 'Imported part', category: '', unit: 'Pieces', stock: 10, threshold: 0, cost: 2, price: 3, sku: 'BLANK-CATEGORY' }] });
  assert.equal(imported.code, 201);
  assert.equal(imported.result.createdCount, 1);
  const { rows: [saved] } = await run("SELECT * FROM inventory_items WHERE sku='BLANK-CATEGORY'");
  assert.equal(saved.category, '');
  assert.equal(saved.threshold, 0);
  const invalid = await invoke(inventory.bulkImport, { items: [{ name: '', category: '' }] });
  assert.equal(invalid.code, 400);
  assert.equal(invalid.result.errors[0].message, 'name is required');
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
  assert.equal(repeated.code, 200);assert.equal(repeated.result.replayed,true);
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



test('expense items do not change stock and capitalized tax reconciles to inventory cost',async()=>{
 const data=payload();data.items[0].accountType='expense';await invoke(controller.create,data);assert.equal((await run('SELECT stock FROM inventory_items WHERE id=1')).rows[0].stock,10);
});
test('recoverable input tax and shipping are posted separately and stock cost reconciles',async()=>{
 const data={...payload(),taxTreatment:'recoverable',shippingCost:20,otherCost:5};const result=(await invoke(controller.create,data)).result;assert.equal(Number(result.total),233.8);const item=(await run('SELECT stock,cost FROM inventory_items WHERE id=1')).rows[0];assert.equal(item.stock,12);assert.ok(Math.abs(Number(item.cost)-700/12)<0.005);
 const journal=(await run('SELECT SUM(debit) debit,SUM(credit) credit FROM journal_entry_lines')).rows[0];assert.equal(Number(journal.debit),233.8);assert.equal(Number(journal.credit),233.8);
 const inventory=(await run('SELECT SUM(debit) amount FROM journal_entry_lines WHERE account_id=1')).rows[0];assert.equal(Number(inventory.amount),200);
});

test('small shipping amounts allocate exactly without negative stock costs',()=>{const p=require('../src/utils/purchasePolicy'),lines=p.lines([1,2,3,4].map(itemId=>({itemId,quantity:1,costBeforeDiscount:0})));const post=p.posting({shipping_cost:0.02},lines);assert.equal(post.asset,0.02);assert.equal(post.total,0.02);assert.ok(Object.values(post.costs).every(n=>n>=0));assert.equal(Object.values(post.costs).reduce((n,v)=>n+v,0),0.02);});
