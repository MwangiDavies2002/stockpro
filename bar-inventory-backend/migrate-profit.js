require('dotenv').config();
const { query, db } = require('./src/config/db');
async function migrate() {
  for (const [table, column, definition] of [
    ['sale_items', 'unit_cost', 'DECIMAL(15,4) NULL'],
    ['sale_items', 'net_revenue', 'DECIMAL(15,2) NULL'],
    ['sales_document_items', 'unit_cost', 'DECIMAL(15,4) NULL'],
  ]) {
    const { rows } = await query(`SHOW COLUMNS FROM ${table} LIKE ?`, [column]);
    if (!rows.length) await query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
  console.log('Profit reporting columns ready; legacy sale costs remain unknown.');
}
migrate().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.end());
