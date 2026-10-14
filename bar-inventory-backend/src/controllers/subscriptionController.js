const { query, getClient } = require('../config/db');
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
  const client=await getClient();
  try {
    const { plan, amount, paymentMethod, phone, checkoutRequestId } = req.body;
    if (!['basic', 'growth', 'erp'].includes(plan)) return res.status(400).json({ message: 'Invalid subscription plan' });
    if (!['mpesa', 'offline'].includes(paymentMethod)) return res.status(400).json({ message: 'Invalid payment method' });
    if (paymentMethod === 'mpesa' && !String(phone || '').trim()) return res.status(400).json({ message: 'Phone number is required for M-Pesa' });
    const prices={basic:1000,growth:5000,erp:30000};const expected=prices[plan];
    await client.query('BEGIN');let verified=false;
    if(paymentMethod==='mpesa'){
      const {rows:[payment]}=await client.query("SELECT * FROM mpesa_payments WHERE transaction_id=? AND business_id=? AND purpose='subscription' FOR UPDATE",[checkoutRequestId,getBusinessId(req)]);
      if(!payment||Number(payment.amount)!==expected)throw Object.assign(new Error('Subscription requires a matching shop-owned payment request'),{status:400});
      verified=payment.status==='completed'&&!!payment.verified_at;
      const existing=await client.query('SELECT * FROM subscriptions WHERE checkout_request_id=? AND business_id=?',[checkoutRequestId,getBusinessId(req)]);
      if(existing.rows.length){await client.query('COMMIT');return res.status(201).json({...existing.rows[0],replayed:true});}
    }
    const { insertId } = await client.query('INSERT INTO subscriptions (business_id,plan,amount,payment_method,phone,status,checkout_request_id,created_by) VALUES (?,?,?,?,?,?,?,?)', [getBusinessId(req), plan, expected, paymentMethod, phone || null, 'pending', checkoutRequestId || null, req.user.id]);
    if(verified)await client.query("UPDATE subscriptions SET status='approved',approved_at=NOW(),start_date=NOW(),end_date=DATE_ADD(NOW(),INTERVAL 30 DAY) WHERE id=? AND business_id=?",[insertId,getBusinessId(req)]);
    await client.query('COMMIT');
    const { rows } = await query('SELECT * FROM subscriptions WHERE id=? AND business_id=?', [insertId, getBusinessId(req)]);
    res.status(201).json(rows[0]);
  } catch (err) { await client.query('ROLLBACK');next(err); }finally{client.release();}
}

async function approve(req, res, next) {
  try {
    const allowed=(process.env.SUBSCRIPTION_APPROVER_EMAILS||'').toLowerCase().split(',').map(value=>value.trim()).filter(Boolean);
    if(!allowed.includes(String(req.user.email||'').toLowerCase()))return res.status(403).json({message:'Subscription approval requires a configured billing operator'});
    const{rows:[request]}=await query('SELECT * FROM subscriptions WHERE id=? AND business_id=?',[req.params.id,getBusinessId(req)]);
    if(!request||request.payment_method!=='offline')return res.status(400).json({message:'M-Pesa subscriptions activate only after verified provider confirmation'});
    if(request.status!=='pending')return res.status(400).json({message:'This subscription request has already been processed'});
    const { rowCount } = await query("UPDATE subscriptions SET status='approved', approved_at=NOW(), start_date=NOW(), end_date=DATE_ADD(NOW(), INTERVAL 30 DAY) WHERE id=? AND business_id=? AND status='pending'", [req.params.id, getBusinessId(req)]);
    if (!rowCount) return res.status(404).json({ message: 'Subscription request not found' });
    const { rows } = await query('SELECT * FROM subscriptions WHERE id=? AND business_id=?', [req.params.id, getBusinessId(req)]);
    res.json(rows[0]);
  } catch (err) { next(err); }
}

module.exports = { getAll, getCurrent, create, approve };
