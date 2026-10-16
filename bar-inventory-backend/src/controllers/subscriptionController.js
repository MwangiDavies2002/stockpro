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
    const { plan, amount, paymentMethod, phone, checkoutRequestId, couponCode } = req.body;
    if (!['mpesa', 'offline'].includes(paymentMethod)) return res.status(400).json({ message: 'Invalid payment method' });
    if (paymentMethod === 'mpesa' && !String(phone || '').trim()) return res.status(400).json({ message: 'Phone number is required for M-Pesa' });
    const catalog=require('../utils/platformCatalog');
    let quote=paymentMethod==='offline'?await catalog.subscriptionQuote(plan,couponCode,getBusinessId(req)):null;
    let expected=quote?.amount;
    await client.query('BEGIN');let verified=false;
    if(paymentMethod==='mpesa'){
      const {rows:[payment]}=await client.query("SELECT * FROM mpesa_payments WHERE transaction_id=? AND business_id=? AND purpose='subscription' FOR UPDATE",[checkoutRequestId,getBusinessId(req)]);
      if(payment){const payload=require('../utils/accessPolicy').parse(payment.payload_json,{});quote=payload.kind==='subscription'?payload.quote:await catalog.subscriptionQuote(plan,couponCode,getBusinessId(req));if(quote.plan!==plan||quote.couponCode!==(couponCode?String(couponCode).trim().toUpperCase():null))throw Object.assign(new Error('Payment request must match the package and coupon'),{status:400});expected=quote.amount;}
      if(!payment||Number(payment.amount)!==expected)throw Object.assign(new Error('Subscription requires a matching shop-owned payment request'),{status:400});
      verified=payment.status==='completed'&&!!payment.verified_at;
      const existing=await client.query('SELECT * FROM subscriptions WHERE checkout_request_id=? AND business_id=?',[checkoutRequestId,getBusinessId(req)]);
      if(existing.rows.length){await client.query('COMMIT');return res.status(201).json({...existing.rows[0],replayed:true});}
    }
    const { insertId } = await client.query('INSERT INTO subscriptions (business_id,plan,amount,payment_method,phone,status,checkout_request_id,created_by,original_amount,coupon_code) VALUES (?,?,?,?,?,?,?,?,?,?)', [getBusinessId(req), plan, expected, paymentMethod, phone || null, 'pending', checkoutRequestId || null, req.user.id,quote.originalAmount,quote.couponCode]);
    if(verified)await client.query("UPDATE subscriptions SET status='approved',approved_at=NOW(),start_date=NOW(),end_date=DATE_ADD(NOW(),INTERVAL 30 DAY) WHERE id=? AND business_id=?",[insertId,getBusinessId(req)]);
    await client.query('COMMIT');
    const { rows } = await query('SELECT * FROM subscriptions WHERE id=? AND business_id=?', [insertId, getBusinessId(req)]);
    res.status(201).json(rows[0]);
  } catch (err) { await client.query('ROLLBACK');next(err); }finally{client.release();}
}

function approve(req,res){return res.status(403).json({message:'Manage subscription approvals from the Superadmin area'});}

module.exports = { getAll, getCurrent, create, approve };
