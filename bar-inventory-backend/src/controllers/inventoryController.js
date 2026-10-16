const { query, getClient } = require('../config/db');
const JournalEngine = require('../models/JournalEngine');
const { getBusinessId } = require('../utils/tenant');

/* GET /api/inventory */
/**
 * Retrieve a list of inventory items.
 * Supports optional `category` and `search` query parameters.
 */
async function getAll(req, res, next) {
  try {
    const { category, search, locationId } = req.query;
    let sql = 'SELECT i.*, s.name AS supplier_name, l.name AS location_name FROM inventory_items i LEFT JOIN suppliers s ON s.id=i.supplier_id AND s.business_id=i.business_id LEFT JOIN locations l ON l.id=i.location_id AND l.business_id=i.business_id WHERE i.business_id=?';
    const params = [getBusinessId(req)];
    if (category) { params.push(category); sql += ' AND i.category=?'; }
    if (search)   { params.push(...Array(3).fill(`%${search}%`)); sql += ' AND (i.name LIKE ? OR i.sku LIKE ? OR i.barcode LIKE ?)'; }
    if (locationId) { params.push(locationId); sql += ' AND i.location_id=?'; }
    sql += ' ORDER BY i.name';
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) { next(err); }
}

/* GET /api/inventory/low-stock */
/**
 * Return items where `stock <= threshold` (low stock alert list).
 */
