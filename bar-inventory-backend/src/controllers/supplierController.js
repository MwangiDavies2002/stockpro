const { query } = require('../config/db');

async function getAll(req, res, next) {
  try {
    const { rows } = await query('SELECT * FROM suppliers ORDER BY name');
    res.json(rows);
  } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  try {
    const { rows } = await query('SELECT * FROM suppliers WHERE id=$1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Supplier not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const { name, email, phone, address, itemsSupplied } = req.body;
    if (!name) return res.status(400).json({ message: 'name is required' });
    const { rows } = await query(
      'INSERT INTO suppliers (name,email,phone,address,items_supplied) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [name, email||null, phone||null, address||null, itemsSupplied||[]]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const { name, email, phone, address, itemsSupplied } = req.body;
    const { rows } = await query(
      'UPDATE suppliers SET name=$1,email=$2,phone=$3,address=$4,items_supplied=$5,updated_at=NOW() WHERE id=$6 RETURNING *',
      [name, email||null, phone||null, address||null, itemsSupplied||[], req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Supplier not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    const { rowCount } = await query('DELETE FROM suppliers WHERE id=$1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: 'Supplier not found' });
    res.json({ message: 'Supplier deleted' });
  } catch (err) { next(err); }
}

module.exports = { getAll, getOne, create, update, remove };
