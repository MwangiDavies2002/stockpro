const { query } = require('../config/db');

/**
 * Data access helpers for `inventory_items` table.
 * Each method returns the promise-like object from `query()`.
 */
const Item = {
  /**
   * Find items optionally filtered by category/search.
   * @param {Object} params
   */
  findAll:     (params = {}) => {
    const conditions = ['1=1']; const vals = [];
    if (params.category) { vals.push(params.category); conditions.push(`category=$${vals.length}`); }
    if (params.search)   { vals.push(`%${params.search}%`); conditions.push(`name ILIKE $${vals.length}`); }
    return query(`SELECT * FROM inventory_items WHERE ${conditions.join(' AND ')} ORDER BY name`, vals);
  },
  /** Find an item by ID. */
  findById:    (id)  => query('SELECT * FROM inventory_items WHERE id=$1', [id]),
  /** List items with low stock. */
  findLowStock: ()   => query('SELECT * FROM inventory_items WHERE stock <= threshold ORDER BY stock ASC'),
  /** Create a new inventory item. */
  create:      (d)   => query(
    'INSERT INTO inventory_items (name,category,unit,stock,threshold,price,supplier_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [d.name, d.category, d.unit||'Bottles', d.stock||0, d.threshold||5, d.price||0, d.supplierId||null]
  ),
  /** Update an existing inventory item. */
  update: (id, d) => query(
    'UPDATE inventory_items SET name=$1,category=$2,unit=$3,stock=$4,threshold=$5,price=$6,supplier_id=$7,updated_at=NOW() WHERE id=$8 RETURNING *',
    [d.name, d.category, d.unit, d.stock, d.threshold, d.price, d.supplierId||null, id]
  ),
  /** Decrement stock and increment `sold` counter. */
  incrementSold: (id, qty) => query(
    'UPDATE inventory_items SET stock=stock-$1,sold=sold+$1,updated_at=NOW() WHERE id=$2 RETURNING *',
    [qty, id]
  ),
  /** Increase stock for an item. */
  restock: (id, qty) => query(
    'UPDATE inventory_items SET stock=stock+$1,updated_at=NOW() WHERE id=$2 RETURNING *',
    [qty, id]
  ),
  /** Delete an item by ID. */
  delete: (id) => query('DELETE FROM inventory_items WHERE id=$1', [id]),
};

module.exports = Item;
