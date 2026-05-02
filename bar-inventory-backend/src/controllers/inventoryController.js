const { query } = require('../config/db');
const { sendLowStockAlert } = require('../utils/notifications');

/* GET /api/inventory */
async function getAll(req, res, next) {
  try {
    const { category, search } = req.query;
    let sql = 'SELECT i.*, s.name AS supplier_name FROM inventory_items i LEFT JOIN suppliers s ON s.id=i.supplier_id WHERE 1=1';
    const params = [];
    if (category) { params.push(category); sql += ` AND i.category=$${params.length}`; }
    if (search)   { params.push(`%${search}%`); sql += ` AND i.name ILIKE $${params.length}`; }
    sql += ' ORDER BY i.name';
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) { next(err); }
}

/* GET /api/inventory/low-stock */
async function getLowStock(req, res, next) {
  try {
    const { rows } = await query(
      'SELECT * FROM inventory_items WHERE stock <= threshold ORDER BY stock ASC'
    );
    res.json(rows);
  } catch (err) { next(err); }
}

/* GET /api/inventory/:id */
async function getOne(req, res, next) {
  try {
    const { rows } = await query(
      'SELECT i.*, s.name AS supplier_name FROM inventory_items i LEFT JOIN suppliers s ON s.id=i.supplier_id WHERE i.id=$1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Item not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

/* POST /api/inventory */
async function create(req, res, next) {
  try {
    const { name, category, unit, stock, threshold, price, supplierId } = req.body;
    if (!name || !category) return res.status(400).json({ message: 'name and category are required' });
    const { rows } = await query(
      'INSERT INTO inventory_items (name,category,unit,stock,threshold,price,supplier_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [name, category, unit||'Bottles', stock||0, threshold||5, price||0, supplierId||null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

/* PUT /api/inventory/:id */
async function update(req, res, next) {
  try {
    const { name, category, unit, stock, threshold, price, supplierId } = req.body;
    const { rows } = await query(
      `UPDATE inventory_items
       SET name=$1,category=$2,unit=$3,stock=$4,threshold=$5,price=$6,supplier_id=$7,updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [name, category, unit, stock, threshold, price, supplierId||null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Item not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

/* DELETE /api/inventory/:id */
async function remove(req, res, next) {
  try {
    const { rowCount } = await query('DELETE FROM inventory_items WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: 'Item not found' });
    res.json({ message: 'Item deleted' });
  } catch (err) { next(err); }
}

/* PATCH /api/inventory/:id/restock */
async function restock(req, res, next) {
  try {
    const { quantity } = req.body;
    if (!quantity || quantity < 1) return res.status(400).json({ message: 'quantity must be >= 1' });
    const { rows } = await query(
      'UPDATE inventory_items SET stock=stock+$1,updated_at=NOW() WHERE id=$2 RETURNING *',
      [quantity, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Item not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

/* PATCH /api/inventory/:id/sell */
async function sell(req, res, next) {
  try {
    const { quantity = 1 } = req.body;
    const check = await query('SELECT stock, threshold, name FROM inventory_items WHERE id=$1', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ message: 'Item not found' });
    if (check.rows[0].stock < quantity) return res.status(400).json({ message: 'Insufficient stock' });

    const { rows } = await query(
      'UPDATE inventory_items SET stock=stock-$1,sold=sold+$1,updated_at=NOW() WHERE id=$2 RETURNING *',
      [quantity, req.params.id]
    );
    const item = rows[0];

    // Trigger low-stock notification
    if (item.stock <= item.threshold) {
      await sendLowStockAlert(item).catch(() => {});
    }
    res.json(item);
  } catch (err) { next(err); }
}

module.exports = { getAll, getLowStock, getOne, create, update, remove, restock, sell };
