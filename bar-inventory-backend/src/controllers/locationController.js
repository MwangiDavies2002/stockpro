const {assertCapacity}=require('../utils/accessPolicy');
const {loadAccess}=require('../utils/accessService');
const { query, getClient } = require('../config/db');
const { getBusinessId } = require('../utils/tenant');
async function getAll(req, res, next) {
  try {
    const { rows } = await query('SELECT * FROM locations WHERE business_id=? ORDER BY name', [getBusinessId(req)]);
    res.json(rows);
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  const db=await getClient();
  try {
    const { name, address, paymentOptions } = req.body;
    if (!name) return res.status(400).json({ message: 'name is required' });
    await db.query('BEGIN');
    await db.query('SELECT id FROM businesses WHERE id=? FOR UPDATE',[getBusinessId(req)]);
    const {rows:[count]}=await db.query('SELECT COUNT(*) count FROM locations WHERE business_id=?',[getBusinessId(req)]);
    assertCapacity((await loadAccess(req.user,db)).plan,'locations',count.count);
    const { insertId } = await db.query(
      `INSERT INTO locations (business_id,name,address,invoice_scheme_pos,invoice_layout_pos,invoice_scheme_sale,invoice_layout_sale,location_type,payment_options)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        getBusinessId(req), 
        name, 
        address || null, 
        req.body.invoiceSchemePos || 'Default',
        req.body.invoiceLayoutPos || 'Default',
        req.body.invoiceSchemeSale || 'Default',
        req.body.invoiceLayoutSale || 'Default',
        req.body.locationType || 'selling',
        paymentOptions ? JSON.stringify(paymentOptions) : null
      ]
    );
    const { rows } = await db.query('SELECT * FROM locations WHERE id=? AND business_id=?', [insertId, getBusinessId(req)]);
    await db.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (err) { await db.query('ROLLBACK');next(err); } finally {db.release();}
}

async function update(req, res, next) {
  try {
    const { name, address, active, paymentOptions } = req.body;
    const { rowCount } = await query(
      'UPDATE locations SET name=?, address=?, active=?, payment_options=? WHERE id=? AND business_id=?',
      [name, address || null, active ?? true, paymentOptions ? JSON.stringify(paymentOptions) : null, req.params.id, getBusinessId(req)]
    );
    if (!rowCount) return res.status(404).json({ message: 'Location not found' });
    const { rows } = await query('SELECT * FROM locations WHERE id=? AND business_id=?', [req.params.id, getBusinessId(req)]);
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    if (Number(req.params.id) === 1) {
      return res.status(400).json({ message: 'Cannot delete the default location' });
    }
    const used=await query('SELECT user_id FROM user_locations WHERE location_id=? AND business_id=?',[req.params.id,getBusinessId(req)]);
    if(used.rows.length)return res.status(409).json({message:'Reassign members before deleting this location'});
    const products=await query('SELECT id FROM inventory_items WHERE location_id=? AND business_id=? LIMIT 1',[req.params.id,getBusinessId(req)]);
    if(products.rows.length)return res.status(409).json({message:'Move or remove products before deleting this location'});
    const { rowCount } = await query('DELETE FROM locations WHERE id=? AND business_id=?', [req.params.id, getBusinessId(req)]);
    if (!rowCount) return res.status(404).json({ message: 'Location not found' });
    res.json({ message: 'Location deleted' });
  } catch (err) { next(err); }
}

/* GET /api/locations/:id/summary */
/**
 * Per-location snapshot: stock count, low stock count, revenue (30d).
 */
async function summary(req, res, next) {
  try {
    const locationId = req.params.id;
    const stockRes = await query(
      'SELECT COUNT(*) AS total, SUM(CASE WHEN stock<=threshold THEN 1 ELSE 0 END) AS low FROM inventory_items WHERE location_id=? AND business_id=?',
      [locationId, getBusinessId(req)]
    );
    const revenueRes = await query(
      "SELECT COALESCE(SUM(total),0) AS revenue, COUNT(*) AS sale_count FROM sales WHERE location_id=? AND business_id=? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)",
      [locationId, getBusinessId(req)]
    );
    res.json({
      totalProducts: Number(stockRes.rows[0].total),
      lowStockCount: Number(stockRes.rows[0].low),
      revenue30d: Number(revenueRes.rows[0].revenue),
      sales30d: Number(revenueRes.rows[0].sale_count),
    });
  } catch (err) { next(err); }
}

module.exports = { getAll, create, update, remove, summary };
