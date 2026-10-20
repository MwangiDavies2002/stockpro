const { query, getClient } = require('../config/db');
const { getBusinessId } = require('../utils/tenant');

/* POST /api/shifts */
/**
 * Open a new shift for the logged-in user with a starting cash float.
 * Rejects if the user already has an open shift.
 */
async function open(req, res, next) {
  const client=await getClient();
  const query=(...args)=>client.query(...args);
  try {
    const { openingFloat } = req.body;
    if (openingFloat === undefined || !Number.isFinite(Number(openingFloat)) || Number(openingFloat) < 0) {
      return res.status(400).json({ message: 'openingFloat must be >= 0' });
    }

    await query('BEGIN');
    await query('SELECT id FROM users WHERE id=? AND business_id=? FOR UPDATE',[req.user.id,getBusinessId(req)]);
    const existing = await query(
      "SELECT id FROM shifts WHERE user_id=? AND status='open'",
      [req.user.id]
    );
    if (existing.rows.length) {
      await query('ROLLBACK');
      return res.status(400).json({ message: 'You already have an open shift' });
    }

    const boundary=await query('SELECT COALESCE(MAX(id),0) id FROM sales WHERE created_by=? AND business_id=?',[req.user.id,getBusinessId(req)]);
    const { insertId } = await query(
      'INSERT INTO shifts (business_id,user_id, opening_float, status,sales_start_id) VALUES (?,?,?,?,?)',
      [getBusinessId(req), req.user.id, openingFloat, 'open',boundary.rows[0].id]
    );
    const { rows } = await query('SELECT * FROM shifts WHERE id=?', [insertId]);
    await query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) { await query('ROLLBACK');next(err); }
  finally{client.release();}
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
  const client=await getClient();
  const query=(...args)=>client.query(...args);
  try {
    const { actualCash, notes } = req.body;
    if (actualCash === undefined || !Number.isFinite(Number(actualCash)) || Number(actualCash) < 0) {
      return res.status(400).json({ message: 'actualCash must be >= 0' });
    }

    const owner=await query('SELECT user_id FROM shifts WHERE id=? AND business_id=?',[req.params.id,getBusinessId(req)]);
    if(!owner.rows.length)return res.status(404).json({message:'Shift not found'});
    await query('BEGIN');
    await query('SELECT id FROM users WHERE id=? AND business_id=? FOR UPDATE',[owner.rows[0].user_id,getBusinessId(req)]);
    const shiftRes = await query('SELECT * FROM shifts WHERE id=? AND business_id=? FOR UPDATE', [req.params.id, getBusinessId(req)]);
    if (!shiftRes.rows.length) return res.status(404).json({ message: 'Shift not found' });
    const shift = shiftRes.rows[0];

    if (shift.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Not your shift' });
    }
    if (shift.status === 'closed') {
      return res.status(400).json({ message: 'Shift already closed' });
    }

    const cashSalesRes = await query(
      `SELECT COALESCE(SUM(CASE WHEN s.payment_method='cash' THEN s.total WHEN s.payment_method='mixed' THEN COALESCE((SELECT SUM(p.amount) FROM sales_documents d JOIN sales_document_payments p ON p.document_id=d.id WHERE d.sale_id=s.id AND d.business_id=s.business_id AND p.method='cash'),0) ELSE 0 END),0) AS cash_total
       FROM sales s
       WHERE s.created_by=? AND s.business_id=? AND ${shift.sales_start_id==null?'s.created_at >= ?':'s.id > ?'}`,
      [shift.user_id, getBusinessId(req), shift.sales_start_id??shift.opened_at]
    );
    const cashSalesTotal = Number(cashSalesRes.rows[0].cash_total);
    const expected = Number(shift.opening_float) + cashSalesTotal;
    const variance = Number(actualCash) - expected;

    const closed = await query(
      `UPDATE shifts
       SET closing_expected=?, closing_actual=?, variance=?, status='closed', closed_at=NOW(), notes=?
       WHERE id=? AND business_id=? AND status='open'`,
      [expected, actualCash, variance, notes || null, req.params.id, getBusinessId(req)]
    );
    if(!closed.rowCount)return res.status(409).json({message:'This shift was already closed by another request'});

    // If there's a variance, we might want to log it specifically or notify admin
    if (Math.abs(variance) > 0) {
      console.log(`Shift ${req.params.id} closed with variance: ${variance}`);
    }

    const { rows } = await query('SELECT * FROM shifts WHERE id=?', [req.params.id]);
    await query('COMMIT');
    res.json(rows[0]);
  } catch (err) { next(err); }
  finally{await query('ROLLBACK');client.release();}
}

/* GET /api/shifts */
/**
 * List shifts. Admins see everyone's; employees see only their own.
 */
async function getAll(req, res, next) {
  try {
    let sql = `SELECT s.*, u.name AS user_name FROM shifts s
               LEFT JOIN users u ON u.id = s.user_id WHERE s.business_id=?`;
    const params = [getBusinessId(req)];
    if (req.user.role !== 'admin') {
      sql += ' AND s.user_id=?';
      params.push(req.user.id);
    }
    sql += ' ORDER BY s.opened_at DESC LIMIT 100';
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { open, current, close, getAll };
