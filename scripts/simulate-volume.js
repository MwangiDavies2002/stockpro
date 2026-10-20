const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { performance } = require('node:perf_hooks');
const { openDatabase } = require('../electron/db');

const LOCATION_COUNT = 100;
const DOCUMENTS_PER_TYPE = 50_000;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stockpro-volume-simulation-'));
const db = openDatabase(root);

try {
  db.pragma('synchronous = NORMAL');
  db.prepare('UPDATE businesses SET name=? WHERE id=1').run('Volume Simulation Business');
  db.prepare('UPDATE locations SET name=?,address=? WHERE id=1 AND business_id=1').run('Simulation Location 001', 'Synthetic test data');

  const insertLocation = db.prepare('INSERT INTO locations (business_id,name,address,active) VALUES (1,?,?,1)');
  const locations = [1];
  for (let i = 2; i <= LOCATION_COUNT; i++) {
    locations.push(Number(insertLocation.run(`Simulation Location ${String(i).padStart(3, '0')}`, 'Synthetic test data').lastInsertRowid));
  }

  db.prepare('INSERT OR IGNORE INTO users (id,name,email,password,role,active,business_id) VALUES (1,?,?,?,?,1,1)')
    .run('Simulation User', 'simulation@example.invalid', 'not-a-real-login', 'admin');
  const insertSupplier = db.prepare('INSERT INTO suppliers (business_id,name,email,phone,address) VALUES (1,?,?,?,?)');
  const insertCustomer = db.prepare('INSERT INTO customers (business_id,name,phone,credit_limit,balance,active) VALUES (1,?,?,1000000000,0,1)');
  const insertItem = db.prepare('INSERT INTO inventory_items (business_id,location_id,name,category,unit,stock,threshold,cost,price,supplier_id,not_for_selling) VALUES (1,?,? ,\'Simulation\',\'unit\',1000,10,100,160,?,0)');
  const parties = new Map();
  for (let i = 0; i < LOCATION_COUNT; i++) {
    const locationId = locations[i];
    const supplierId = Number(insertSupplier.run(`Simulation Supplier ${String(i + 1).padStart(3, '0')}`, null, null, 'Synthetic test data').lastInsertRowid);
    const customerId = Number(insertCustomer.run(`Simulation Customer ${String(i + 1).padStart(3, '0')}`, null).lastInsertRowid);
    const itemId = Number(insertItem.run(locationId, `Simulation Product ${String(i + 1).padStart(3, '0')}`, supplierId).lastInsertRowid);
    parties.set(locationId, { supplierId, customerId, itemId });
  }

  const insertPurchase = db.prepare(`INSERT INTO orders
    (business_id,supplier_id,location_id,status,transaction_type,total,notes,created_by,paid_amount,due_date,tax_treatment,shipping_cost,other_cost,supplier_snapshot,reference_no,purchase_date)
    VALUES (1,?,?, 'delivered','purchase',100,'Synthetic load record',1,0,NULL,'included',0,0,?,?,?)`);
  const insertPurchaseLine = db.prepare(`INSERT INTO order_items
    (order_id,item_id,item_name,quantity,unit_price,account_type,cost_before_discount,discount_percent,tax_percent,subtotal,net_cost)
    VALUES (?,?,?,1,100,'asset',100,0,0,100,100)`);

  const insertSale = db.prepare(`INSERT INTO sales
    (business_id,total,created_by,notes,payment_method,location_id,customer_id)
    VALUES (1,160,1,'Synthetic invoice sale','cash',?,?)`);
  const insertInvoice = db.prepare(`INSERT INTO sales_documents
    (business_id,type,status,customer_id,reference_no,document_date,location_id,sale_id,subtotal,discount_total,tax_total,total,paid_amount,balance_due,notes,created_by,customer_snapshot,seller_snapshot)
    VALUES (1,'invoice','paid',?,?,?, ?,?,160,0,0,160,160,0,'Synthetic load record',1,?,?)`);
  const insertInvoiceLine = db.prepare(`INSERT INTO sales_document_items
    (document_id,item_id,item_name,quantity,unit_price,unit_cost,discount_percent,discount_amount,tax_percent,tax_amount,subtotal,line_total,sku,unit)
    VALUES (?,?,?,1,160,100,0,0,0,0,160,160,?,'unit')`);
  const insertSaleLine = db.prepare(`INSERT INTO sale_items
    (sale_id,item_id,item_name,quantity,unit_price,unit_cost,net_revenue)
    VALUES (?,?,?,1,160,100,160)`);
  const insertStockLog = db.prepare(`INSERT INTO inventory_stock_log
    (item_id,user_id,change_type,qty_change,before_stock,after_stock,note)
    VALUES (?,1,?,?,?,?,?)`);

  const start = performance.now();
  const runLoad = db.transaction(() => {
    const business = db.prepare('SELECT name,currency,contact_number,city,state,country,timezone FROM businesses WHERE id=1').get();
    for (let n = 0; n < DOCUMENTS_PER_TYPE; n++) {
      const locationId = locations[n % LOCATION_COUNT];
      const { supplierId, customerId, itemId } = parties.get(locationId);
      const seq = n + 1;
      const date = new Date(Date.UTC(2025, 0, 1 + (n % 365))).toISOString().slice(0, 10);
      const beforeStock = 1000 + Math.floor(n / LOCATION_COUNT);

      const purchaseId = Number(insertPurchase.run(supplierId, locationId,
        JSON.stringify({ name: `Simulation Supplier ${String((n % LOCATION_COUNT) + 1).padStart(3, '0')}` }),
        `SIM-P-${String(seq).padStart(6, '0')}`, date).lastInsertRowid);
      const itemName = `Simulation Product ${String((n % LOCATION_COUNT) + 1).padStart(3, '0')}`;
      insertPurchaseLine.run(purchaseId, itemId, itemName);
      insertStockLog.run(itemId, 'restock', 1, beforeStock, beforeStock + 1, `Simulation purchase #${purchaseId}`);

      const saleId = Number(insertSale.run(locationId, customerId).lastInsertRowid);
      insertSaleLine.run(saleId, itemId, itemName);
      const invoiceId = Number(insertInvoice.run(customerId, `SIM-I-${String(seq).padStart(6, '0')}`, date,
        locationId, saleId, JSON.stringify({ name: `Simulation Customer ${String((n % LOCATION_COUNT) + 1).padStart(3, '0')}`, phone: '', address: '' }),
        JSON.stringify({ name: business.name, currency: business.currency, phone: business.contact_number || '', address: [business.city, business.state, business.country].filter(Boolean).join(', '), timezone: business.timezone })).lastInsertRowid);
      insertInvoiceLine.run(invoiceId, itemId, itemName, `SIM-${String(locationId).padStart(3, '0')}-${String(seq).padStart(6, '0')}`);
      insertStockLog.run(itemId, 'sale', -1, beforeStock + 1, beforeStock, `Simulation invoice #${invoiceId}`);
    }
  });
  runLoad();
  const generationMs = Math.round(performance.now() - start);

  const queryStart = performance.now();
  const distribution = db.prepare(`SELECT l.id location_id,l.name,COALESCE(p.count,0) purchases,COALESCE(i.count,0) invoices
    FROM locations l
    LEFT JOIN (SELECT location_id,COUNT(*) count FROM orders WHERE business_id=1 AND transaction_type='purchase' GROUP BY location_id) p ON p.location_id=l.id
    LEFT JOIN (SELECT location_id,COUNT(*) count FROM sales_documents WHERE business_id=1 AND type='invoice' GROUP BY location_id) i ON i.location_id=l.id
    WHERE l.business_id=1 ORDER BY l.id`).all();
  const distributionQueryMs = Math.round(performance.now() - queryStart);
  const pageQueryStart = performance.now();
  const sampleLocation = locations[0];
  const purchasePage = db.prepare('SELECT id,total,status,purchase_date FROM orders WHERE business_id=1 AND location_id=? AND transaction_type=\'purchase\' ORDER BY id DESC LIMIT 50').all(sampleLocation);
  const invoicePage = db.prepare('SELECT id,total,status,document_date FROM sales_documents WHERE business_id=1 AND location_id=? AND type=\'invoice\' ORDER BY id DESC LIMIT 50').all(sampleLocation);
  const pageQueryMs = Math.round(performance.now() - pageQueryStart);
  const totals = db.prepare(`SELECT
      (SELECT COUNT(*) FROM orders WHERE business_id=1 AND transaction_type='purchase') purchases,
      (SELECT COUNT(*) FROM sales_documents WHERE business_id=1 AND type='invoice') invoices,
      (SELECT COUNT(*) FROM order_items) purchase_lines,
      (SELECT COUNT(*) FROM sales_document_items) invoice_lines`).get();

  console.log(JSON.stringify({
    database: path.join(root, 'data', 'stockpro.sqlite'),
    locations: distribution.length,
    documentsPerType: DOCUMENTS_PER_TYPE,
    totals,
    perLocation: { minimumPurchases: Math.min(...distribution.map(row => row.purchases)), maximumPurchases: Math.max(...distribution.map(row => row.purchases)), minimumInvoices: Math.min(...distribution.map(row => row.invoices)), maximumInvoices: Math.max(...distribution.map(row => row.invoices)) },
    generationMs,
    distributionQueryMs,
    sampleLocationPageRows: { purchases: purchasePage.length, invoices: invoicePage.length },
    pageQueryMs
  }, null, 2));
} finally {
  db.close();
}
