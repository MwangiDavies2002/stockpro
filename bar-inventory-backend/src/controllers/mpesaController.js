const axios  = require('axios');
const { query, db } = require('../config/db');

const PRICE_GROUPS = [
  { label:'Micro',  min:0,    max:50   },
  { label:'Small',  min:51,   max:500  },
  { label:'Medium', min:501,  max:1000 },
  { label:'Large',  min:1001, max:2500 },
];

function getPriceGroup(amount) {
  for (const g of PRICE_GROUPS) {
    if (amount >= g.min && amount <= g.max) return g.label;
  }
  return 'Other';
}

/* Get M-Pesa OAuth token */
async function getMpesaToken() {
  const { MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_ENV } = process.env;
  const base = MPESA_ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
  const creds = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString('base64');
  const { data } = await axios.get(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${creds}` },
  });
  return { token: data.access_token, base };
}

/* POST /api/mpesa/stk-push */
async function stkPush(req, res, next) {
  try {
    const { phone, amount, itemId } = req.body;
    if (!phone || !amount) return res.status(400).json({ message: 'phone and amount required' });

    const { token, base }  = await getMpesaToken();
    const shortcode        = process.env.MPESA_SHORTCODE;
    const passkey          = process.env.MPESA_PASSKEY;
    const timestamp        = new Date().toISOString().replace(/[-T:.Z]/g,'').slice(0,14);
    const password         = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
    const callbackUrl      = process.env.MPESA_CALLBACK_URL;
    const formattedPhone   = phone.replace(/^0/, '254');

    const { data } = await axios.post(`${base}/mpesa/stkpush/v1/processrequest`, {
      BusinessShortCode: shortcode,
      Password:          password,
      Timestamp:         timestamp,
      TransactionType:   'CustomerPayBillOnline',
      Amount:            Math.ceil(amount),
      PartyA:            formattedPhone,
      PartyB:            shortcode,
      PhoneNumber:       formattedPhone,
      CallBackURL:       callbackUrl,
      AccountReference:  itemId ? String(itemId) : (req.body.itemName || 'BarStock'),
      TransactionDesc:   req.body.itemName ? `Payment for ${req.body.itemName}` : 'Bar payment',
    }, { headers: { Authorization: `Bearer ${token}` } });

    res.json({ checkoutRequestId: data.CheckoutRequestID, message: 'STK push sent' });
  } catch (err) {
    next(err);
  }
}

/* POST /api/mpesa/callback  — called by Safaricom */
async function callback(req, res, next) {
  try {
    const body   = req.body?.Body?.stkCallback;
    if (!body)   return res.json({ ResultCode:0, ResultDesc:'Accepted' });

    const { ResultCode, CallbackMetadata, CheckoutRequestID } = body;
    if (ResultCode !== 0) {
      console.log('M-Pesa STK failed:', body.ResultDesc);
      return res.json({ ResultCode:0, ResultDesc:'Accepted' });
    }

    const items  = CallbackMetadata?.Item || [];
    const get    = (name) => items.find(i => i.Name === name)?.Value;
    const amount = parseFloat(get('Amount'));
    const receipt= get('MpesaReceiptNumber');
    const phone  = String(get('PhoneNumber'));
    const group  = getPriceGroup(amount);

    // Store the payment (basic fields)
    await query(
      `INSERT INTO mpesa_payments (transaction_id,phone,amount,price_group,mpesa_receipt,status)
       VALUES ($1,$2,$3,$4,$5,'completed')`,
      [CheckoutRequestID, phone, amount, group, receipt]
    );

    // Attempt to extract a reference from metadata to map to an inventory item
    const ref = get('AccountReference') || get('BillRefNumber') || get('Reference') || get('Item') || get('ItemName') || get('MpesaReference');
    if (ref) {
      let item = null;
      // If numeric, try to match by id
      if (/^\d+$/.test(String(ref))) {
        item = db.selectOne('inventory_items', { id: Number(ref) });
      }
      // Exact name match
      if (!item) {
        item = db.selectOne('inventory_items', { name: String(ref) });
      }
      // Partial, case-insensitive match
      if (!item) {
        const all = db.select('inventory_items');
        const lowerRef = String(ref).toLowerCase();
        item = all.find(i => i.name && i.name.toLowerCase().includes(lowerRef));
      }

      if (item) {
        // Decrement stock by 1 (or by quantity if metadata includes Quantity)
        const qty = parseInt(get('Quantity')) || 1;
        const newStock = Math.max(0, (item.stock || 0) - qty);
        const newSold  = (item.sold || 0) + qty;
        db.update('inventory_items', { stock: newStock, sold: newSold }, { id: item.id });

        // Attach item info to the payment record
        db.update('mpesa_payments', { item_id: item.id, item_name: item.name }, { transaction_id: CheckoutRequestID });
        console.log(`Mapped payment ${CheckoutRequestID} -> item ${item.id} (${item.name}), qty ${qty}`);
      } else {
        console.log('MPesa callback reference not matched to inventory:', ref);
      }
    } else {
      console.log('No reference found in MPesa callback metadata');
    }

    res.json({ ResultCode:0, ResultDesc:'Accepted' });
  } catch (err) { next(err); }
}

/* GET /api/mpesa/payments */
async function getPayments(req, res, next) {
  try {
    const { period } = req.query; // 'week' | 'two-week' | 'month'
    const days = period === 'month' ? 30 : period === 'two-week' ? 14 : 7;
    const { rows } = await query(`
      SELECT mp.*, i.name AS item_name
      FROM mpesa_payments mp
      LEFT JOIN inventory_items i ON i.id=mp.item_id
      WHERE mp.created_at >= NOW() - ($1 || ' days')::interval
      ORDER BY mp.created_at DESC
    `, [days]);
    res.json(rows);
  } catch (err) { next(err); }
}

/* GET /api/mpesa/groups */
async function getGroups(req, res, next) {
  try {
    const { rows } = await query(`
      SELECT price_group, COUNT(*)::int AS count, SUM(amount)::numeric AS total
      FROM mpesa_payments
      WHERE created_at >= NOW() - interval '30 days'
      GROUP BY price_group
    `);
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = { stkPush, callback, getPayments, getGroups };
