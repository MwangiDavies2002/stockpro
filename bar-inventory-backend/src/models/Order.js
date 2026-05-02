const { query } = require('../config/db');

const Order = {
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
  findById: (id) => query(
    `SELECT o.*, s.name AS supplier_name FROM orders o LEFT JOIN suppliers s ON s.id=o.supplier_id WHERE o.id=$1`,
    [id]
  ),
  getItems: (orderId) => query('SELECT * FROM order_items WHERE order_id=$1', [orderId]),
  create: (supplierId, total, notes, userId) => query(
    'INSERT INTO orders (supplier_id,total,notes,created_by) VALUES ($1,$2,$3,$4) RETURNING *',
    [supplierId||null, total, notes||null, userId]
  ),
  addItem: (orderId, itemId, itemName, qty, unitPrice) => query(
    'INSERT INTO order_items (order_id,item_id,item_name,quantity,unit_price) VALUES ($1,$2,$3,$4,$5)',
    [orderId, itemId||null, itemName, qty, unitPrice]
  ),
  updateStatus: (id, status) => query(
    'UPDATE orders SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *',
    [status, id]
  ),
  delete: (id) => query('DELETE FROM orders WHERE id=$1', [id]),
};

module.exports = Order;
