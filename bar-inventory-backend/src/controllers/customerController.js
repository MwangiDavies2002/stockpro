const { query, getClient } = require('../config/db');

async function getAll(req, res, next) {
  try {
    const { rows } = await query('SELECT * FROM customers ORDER BY name');
    res.json(rows);
  } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  try {
    const { rows } = await query('SELECT * FROM customers WHERE id=?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Customer not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const { name, phone, creditLimit } = req.body;
    if (!name) return res.status(400).json({ message: 'name is required' });
    const { insertId } = await query(
      'INSERT INTO customers (name, phone, credit_limit) VALUES (?,?,?)',
      [name, phone || null, creditLimit || 0]
    );
    const { rows } = await query('SELECT * FROM customers WHERE id=?', [insertId]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const { name, phone, creditLimit, active } = req.body;
    const { rowCount } = await query(
      'UPDATE customers SET name=?, phone=?, credit_limit=?, active=? WHERE id=?',
      [name, phone || null, creditLimit || 0, active ?? true, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ message: 'Customer not found' });
    const { rows } = await query('SELECT * FROM customers WHERE id=?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
}

/* GET /api/customers/:id/statement */
/**
 * All sales (on credit) and payments for a customer, most recent first.
 */
async function statement(req, res, next) {
  try {
    const { rows: sales } = await query(
      "SELECT id, total, created_at, notes FROM sales WHERE customer_id=? ORDER BY created_at DESC",
      [req.params.id]
    );
    const { rows: payments } = await query(
      'SELECT id, amount, method, notes, created_at FROM customer_payments WHERE customer_id=? ORDER BY created_at DESC',
      [req.params.id]
    );
    const { rows: customerRows } = await query('SELECT * FROM customers WHERE id=?', [req.params.id]);
    if (!customerRows.length) return res.status(404).json({ message: 'Customer not found' });
    res.json({ customer: customerRows[0], sales, payments });
  } catch (err) { next(err); }
}

/* POST /api/customers/:id/payments */
/**
 * Record a payment against a customer's tab, reducing their balance.
 */
async function recordPayment(req, res, next) {
  const client = await getClient();
  try {
    const { amount, method, notes } = req.body;
    if (!amount || amount <= 0) {
      client.release();
      return res.status(400).json({ message: 'amount must be greater than 0' });
    }

    const custRes = await client.query('SELECT balance FROM customers WHERE id=?', [req.params.id]);
    if (!custRes.rows.length) {
      client.release();
      return res.status(404).json({ message: 'Customer not found' });
    }

    await client.query('BEGIN');
    await client.query(
      'INSERT INTO customer_payments (customer_id, amount, method, notes, created_by) VALUES (?,?,?,?,?)',
      [req.params.id, amount, method || 'cash', notes || null, req.user?.id || null]
    );
    await client.query('UPDATE customers SET balance = balance - ? WHERE id=?', [amount, req.params.id]);
    const { rows } = await client.query('SELECT * FROM customers WHERE id=?', [req.params.id]);
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

module.exports = { getAll, getOne, create, update, statement, recordPayment };