const { query } = require('../config/db');

/* POST /api/shifts */
/**
 * Open a new shift for the logged-in user with a starting cash float.
 * Rejects if the user already has an open shift.
 */
async function open(req, res, next) {
  try {
    const { openingFloat } = req.body;
    if (openingFloat === undefined || openingFloat < 0) {
      return res.status(400).json({ message: 'openingFloat must be >= 0' });
    }

    const existing = await query(
      "SELECT id FROM shifts WHERE user_id=? AND status='open'",
      [req.user.id]
    );
    if (existing.rows.length) {
      return res.status(400).json({ message: 'You already have an open shift' });
    }

    const { insertId } = await query(
      'INSERT INTO shifts (user_id, opening_float, status) VALUES (?,?,?)',
      [req.user.id, openingFloat, 'open']
    );
    const { rows } = await query('SELECT * FROM shifts WHERE id=?', [insertId]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

/* GET /api/shifts/current */
/**
 * Get the logged-in user's currently open shift, if any.
 */
async function current(req, res, next) {
  try {
    const { rows } = await query(
      "SELECT * FROM shifts WHERE user_id=? AND status='open' LIMIT 1",
      [req.user.id]
    );
    res.json(rows[0] || null);
  } catch (err) { next(err); }
}

/* PATCH /api/shifts/:id/close */
/**
 * Close a shift: computes expected cash (opening float + cash sales
 * during the shift window) and compares to what was actually counted.
 */
async function close(req, res, next) {
  try {
    const { actualCash, notes } = req.body;
    if (actualCash === undefined || actualCash < 0) {
      return res.status(400).json({ message: 'actualCash must be >= 0' });
    }

    const shiftRes = await query('SELECT * FROM shifts WHERE id=?', [req.params.id]);
    if (!shiftRes.rows.length) return res.status(404).json({ message: 'Shift not found' });
    const shift = shiftRes.rows[0];

    if (shift.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not your shift' });
    }
    if (shift.status === 'closed') {
      return res.status(400).json({ message: 'Shift already closed' });
    }

    const cashSalesRes = await query(
      `SELECT COALESCE(SUM(total), 0) AS cash_total
       FROM sales
       WHERE created_by=? AND payment_method='cash' AND created_at >= ?`,
      [shift.user_id, shift.opened_at]
    );
    const cashSalesTotal = Number(cashSalesRes.rows[0].cash_total);
    const expected = Number(shift.opening_float) + cashSalesTotal;
    const variance = Number(actualCash) - expected;

    await query(
      `UPDATE shifts
       SET closing_expected=?, closing_actual=?, variance=?, status='closed', closed_at=NOW(), notes=?
       WHERE id=?`,
      [expected, actualCash, variance, notes || null, req.params.id]
    );

    const { rows } = await query('SELECT * FROM shifts WHERE id=?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
}

/* GET /api/shifts */
/**
 * List shifts. Admins see everyone's; employees see only their own.
 */
async function getAll(req, res, next) {
  try {
    let sql = `SELECT s.*, u.name AS user_name FROM shifts s
               LEFT JOIN users u ON u.id = s.user_id`;
    const params = [];
    if (req.user.role !== 'admin') {
      sql += ' WHERE s.user_id=?';
      params.push(req.user.id);
    }
    sql += ' ORDER BY s.opened_at DESC LIMIT 100';
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { open, current, close, getAll };