async function getLowStock(req, res, next) {
  try {
    const { rows } = await query(
      'SELECT * FROM inventory_items WHERE business_id=? AND stock <= threshold ORDER BY stock ASC',
      [getBusinessId(req)]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

/* GET /api/inventory/:id */
/**
 * Get a single inventory item by ID.
 */
async function getOne(req, res, next) {
  try {
    const { rows } = await query(
      'SELECT i.*, s.name AS supplier_name,l.name AS location_name FROM inventory_items i LEFT JOIN suppliers s ON s.id=i.supplier_id AND s.business_id=i.business_id LEFT JOIN locations l ON l.id=i.location_id AND l.business_id=i.business_id WHERE i.id=? AND i.business_id=?',
      [req.params.id, getBusinessId(req)]
    );
    if (!rows.length) return res.status(404).json({ message: 'Item not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function getHistory(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT l.id, l.change_type, (l.after_stock-l.before_stock) AS qty_change, l.before_stock, l.after_stock, l.note,
              l.created_at, u.name AS user_name
         FROM inventory_stock_log l
         LEFT JOIN users u ON u.id=l.user_id
        WHERE l.item_id=? AND EXISTS (SELECT 1 FROM inventory_items i WHERE i.id=l.item_id AND i.business_id=?)
        ORDER BY l.created_at DESC, l.id DESC`,
      [req.params.id, getBusinessId(req)]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

/* POST /api/inventory */
/**
 * Create a new inventory item. Required: `name`. Category is optional.
 */
const {create,update,remove}=require('../services/inventoryCatalog');

/* PATCH /api/inventory/:id/restock */
/**
 * Increase stock for an item by `quantity`.
 * Uses a dedicated connection so BEGIN/COMMIT/ROLLBACK are atomic.
 */
async function restock(req,res){res.status(400).json({message:'Receive supplier stock through Purchases. Use stock correction for a physical-count difference.'});}

/* PATCH /api/inventory/:id/adjustment
 * Post-launch correction only. Opening stock and purchases must use their own workflows.
 */
async function adjustStock(req, res, next) {
  const client = await getClient();
  try {
    const quantity = Number(req.body.quantity);
    const reason = String(req.body.reason || '').trim();
    if (!Number.isInteger(quantity) || quantity === 0) return res.status(400).json({ message: 'quantity must be a non-zero whole number' });
    if (reason.length < 5 || reason.length > 255) return res.status(400).json({ message: 'A correction reason of at least 5 characters is required' });

    await client.query('BEGIN');
    await client.query('SELECT id FROM businesses WHERE id=? FOR UPDATE',[getBusinessId(req)]);
    require('../utils/treasuryPolicy').requestKey(req.body.requestId);
    if(req.body.requestId){const previous=(await client.query('SELECT result_json FROM operation_requests WHERE business_id=? AND operation=? AND request_key=? FOR UPDATE',[getBusinessId(req),`inventory-adjust-${req.params.id}`,req.body.requestId])).rows[0];if(previous?.result_json){await client.query('COMMIT');return res.json({...JSON.parse(typeof previous.result_json==='string'?previous.result_json:JSON.stringify(previous.result_json)),replayed:true});}}
    const { rows } = await client.query('SELECT * FROM inventory_items WHERE id=? AND business_id=? FOR UPDATE', [req.params.id, getBusinessId(req)]);
    if (!rows.length) throw new Error('Item not found');
    const item = rows[0];
    const beforeStock = Number(item.stock);
    const afterStock = beforeStock + quantity;
    if (afterStock < 0) throw new Error('Adjustment would make stock negative');

    if(Math.abs(quantity)>2147483647||afterStock>2147483647)throw new Error('Quantity exceeds the supported stock range');
    const amount = Math.abs(quantity) * Number(item.cost || 0);
    if (amount > 0) {
      await require('../utils/accountingDefaults').ensureMappings([{key:'inventory_asset',code:'1200',name:'Inventory Asset',type:'Assets',normal:'Debit'},{key:'inventory_adjustment',code:'5200',name:'Inventory Adjustment',type:'Expenses',normal:'Debit'}],client);
      const journalId = await JournalEngine.generate('STOCK_ADJUSTMENT', amount, `ADJ-${item.id}-${Date.now()}`, `Stock correction: ${item.name} / ${reason}`, client, { quantity });
      if (!journalId) throw new Error('Set up Inventory Asset and Inventory Adjustment accounts before posting a stock adjustment');
    }

    await client.query('UPDATE inventory_items SET stock=?, updated_at=NOW() WHERE id=? AND business_id=?', [afterStock, item.id, getBusinessId(req)]);
    await client.query(
      'INSERT INTO inventory_stock_log (item_id, change_type, qty_change, before_stock, after_stock, user_id, note) VALUES (?,?,?,?,?,?,?)',
      [item.id, 'adjustment', quantity, beforeStock, afterStock, req.user?.id || null, reason]
    );
    const { rows: updatedRows } = await client.query('SELECT * FROM inventory_items WHERE id=? AND business_id=?', [item.id, getBusinessId(req)]);
    if(req.body.requestId)await client.query('INSERT INTO operation_requests(business_id,operation,request_key,result_json) VALUES (?,?,?,?)',[getBusinessId(req),`inventory-adjust-${item.id}`,req.body.requestId,JSON.stringify(updatedRows[0])]);
    await client.query('COMMIT');
    res.json(updatedRows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    const status = err.message === 'Item not found' ? 404 : 400;
    res.status(status).json({ message: err.message || 'Failed to adjust stock' });
  } finally {
    client.release();
  }
}

/* PATCH /api/inventory/:id/sell */
/**
 * Record a sale for an item: decrease stock, create a sale record, and log inventory movement.
 * Uses a dedicated connection so BEGIN/COMMIT/ROLLBACK are atomic.
 */
async function sell(req,res,next){try{require('../utils/accessPolicy').assertAccess(req.user.access,'/sales','post',req.body);}catch(e){return next(e);}req.body={items:[{itemId:Number(req.params.id),quantity:req.body.quantity??1}],paymentMethod:'cash',note:req.body.note};return require('./salesController').create(req,res,next);}

/* POST /api/inventory/import */
/**
 * Bulk-create inventory items from a parsed spreadsheet.
 * Expects body: { items: [{ name, category, unit, stock, threshold, price, supplierId }] }
 * Inserts each row independently â€” one bad row doesn't block the rest.
 * Returns a summary of created rows and any per-row errors.
 */
const { bulkImport } = require('./inventoryImportController');

module.exports = { getAll, getLowStock, getOne, getHistory, create, update, remove, restock, adjustStock, sell, bulkImport };

