const { query } = require('../config/db');
const { getBusinessId } = require('../utils/tenant');

function badRequest(message) { return Object.assign(new Error(message), { status: 400 }); }

function validate(body) {
  const locationId = Number(body.locationId ?? body.location_id);
  const name = String(body.name || '').trim();
  const discountType = String(body.discountType ?? body.discount_type ?? 'percent');
  const value = Number(body.value);
  const appliesTo = String(body.appliesTo ?? body.applies_to ?? 'product');
  if (!Number.isInteger(locationId) || locationId <= 0) throw badRequest('Business location is required');
  if (!name) throw badRequest('Name is required');
  if (!['percent', 'fixed'].includes(discountType)) throw badRequest('Discount type must be percent or fixed');
  if (!Number.isFinite(value) || value <= 0 || (discountType === 'percent' && value > 100)) throw badRequest('Discount value is invalid');
  if (!['product', 'category', 'customer'].includes(appliesTo)) throw badRequest('Discount applies-to value is invalid');
  const target = appliesTo === 'product' ? body.productId ?? body.product_id : appliesTo === 'category' ? body.categoryId ?? body.category_id : body.customerId ?? body.customer_id;
  if (!Number.isInteger(Number(target)) || Number(target)<1) throw badRequest('Choose the product, category or customer this discount applies to');
  const restriction = body.customerRestrictionId ?? body.customer_restriction_id;
  if (restriction !== undefined && restriction !== null && restriction !== '' && (!Number.isInteger(Number(restriction)) || Number(restriction) < 1)) throw badRequest('Choose a valid customer restriction');
  return {
    locationId, name, discountType, value, appliesTo,
    productId: body.productId || body.product_id ? Number(body.productId ?? body.product_id) : null,
    categoryId: body.categoryId || body.category_id ? Number(body.categoryId ?? body.category_id) : null,
    customerId: body.customerId || body.customer_id ? Number(body.customerId ?? body.customer_id) : null,
    customerRestrictionId: body.customerRestrictionId || body.customer_restriction_id ? Number(body.customerRestrictionId ?? body.customer_restriction_id) : null,
    active: body.active !== false && Number(body.active) !== 0,
  };
}

async function list(req, res, next) {
  try {
    const params = [getBusinessId(req)];
    let sql = `SELECT d.*, i.name AS product_name, c.name AS category_name, cu.name AS customer_name, cr.name AS customer_restriction_name
               FROM discounts d
               LEFT JOIN inventory_items i ON i.id=d.product_id
               LEFT JOIN categories c ON c.id=d.category_id
               LEFT JOIN customers cu ON cu.id=d.customer_id
               LEFT JOIN customers cr ON cr.id=d.customer_restriction_id
               WHERE d.business_id=?`;
    if (req.query.locationId) { params.push(req.query.locationId); sql += ' AND d.location_id=?'; }
    sql += ' ORDER BY d.active DESC, d.name';
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const d = validate(req.body);
    await validateTarget(d,getBusinessId(req));
    const { insertId } = await query(
      `INSERT INTO discounts (business_id,location_id,name,discount_type,value,applies_to,product_id,category_id,customer_id,customer_restriction_id,active)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [getBusinessId(req), d.locationId, d.name, d.discountType, d.value, d.appliesTo, d.productId, d.categoryId, d.customerId, d.customerRestrictionId, d.active]
    );
    const { rows } = await query('SELECT * FROM discounts WHERE id=? AND business_id=?', [insertId, getBusinessId(req)]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const d = validate(req.body);
    await validateTarget(d,getBusinessId(req));
    const { rowCount } = await query(
      `UPDATE discounts SET location_id=?,name=?,discount_type=?,value=?,applies_to=?,product_id=?,category_id=?,customer_id=?,customer_restriction_id=?,active=?,updated_at=NOW()
       WHERE id=? AND business_id=?`,
      [d.locationId, d.name, d.discountType, d.value, d.appliesTo, d.productId, d.categoryId, d.customerId, d.customerRestrictionId, d.active, req.params.id, getBusinessId(req)]
    );
    if (!rowCount) return res.status(404).json({ message: 'Discount not found' });
    const { rows } = await query('SELECT * FROM discounts WHERE id=? AND business_id=?', [req.params.id, getBusinessId(req)]);
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function validateTarget(d,businessId) {
  const table = d.appliesTo==='product'?'inventory_items':d.appliesTo==='category'?'categories':'customers';
  const id = d.appliesTo==='product'?d.productId:d.appliesTo==='category'?d.categoryId:d.customerId;
  const {rows}=await query(`SELECT id FROM ${table} WHERE id=? AND business_id=?${table==='customers'?'':' AND location_id=?'}`,table==='customers'?[id,businessId]:[id,businessId,d.locationId]);
  if(!rows.length) throw badRequest('Discount target must belong to the selected shop location');
  if (d.customerRestrictionId) {
    if (d.appliesTo === 'customer') throw badRequest('A customer-only discount cannot have a second customer restriction');
    const { rows: customerRows } = await query('SELECT id FROM customers WHERE id=? AND business_id=?', [d.customerRestrictionId, businessId]);
    if (!customerRows.length) throw badRequest('Discount customer must belong to this business');
  }
}

async function remove(req, res, next) {
  try {
    const { rowCount } = await query('DELETE FROM discounts WHERE id=? AND business_id=?', [req.params.id, getBusinessId(req)]);
    if (!rowCount) return res.status(404).json({ message: 'Discount not found' });
    res.json({ message: 'Discount deleted' });
  } catch (err) { next(err); }
}

module.exports = { list, create, update, remove };
