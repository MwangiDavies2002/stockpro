const { query, getClient } = require('../config/db');
const { sendLowStockAlert } = require('../utils/notifications');

/* GET /api/inventory */
/**
 * Retrieve a list of inventory items.
 * Supports optional `category` and `search` query parameters.
 */
async function getAll(req, res, next) {
  try {
    const { category, search } = req.query;
    let sql = 'SELECT i.*, s.name AS supplier_name FROM inventory_items i LEFT JOIN suppliers s ON s.id=i.supplier_id WHERE 1=1';
    const params = [];
    if (category) { params.push(category); sql += ' AND i.category=?'; }
    if (search)   { params.push(`%${search}%`); sql += ' AND i.name LIKE ?'; }
    sql += ' ORDER BY i.name';
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) { next(err); }
}

/* GET /api/inventory/low-stock */
/**
 * Return items where `stock <= threshold` (low stock alert list).
 */
async function getLowStock(_req, res, next) {
  try {
    const { rows } = await query(
      'SELECT * FROM inventory_items WHERE stock <= threshold ORDER BY stock ASC'
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
      'SELECT i.*, s.name AS supplier_name FROM inventory_items i LEFT JOIN suppliers s ON s.id=i.supplier_id WHERE i.id=?',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Item not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

/* POST /api/inventory */
/**
 * Create a new inventory item. Required: `name`, `category`.
 */
async function create(req, res, next) {
  try {
    const { name, category, unit, stock, threshold, price, supplierId } = req.body;
    if (!name || !category) return res.status(400).json({ message: 'name and category are required' });
    const { insertId } = await query(
      'INSERT INTO inventory_items (name,category,unit,stock,threshold,price,supplier_id) VALUES (?,?,?,?,?,?,?)',
      [name, category, unit || 'Bottles', stock || 0, threshold || 5, price || 0, supplierId || null]
    );
    const { rows } = await query('SELECT * FROM inventory_items WHERE id=?', [insertId]);
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

/* PUT /api/inventory/:id */
/**
 * Update an existing inventory item by ID.
 */
async function update(req, res, next) {
  try {
    const { name, category, unit, stock, threshold, price, supplierId } = req.body;
    const { rowCount } = await query(
      `UPDATE inventory_items
       SET name=?,category=?,unit=?,stock=?,threshold=?,price=?,supplier_id=?,updated_at=NOW()
       WHERE id=?`,
      [name, category, unit, stock, threshold, price, supplierId || null, req.params.id]
    );
    if (!rowCount) return res.status(404).json({ message: 'Item not found' });
    const { rows } = await query('SELECT * FROM inventory_items WHERE id=?', [req.params.id]);
    res.json(rows[0]);
  } catch (err) { next(err); }
}

/* DELETE /api/inventory/:id */
/**
 * Delete an inventory item by ID.
 */
async function remove(req, res, next) {
  try {
    const { rowCount } = await query('DELETE FROM inventory_items WHERE id=?', [req.params.id]);
    if (!rowCount) return res.status(404).json({ message: 'Item not found' });
    res.json({ message: 'Item deleted' });
  } catch (err) { next(err); }
}

/* PATCH /api/inventory/:id/restock */
/**
 * Increase stock for an item by `quantity`.
 * Uses a dedicated connection so BEGIN/COMMIT/ROLLBACK are atomic.
 */
async function restock(req, res, next) {
  const client = await getClient();
  try {
    const { quantity, note } = req.body;
    if (!quantity || quantity < 1) return res.status(400).json({ message: 'quantity must be >= 1' });

    const check = await client.query('SELECT stock, threshold, name FROM inventory_items WHERE id=?', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ message: 'Item not found' });
    const beforeStock = check.rows[0].stock;

    await client.query('BEGIN');
    await client.query(
      'UPDATE inventory_items SET stock=stock+?,updated_at=NOW() WHERE id=?',
      [quantity, req.params.id]
    );
    const { rows: [item] } = await client.query('SELECT * FROM inventory_items WHERE id=?', [req.params.id]);

    await client.query(
      'INSERT INTO inventory_stock_log (item_id, change_type, qty_change, before_stock, after_stock, user_id, note) VALUES (?,?,?,?,?,?,?)',
      [req.params.id, 'restock', quantity, beforeStock, item.stock, req.user?.id || null, note || 'Stock restocked']
    );
    await client.query('COMMIT');
    res.json(item);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

/* PATCH /api/inventory/:id/sell */
/**
 * Record a sale for an item: decrease stock, create a sale record, and log inventory movement.
 * Uses a dedicated connection so BEGIN/COMMIT/ROLLBACK are atomic.
 */
async function sell(req, res, next) {
  const client = await getClient();
  try {
    const quantity = Number(req.body.quantity || 1);
    if (!Number.isInteger(quantity) || quantity < 1) return res.status(400).json({ message: 'quantity must be a positive integer' });

    const check = await client.query('SELECT stock, threshold, name, price FROM inventory_items WHERE id=?', [req.params.id]);
    if (!check.rows.length) return res.status(404).json({ message: 'Item not found' });
    const item = check.rows[0];
    if (item.stock < quantity) return res.status(400).json({ message: 'Insufficient stock' });

    await client.query('BEGIN');
    const total = (item.price || 0) * quantity;
    const { insertId: saleId } = await client.query(
      'INSERT INTO sales (total, created_by, notes) VALUES (?,?,?)',
      [total, req.user?.id || null, req.body.note || 'Sale recorded']
    );
    const { rows: [sale] } = await client.query('SELECT * FROM sales WHERE id=?', [saleId]);

    await client.query(
      'INSERT INTO sale_items (sale_id, item_id, item_name, quantity, unit_price) VALUES (?,?,?,?,?)',
      [sale.id, req.params.id, item.name, quantity, item.price || 0]
    );

    await client.query(
      'UPDATE inventory_items SET stock=stock-?,sold=sold+?,updated_at=NOW() WHERE id=?',
      [quantity, quantity, req.params.id]
    );
    const { rows: [updatedItem] } = await client.query('SELECT * FROM inventory_items WHERE id=?', [req.params.id]);

    await client.query(
      'INSERT INTO inventory_stock_log (item_id, change_type, qty_change, before_stock, after_stock, user_id, note) VALUES (?,?,?,?,?,?,?)',
      [req.params.id, 'sale', quantity, item.stock, updatedItem.stock, req.user?.id || null, req.body.note || 'Sale transaction']
    );

    await client.query('COMMIT');
    if (updatedItem.stock <= updatedItem.threshold) {
      await sendLowStockAlert(updatedItem).catch(() => {});
    }

    res.json({ sale, item: updatedItem });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

/* POST /api/inventory/import */
/**
 * Bulk-create inventory items from a parsed spreadsheet.
 * Expects body: { items: [{ name, category, unit, stock, threshold, price, supplierId }] }
 * Inserts each row independently — one bad row doesn't block the rest.
 * Returns a summary of created rows and any per-row errors.
 */
async function bulkImport(req, res, next) {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ message: 'No items to import' });
    }

    const created = [];
    const errors = [];

    for (let i = 0; i < items.length; i++) {
      const row = items[i];
      const rowNum = i + 2; // +2 accounts for header row + 1-index
      try {
        const name = String(row.name || '').trim();
        const category = String(row.category || '').trim();
        if (!name || !category) {
          errors.push({ row: rowNum, name: name || '(blank)', message: 'name and category are required' });
          continue;
        }
        const unit = String(row.unit || 'Bottles').trim();
        const stock = Number(row.stock) || 0;
        const threshold = Number(row.threshold) || 5;
        const price = Number(row.price) || 0;
        const supplierId = row.supplierId ? Number(row.supplierId) : null;

        const { insertId } = await query(
          'INSERT INTO inventory_items (name,category,unit,stock,threshold,price,supplier_id) VALUES (?,?,?,?,?,?,?)',
          [name, category, unit, stock, threshold, price, supplierId]
        );
        created.push({ row: rowNum, id: insertId, name });
      } catch (rowErr) {
        errors.push({ row: rowNum, name: row.name || '(blank)', message: rowErr.message });
      }
    }

    res.status(errors.length === items.length ? 400 : 201).json({
      createdCount: created.length,
      errorCount: errors.length,
      created,
      errors,
    });
  } catch (err) { next(err); }
}

module.exports = { getAll, getLowStock, getOne, create, update, remove, restock, sell, bulkImport };