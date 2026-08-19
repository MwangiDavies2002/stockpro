const { query, getClient } = require('../config/db');
const JournalEngine = require('../models/JournalEngine');

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
               LEFT JOIN suppliers s ON s.id=o.supplier_id
               LEFT JOIN users     u ON u.id=o.created_by
               WHERE 1=1`;
    const params = [];
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
      `SELECT o.*, s.name AS supplier_name FROM orders o LEFT JOIN suppliers s ON s.id=o.supplier_id WHERE o.id=$1`,
      [req.params.id]
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
  const { supplierId, items = [], notes, transactionType = 'purchase' } = req.body;
  if (!items.length) return res.status(400).json({ message: 'Order must have at least one item' });
  if (!['purchase', 'opening_stock'].includes(transactionType)) {
    return res.status(400).json({ message: 'transactionType must be purchase or opening_stock' });
  }
  if (transactionType === 'purchase' && !supplierId) {
    return res.status(400).json({ message: 'A supplier is required for a purchase order' });
  }
  for (const line of items) {
    if (!Number.isInteger(Number(line.itemId)) || Number(line.itemId) <= 0 ||
        !Number.isInteger(Number(line.quantity)) || Number(line.quantity) <= 0 ||
        !Number.isFinite(Number(line.unitPrice)) || Number(line.unitPrice) < 0) {
      return res.status(400).json({ message: 'Each line needs an item, a positive whole quantity, and a non-negative unit price' });
    }
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const total = items.reduce((a, i) => a + Number(i.quantity) * Number(i.unitPrice), 0);
    const insertRes = await client.query(
      'INSERT INTO orders (supplier_id,notes,total,created_by,transaction_type) VALUES ($1,$2,$3,$4,$5)',
      [supplierId || null, notes || null, total, req.user?.id || null, transactionType]
    );
    const orderId = insertRes.insertId;

    for (const line of items) {
      const { rows: itemRows } = await client.query('SELECT name FROM inventory_items WHERE id=?', [line.itemId]);
      if (!itemRows.length) throw new Error(`Inventory item ${line.itemId} was not found`);
      await client.query(
        'INSERT INTO order_items (order_id,item_id,item_name,quantity,unit_price) VALUES ($1,$2,$3,$4,$5)',
        [orderId, line.itemId, itemRows[0].name, Number(line.quantity), Number(line.unitPrice)]
      );
    }

    const { rows: [freshOrder] } = await client.query('SELECT * FROM orders WHERE id=$1', [orderId]);
    await client.query('COMMIT');
    res.status(201).json({ ...freshOrder, items });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

/* PUT /api/orders/:id */
/**
 * Update order metadata (notes) by ID.
 */
async function update(req, res, next) {
  try {
    const { notes } = req.body;
   const { rowCount } = await query(
  'UPDATE orders SET notes=$1,updated_at=NOW() WHERE id=$2',
  [notes, req.params.id]
);
    if (!rowCount) return res.status(404).json({ message: 'Order not found' });
    const { rows } = await query('SELECT * FROM orders WHERE id=$1', [req.params.id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
}
/* DELETE /api/orders/:id */
/**
 * Delete an order by ID (cannot delete delivered orders).
 */
async function remove(req, res, next) {
  try {
    const check = await query('SELECT status FROM orders WHERE id=$1', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ message: 'Order not found' });
    if (check.rows[0].status === 'delivered') {
      return res.status(400).json({ message: 'Cannot delete a delivered order' });
    }
    await query('DELETE FROM orders WHERE id=$1', [req.params.id]);
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
    const { rows: lockedOrders } = await client.query('SELECT * FROM orders WHERE id=? FOR UPDATE', [req.params.id]);
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

    await client.query('UPDATE orders SET status=$1,updated_at=NOW() WHERE id=$2 ', [status, req.params.id]);

    if (status === 'delivered') {
      const { rows: items } = await client.query('SELECT * FROM order_items WHERE order_id=$1', [req.params.id]);

      for (const line of items) {
        if (line.item_id) {
          const check = await client.query('SELECT stock, cost FROM inventory_items WHERE id=? FOR UPDATE', [line.item_id]);
          if (!check.rows.length) throw new Error(`Inventory item ${line.item_id} was not found`);
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

          await client.query('UPDATE inventory_items SET stock = stock + ?, cost = ?, updated_at=NOW() WHERE id = ?', [receivedQty, newCost, line.item_id]);

          const { rows: [updated] } = await client.query('SELECT stock FROM inventory_items WHERE id=?', [line.item_id]);
          await client.query(
            'INSERT INTO inventory_stock_log (item_id, change_type, qty_change, before_stock, after_stock, user_id, note) VALUES (?,?,?,?,?,?,?)',
            [line.item_id, order.transaction_type === 'opening_stock' ? 'opening_stock' : 'restock', receivedQty, beforeStock, updated.stock, req.user?.id || null, `Order #${order.id} delivered`]
          );
        }
      }
      const journalType = order.transaction_type === 'opening_stock' ? 'OPENING_STOCK' : 'PURCHASE';
      const journalId = await JournalEngine.generate(journalType, order.total, `Order #${order.id}`, order.transaction_type === 'opening_stock' ? 'Opening stock' : `Purchase from supplier #${order.supplier_id}`, client);
      if (!journalId) {
        throw new Error(order.transaction_type === 'opening_stock'
          ? 'Set up Inventory Asset and Opening Balance Equity accounts before delivering opening stock'
          : 'Set up Inventory Asset and Accounts Payable before delivering a purchase order');
      }
    }

    const { rows: [freshOrder] } = await client.query('SELECT * FROM orders WHERE id=$1', [req.params.id]);
    await client.query('COMMIT');
    res.json(freshOrder);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

module.exports = { getAll, getOne, create, update, remove, updateStatus };
