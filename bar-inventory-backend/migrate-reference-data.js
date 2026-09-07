require('dotenv').config();
const { query, db } = require('./src/config/db');

async function hasColumn(table, column) {
  const { rows } = await query(`SHOW COLUMNS FROM ${table} LIKE ?`, [column]);
  return rows.length > 0;
}

async function addColumn(table, column, definition) {
  if (!(await hasColumn(table, column))) await query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

async function migrate() {
  await query(`
    CREATE TABLE IF NOT EXISTS units (
      id INT AUTO_INCREMENT PRIMARY KEY,
      location_id INT NOT NULL,
      name VARCHAR(150) NOT NULL,
      short_name VARCHAR(30) NULL,
      allow_decimal BOOLEAN NOT NULL DEFAULT FALSE,
      base_unit_id INT NULL,
      multiplier DECIMAL(15,6) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_units_location_name (location_id, name),
      CONSTRAINT fk_units_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
      CONSTRAINT fk_units_base FOREIGN KEY (base_unit_id) REFERENCES units(id) ON DELETE SET NULL
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      location_id INT NOT NULL,
      name VARCHAR(150) NOT NULL,
      code VARCHAR(50) NULL,
      description TEXT NULL,
      parent_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_categories_location_name_parent (location_id, name, parent_id),
      CONSTRAINT fk_categories_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
      CONSTRAINT fk_categories_parent FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE SET NULL
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS brands (
      id INT AUTO_INCREMENT PRIMARY KEY,
      location_id INT NOT NULL,
      name VARCHAR(150) NOT NULL,
      description TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_brands_location_name (location_id, name),
      CONSTRAINT fk_brands_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
    )
  `);

  await addColumn('inventory_items', 'unit_id', 'INT NULL');
  await addColumn('inventory_items', 'category_id', 'INT NULL');
  await addColumn('inventory_items', 'brand_id', 'INT NULL');

  console.log('Reference data schema ready.');
}

if (require.main === module) {
  migrate().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.end());
}

module.exports = migrate;
