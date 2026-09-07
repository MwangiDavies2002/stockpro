require('dotenv').config();
const { query, db } = require('./src/config/db');
const { ensurePurchaseAccountingMappings } = require('./src/utils/accountingDefaults');

async function migrate() {
  const columns = {
    inventory_items: {
      sku: 'VARCHAR(100) NULL', barcode: 'VARCHAR(100) NULL',
      previous_unit_price: 'DECIMAL(15,4) NULL', previous_discount: 'DECIMAL(7,4) NULL',
    },
    orders: {
      transaction_type: "VARCHAR(20) NOT NULL DEFAULT 'purchase'",
      reference_no: 'VARCHAR(100) NULL', purchase_date: 'DATE NULL',
      location_id: 'INT NULL', pay_term: 'VARCHAR(100) NULL',
    },
    order_items: {
      cost_before_discount: 'DECIMAL(15,4) NULL', discount_percent: 'DECIMAL(7,4) NOT NULL DEFAULT 0',
      tax_percent: 'DECIMAL(7,4) NOT NULL DEFAULT 0', subtotal: 'DECIMAL(15,2) NULL',
      net_cost: 'DECIMAL(15,2) NULL', profit_margin: 'DECIMAL(12,4) NOT NULL DEFAULT 0',
      selling_price: 'DECIMAL(15,2) NULL', account_type: "VARCHAR(20) NOT NULL DEFAULT 'asset'",
    },
  };
  for (const [table, fields] of Object.entries(columns)) {
    for (const [column, definition] of Object.entries(fields)) {
      const { rows } = await query(`SHOW COLUMNS FROM ${table} LIKE ?`, [column]);
      if (!rows.length) await query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  }
  await query('ALTER TABLE order_items MODIFY COLUMN unit_price DECIMAL(15,4) NOT NULL');
  await ensurePurchaseAccountingMappings();
  console.log('Purchase schema ready.');
}
if (require.main === module) migrate().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.end());
module.exports = migrate;
