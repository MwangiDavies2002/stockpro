const { query } = require('../config/db');

/**
 * List all suppliers.
 */
async function getAll(req, res, next) {
  try {
    const { rows } = await query('SELECT * FROM suppliers ORDER BY name');
    res.json(rows);
  } catch (err) { next(err); }
}

/**
 * Get a supplier by ID.
 */
async function getOne(req, res, next) {
  try {
    const { rows } = await query('SELECT * FROM suppliers WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Supplier not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

/**
 * Create a new supplier. Requires `name` in the request body.
 */
async function create(req, res, next) {
  try {
    const { name, email, phone, address, itemsSupplied } = req.body;
    if (!name) return res.status(400).json({ message: 'name is required' });
    const { insertId } = await query(
      'INSERT INTO suppliers (name,email,phone,address,items_supplied) VALUES ($1,$2,$3,$4,$5)',
      [name, email||null, phone||null, address||null, itemsSupplied||[]]
    );
    const {rows} = await query (' SELECT * FROM suppliers WHERE id=$1',[insertId]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

/**
 * Update supplier details by ID.
 */
async function update(req, res, next) {
  try {
    const { name, email, phone, address, itemsSupplied } = req.body;
    const { rowCount } = await query(
  'UPDATE suppliers SET name=$1,email=$2,phone=$3,address=$4,items_supplied=$5,updated_at=NOW() WHERE id=$6',
  [name, email||null, phone||null, address||null, JSON.stringify(itemsSupplied||[]), req.params.id]
);
if (!rowCount) return res.status(404).json({ message: 'Supplier not found' });
const { rows } = await query('SELECT * FROM suppliers WHERE id=$1', [req.params.id]);
res.json(rows[0]);
  } catch (err) { next(err); }
}

/**
 * Delete a supplier by ID.
 */
async function remove(req, res, next) {
  try {
    const { rowCount } = await query('DELETE FROM suppliers WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: 'Supplier not found' });
    res.json({ message: 'Supplier deleted' });
  } catch (err) { next(err); }
}

module.exports = { getAll, getOne, create, update, remove };
