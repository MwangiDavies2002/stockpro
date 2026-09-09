const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
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
  `);
  const count = db.prepare('SELECT COUNT(*) AS n FROM chart_of_accounts').get().n;
  if (!count) db.prepare('INSERT INTO chart_of_accounts (account_code,account_name,account_type,normal_balance) VALUES (?,?,?,?)').run('4000','Sales Revenue','Income','Credit');
  return db;
}

function apiRequest(db, request) {
  const method = (request.method || 'get').toLowerCase();
  const url = String(request.url || '').replace(/^\/api/, '').replace(/\?.*$/, '');
  const body = request.data || {};
  if (method === 'post' && url === '/auth/login') {
    const user = db.prepare('SELECT * FROM users WHERE lower(email)=lower(?) AND active=1').get(body.email);
    if (!user || !verifyPassword(body.password || '', user.password)) throw new Error('Invalid email or password');
    return { token: `local.${user.id}.${crypto.randomBytes(12).toString('hex')}`, user: safeUser(user) };
  }
  if (method === 'post' && url === '/auth/register') {
    const result = db.prepare('INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)').run(body.name, body.email, hashPassword(body.password || ''), body.role || 'employee');
    return safeUser(db.prepare('SELECT * FROM users WHERE id=?').get(result.lastInsertRowid));
  }
  if (method === 'get' && url === '/sales') return db.prepare('SELECT * FROM sales ORDER BY id DESC').all();
  if (method === 'get' && url === '/inventory') return db.prepare('SELECT * FROM inventory_items ORDER BY name').all();
  if (method === 'get' && url === '/inventory/low-stock') return db.prepare('SELECT * FROM inventory_items WHERE stock <= threshold ORDER BY name').all();
  if (method === 'get' && url === '/shifts/current') return db.prepare("SELECT * FROM shifts WHERE status='open' ORDER BY id DESC LIMIT 1").get() || null;
  if (method === 'get' && url === '/auth/me') return request.user || db.prepare('SELECT * FROM users WHERE active=1 ORDER BY id LIMIT 1').get() || null;
  if (method === 'get' && url === '/shifts') return db.prepare('SELECT * FROM shifts ORDER BY id DESC').all();
  if (method === 'post' && url === '/shifts') { const r = db.prepare("INSERT INTO shifts (opening_float,status) VALUES (?, 'open')").run(Number(body.openingFloat || 0)); return db.prepare('SELECT * FROM shifts WHERE id=?').get(r.lastInsertRowid); }
  const close = url.match(/^\/shifts\/(\d+)\/close$/);
  if (method === 'patch' && close) { const id = Number(close[1]); const shift = db.prepare('SELECT * FROM shifts WHERE id=?').get(id); if (!shift || shift.status !== 'open') throw new Error('Shift is not open'); const sales = db.prepare("SELECT COALESCE(SUM(total),0) AS total FROM sales WHERE shift_id=? AND payment_method='cash'").get(id).total; const expected = Number(shift.opening_float) + Number(sales); db.prepare("UPDATE shifts SET closed_at=CURRENT_TIMESTAMP, actual_cash=?, expected_cash=?, status='closed' WHERE id=?").run(Number(body.actualCash || 0), expected, id); return { ...db.prepare('SELECT * FROM shifts WHERE id=?').get(id), variance: Number(body.actualCash || 0) - expected }; }
  if (method === 'post' && url === '/sales') {
    const items = body.items || [];
    return db.transaction(() => { const shift = db.prepare("SELECT id FROM shifts WHERE status='open' ORDER BY id DESC LIMIT 1").get(); const total = items.reduce((s, x) => s + Number(x.quantity) * Number(x.unitPrice || 0), 0); const sale = db.prepare('INSERT INTO sales (shift_id,user_id,payment_method,total) VALUES (?,?,?,?)').run(shift?.id || null, null, body.paymentMethod || 'cash', total); const line = db.prepare('INSERT INTO sale_items (sale_id,item_id,quantity,unit_price) VALUES (?,?,?,?)'); const stock = db.prepare('UPDATE inventory_items SET stock=stock-?, sold=sold+?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND stock>=?'); for (const x of items) { const result = stock.run(x.quantity, x.quantity, x.itemId, x.quantity); if (!result.changes) throw new Error('Insufficient stock'); line.run(sale.lastInsertRowid, x.itemId, x.quantity, x.unitPrice || 0); } const journal = db.prepare("INSERT INTO journal_entries (posting_date,description,reference) VALUES (date('now'),?,?)").run('Sale', `SALE-${sale.lastInsertRowid}`); db.prepare('INSERT INTO journal_entry_lines (journal_entry_id,account_id,debit,credit,description) VALUES (?,?,?,?,?)').run(journal.lastInsertRowid, 1, total, 0, 'Sale'); db.prepare('INSERT INTO journal_entry_lines (journal_entry_id,account_id,debit,credit,description) VALUES (?,?,?,?,?)').run(journal.lastInsertRowid, 1, 0, total, 'Revenue'); return { id: sale.lastInsertRowid, total }; })();
  }
  throw new Error(`Offline IPC endpoint not implemented: ${method.toUpperCase()} ${url}`);
}

function hashPassword(password) { const salt = crypto.randomBytes(16).toString('hex'); return `${salt}:${crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex')}`; }
function verifyPassword(password, stored) { const [salt, hash] = String(stored).split(':'); return salt && hash && crypto.timingSafeEqual(Buffer.from(hash, 'hex'), crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256')); }
function safeUser(user) { if (!user) return null; const { password, ...result } = user; return result; }

module.exports = { openDatabase, apiRequest };
