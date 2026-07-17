const { query } = require('../config/db');

async function getAll(req, res, next) {
  try {
    const { rows } = await query('SELECT * FROM locations ORDER BY name');
    res.json(rows);
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const { name, address } = req.body;
    if (!name) return res.status(400).json({ message: 'name is required' });
    const { insertId } = await query(
      'INSERT INTO locations (name, address) VALUES (?,?)',
      [name, address || null]
    );
    const { rows } = await query('SELECT * FROM locations WHERE id=?', [insertId]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const { name, address, active } = req.body;
    const { rowCount } = await query(
      'UPDATE locations SET name=?, address=?, active=? WHERE id=?',
      [name, address || null, active ?? true, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ message: 'Location not found' });
    const { rows } = await query('SELECT * FROM locations WHERE id=?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    if (Number(req.params.id) === 1) {
      return res.status(400).json({ message: 'Cannot delete the default location' });
    }
    const { rowCount } = await query('DELETE FROM locations WHERE id=?', [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: 'Location not found' });
    res.json({ message: 'Location deleted' });
  } catch (err) { next(err); }
}

/* GET /api/locations/:id/summary */
/**
 * Per-location snapshot: stock count, low stock count, revenue (30d).
 */
async function summary(req, res, next) {
  try {
    const locationId = req.params.id;
    const stockRes = await query(
      'SELECT COUNT(*) AS total, SUM(CASE WHEN stock<=threshold THEN 1 ELSE 0 END) AS low FROM inventory_items WHERE location_id=?',
      [locationId]
    );
    const revenueRes = await query(
      "SELECT COALESCE(SUM(total),0) AS revenue, COUNT(*) AS sale_count FROM sales WHERE location_id=? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)",
      [locationId]
    );
    res.json({
      totalProducts: Number(stockRes.rows[0].total),
      lowStockCount: Number(stockRes.rows[0].low),
      revenue30d: Number(revenueRes.rows[0].revenue),
      sales30d: Number(revenueRes.rows[0].sale_count),
    });
  } catch (err) { next(err); }
}

module.exports = { getAll, create, update, remove, summary };