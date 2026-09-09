const mysql = require('mysql2/promise');
require('dotenv').config();

const cfg = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'barstockpro',
  port: Number.parseInt(process.env.DB_PORT, 10) || 3306,
  multipleStatements: true,
};

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?`,
    [table]
  );
  return Number(rows[0].count) > 0;
}
async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?`,
    [table, column]
  );
  return Number(rows[0].count) > 0;
}
async function indexExists(conn, table, indexName) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS count FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?`,
    [table, indexName]
  );
  return Number(rows[0].count) > 0;
}
async function addColumn(conn, table, ddl) {
  const col = ddl.match(/^`?([a-zA-Z0-9_]+)`?\s/)?.[1];
  if (!col || !(await tableExists(conn, table)) || await columnExists(conn, table, col)) return;
  await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
  console.log(`Added ${table}.${col}`);
}
async function addBusinessColumn(conn, table, defaultBusinessId) {
  if (!(await tableExists(conn, table))) return;
  if (!(await columnExists(conn, table, 'business_id'))) {
    await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN business_id INT NULL AFTER id`);
    console.log(`Added ${table}.business_id`);
  }
  await conn.query(`UPDATE \`${table}\` SET business_id=? WHERE business_id IS NULL`, [defaultBusinessId]);
  const idx = `idx_${table}_business`;
  if (!(await indexExists(conn, table, idx))) {
    await conn.query(`CREATE INDEX \`${idx}\` ON \`${table}\` (business_id)`);
    console.log(`Indexed ${table}.business_id`);
  }
}

