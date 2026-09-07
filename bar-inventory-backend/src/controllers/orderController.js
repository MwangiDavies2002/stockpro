const { query, getClient } = require('../config/db');
const JournalEngine = require('../models/JournalEngine');
const { ensurePurchaseAccountingMappings } = require('../utils/accountingDefaults');
const { getBusinessId } = require('../utils/tenant');

/* GET /api/orders */
/**
 * List orders. Optional `status` query filters by order status.
 * Attaches line items to each order in the response.
 */
async function getAll(req, res, next) {
  try {
    const { status } = req.query;
    let sql = `SELECT o.*, s.name AS supplier_name, u.name AS created_by_name
               FROM orders o
               LEFT JOIN suppliers s ON s.id=o.supplier_id AND s.business_id=o.business_id
               LEFT JOIN users     u ON u.id=o.created_by
               WHERE o.business_id=?`;
    const params = [getBusinessId(req)];
    if (status) { params.push(status); sql += ' AND o.status=?'; }
    sql += ' ORDER BY o.created_at DESC';
    const { rows: orders } = await query(sql, params);

    // Attach line items
    const ids = orders.map((o) => o.id);
    let items = [];
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',');
      const { rows } = await query(
        `SELECT * FROM order_items WHERE order_id IN (${placeholders})`,
        ids
      );
      items = rows;
    }
    const result = orders.map((o) => ({
      ...o,
      items: items.filter((i) => i.order_id === o.id),
    }));
    res.json(result);
  } catch (err) { next(err); }
}

/* GET /api/orders/:id */
/**
 * Retrieve a single order by ID including its line items.
 */
