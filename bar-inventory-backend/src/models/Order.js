const { query } = require('../config/db');

/**
 * Data access helpers for `orders` and `order_items`.
 */
const Order = {
  /** List orders; optional status filter. */
  findAll: (status) => {
    const where = status ? `WHERE o.status='${status}'` : '';
    return query(`
      SELECT o.*, s.name AS supplier_name, u.name AS created_by_name
      FROM orders o
      LEFT JOIN suppliers s ON s.id=o.supplier_id
      LEFT JOIN users     u ON u.id=o.created_by
      ${where}
      ORDER BY o.created_at DESC
    `);
  },
  /** Find an order by ID. */
  findById: (id) => query(
    `SELECT o.*, s.name AS supplier_name FROM orders o LEFT JOIN suppliers s ON s.id=o.supplier_id WHERE o.id=$1`,
    [id]
  ),
  /** Get line items for an order. */
  getItems: (orderId) => query('SELECT * FROM order_items WHERE order_id=$1', [orderId]),
  /** Create a new order header. */
  create: (supplierId, total, notes, userId) => query(
    'INSERT INTO orders (supplier_id,total,notes,created_by) VALUES ($1,$2,$3,$4) RETURNING *',
    [supplierId||null, total, notes||null, userId]
  ),
  /** Add a line item to an order. */
  addItem: (orderId, itemId, itemName, qty, unitPrice) => query(
    'INSERT INTO order_items (order_id,item_id,item_name,quantity,unit_price) VALUES ($1,$2,$3,$4,$5)',
    [orderId, itemId||null, itemName, qty, unitPrice]
  ),
  /** Update order status. */
  updateStatus: (id, status) => query(
    'UPDATE orders SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *',
    [status, id]
  ),
  /** Delete an order by ID. */
  delete: (id) => query('DELETE FROM orders WHERE id=$1', [id]),
};

module.exports = Order;
