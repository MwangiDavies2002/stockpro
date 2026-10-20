// Adds the generated 50k purchase + 50k invoice demo workload to a selected web business.
// The fixed batch marker and reference prefix make repeat runs fail safely.
const { getClient, db } = require('../bar-inventory-backend/src/config/db');

const BUSINESS_ID = 21;
const OWNER_ID = 37;
const LOCATION_COUNT = 100;
const DOCUMENT_COUNT = 50_000;
const PREFIX = 'SIM20261020';
const BATCH_KEY = `${PREFIX}-volume-100x500`;
const BATCH = 'simulation-import';
const CHUNK = 500;

function dateAt(index) {
  const dayOffset = 119 - (index % 120);
  return new Date(Date.now() - dayOffset * 86400000).toISOString().slice(0, 10);
}

async function insertRows(client, table, columns, rows, chunk = CHUNK) {
  if (!rows.length) return;
  const marks = `(${columns.map(() => '?').join(',')})`;
  for (let start = 0; start < rows.length; start += chunk) {
    const part = rows.slice(start, start + chunk);
    const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES ${part.map(() => marks).join(',')}`;
    await client.query(sql, part.flat());
  }
}

async function loadMap(client, sql, params, key) {
  const result = await client.query(sql, params);
  return new Map(result.rows.map(row => [key(row), Number(row.id)]));
}

async function main() {
  const client = await getClient();
  try {
    const [batch, business, owner, settings] = await Promise.all([
      client.query('SELECT request_key FROM operation_requests WHERE business_id=? AND operation=? AND request_key=?', [BUSINESS_ID, BATCH, BATCH_KEY]),
      client.query('SELECT id,name,currency,contact_number,city,state,country,timezone FROM businesses WHERE id=?', [BUSINESS_ID]),
      client.query('SELECT id FROM users WHERE id=? AND business_id=?', [OWNER_ID, BUSINESS_ID]),
      client.query('SELECT setting_key,account_id FROM accounting_settings WHERE business_id=?', [BUSINESS_ID]),
    ]);
    if (batch.rows.length) throw new Error(`Batch ${BATCH_KEY} was already imported.`);
    if (!business.rows.length || business.rows[0].name !== 'Samantha spare parts') throw new Error('Target business check failed; refusing to import.');
    if (!owner.rows.length) throw new Error('Target owner check failed; refusing to import.');
    const accounts = new Map(settings.rows.map(row => [row.setting_key, Number(row.account_id)]));
    for (const key of ['inventory_asset', 'purchases_payable', 'payment_cash', 'sales_revenue', 'inventory_cogs']) {
      if (!accounts.get(key)) throw new Error(`Missing accounting mapping: ${key}`);
    }

    const [existingPurchases, existingInvoices] = await Promise.all([
      client.query('SELECT COUNT(*) AS n FROM orders WHERE business_id=? AND reference_no LIKE ?', [BUSINESS_ID, `${PREFIX}-P-%`]),
      client.query('SELECT COUNT(*) AS n FROM sales_documents WHERE business_id=? AND reference_no LIKE ?', [BUSINESS_ID, `${PREFIX}-I-%`]),
    ]);
    if (Number(existingPurchases.rows[0].n) || Number(existingInvoices.rows[0].n)) {
      throw new Error('Simulation references already exist without the completion marker; refusing a duplicate import.');
    }

    await client.query('BEGIN');
    try {
      const locations = Array.from({ length: LOCATION_COUNT }, (_, i) => [BUSINESS_ID, `SIMULATION - Location ${String(i + 1).padStart(3, '0')}`, 'SIMULATED TEST DATA', 1]);
      await insertRows(client, 'locations', ['business_id', 'name', 'address', 'active'], locations);
      const locationMap = await loadMap(client,
        'SELECT id,name FROM locations WHERE business_id=? AND name LIKE ?', [BUSINESS_ID, 'SIMULATION - Location %'], row => row.name);
      if (locationMap.size !== LOCATION_COUNT) throw new Error('Could not resolve all inserted simulation locations.');

      await insertRows(client, 'user_locations', ['business_id', 'user_id', 'location_id'],
        [...locationMap.values()].map(id => [BUSINESS_ID, OWNER_ID, id]));

      await insertRows(client, 'suppliers', ['business_id', 'name', 'address'],
        Array.from({ length: LOCATION_COUNT }, (_, i) => [BUSINESS_ID, `SIMULATION - Supplier ${String(i + 1).padStart(3, '0')}`, 'SIMULATED TEST DATA']));
      await insertRows(client, 'customers', ['business_id', 'name', 'active'],
        Array.from({ length: LOCATION_COUNT }, (_, i) => [BUSINESS_ID, `SIMULATION - Customer ${String(i + 1).padStart(3, '0')}`, 1]));
      const supplierMap = await loadMap(client, 'SELECT id,name FROM suppliers WHERE business_id=? AND name LIKE ?', [BUSINESS_ID, 'SIMULATION - Supplier %'], row => row.name);
      const customerMap = await loadMap(client, 'SELECT id,name FROM customers WHERE business_id=? AND name LIKE ?', [BUSINESS_ID, 'SIMULATION - Customer %'], row => row.name);
      if (supplierMap.size !== LOCATION_COUNT || customerMap.size !== LOCATION_COUNT) throw new Error('Could not resolve simulation partners.');

      const productRows = [];
      for (let i = 0; i < LOCATION_COUNT; i++) {
        const n = String(i + 1).padStart(3, '0');
        productRows.push([BUSINESS_ID, `SIMULATION - Spare Part ${n}`, 'Simulation Test Data', 'unit', 0, 1, 160, 100, DOCUMENT_COUNT / LOCATION_COUNT, supplierMap.get(`SIMULATION - Supplier ${n}`), [...locationMap.values()][i], `${PREFIX}-SKU-${n}`]);
      }
      await insertRows(client, 'inventory_items', ['business_id', 'name', 'category', 'unit', 'stock', 'threshold', 'price', 'cost', 'sold', 'supplier_id', 'location_id', 'sku'], productRows);
      const itemMap = await loadMap(client, 'SELECT id,name FROM inventory_items WHERE business_id=? AND sku LIKE ?', [BUSINESS_ID, `${PREFIX}-SKU-%`], row => row.name);

      const purchaseHeaders = [], salesHeaders = [], invoiceHeaders = [];
      for (let i = 0; i < DOCUMENT_COUNT; i++) {
        const locationNumber = (i % LOCATION_COUNT) + 1;
        const n = String(locationNumber).padStart(3, '0');
        const seq = String(i + 1).padStart(6, '0');
        const day = dateAt(i);
        const purchaseRef = `${PREFIX}-P-${seq}`;
        const invoiceRef = `${PREFIX}-I-${seq}`;
        const customerName = `SIMULATION - Customer ${n}`;
        const supplierName = `SIMULATION - Supplier ${n}`;
        purchaseHeaders.push([BUSINESS_ID, supplierMap.get(supplierName), 'delivered', 'SIMULATED TEST DATA', 100, OWNER_ID, purchaseRef, day,
          [...locationMap.values()][locationNumber - 1], 'purchase', 0, day, 'included', 0, 0,
          JSON.stringify({ name: supplierName, phone: '', email: '', address: 'SIMULATED TEST DATA' }), accounts.get('purchases_payable')]);
        salesHeaders.push([BUSINESS_ID, 160, 'cash', OWNER_ID, [...locationMap.values()][locationNumber - 1], customerMap.get(customerName), invoiceRef]);
        invoiceHeaders.push([BUSINESS_ID, 'invoice', 'paid', customerMap.get(customerName), invoiceRef, day,
          [...locationMap.values()][locationNumber - 1], 160, 0, 0, 160, 160, 0,
          `SIMULATED TEST DATA · ${BATCH_KEY}`, OWNER_ID,
          JSON.stringify({ name: customerName, phone: '', address: '' }),
          JSON.stringify({ name: business.rows[0].name, currency: business.rows[0].currency, phone: business.rows[0].contact_number || '', address: [business.rows[0].city, business.rows[0].state, business.rows[0].country].filter(Boolean).join(', '), timezone: business.rows[0].timezone })]);
      }

      await insertRows(client, 'orders', ['business_id', 'supplier_id', 'status', 'notes', 'total', 'created_by', 'reference_no', 'purchase_date', 'location_id', 'transaction_type', 'paid_amount', 'due_date', 'tax_treatment', 'shipping_cost', 'other_cost', 'supplier_snapshot', 'payable_account_id'], purchaseHeaders);
      await insertRows(client, 'sales', ['business_id', 'total', 'payment_method', 'created_by', 'location_id', 'customer_id', 'notes'], salesHeaders);
      const purchaseMap = await loadMap(client, 'SELECT id,reference_no FROM orders WHERE business_id=? AND reference_no LIKE ?', [BUSINESS_ID, `${PREFIX}-P-%`], row => row.reference_no);
      const saleMap = await loadMap(client, 'SELECT id,notes FROM sales WHERE business_id=? AND notes LIKE ?', [BUSINESS_ID, `${PREFIX}-I-%`], row => row.notes);
      if (purchaseMap.size !== DOCUMENT_COUNT || saleMap.size !== DOCUMENT_COUNT) throw new Error('Could not resolve all inserted purchase and sale IDs.');

      await insertRows(client, 'sales_documents', ['business_id', 'type', 'status', 'customer_id', 'reference_no', 'document_date', 'location_id', 'subtotal', 'discount_total', 'tax_total', 'total', 'paid_amount', 'balance_due', 'notes', 'created_by', 'customer_snapshot', 'seller_snapshot'], invoiceHeaders);
      const invoiceMap = await loadMap(client, 'SELECT id,reference_no FROM sales_documents WHERE business_id=? AND reference_no LIKE ?', [BUSINESS_ID, `${PREFIX}-I-%`], row => row.reference_no);
      if (invoiceMap.size !== DOCUMENT_COUNT) throw new Error('Could not resolve all inserted invoice IDs.');

      const orderLines = [], stockLogs = [], purchaseEvents = [], saleItems = [], invoiceLines = [], invoicePayments = [], invoiceEvents = [], journalHeaders = [], journalLines = [];
      const locIds = [...locationMap.values()];
      const productIds = Array.from({ length: LOCATION_COUNT }, (_, i) => itemMap.get(`SIMULATION - Spare Part ${String(i + 1).padStart(3, '0')}`));
      if (productIds.some(id => !id)) throw new Error('Could not resolve all inserted product IDs.');
      const runningStock = Array(LOCATION_COUNT).fill(0);
      for (let i = 0; i < DOCUMENT_COUNT; i++) {
        const loc = i % LOCATION_COUNT;
        const seq = String(i + 1).padStart(6, '0');
        const purchaseRef = `${PREFIX}-P-${seq}`;
        const invoiceRef = `${PREFIX}-I-${seq}`;
        const orderId = purchaseMap.get(purchaseRef), saleId = saleMap.get(invoiceRef), docId = invoiceMap.get(invoiceRef);
        const itemId = productIds[loc], itemName = `SIMULATION - Spare Part ${String(loc + 1).padStart(3, '0')}`;
        const day = dateAt(i);
        const beforePurchase = runningStock[loc]++;
        orderLines.push([orderId, itemId, itemName, 1, 100, 100, 0, 0, 100, 100, 0, 160, 'asset', `${PREFIX}-LOT-${seq}`]);
        stockLogs.push([BUSINESS_ID, itemId, 'restock', 1, beforePurchase, beforePurchase + 1, `SIMULATED TEST DATA purchase ${purchaseRef}`, OWNER_ID]);
        purchaseEvents.push([BUSINESS_ID, orderId, OWNER_ID, 'created', JSON.stringify({ status: 'delivered', total: 100 })], [BUSINESS_ID, orderId, OWNER_ID, 'received', JSON.stringify({ total: 100 })]);
        saleItems.push([saleId, itemId, itemName, 1, 160, 100, 160]);
        invoiceLines.push([docId, itemId, itemName, 1, 160, 0, 0, 0, 0, 160, 160, 100, `${PREFIX}-SKU-${String(loc + 1).padStart(3, '0')}`, 'unit']);
        invoicePayments.push([docId, 160, 'cash', invoiceRef, `SIMULATED TEST DATA ${BATCH_KEY}`, OWNER_ID]);
        invoiceEvents.push([BUSINESS_ID, docId, OWNER_ID, 'issued', JSON.stringify({ total: 160, simulation: true })], [BUSINESS_ID, docId, OWNER_ID, 'payment', JSON.stringify({ amount: 160, method: 'cash', reference: invoiceRef, status: 'paid', simulation: true })]);
        const postingDate = day;
        journalHeaders.push([BUSINESS_ID, postingDate, `SIM purchase received ${purchaseRef}`, purchaseRef, 'Simulation batch', 'posted', OWNER_ID, 'system']);
        journalHeaders.push([BUSINESS_ID, postingDate, `SIM paid invoice ${invoiceRef}`, invoiceRef, 'Simulation batch', 'posted', OWNER_ID, 'system']);
      }
      for (let loc = 0; loc < LOCATION_COUNT; loc++) {
        for (let n = 0; n < DOCUMENT_COUNT / LOCATION_COUNT; n++) {
          const index = loc + n * LOCATION_COUNT;
          const seq = String(index + 1).padStart(6, '0');
          const itemId = productIds[loc], before = runningStock[loc]--;
          stockLogs.push([BUSINESS_ID, itemId, 'sale', -1, before, before - 1, `SIMULATED TEST DATA invoice ${PREFIX}-I-${seq}`, OWNER_ID]);
        }
      }

      await insertRows(client, 'order_items', ['order_id', 'item_id', 'item_name', 'quantity', 'unit_price', 'cost_before_discount', 'discount_percent', 'tax_percent', 'subtotal', 'net_cost', 'profit_margin', 'selling_price', 'account_type', 'lot_number'], orderLines);
      await insertRows(client, 'sale_items', ['sale_id', 'item_id', 'item_name', 'quantity', 'unit_price', 'unit_cost', 'net_revenue'], saleItems);
      await insertRows(client, 'sales_document_items', ['document_id', 'item_id', 'item_name', 'quantity', 'unit_price', 'discount_percent', 'discount_amount', 'tax_percent', 'tax_amount', 'subtotal', 'line_total', 'unit_cost', 'sku', 'unit'], invoiceLines);
      await insertRows(client, 'sales_document_payments', ['document_id', 'amount', 'method', 'reference_no', 'notes', 'created_by'], invoicePayments);
      await insertRows(client, 'purchase_events', ['business_id', 'order_id', 'user_id', 'action', 'details_json'], purchaseEvents);
      await insertRows(client, 'sales_document_events', ['business_id', 'document_id', 'user_id', 'action', 'details_json'], invoiceEvents);
      await insertRows(client, 'inventory_stock_log', ['business_id', 'item_id', 'change_type', 'qty_change', 'before_stock', 'after_stock', 'note', 'user_id'], stockLogs);

      await insertRows(client, 'journal_entries', ['business_id', 'posting_date', 'description', 'reference', 'notes', 'status', 'created_by', 'entry_type'], journalHeaders);
      const journalMap = await loadMap(client, 'SELECT id,reference FROM journal_entries WHERE business_id=? AND reference LIKE ?', [BUSINESS_ID, `${PREFIX}-%`], row => row.reference);
      if (journalMap.size !== DOCUMENT_COUNT * 2) throw new Error('Could not resolve all inserted journal IDs.');
      for (let i = 0; i < DOCUMENT_COUNT; i++) {
        const seq = String(i + 1).padStart(6, '0');
        const purchaseRef = `${PREFIX}-P-${seq}`, invoiceRef = `${PREFIX}-I-${seq}`;
        journalLines.push([journalMap.get(purchaseRef), accounts.get('inventory_asset'), 100, 0, 'SIM inventory purchase']);
        journalLines.push([journalMap.get(purchaseRef), accounts.get('purchases_payable'), 0, 100, 'SIM accounts payable']);
        journalLines.push([journalMap.get(invoiceRef), accounts.get('payment_cash'), 160, 0, 'SIM cash receipt']);
        journalLines.push([journalMap.get(invoiceRef), accounts.get('sales_revenue'), 0, 160, 'SIM sales revenue']);
        journalLines.push([journalMap.get(invoiceRef), accounts.get('inventory_cogs'), 100, 0, 'SIM cost of sales']);
        journalLines.push([journalMap.get(invoiceRef), accounts.get('inventory_asset'), 0, 100, 'SIM inventory issued']);
      }
      await insertRows(client, 'journal_entry_lines', ['journal_entry_id', 'account_id', 'debit', 'credit', 'description'], journalLines);

      await client.query('INSERT INTO operation_requests (business_id,operation,request_key,result_json) VALUES (?,?,?,?)',
        [BUSINESS_ID, BATCH, BATCH_KEY, JSON.stringify({ locations: LOCATION_COUNT, purchases: DOCUMENT_COUNT, invoices: DOCUMENT_COUNT, importedBy: OWNER_ID })]);
      await client.query('COMMIT');
      console.log(JSON.stringify({ business: business.rows[0].name, businessId: BUSINESS_ID, locations: LOCATION_COUNT, purchases: DOCUMENT_COUNT, invoices: DOCUMENT_COUNT, ledgerEntries: DOCUMENT_COUNT * 2, marker: BATCH_KEY }));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    client.release();
    await db.end();
  }
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
