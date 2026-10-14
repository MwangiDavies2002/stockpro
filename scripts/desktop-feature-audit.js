const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { openDatabase, apiRequest } = require('../electron/db');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stockpro-feature-audit-'));
const db = openDatabase(dir);
const results = [];
let token;
const run = (method, url, data, params) => apiRequest(db, { method, url, data, params,authorization: token ? `Bearer ${token}` : undefined });
const check = (name, fn) => {
  try { fn(); results.push({ name, status: 'pass' }); }
  catch (error) { results.push({ name, status: 'fail', error: error.message }); }
};
try {
  let product, user;
  check('Register → login → current user has no password', () => {
    user = run('post', '/auth/register', { name: 'Audit staff', email: 'audit@example.invalid', password: 'AuditOnlyStrong123!', role: 'admin' }).user;
    const login = run('post', '/auth/login', { email: user.email, password: 'AuditOnlyStrong123!' });
    token=login.token;
    assert.ok(login.token); assert.equal(login.user.password, undefined);
    assert.ok(!run('get', '/auth/me').password, 'Current-user response exposes the stored password hash');
  });
  check('Import with blank category preserves SKU', () => {
    const imported = run('post', '/inventory/import', { items: [{ name: 'Audit part', category: '', unit: 'Pieces', stock: 10, threshold: 0, cost: 2, price: 5, sku: 'AUDIT' }] });
    assert.equal(imported.createdCount, 1); product = run('get', '/inventory')[0];
    assert.equal(product.category, ''); assert.equal(product.sku, 'AUDIT');
  });
  check('Shift → cash sale → stock → balanced journal → close', () => {
    const shift = run('post', '/shifts', { openingFloat: 100 });
    run('post', '/sales', { paymentMethod: 'cash', items: [{ itemId: product.id, quantity: 2, unitPrice: 5 }] });
    assert.equal(run('get', '/inventory')[0].stock, 8);
    const sums = db.prepare('SELECT SUM(debit) debit,SUM(credit) credit FROM journal_entry_lines').get();
    assert.equal(sums.debit, sums.credit);
    assert.equal(run('patch', `/shifts/${shift.id}/close`, { actualCash: 110 }).variance, 0);
  });
  check('Purchase → receive → stock and cost', () => {
    const supplier = run('post', '/suppliers', { name: 'Audit supplier' });
    const order = run('post', '/orders', { supplierId: supplier.id, items: [{ itemId: product.id, quantity: 2, unitPrice: 3 }], status: 'pending' });
    run('patch', `/orders/${order.id}/status`, { status: 'delivered' });
    assert.equal(run('get', '/inventory')[0].stock, 10);
  });
  check('Search and location filters applied', () => {
    assert.equal(run('get', '/inventory', undefined, { search: 'no matching product', locationId: 99999 }).length, 0);
  });
  check('Negative sale quantity rejected', () => {
    assert.throws(() => run('post', '/sales', { items: [{ itemId: product.id, quantity: -1, unitPrice: 5 }] }));
  });
  check('Credit sale requires customer and updates balance', () => {
    assert.throws(() => run('post', '/sales', { paymentMethod: 'credit', items: [{ itemId: product.id, quantity: 1, unitPrice: 5 }] }));
  });
  check('Current user requires authentication', () => {
    assert.throws(()=>apiRequest(db,{method:'get',url:'/auth/me'}),error=>error.status===401);
  });
  check('Stock movement writes history', () => {
    const before = db.prepare('SELECT COUNT(*) n FROM inventory_stock_log').get().n;
    run('patch', `/inventory/${product.id}/restock`, { quantity: 2 });
    assert.equal(db.prepare('SELECT COUNT(*) n FROM inventory_stock_log').get().n, before + 1);
  });
  check('Manual journal balance validated', () => {
    assert.throws(() => run('post', '/journal-entries', { description: 'Unbalanced', lines: [{ account_id: 1, debit: 100, credit: 0 }] }));
  });
  check('Desktop quotation, invoice, payment, credit note and historical cost flow',()=>{
    const item=run('post','/inventory',{name:'Document parity item',unit:'Pieces',locationId:1,stock:5,cost:4,price:10});
    const customer=run('post','/customers',{name:'Document audit customer',creditLimit:100});
    const quote=run('post','/sales-documents',{type:'quotation',locationId:1,customerId:customer.id,items:[{itemId:item.id,quantity:2,unitPrice:10}]});
    assert.equal(run('get',`/inventory/${item.id}`).stock,5);
    const invoice=run('post',`/sales-documents/${quote.id}/convert`,{targetType:'invoice',payment:{amount:5,method:'cash'}});
    assert.equal(run('post',`/sales-documents/${quote.id}/convert`,{targetType:'invoice'}).id,invoice.id);
    assert.equal(invoice.balance_due,15);assert.equal(run('get',`/customers/${customer.id}`).balance,15);assert.equal(run('get',`/inventory/${item.id}`).stock,3);
    assert.throws(()=>run('post',`/sales-documents/${invoice.id}/payments`,{amount:16}));
    run('post',`/sales-documents/${invoice.id}/payments`,{amount:15});
    assert.equal(run('get',`/customers/${customer.id}`).balance,0);
    db.prepare('UPDATE inventory_items SET cost=999 WHERE id=?').run(item.id);
    run('post','/sales-documents',{type:'credit_note',locationId:1,referenceInvoiceId:invoice.id,items:[{itemId:item.id,quantity:1,unitPrice:10}]});
    assert.equal(run('get',`/inventory/${item.id}`).stock,4);
    const credit=db.prepare("SELECT i.unit_cost FROM sales_document_items i JOIN sales_documents d ON d.id=i.document_id WHERE d.type='credit_note' AND i.item_id=?").get(item.id);assert.equal(credit.unit_cost,4);
    assert.throws(()=>run('post','/sales-documents',{type:'credit_note',locationId:1,referenceInvoiceId:invoice.id,items:[{itemId:item.id,quantity:2,unitPrice:10}]}));
  });
  check('Desktop automatic discount target and request replay',()=>{
    const item=run('post','/inventory',{name:'Discount parity item',unit:'Pieces',locationId:1,stock:5,cost:4,price:10});
    run('post','/discounts',{locationId:1,name:'Product ten percent',appliesTo:'product',productId:item.id,discountType:'percent',value:10});
    const body={type:'pos',requestId:'desktop-discount-retry',locationId:1,payment:{amount:9,method:'cash'},items:[{itemId:item.id,quantity:1,unitPrice:10}]};
    const doc=run('post','/sales-documents',body);assert.equal(doc.total,9);
    const again=run('post','/sales-documents',body);assert.equal(again.id,doc.id);assert.equal(run('get',`/inventory/${item.id}`).stock,4);
  });
  check('Disabled desktop user session is revoked',()=>{
    db.prepare('UPDATE users SET active=0 WHERE id=?').run(user.id);
    assert.throws(()=>run('get','/auth/me'),error=>error.status===401);
    db.prepare('UPDATE users SET active=1 WHERE id=?').run(user.id);
  });
  const endpoints = [
    ['get',`/inventory/${product.id}`], ['get',`/inventory/${product.id}/history`],
    ['get','/reference-data/units'], ['get','/reference-data/categories'], ['get','/reference-data/brands'],
    ['get','/reports/usage'], ['get','/reports/sales-trend'], ['get','/reports/hourly-sales'], ['get','/reports/benchmarks'],
    ['get','/reports/product-pairs'], ['get','/reports/loss-alerts'], ['get','/reports/staff-performance'], ['get','/reports/owner-intelligence'],
    ['get','/mpesa/payments'], ['get','/mpesa/groups'], ['get','/owner-network'],
    ['get','/subscriptions'], ['get','/subscriptions/current'], ['get','/loyalty/customers'], ['get','/loyalty/redemptions'],
    ['get','/sales-documents'], ['get','/discounts'], ['get','/etims/config'], ['get','/accounting-settings'],
    ['get','/accounts/1/book'], ['get','/treasury/1/transactions'], ['get','/customers/1/statement'],
    ['put','/locations/1',{ name: 'Updated' }], ['put','/suppliers/1',{ name: 'Updated' }],
    ['get','/sales/1'], ['get','/orders/1'],
  ];
  for (const [method, url, data] of endpoints) check(`Desktop endpoint ${method.toUpperCase()} ${url}`, () => {try{run(method,url,data);}catch(error){if(error.status!==404||/Endpoint not found/.test(error.message))throw error;}});
} finally {
  db.close();
  const resolved = path.resolve(dir);
  assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('stockpro-feature-audit-'));
  fs.rmSync(resolved, { recursive: true, force: true });
}
fs.writeFileSync(path.join(__dirname, '../desktop-audit-results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ passed: results.filter(row => row.status === 'pass').length, failed: results.filter(row => row.status === 'fail').length, checks: results }, null, 2));