async function getOne(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT o.*, s.name AS supplier_name FROM orders o LEFT JOIN suppliers s ON s.id=o.supplier_id AND s.business_id=o.business_id WHERE o.id=$1 AND o.business_id=$2`,
      [req.params.id, getBusinessId(req)]
    );
    if (!rows.length) return res.status(404).json({ message: 'Order not found' });
    const { rows: items } = await query('SELECT * FROM order_items WHERE order_id=$1', [req.params.id]);
    res.json({ ...rows[0], items });
  } catch (err) { next(err); }
}

/* POST /api/orders */
/**
 * Create a new order with `items` array. Uses a DB transaction.
 */
async function create(req, res, next) {
  const { supplierId, items = [], notes, transactionType = 'purchase', referenceNo,
    purchaseDate, locationId, payTerm, status = 'pending' } = req.body;
  const enhanced = purchaseDate !== undefined;
  let lines;
  try {
    if (!Array.isArray(items) || !items.length) throw badRequest('Order must have at least one item');
    if (!['purchase', 'opening_stock'].includes(transactionType)) throw badRequest('Invalid transaction type');
    if (transactionType === 'purchase' && !supplierId) throw badRequest('A supplier is required');
    if (!['pending', 'approved', 'delivered'].includes(status)) throw badRequest('Invalid purchase status');
    if (!enhanced && status !== 'pending') throw badRequest('Use the purchase form to receive stock immediately');
    if (enhanced && (!Number.isInteger(Number(locationId)) || Number(locationId) <= 0 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate) ||
        !Number.isFinite(Date.parse(purchaseDate)) || new Date(purchaseDate).toISOString().slice(0,10) !== purchaseDate)) {
      throw badRequest('A valid purchase date and business location are required');
    }
    if (String(referenceNo || '').length > 100 || String(payTerm || '').length > 100) throw badRequest('Reference and pay term must be at most 100 characters');
    const seen = new Set();
    lines = items.map(line => {
      const itemId = Number(line.itemId);
      if (!Number.isInteger(itemId) || itemId <= 0 || seen.has(itemId)) throw badRequest('Each product must appear once with a valid ID');
      seen.add(itemId);
      if (!['asset', 'expense'].includes(line.accountType || 'asset')) throw badRequest('Invalid account type');
      return { ...require('../utils/purchaseMath').calculateLine({ ...line, costBeforeDiscount: enhanced ? line.costBeforeDiscount : line.unitPrice }),
        itemId, accountType: line.accountType || 'asset' };
    });
  } catch (err) { return next(err); }
  let client;
  try {
    client = await getClient();
    await client.query('BEGIN');
    if (supplierId) {
      const supplier = await client.query('SELECT id FROM suppliers WHERE id=? AND business_id=?', [supplierId, getBusinessId(req)]);
      if (!supplier.rows.length) throw badRequest('Supplier does not exist');
    }
    if (enhanced) {
      const location = await client.query('SELECT id FROM locations WHERE id=? AND business_id=?', [locationId, getBusinessId(req)]);
      if (!location.rows.length) throw badRequest('Business location does not exist');
    }
    const total = Number(lines.reduce((sum, line) => sum + line.netCost, 0).toFixed(2));
    if (total > 9999999999.99) throw badRequest('Purchase total exceeds the supported amount');
    const result = await client.query(
      'INSERT INTO orders (business_id,supplier_id,notes,total,created_by,transaction_type,status,reference_no,purchase_date,location_id,pay_term) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [getBusinessId(req), supplierId || null, notes || null, total, req.user.id, transactionType, status, referenceNo || null, purchaseDate || null, locationId || null, payTerm || null]);
    const orderId = result.insertId;
    for (const line of [...lines].sort((a,b) => a.itemId-b.itemId)) {
      const { rows: [item] } = await client.query('SELECT * FROM inventory_items WHERE id=? AND business_id=? FOR UPDATE', [line.itemId, getBusinessId(req)]);
      if (!item) throw badRequest('Product no longer exists');
      if (enhanced && Number(item.location_id) !== Number(locationId)) throw badRequest(`${item.name} belongs to another business location`);
      await client.query(
        'INSERT INTO order_items (order_id,item_id,item_name,quantity,unit_price,cost_before_discount,discount_percent,tax_percent,subtotal,net_cost,profit_margin,selling_price,account_type) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [orderId, line.itemId, item.name, line.quantity, line.unitPrice, line.before, line.discount, line.tax, line.subtotal, line.netCost, line.margin, enhanced ? line.sellingPrice : null, line.accountType]);
      if (enhanced) await client.query('UPDATE inventory_items SET previous_unit_price=?, previous_discount=? WHERE id=? AND business_id=?', [line.before, line.discount, line.itemId, getBusinessId(req)]);
    }
    const { rows: [order] } = await client.query('SELECT * FROM orders WHERE id=? AND business_id=?', [orderId, getBusinessId(req)]);
    if (status === 'delivered') await receiveOrder(client, order, req.user.id, getBusinessId(req));
    const { rows: savedLines } = await client.query('SELECT * FROM order_items WHERE order_id=?', [orderId]);
    await client.query('COMMIT');
    res.status(201).json({ ...order, items: savedLines });
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    next(err);
  } finally { client?.release(); }
}

function badRequest(message) { return Object.assign(new Error(message), { status: 400 }); }

/* PUT /api/orders/:id */
/**
 * Update order metadata (notes) by ID.
 */
async function update(req, res, next) {
  try {
    const { notes } = req.body;
   const { rowCount } = await query(
  'UPDATE orders SET notes=$1,updated_at=NOW() WHERE id=$2 AND business_id=$3',
  [notes, req.params.id, getBusinessId(req)]
);
    if (!rowCount) return res.status(404).json({ message: 'Order not found' });
    const { rows } = await query('SELECT * FROM orders WHERE id=$1 AND business_id=$2', [req.params.id, getBusinessId(req)]);
    res.json(rows[0]);
  } catch (err) { next(err); }
}
/* DELETE /api/orders/:id */
/**
 * Delete an order by ID (cannot delete delivered orders).
 */
async function remove(req, res, next) {
  try {
    const check = await query('SELECT status FROM orders WHERE id=$1 AND business_id=$2', [req.params.id, getBusinessId(req)]);
    if (!check.rows.length) return res.status(404).json({ message: 'Order not found' });
    if (check.rows[0].status === 'delivered') {
      return res.status(400).json({ message: 'Cannot delete a delivered order' });
    }
    await query('DELETE FROM orders WHERE id=$1 AND business_id=$2', [req.params.id, getBusinessId(req)]);
    res.json({ message: 'Order deleted' });
  } catch (err) { next(err); }
}

/* PATCH /api/orders/:id/status */
/**
 * Change the status of an order (pending|approved|delivered|cancelled).
 */
async function updateStatus(req, res, next) {
  const client = await getClient();
  try {
    const { status } = req.body;
    const valid = ['pending','approved','delivered','cancelled'];
    if (!valid.includes(status)) {
      return res.status(400).json({ message: `status must be one of: ${valid.join(', ')}` });
    }

    await client.query('BEGIN');
    const { rows: lockedOrders } = await client.query('SELECT * FROM orders WHERE id=? AND business_id=? FOR UPDATE', [req.params.id, getBusinessId(req)]);
    if (!lockedOrders.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Order not found' });
    }
    const order = lockedOrders[0];
    const allowedTransitions = { pending: ['approved', 'cancelled'], approved: ['delivered', 'cancelled'], delivered: [], cancelled: [] };
    if (!allowedTransitions[order.status].includes(status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: `Cannot change a ${order.status} order to ${status}` });
    }

    await client.query('UPDATE orders SET status=$1,updated_at=NOW() WHERE id=$2 AND business_id=$3 ', [status, req.params.id, getBusinessId(req)]);

    if (status === 'delivered') {
      await receiveOrder(client, order, req.user?.id || null, getBusinessId(req));
    }

    const { rows: [freshOrder] } = await client.query('SELECT * FROM orders WHERE id=$1 AND business_id=$2', [req.params.id, getBusinessId(req)]);
    await client.query('COMMIT');
    res.json(freshOrder);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function receiveOrder(client, order, userId, businessId = 1) {
      const { rows: items } = await client.query('SELECT * FROM order_items WHERE order_id=$1', [order.id]);

      for (const line of items) {
        if (line.item_id) {
          const check = await client.query('SELECT stock, cost, location_id FROM inventory_items WHERE id=? AND business_id=? FOR UPDATE', [line.item_id, businessId]);
          if (!check.rows.length) throw new Error(`Inventory item ${line.item_id} was not found`);
          if (order.location_id && Number(check.rows[0].location_id) !== Number(order.location_id)) throw badRequest('Product location changed; cannot receive this purchase');
          const beforeStock = Number(check.rows[0].stock);
          const beforeCost = Number(check.rows[0].cost || 0);
          const receivedQty = Number(line.quantity);
          const receivedCost = Number(line.unit_price);
          if (order.transaction_type === 'opening_stock' && beforeStock !== 0) {
            throw new Error(`Opening stock can only be delivered for an item with zero stock (${line.item_name})`);
          }
          const newCost = order.transaction_type === 'opening_stock'
            ? receivedCost
            : ((beforeStock * beforeCost) + (receivedQty * receivedCost)) / (beforeStock + receivedQty);

          await client.query('UPDATE inventory_items SET stock = stock + ?, cost = ?, price = COALESCE(?, price), updated_at=NOW() WHERE id = ? AND business_id=?', [receivedQty, newCost, line.selling_price, line.item_id, businessId]);

          const { rows: [updated] } = await client.query('SELECT stock FROM inventory_items WHERE id=? AND business_id=?', [line.item_id, businessId]);
          await client.query(
            'INSERT INTO inventory_stock_log (item_id, change_type, qty_change, before_stock, after_stock, user_id, note) VALUES (?,?,?,?,?,?,?)',
            [line.item_id, order.transaction_type === 'opening_stock' ? 'opening_stock' : 'restock', receivedQty, beforeStock, updated.stock, userId, `Order #${order.id} delivered`]
          );
        }
      }
      const journalType = order.transaction_type === 'opening_stock' ? 'OPENING_STOCK' : 'PURCHASE';
      const expenseAmount = items.filter(line => line.account_type === 'expense').reduce((sum, line) => sum + Number(line.net_cost ?? Number(line.quantity) * Number(line.unit_price)), 0);
      if (journalType === 'PURCHASE') await ensurePurchaseAccountingMappings(client);
      const journalId = Number(order.total) === 0 ? true : await JournalEngine.generate(journalType, order.total, `Order #${order.id}`, order.transaction_type === 'opening_stock' ? 'Opening stock' : `Purchase from supplier #${order.supplier_id}`, client, { expenseAmount, postingDate: order.purchase_date });
      if (!journalId) {
        throw new Error(order.transaction_type === 'opening_stock'
          ? 'Set up Inventory Asset and Opening Balance Equity accounts before delivering opening stock'
          : 'Set up Inventory Asset, Purchase Expense (for expense lines), and Accounts Payable before receiving a purchase');
      }
}

module.exports = { getAll, getOne, create, update, remove, updateStatus };
