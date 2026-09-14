const { query } = require('../config/db');
const { getBusinessId } = require('../utils/tenant');

async function getAll(req, res, next) {
  try { const { rows } = await query("SELECT *, CASE WHEN status='approved' AND end_date < NOW() THEN 'expired' ELSE status END AS current_status FROM subscriptions WHERE business_id=? ORDER BY created_at DESC", [getBusinessId(req)]); res.json(rows); } catch (err) { next(err); }
}

async function getCurrent(req, res, next) {
  try {
    const { rows } = await query("SELECT *, CASE WHEN end_date < NOW() THEN 'expired' ELSE status END AS current_status FROM subscriptions WHERE business_id=? AND status='approved' ORDER BY end_date DESC LIMIT 1", [getBusinessId(req)]);
    res.json(rows[0] || null);
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const { plan, amount, paymentMethod, phone, checkoutRequestId } = req.body;
    if (!['basic', 'growth', 'erp'].includes(plan)) return res.status(400).json({ message: 'Invalid subscription plan' });
    if (!['mpesa', 'offline'].includes(paymentMethod)) return res.status(400).json({ message: 'Invalid payment method' });
    if (paymentMethod === 'mpesa' && !String(phone || '').trim()) return res.status(400).json({ message: 'Phone number is required for M-Pesa' });
    const { insertId } = await query('INSERT INTO subscriptions (business_id,plan,amount,payment_method,phone,status,checkout_request_id,created_by) VALUES (?,?,?,?,?,?,?,?)', [getBusinessId(req), plan, amount || 0, paymentMethod, phone || null, 'pending', checkoutRequestId || null, req.user.id]);
    const { rows } = await query('SELECT * FROM subscriptions WHERE id=? AND business_id=?', [insertId, getBusinessId(req)]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

async function approve(req, res, next) {
  try {
    const { rowCount } = await query("UPDATE subscriptions SET status='approved', approved_at=NOW(), start_date=NOW(), end_date=DATE_ADD(NOW(), INTERVAL 30 DAY) WHERE id=? AND business_id=?", [req.params.id, getBusinessId(req)]);
    if (!rowCount) return res.status(404).json({ message: 'Subscription request not found' });
    const { rows } = await query('SELECT * FROM subscriptions WHERE id=? AND business_id=?', [req.params.id, getBusinessId(req)]);
    res.json(rows[0]);
  } catch (err) { next(err); }
}

module.exports = { getAll, getCurrent, create, approve };