(async () => {
  const conn = await mysql.createConnection(cfg);
  await conn.query(`CREATE TABLE IF NOT EXISTS businesses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(180) NOT NULL,
    start_date DATE NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'KES',
    logo_url TEXT NULL,
    website VARCHAR(255) NULL,
    contact_number VARCHAR(40) NULL,
    alternate_contact_number VARCHAR(40) NULL,
    country VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    city VARCHAR(100) NOT NULL,
    zip_code VARCHAR(40) NOT NULL,
    landmark VARCHAR(180) NOT NULL,
    timezone VARCHAR(80) NOT NULL DEFAULT 'Africa/Nairobi',
    locale VARCHAR(20) NOT NULL DEFAULT 'en-KE',
    business_type VARCHAR(60) NOT NULL DEFAULT 'Retail',
    business_type_other VARCHAR(100) NULL,
    default_tax_rate DECIMAL(7,4) NOT NULL DEFAULT 0,
    tax_number VARCHAR(80) NULL,
    selling_price_tax_type VARCHAR(20) NOT NULL DEFAULT 'inclusive',
    stock_accounting_method VARCHAR(30) NOT NULL DEFAULT 'weighted_average',
    default_low_stock_threshold DECIMAL(12,4) NOT NULL DEFAULT 5,
    feature_pos_offline TINYINT(1) NOT NULL DEFAULT 0,
    feature_multi_currency_sales TINYINT(1) NOT NULL DEFAULT 0,
    feature_barcode_scanning TINYINT(1) NOT NULL DEFAULT 1,
    feature_service_repair TINYINT(1) NOT NULL DEFAULT 0,
    financial_year_start_month TINYINT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CHECK (selling_price_tax_type IN ('inclusive','exclusive')),
    CHECK (stock_accounting_method IN ('fifo','lifo','weighted_average')),
    CHECK (financial_year_start_month BETWEEN 1 AND 12)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`);

  const [existing] = await conn.query('SELECT id FROM businesses ORDER BY id LIMIT 1');
  let defaultBusinessId = existing[0]?.id;
  if (!defaultBusinessId) {
    const [result] = await conn.query(
      `INSERT INTO businesses (name,currency,country,state,city,zip_code,landmark,timezone,locale,business_type,default_tax_rate,selling_price_tax_type,stock_accounting_method,default_low_stock_threshold,financial_year_start_month)
       VALUES ('Default Business','KES','Kenya','Nairobi','Nairobi','00100','Main Branch','Africa/Nairobi','en-KE','Retail',0,'inclusive','weighted_average',5,1)`
    );
    defaultBusinessId = result.insertId;
    console.log(`Created Default Business #${defaultBusinessId}`);
  }

  await addColumn(conn, 'users', 'business_id INT NULL AFTER id');
  await addColumn(conn, 'users', 'prefix VARCHAR(20) NULL AFTER business_id');
  await addColumn(conn, 'users', 'first_name VARCHAR(100) NULL AFTER prefix');
  await addColumn(conn, 'users', 'last_name VARCHAR(100) NULL AFTER first_name');
  await addColumn(conn, 'users', 'username VARCHAR(100) NULL AFTER last_name');
  await addColumn(conn, 'users', 'is_owner TINYINT(1) NOT NULL DEFAULT 0 AFTER role');
  if (await tableExists(conn, 'users')) {
    await conn.query('UPDATE users SET business_id=? WHERE business_id IS NULL', [defaultBusinessId]);
    await conn.query("UPDATE users SET first_name=COALESCE(first_name, SUBSTRING_INDEX(name, ' ', 1)), last_name=COALESCE(last_name, NULLIF(TRIM(SUBSTRING(name, LENGTH(SUBSTRING_INDEX(name, ' ', 1)) + 1)), ''))");
    if (!(await indexExists(conn, 'users', 'idx_users_business'))) await conn.query('CREATE INDEX idx_users_business ON users (business_id)');
    if (!(await indexExists(conn, 'users', 'uq_users_username'))) await conn.query('CREATE UNIQUE INDEX uq_users_username ON users (username)');
  }

  for (const table of ['locations','inventory_items','customers','suppliers','orders','sales','categories','units','brands','discounts','sales_documents','customer_payments','inventory_stock_log','shifts','treasury','chart_of_accounts','journal_entries']) {
    await addBusinessColumn(conn, table, defaultBusinessId);
  }

  await addColumn(conn, 'businesses', 'kra_pin VARCHAR(20) NULL');
  await addColumn(conn, 'businesses', 'etims_enabled TINYINT(1) NOT NULL DEFAULT 0');
  await addColumn(conn, 'businesses', 'etims_mode VARCHAR(20) NOT NULL DEFAULT \'sandbox\'');
  await addColumn(conn, 'businesses', 'etims_api_url VARCHAR(255) NULL');
  await addColumn(conn, 'businesses', 'etims_username VARCHAR(180) NULL');
  await addColumn(conn, 'businesses', 'etims_password_encrypted TEXT NULL');
  await addColumn(conn, 'businesses', 'etims_device_serial VARCHAR(120) NULL');
  await addColumn(conn, 'businesses', 'settings_json JSON NULL');
  await addColumn(conn, 'locations', "invoice_scheme_pos VARCHAR(40) NOT NULL DEFAULT 'Default'");
  await addColumn(conn, 'locations', "invoice_layout_pos VARCHAR(40) NOT NULL DEFAULT 'Default'");
  await addColumn(conn, 'locations', "invoice_scheme_sale VARCHAR(40) NOT NULL DEFAULT 'Default'");
  await addColumn(conn, 'locations', "invoice_layout_sale VARCHAR(40) NOT NULL DEFAULT 'Default'");
  await addColumn(conn, 'locations', "location_type VARCHAR(30) NOT NULL DEFAULT 'selling'");
  await addColumn(conn, 'locations', 'payment_options JSON NULL');

  if (await tableExists(conn, 'locations')) {
    const [rows] = await conn.query('SELECT COUNT(*) AS count FROM locations WHERE business_id=?', [defaultBusinessId]);
    if (Number(rows[0].count) === 0) {
      await conn.query('INSERT INTO locations (business_id,name,address) VALUES (?,?,?)', [defaultBusinessId, 'Main Branch', 'Default location']);
    }
  }

  await conn.end();
  console.log('Tenant onboarding migration complete');
})().catch((err) => { console.error(err); process.exit(1); });
