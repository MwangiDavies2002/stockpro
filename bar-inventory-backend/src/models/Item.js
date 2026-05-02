const { query } = require('../config/db');

const Item = {
  findAll:     (params = {}) => {
    const conditions = ['1=1']; const vals = [];
    if (params.category) { vals.push(params.category); conditions.push(`category=$${vals.length}`); }
    if (params.search)   { vals.push(`%${params.search}%`); conditions.push(`name ILIKE $${vals.length}`); }
    return query(`SELECT * FROM inventory_items WHERE ${conditions.join(' AND ')} ORDER BY name`, vals);
  },
  findById:    (id)  => query('SELECT * FROM inventory_items WHERE id=$1', [id]),
  findLowStock: ()   => query('SELECT * FROM inventory_items WHERE stock <= threshold ORDER BY stock ASC'),
  create:      (d)   => query(
    'INSERT INTO inventory_items (name,category,unit,stock,threshold,price,supplier_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
    [d.name, d.category, d.unit||'Bottles', d.stock||0, d.threshold||5, d.price||0, d.supplierId||null]
  ),
  update: (id, d) => query(
    'UPDATE inventory_items SET name=$1,category=$2,unit=$3,stock=$4,threshold=$5,price=$6,supplier_id=$7,updated_at=NOW() WHERE id=$8 RETURNING *',
    [d.name, d.category, d.unit, d.stock, d.threshold, d.price, d.supplierId||null, id]
  ),
  incrementSold: (id, qty) => query(
    'UPDATE inventory_items SET stock=stock-$1,sold=sold+$1,updated_at=NOW() WHERE id=$2 RETURNING *',
    [qty, id]
  ),
  restock: (id, qty) => query(
    'UPDATE inventory_items SET stock=stock+$1,updated_at=NOW() WHERE id=$2 RETURNING *',
    [qty, id]
  ),
  delete: (id) => query('DELETE FROM inventory_items WHERE id=$1', [id]),
};

module.exports = Item;
