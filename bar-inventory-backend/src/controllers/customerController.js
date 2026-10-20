const { query, getClient } = require('../config/db');
const { getBusinessId } = require('../utils/tenant');
const JournalEngine = require('../models/JournalEngine');
const crypto = require('node:crypto');

function contactText(value, max, label) {
  if (value !== undefined && value !== null && typeof value === 'object') throw Object.assign(new Error(`Invalid ${label}`), { status: 400 });
  const text = String(value ?? '').trim();
  if (text.length > max) throw Object.assign(new Error(`${label} must be ${max} characters or fewer`), { status: 400 });
  return text || null;
}

async function getAll(req, res, next) {
  try {
    const { rows } = await query(`SELECT c.*,COALESCE((SELECT SUM(s.total) DIV 100 FROM sales s WHERE s.customer_id=c.id AND s.business_id=c.business_id),0)-COALESCE((SELECT SUM(r.points) FROM loyalty_redemptions r WHERE r.customer_id=c.id AND r.business_id=c.business_id),0) AS points FROM customers c WHERE c.business_id=? ORDER BY c.name`, [getBusinessId(req)]);
    rows.forEach(c => { c.tier = Number(c.points) >= 1000 ? 'VIP' : Number(c.points) >= 500 ? 'Gold' : Number(c.points) >= 100 ? 'Silver' : 'Member'; });
    res.json(rows);
  } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  try {
    const { rows } = await query('SELECT * FROM customers WHERE id=? AND business_id=?', [req.params.id, getBusinessId(req)]);
    if (!rows.length) return res.status(404).json({ message: 'Customer not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  const client = await getClient();
  try {
    const name = contactText(req.body.name,150,'Name');
    if (!name) return res.status(400).json({ message: 'name is required' });
    const creditLimit=Number(req.body.creditLimit||0);
    if(!Number.isFinite(creditLimit)||creditLimit<0||creditLimit>99999999.99) return res.status(400).json({message:'Credit limit must be between 0 and 99,999,999.99'});
    const openingBalance=Number(req.body.openingBalance||0);
    if(!Number.isFinite(openingBalance)||openingBalance<0||openingBalance>99999999.99) return res.status(400).json({message:'Opening balance must be between 0 and 99,999,999.99'});
    const termValue=req.body.paymentTermValue===''||req.body.paymentTermValue==null?null:Number(req.body.paymentTermValue);
    const termUnit=contactText(req.body.paymentTermUnit,20,'Payment term unit');
    if(termValue!==null&&(!Number.isInteger(termValue)||termValue<1||termValue>9999))return res.status(400).json({message:'Payment term must be a whole number between 1 and 9,999'});
    if((termValue===null)!==(termUnit===null)||termUnit&&!['days','weeks','months'].includes(termUnit.toLowerCase()))return res.status(400).json({message:'Choose a valid payment term and unit'});
    const entityType=['individual','business'].includes(req.body.entityType)?req.body.entityType:'individual';
    const currencyCode=(contactText(req.body.currencyCode,3,'Currency')||'KES').toUpperCase();
    if(!/^[A-Z]{3}$/.test(currencyCode))return res.status(400).json({message:'Choose a valid three-letter currency code'});
    const contactId=contactText(req.body.contactId,40,'Contact ID')||`CUS-${crypto.randomUUID().toUpperCase()}`;
    const fields={contact_type:'customer',entity_type:entityType,contact_id:contactId,customer_group:contactText(req.body.customerGroup,100,'Customer group'),currency_code:currencyCode,alternate_phone:contactText(req.body.alternatePhone,20,'Alternate phone'),landline:contactText(req.body.landline,20,'Landline'),email:contactText(req.body.email,150,'Email'),assigned_to:contactText(req.body.assignedTo,120,'Assigned to'),account_type:contactText(req.body.accountType,30,'Account type'),tax_number:contactText(req.body.taxNumber,50,'Tax number'),address_line1:contactText(req.body.addressLine1,200,'Address line 1'),address_line2:contactText(req.body.addressLine2,200,'Address line 2'),city:contactText(req.body.city,100,'City'),state:contactText(req.body.state,100,'State'),country:contactText(req.body.country,100,'Country'),zip_code:contactText(req.body.zipCode,20,'Postal code'),landmark:contactText(req.body.landmark,150,'Landmark'),street_name:contactText(req.body.streetName,150,'Street name'),building_number:contactText(req.body.buildingNumber,50,'Building number'),additional_number:contactText(req.body.additionalNumber,50,'Additional number'),id_number:contactText(req.body.idNumber,80,'ID number'),payment_term_value:termValue,payment_term_unit:termUnit?.toLowerCase()||null};
    for(let i=1;i<=10;i++)fields[`custom_field_${i}`]=contactText(req.body[`customField${i}`],200,`Custom field ${i}`);
    if(fields.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email))return res.status(400).json({message:'Enter a valid email address'});
    const businessId=getBusinessId(req);
    await client.query('BEGIN');
    if((await client.query('SELECT id FROM customers WHERE business_id=? AND contact_id=?',[businessId,contactId])).rows.length){await client.query('ROLLBACK');return res.status(409).json({message:'Contact ID is already in use'});}
    const { insertId } = await client.query(
      `INSERT INTO customers (business_id,name,phone,credit_limit,balance,opening_balance,${Object.keys(fields).join(',')}) VALUES (${Array(6+Object.keys(fields).length).fill('?').join(',')})`,
      [businessId, name, contactText(req.body.phone,20,'Mobile')||null, creditLimit, openingBalance, openingBalance, ...Object.values(fields)]
    );
    // Use the same connection for the contact and opening journal, so a ledger
    // configuration error cannot leave an unbalanced customer balance behind.
    if(openingBalance>0){
      const maps=await require('../utils/accountingDefaults').ensureSalesAccountingMappings(client);
      const equity=await require('../utils/accountingDefaults').openingEquity(client,businessId);
      await require('../models/Journal').create({posting_date:new Date().toISOString().slice(0,10),description:`Opening customer balance: ${name}`,reference:`OPEN-CUSTOMER-${insertId}`,entry_type:'opening_balance',created_by:req.user?.id||null},[{account_id:maps.sales_receivable,debit:openingBalance,credit:0,description:`Opening receivable - ${name}`},{account_id:equity.id,debit:0,credit:openingBalance,description:'Opening Balance Equity'}],client);
    }
    const { rows } = await client.query('SELECT * FROM customers WHERE id=? AND business_id=?', [insertId, businessId]);
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) { try{await client.query('ROLLBACK');}catch{} next(err); }
  finally { client.release(); }
}

async function update(req, res, next) {
  try {
    const { name, phone, creditLimit, active } = req.body;
    const { rowCount } = await query(
      'UPDATE customers SET name=?, phone=?, credit_limit=?, active=? WHERE id=? AND business_id=?',
      [name, phone || null, creditLimit || 0, active ?? true, req.params.id, getBusinessId(req)]
    );
    if (!rowCount) return res.status(404).json({ message: 'Customer not found' });
    const { rows } = await query('SELECT * FROM customers WHERE id=? AND business_id=?', [req.params.id, getBusinessId(req)]);
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
      "SELECT id, total, created_at, notes FROM sales WHERE customer_id=? AND business_id=? ORDER BY created_at DESC",
      [req.params.id, getBusinessId(req)]
    );
    const { rows: payments } = await query(
      'SELECT id, amount, method, notes, created_at FROM customer_payments WHERE customer_id=? AND business_id=? ORDER BY created_at DESC',
      [req.params.id, getBusinessId(req)]
    );
    const { rows: customerRows } = await query('SELECT * FROM customers WHERE id=? AND business_id=?', [req.params.id, getBusinessId(req)]);
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
    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ message: 'amount must be greater than 0' });
    }

    await client.query('BEGIN');
    const custRes = await client.query('SELECT balance FROM customers WHERE id=? AND business_id=? FOR UPDATE', [req.params.id, getBusinessId(req)]);
    if (!custRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Customer not found' });
    }

    if (Number(amount) > Number(custRes.rows[0].balance)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Payment cannot exceed the outstanding customer balance' });
    }
    await client.query(
      'INSERT INTO customer_payments (business_id, customer_id, amount, method, notes, created_by) VALUES (?,?,?,?,?,?)',
      [getBusinessId(req), req.params.id, amount, method || 'cash', notes || null, req.user?.id || null]
    );
    await client.query('UPDATE customers SET balance = balance - ? WHERE id=? AND business_id=?', [amount, req.params.id, getBusinessId(req)]);
    
    // Journal Entry for Debt Payment
    const paymentData = {};
    if (method === 'mpesa') paymentData.settingKey = 'payment_mobile';
    else if (method === 'bank') paymentData.settingKey = 'payment_bank';
    // If we have a specific treasuryId from the UI, we could use it too
    // For now, let JournalEngine handle the mapping based on type/method

    await JournalEngine.generate('DEBT_PAYMENT', amount, `Payment from Cust #${req.params.id}`, notes || 'Customer Payment', client, paymentData);

    const { rows } = await client.query('SELECT * FROM customers WHERE id=? AND business_id=?', [req.params.id, getBusinessId(req)]);
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
