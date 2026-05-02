const { query, pool } = require('../config/db');

/* GET /api/orders */
async function getAll(req, res, next) {
  try {
    const { status } = req.query;
    let sql = `SELECT o.*, s.name AS supplier_name, u.name AS created_by_name
               FROM orders o
               LEFT JOIN suppliers s ON s.id=o.supplier_id
               LEFT JOIN users     u ON u.id=o.created_by
               WHERE 1=1`;
    const params = [];
    if (status) { params.push(status); sql += ` AND o.status=$${params.length}`; }
    sql += ' ORDER BY o.created_at DESC';
    const { rows: orders } = await query(sql, params);

    // Attach line items
    const ids = orders.map(o => o.id);
    let items = [];
    if (ids.length) {
      const { rows } = await query(
        'SELECT * FROM order_items WHERE order_id=ANY($1::int[])', [ids]
      );
      items = rows;
    }
    const result = orders.map(o => ({
      ...o,
      items: items.filter(i => i.order_id === o.id),
    }));
    res.json(result);
  } catch (err) { next(err); }
}

/* GET /api/orders/:id */
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
async function create(req, res, next) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { supplierId, items = [], notes } = req.body;
    if (!items.length) return res.status(400).json({ message: 'Order must have at least one item' });

    const total = items.reduce((a, i) => a + i.quantity * i.unitPrice, 0);
    const { rows: [order] } = await client.query(
      'INSERT INTO orders (supplier_id,notes,total,created_by) VALUES ($1,$2,$3,$4) RETURNING *',
      [supplierId||null, notes||null, total, req.user.id]
    );
    for (const line of items) {
      await client.query(
        'INSERT INTO order_items (order_id,item_id,item_name,quantity,unit_price) VALUES ($1,$2,$3,$4,$5)',
        [order.id, line.itemId||null, line.name||'', line.quantity, line.unitPrice]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ ...order, items });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
}

/* PUT /api/orders/:id */
async function update(req, res, next) {
  try {
    const { notes } = req.body;
    const { rows } = await query(
      'UPDATE orders SET notes=$1,updated_at=NOW() WHERE id=$2 RETURNING *',
      [notes, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Order not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

/* DELETE /api/orders/:id */
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
async function updateStatus(req, res, next) {
  try {
    const { status } = req.body;
    const valid = ['pending','approved','delivered','cancelled'];
    if (!valid.includes(status)) return res.status(400).json({ message: `status must be one of: ${valid.join(', ')}` });

    const { rows } = await query(
      'UPDATE orders SET status=$1,updated_at=NOW() WHERE id=$2 RETURNING *',
      [status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Order not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

module.exports = { getAll, getOne, create, update, remove, updateStatus };
