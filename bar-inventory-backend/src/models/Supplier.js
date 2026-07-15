const { query } = require('../config/db');

/**
 * Data access helpers for the `suppliers` table.
 */
const Supplier = {
  /** List all suppliers. */
  findAll:  ()    => query('SELECT * FROM suppliers ORDER BY name'),
  /** Find supplier by ID. */
  findById: (id)  => query('SELECT * FROM suppliers WHERE id=$1', [id]),
  /** Create a supplier record. */
  create: (d)     => query(
    'INSERT INTO suppliers (name,email,phone,address,items_supplied) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [d.name, d.email||null, d.phone||null, d.address||null, d.itemsSupplied||[]]
  ),
  /** Update a supplier record by ID. */
  update: (id, d) => query(
    'UPDATE suppliers SET name=$1,email=$2,phone=$3,address=$4,items_supplied=$5,updated_at=NOW() WHERE id=$6 RETURNING *',
    [d.name, d.email||null, d.phone||null, d.address||null, d.itemsSupplied||[], id]
  ),
  /** Delete a supplier by ID. */
  delete: (id) => query('DELETE FROM suppliers WHERE id=$1', [id]),
};

module.exports = Supplier;
