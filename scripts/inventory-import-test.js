const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ts = require('../bar-inventory-system/node_modules/typescript');
const XLSX = require('../bar-inventory-system/node_modules/xlsx');
const source = fs.readFileSync(path.join(__dirname, '../bar-inventory-system/app/lib/inventoryImport.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const helper = { exports: {} };
new Function('exports', compiled)(helper.exports);
const { mapInventoryImportRow, isInventoryTemplatePlaceholder } = helper.exports;
assert.equal(isInventoryTemplatePlaceholder({'Product Name':'', 'Barcode Type':'C128','Manage Stock?':1,'Alert quantity':5,'Product Type':'single','Opening Stock':0}),true);
assert.equal(isInventoryTemplatePlaceholder({'Product Name':'MPESA product','Opening Stock':0}),false);
assert.equal(isInventoryTemplatePlaceholder({'SKU':'ABC'}),false);
const expected = { name: 'Test', category: 'Parts', unit: 'Pieces', sku: 'ABC', stock: 10, threshold: 0, cost: 12.5, price: 20 };
assert.deepEqual(mapInventoryImportRow({ ' NAME ': 'Test', CATEGORY: 'Parts', UNIT: 'Pieces', 'SKU (Leave blank to auto generate sku)': 'ABC', 'OPENING STOCK': 10, 'ALERT QUANTITY': 0, 'PURCHASE PRICE (Including tax)': 12.5, 'SELLING PRICE': 20 }), expected);
assert.deepEqual(mapInventoryImportRow(expected), expected);
assert.equal(mapInventoryImportRow({'Product Name':'Part',Brand:'Maker',Barcode:'000123'}).brand,'Maker');
assert.equal(mapInventoryImportRow({'Product Name':'Part',Brand:'Maker',Barcode:'000123'}).barcode,'000123');
assert.equal(mapInventoryImportRow({ 'Product Name': 'Test', 'Purchase Price (Including Tax)': '', 'Purchase Price (Excluding Tax)': 15 }).cost, 15);

let items = [expected, { ...expected, name: 'No category', category: '', sku: 'NO-CATEGORY' }];
if (process.argv[2]) {
  const workbook = XLSX.readFile(process.argv[2]);
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
  items = rows.map(mapInventoryImportRow);
  assert.equal(items.length, 1590);
  assert.equal(items[0].name, 'ABSORBER REAR');
  assert.equal(items[0].stock, 10);
  assert.equal(items[0].cost, 505.6);
  assert.equal(items[0].price, 790);
  assert.equal(items[0].sku, 'SZ1181150');
  console.log(`Workbook: ${items.length} products; ${items.filter(item => !item.category).length} missing categories`);
}
const { openDatabase, apiRequest:dispatch } = require('../electron/db');
let token;
const apiRequest=(db,request)=>dispatch(db,{...request,authorization:token?`Bearer ${token}`:undefined});
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stockpro-import-test-'));
const db = openDatabase(dir);
try {
  apiRequest(db,{method:'post',url:'/auth/register',data:{name:'Import audit',email:'import@example.invalid',password:'AuditOnlyStrong123!'}});
  token=apiRequest(db,{method:'post',url:'/auth/login',data:{email:'import@example.invalid',password:'AuditOnlyStrong123!'}}).token;
  const result = apiRequest(db, { method: 'post', url: '/inventory/import', data: { items: [...items, { ...expected, name: '' }, { ...expected, stock: -1 }] } });
  assert.equal(result.createdCount, items.filter(item => item.name).length);
  assert.equal(result.errorCount, items.filter(item => !item.name).length + 2);
  const saved = db.prepare('SELECT * FROM inventory_items ORDER BY id LIMIT 1').get();
  for (const key of ['name', 'category', 'unit', 'sku', 'stock', 'threshold', 'cost', 'price']) assert.equal(saved[key], items[0][key]);
  assert.equal(result.errors.at(-1).row, items.length + 3);
  const first = db.prepare('SELECT id,cost FROM inventory_items ORDER BY id LIMIT 1').get();
  apiRequest(db, { method: 'post', url: '/sales', data: { items: [{ itemId: first.id, quantity: 1, unitPrice: 20 }] } });
  db.prepare('UPDATE inventory_items SET cost=999 WHERE id=?').run(first.id);
  const profit = apiRequest(db, { method: 'get', url: '/reports/profit', params: { days: 7 } });
  assert.equal(profit.summary.recordedCost, first.cost);
  assert.equal(profit.summary.grossProfit, Number((20-first.cost).toFixed(2)));
  console.log('Inventory import regression tests passed (temporary database)');
} finally {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
