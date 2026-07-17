const { getClient } = require('../config/db');
const { sendLowStockAlert } = require('../utils/notifications');

/* POST /api/sales */
/**
 * Record a multi-item sale atomically: validates stock for every line
 * item first, then in a single transaction inserts the sale, inserts
 * each sale_item, deducts stock, and logs each inventory movement.
 * If any line fails, the whole transaction rolls back — no partial sales.
 *
 * Expected body: { items: [{ itemId, quantity, unitPrice }], paymentMethod, note }
 */
async function create(req, res, next) {
  const { items = [], paymentMethod, note, locationId, customerId } = req.body;

  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ message: 'Sale must include at least one item' });
  }
  for (const line of items) {
    if (!line.itemId || !Number.isInteger(line.quantity) || line.quantity < 1) {
      return res.status(400).json({ message: 'Each item needs a valid itemId and quantity >= 1' });
    }
    if (line.unitPrice !== undefined && (typeof line.unitPrice !== 'number' || line.unitPrice <= 0)) {
      return res.status(400).json({ message: `Invalid price for item ${line.itemId}: price must be greater than 0` });
    }
  }

  const client = await getClient();
  try {
    // Pre-check all stock levels before touching anything
    const stockChecks = [];
    for (const line of items) {
      const { rows } = await client.query(
        'SELECT id, name, stock, threshold, price FROM inventory_items WHERE id=$1',
        [line.itemId]
      );
      if (!rows.length) {
        client.release();
        return res.status(404).json({ message: `Item ${line.itemId} not found` });
      }
      const item = rows[0];
      if (item.stock < line.quantity) {
        client.release();
        return res.status(400).json({
          message: `Insufficient stock for ${item.name}: have ${item.stock}, need ${line.quantity}`,
        });
      }
      stockChecks.push({ item, line });
    }

    const total = stockChecks.reduce(
      (sum, { item, line }) => sum + (line.unitPrice ?? item.price) * line.quantity,
      0
    );

    // Credit sales: require a customer and check they have room on their tab
    if (paymentMethod === 'credit') {
      if (!customerId) {
        client.release();
        return res.status(400).json({ message: 'A customer is required for credit sales' });
      }
      const custRes = await client.query('SELECT balance, credit_limit, active FROM customers WHERE id=$1', [customerId]);
      if (!custRes.rows.length) {
        client.release();
        return res.status(404).json({ message: 'Customer not found' });
      }
      const customer = custRes.rows[0];
      if (!customer.active) {
        client.release();
        return res.status(400).json({ message: 'This customer account is inactive' });
      }
      if (Number(customer.balance) + total > Number(customer.credit_limit)) {
        client.release();
        return res.status(400).json({
          message: `Credit limit exceeded: balance KSh ${customer.balance} + this sale KSh ${total} exceeds limit KSh ${customer.credit_limit}`,
        });
      }
    }

    await client.query('BEGIN');

    const saleNote = note || (paymentMethod ? `Sale via ${paymentMethod}` : 'Sale recorded');
    const { insertId: saleId } = await client.query(
      'INSERT INTO sales (total, created_by, notes, payment_method, location_id, customer_id) VALUES ($1,$2,$3,$4,$5,$6)',
      [total, req.user?.id || null, saleNote, paymentMethod || 'cash', locationId || 1, customerId || null]
    );

    const updatedItems = [];
    for (const { item, line } of stockChecks) {
      const unitPrice = line.unitPrice ?? item.price;

      await client.query(
        'INSERT INTO sale_items (sale_id, item_id, item_name, quantity, unit_price) VALUES ($1,$2,$3,$4,$5)',
        [saleId, item.id, item.name, line.quantity, unitPrice]
      );

      await client.query(
        'UPDATE inventory_items SET stock=stock-$1,sold=sold+$2,updated_at=NOW() WHERE id=$3',
        [line.quantity, line.quantity, item.id]
      );

      const { rows: [updated] } = await client.query(
        'SELECT * FROM inventory_items WHERE id=$1',
        [item.id]
      );

      await client.query(
        'INSERT INTO inventory_stock_log (item_id, change_type, qty_change, before_stock, after_stock, user_id, note) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [item.id, 'sale', line.quantity, item.stock, updated.stock, req.user?.id || null, saleNote]
      );

      updatedItems.push(updated);
    }

    if (paymentMethod === 'credit') {
      await client.query('UPDATE customers SET balance = balance + $1 WHERE id=$2', [total, customerId]);
    }

    const { rows: [sale] } = await client.query('SELECT * FROM sales WHERE id=$1', [saleId]);
    const { rows: saleItems } = await client.query('SELECT * FROM sale_items WHERE sale_id=$1', [saleId]);

    await client.query('COMMIT');

    // Fire low-stock alerts after commit, outside the transaction
    for (const updated of updatedItems) {
      if (updated.stock <= updated.threshold) {
        sendLowStockAlert(updated).catch(() => {});
      }
    }

    res.status(201).json({ sale, items: saleItems, updatedStock: updatedItems });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

/* GET /api/sales */
/**
 * List sales with their line items, most recent first.
 */
async function getAll(req, res, next) {
  const client = await getClient();
  try {
    const { rows: sales } = await client.query(
      `SELECT s.*, u.name AS created_by_name
       FROM sales s
       LEFT JOIN users u ON u.id = s.created_by
       ORDER BY s.created_at DESC
       LIMIT 200`
    );
    const ids = sales.map((s) => s.id);
    let items = [];
    if (ids.length) {
      const placeholders = ids.map(() => '?').join(',');
      const { rows } = await client.query(
        `SELECT * FROM sale_items WHERE sale_id IN (${placeholders})`,
        ids
      );
      items = rows;
    }
    const result = sales.map((s) => ({
      ...s,
      items: items.filter((i) => i.sale_id === s.id),
    }));
    res.json(result);
  } catch (err) { next(err); }
  finally { client.release(); }
}

/* GET /api/sales/:id */
/**
 * Get one sale with its line items.
 */
async function getOne(req, res, next) {
  const client = await getClient();
  try {
    const { rows } = await client.query('SELECT * FROM sales WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Sale not found' });
    const { rows: items } = await client.query('SELECT * FROM sale_items WHERE sale_id=$1', [req.params.id]);
    res.json({ ...rows[0], items });
  } catch (err) { next(err); }
  finally { client.release(); }
}

module.exports = { create, getAll, getOne };