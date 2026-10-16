const { query } = require('../config/db');
const { getBusinessId } = require('../utils/tenant');
/**
 * List all suppliers.
 */
async function getAll(req, res, next) {
  try {
    const { rows } = await query('SELECT * FROM suppliers WHERE business_id=? ORDER BY name', [getBusinessId(req)]);
    res.json(rows);
  } catch (err) { next(err); }
}

/**
 * Get a supplier by ID.
 */
async function getOne(req, res, next) {
  try {
    const { rows } = await query('SELECT * FROM suppliers WHERE id=$1 AND business_id=$2', [req.params.id, getBusinessId(req)]);
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
      'INSERT INTO suppliers (business_id,name,email,phone,address,items_supplied) VALUES ($1,$2,$3,$4,$5,$6)',
      [getBusinessId(req), name, email||null, phone||null, address||null, JSON.stringify(itemsSupplied||[])]
    );
    const {rows} = await query (' SELECT * FROM suppliers WHERE id=$1 AND business_id=$2',[insertId, getBusinessId(req)]);
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
  'UPDATE suppliers SET name=$1,email=$2,phone=$3,address=$4,items_supplied=$5,updated_at=NOW() WHERE id=$6 AND business_id=$7',
  [name, email||null, phone||null, address||null, JSON.stringify(itemsSupplied||[]), req.params.id, getBusinessId(req)]
);
if (!rowCount) return res.status(404).json({ message: 'Supplier not found' });
const { rows } = await query('SELECT * FROM suppliers WHERE id=$1 AND business_id=$2', [req.params.id, getBusinessId(req)]);
res.json(rows[0]);
  } catch (err) { next(err); }
}

/**
 * Delete a supplier by ID.
 */
async function remove(req, res, next) {
  try {
    const { rowCount } = await query('DELETE FROM suppliers WHERE id=$1 AND business_id=$2', [req.params.id, getBusinessId(req)]);
    if (!rowCount) return res.status(404).json({ message: 'Supplier not found' });
    res.json({ message: 'Supplier deleted' });
  } catch (err) { next(err); }
}

async function statement(req,res,next){try{const bid=getBusinessId(req);const supplier=(await query('SELECT * FROM suppliers WHERE id=? AND business_id=?',[req.params.id,bid])).rows[0];if(!supplier)return res.status(404).json({message:'Supplier not found'});const purchases=(await query("SELECT * FROM orders WHERE supplier_id=? AND business_id=? AND status='delivered' AND transaction_type='purchase' ORDER BY purchase_date,id",[supplier.id,bid])).rows.map(require('../services/purchases').decorate);const payments=(await query('SELECT p.* FROM purchase_payments p JOIN orders o ON o.id=p.order_id AND o.business_id=p.business_id WHERE o.supplier_id=? AND o.business_id=? ORDER BY p.id DESC',[supplier.id,bid])).rows;res.json({supplier,purchases,payments,balance_due:Number(purchases.reduce((n,p)=>n+p.balance_due,0).toFixed(2))});}catch(e){next(e);}}
module.exports = { getAll, getOne, create, update, remove, statement };
