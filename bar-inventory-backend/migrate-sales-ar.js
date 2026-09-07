require('dotenv').config();
const { query, db } = require('./src/config/db');

async function migrate() {
  try {
    await query('ALTER TABLE inventory_stock_log DROP CHECK chk_change_type');
  } catch (err) {
    if (!/check.*exist|constraint.*exist|not found/i.test(err.message)) console.warn(err.message);
  }
  await query('ALTER TABLE inventory_stock_log MODIFY change_type VARCHAR(30) NOT NULL');

  await query(`
    CREATE TABLE IF NOT EXISTS sales_documents (
      id INT AUTO_INCREMENT PRIMARY KEY,
      type VARCHAR(30) NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      customer_id INT NULL,
      reference_no VARCHAR(100) NULL,
      document_date DATE NOT NULL,
      location_id INT NOT NULL,
      converted_from_id INT NULL,
      reference_invoice_id INT NULL,
      sale_id INT NULL,
      subtotal DECIMAL(15,2) NOT NULL DEFAULT 0,
      discount_total DECIMAL(15,2) NOT NULL DEFAULT 0,
      tax_total DECIMAL(15,2) NOT NULL DEFAULT 0,
      total DECIMAL(15,2) NOT NULL DEFAULT 0,
      paid_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      balance_due DECIMAL(15,2) NOT NULL DEFAULT 0,
      notes TEXT NULL,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_sales_documents_type_status (type, status),
      INDEX idx_sales_documents_customer (customer_id),
      INDEX idx_sales_documents_location (location_id),
      CONSTRAINT fk_sales_documents_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
      CONSTRAINT fk_sales_documents_location FOREIGN KEY (location_id) REFERENCES locations(id),
      CONSTRAINT fk_sales_documents_converted_from FOREIGN KEY (converted_from_id) REFERENCES sales_documents(id) ON DELETE SET NULL,
      CONSTRAINT fk_sales_documents_reference_invoice FOREIGN KEY (reference_invoice_id) REFERENCES sales_documents(id) ON DELETE RESTRICT,
      CONSTRAINT fk_sales_documents_sale FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS sales_document_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      document_id INT NOT NULL,
      item_id INT NULL,
      item_name VARCHAR(150) NOT NULL,
      quantity INT NOT NULL,
      unit_price DECIMAL(15,4) NOT NULL,
      discount_percent DECIMAL(7,4) NOT NULL DEFAULT 0,
      discount_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      tax_percent DECIMAL(7,4) NOT NULL DEFAULT 0,
      tax_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      subtotal DECIMAL(15,2) NOT NULL DEFAULT 0,
      line_total DECIMAL(15,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_sales_document_items_document FOREIGN KEY (document_id) REFERENCES sales_documents(id) ON DELETE CASCADE,
      CONSTRAINT fk_sales_document_items_item FOREIGN KEY (item_id) REFERENCES inventory_items(id) ON DELETE SET NULL
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS sales_document_payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      document_id INT NOT NULL,
      amount DECIMAL(15,2) NOT NULL,
      method VARCHAR(30) NOT NULL DEFAULT 'cash',
      reference_no VARCHAR(100) NULL,
      notes TEXT NULL,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_sales_document_payments_document FOREIGN KEY (document_id) REFERENCES sales_documents(id) ON DELETE CASCADE
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS discounts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      location_id INT NOT NULL,
      name VARCHAR(150) NOT NULL,
      discount_type VARCHAR(20) NOT NULL DEFAULT 'percent',
      value DECIMAL(15,4) NOT NULL,
      applies_to VARCHAR(30) NOT NULL DEFAULT 'product',
      product_id INT NULL,
      category_id INT NULL,
      customer_id INT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT fk_discounts_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE,
      CONSTRAINT fk_discounts_product FOREIGN KEY (product_id) REFERENCES inventory_items(id) ON DELETE CASCADE,
      CONSTRAINT fk_discounts_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
      CONSTRAINT fk_discounts_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    )
  `);

  console.log('Sales A/R schema ready.');
}

if (require.main === module) {
  migrate().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.end());
}

module.exports = migrate;
