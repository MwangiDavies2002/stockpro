const fs = require('node:fs');
const path = require('node:path');
const Database = require('./native-db');
const crypto = require('node:crypto');

function openDatabase(userData) {
  const dataDir = path.join(userData, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, 'stockpro.sqlite'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'employee', phone TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS suppliers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT, phone TEXT, address TEXT, items_supplied TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS inventory_items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, category TEXT NOT NULL, unit TEXT NOT NULL DEFAULT 'Bottles', stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0), threshold INTEGER NOT NULL DEFAULT 5, cost REAL NOT NULL DEFAULT 0, price REAL NOT NULL DEFAULT 0, sold INTEGER NOT NULL DEFAULT 0, supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS shifts (id INTEGER PRIMARY KEY AUTOINCREMENT, opened_by INTEGER, opened_at TEXT DEFAULT CURRENT_TIMESTAMP, closed_at TEXT, opening_float REAL NOT NULL DEFAULT 0, expected_cash REAL NOT NULL DEFAULT 0, actual_cash REAL, status TEXT NOT NULL DEFAULT 'open');
    CREATE TABLE IF NOT EXISTS sales (id INTEGER PRIMARY KEY AUTOINCREMENT, shift_id INTEGER, user_id INTEGER, payment_method TEXT NOT NULL, total REAL NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS sale_items (id INTEGER PRIMARY KEY AUTOINCREMENT, sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE, item_id INTEGER NOT NULL REFERENCES inventory_items(id), quantity INTEGER NOT NULL, unit_price REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS journal_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, posting_date TEXT NOT NULL, description TEXT, reference TEXT, status TEXT DEFAULT 'posted', created_by INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS journal_entry_lines (id INTEGER PRIMARY KEY AUTOINCREMENT, journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE, account_id INTEGER NOT NULL, debit REAL DEFAULT 0, credit REAL DEFAULT 0, description TEXT);
    CREATE TABLE IF NOT EXISTS chart_of_accounts (id INTEGER PRIMARY KEY AUTOINCREMENT, account_code TEXT UNIQUE NOT NULL, account_name TEXT NOT NULL, account_type TEXT NOT NULL, normal_balance TEXT NOT NULL, active INTEGER DEFAULT 1);
    CREATE TABLE IF NOT EXISTS app_settings (setting_key TEXT PRIMARY KEY, setting_value TEXT);
    CREATE TABLE IF NOT EXISTS locations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, address TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT, credit_limit REAL DEFAULT 0, balance REAL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS treasury (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL, current_balance REAL DEFAULT 0, status TEXT DEFAULT 'active');
    CREATE TABLE IF NOT EXISTS treasury_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, treasury_id INTEGER REFERENCES treasury(id) ON DELETE CASCADE, transaction_type TEXT NOT NULL, amount REAL NOT NULL, reference TEXT, description TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, supplier_id INTEGER, location_id INTEGER, status TEXT DEFAULT 'pending', transaction_type TEXT DEFAULT 'purchase', total REAL DEFAULT 0, notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE, item_id INTEGER, item_name TEXT, quantity REAL NOT NULL, unit_price REAL NOT NULL, account_type TEXT DEFAULT 'asset');
    CREATE TABLE IF NOT EXISTS inventory_stock_log (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER, change_type TEXT NOT NULL, qty_change REAL NOT NULL, before_stock REAL, after_stock REAL, note TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  `);
  if (!db.prepare('PRAGMA table_info(inventory_items)').all().some(column => column.name === 'sku')) {
    db.exec('ALTER TABLE inventory_items ADD COLUMN sku TEXT');
  }
  for (const column of ['unit_cost', 'net_revenue']) {
    if (!db.prepare('PRAGMA table_info(sale_items)').all().some(field => field.name === column)) db.exec(`ALTER TABLE sale_items ADD COLUMN ${column} REAL`);
  }
  const count = db.prepare('SELECT COUNT(*) AS n FROM chart_of_accounts').get().n;
  if (!count) { db.prepare('INSERT INTO chart_of_accounts (account_code,account_name,account_type,normal_balance) VALUES (?,?,?,?)').run('1000','Cash','Assets','Debit'); db.prepare('INSERT INTO chart_of_accounts (account_code,account_name,account_type,normal_balance) VALUES (?,?,?,?)').run('4000','Sales Revenue','Income','Credit'); }
  require('./schema').upgrade(db);
  return db;
}

module.exports = { openDatabase, apiRequest: require('./desktop-api').apiRequest };
