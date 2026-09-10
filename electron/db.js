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
    CREATE TABLE IF NOT EXISTS locations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, address TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS customers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT, credit_limit REAL DEFAULT 0, balance REAL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS treasury (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL, current_balance REAL DEFAULT 0, status TEXT DEFAULT 'active');
    CREATE TABLE IF NOT EXISTS treasury_transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, treasury_id INTEGER REFERENCES treasury(id) ON DELETE CASCADE, transaction_type TEXT NOT NULL, amount REAL NOT NULL, reference TEXT, description TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, supplier_id INTEGER, location_id INTEGER, status TEXT DEFAULT 'pending', transaction_type TEXT DEFAULT 'purchase', total REAL DEFAULT 0, notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE, item_id INTEGER, item_name TEXT, quantity REAL NOT NULL, unit_price REAL NOT NULL, account_type TEXT DEFAULT 'asset');
    CREATE TABLE IF NOT EXISTS inventory_stock_log (id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER, change_type TEXT NOT NULL, qty_change REAL NOT NULL, before_stock REAL, after_stock REAL, note TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  `);
  const count = db.prepare('SELECT COUNT(*) AS n FROM chart_of_accounts').get().n;
  if (!count) { db.prepare('INSERT INTO chart_of_accounts (account_code,account_name,account_type,normal_balance) VALUES (?,?,?,?)').run('1000','Cash','Assets','Debit'); db.prepare('INSERT INTO chart_of_accounts (account_code,account_name,account_type,normal_balance) VALUES (?,?,?,?)').run('4000','Sales Revenue','Income','Credit'); }
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
  if (method === 'get' && url === '/orders') return db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
  if (method === 'get' && url === '/inventory') return db.prepare('SELECT i.*, s.name AS supplier_name FROM inventory_items i LEFT JOIN suppliers s ON s.id=i.supplier_id ORDER BY i.name').all();
  if (method === 'get' && url === '/inventory/low-stock') return db.prepare('SELECT * FROM inventory_items WHERE stock <= threshold ORDER BY name').all();
  if (method === 'get' && url === '/shifts/current') return db.prepare("SELECT * FROM shifts WHERE status='open' ORDER BY id DESC LIMIT 1").get() || null;
  if (method === 'get' && url === '/auth/me') return request.user || db.prepare('SELECT * FROM users WHERE active=1 ORDER BY id LIMIT 1').get() || null;
  if (method === 'get' && url === '/shifts') return db.prepare('SELECT * FROM shifts ORDER BY id DESC').all();
  const collection = url.match(/^\/(suppliers|users|customers|locations|treasury)$/);
  if (method === 'get' && collection) { const table = collection[1]; return db.prepare(`SELECT * FROM ${table} ORDER BY id DESC`).all().map(table === 'users' ? safeUser : x => x); }
  if (method === 'get' && url === '/accounts') return db.prepare('SELECT * FROM chart_of_accounts WHERE active=1 ORDER BY account_code').all();
  if (method === 'get' && url === '/journal-entries') return db.prepare('SELECT * FROM journal_entries ORDER BY id DESC').all();
  if (method === 'get' && url === '/reports/stock') return db.prepare('SELECT name,category,stock,threshold,cost,price,sold FROM inventory_items ORDER BY name').all();
  if (method === 'get' && url === '/reports/ledger') return db.prepare('SELECT * FROM journal_entries ORDER BY id DESC').all();
  if (method === 'get' && url === '/business-settings') return Object.fromEntries(db.prepare('SELECT setting_key,setting_value FROM app_settings').all().map(x => [x.setting_key, JSON.parse(x.setting_value)]));
  if (method === 'post' && collection && collection[1] !== 'users') { const table = collection[1]; const allowed = { suppliers:['name','email','phone','address'], customers:['name','phone','credit_limit'], locations:['name','address'], treasury:['name','type'] }[table]; const keys = allowed.filter(k => body[k] !== undefined); const r = db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map(k => body[k])); return db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(r.lastInsertRowid); }
  if (method === 'post' && url === '/inventory') { const keys = ['name','category','unit','stock','threshold','cost','price','supplier_id'].filter(k => body[k] !== undefined); const r = db.prepare(`INSERT INTO inventory_items (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map(k => body[k])); return db.prepare('SELECT * FROM inventory_items WHERE id=?').get(r.lastInsertRowid); }
  if (method === 'post' && url === '/orders') { const items = body.items || []; const total = items.reduce((s, x) => s + Number(x.quantity) * Number(x.unitPrice || 0), 0); const result = db.transaction(() => { const order = db.prepare('INSERT INTO orders (supplier_id,location_id,status,transaction_type,total,notes) VALUES (?,?,?,?,?,?)').run(body.supplierId || null, body.locationId || null, body.status || 'pending', body.transactionType || 'purchase', total, body.notes || null); const line = db.prepare('INSERT INTO order_items (order_id,item_id,item_name,quantity,unit_price,account_type) VALUES (?,?,?,?,?,?)'); for (const x of items) { const item = db.prepare('SELECT name FROM inventory_items WHERE id=?').get(x.itemId); if (!item) throw new Error(`Item ${x.itemId} not found`); line.run(order.lastInsertRowid, x.itemId, item.name, Number(x.quantity), Number(x.unitPrice || 0), x.accountType || 'asset'); } return order.lastInsertRowid; })(); return db.prepare('SELECT * FROM orders WHERE id=?').get(result); }
  const orderStatus = url.match(/^\/orders\/(\d+)\/status$/);
  if (method === 'patch' && orderStatus) { const id = Number(orderStatus[1]); const order = db.prepare('SELECT * FROM orders WHERE id=?').get(id); if (!order) throw new Error('Order not found'); if (body.status === 'delivered' && order.status !== 'delivered') { db.transaction(() => { for (const line of db.prepare('SELECT * FROM order_items WHERE order_id=?').all(id)) { const item = db.prepare('SELECT stock,cost FROM inventory_items WHERE id=?').get(line.item_id); const before = Number(item.stock); const qty = Number(line.quantity); const cost = Number(line.unit_price); const newCost = order.transaction_type === 'opening_stock' ? cost : ((before * Number(item.cost) + qty * cost) / Math.max(1, before + qty)); db.prepare('UPDATE inventory_items SET stock=stock+?,cost=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(qty,newCost,line.item_id); db.prepare('INSERT INTO inventory_stock_log (item_id,change_type,qty_change,before_stock,after_stock,note) VALUES (?,?,?,?,?,?)').run(line.item_id, order.transaction_type === 'opening_stock' ? 'opening_stock' : 'restock', qty, before, before + qty, `Order #${id} delivered`); } db.prepare('INSERT INTO journal_entries (posting_date,description,reference) VALUES (date(\'now\'),?,?)').run(order.transaction_type === 'opening_stock' ? 'Opening stock' : 'Inventory purchase', `ORDER-${id}`); db.prepare('UPDATE orders SET status=? WHERE id=?').run('delivered',id); })(); } else db.prepare('UPDATE orders SET status=? WHERE id=?').run(body.status,id); return db.prepare('SELECT * FROM orders WHERE id=?').get(id); }
  const item = url.match(/^\/inventory\/(\d+)(?:\/(restock|sell|adjustment))?$/);
  if (item && method === 'patch') { const id = Number(item[1]); const action = item[2]; const quantity = Number(body.quantity || 0); if (!quantity || quantity < 0) throw new Error('Quantity must be positive'); const sql = action === 'restock' ? 'UPDATE inventory_items SET stock=stock+?, updated_at=CURRENT_TIMESTAMP WHERE id=?' : action === 'sell' ? 'UPDATE inventory_items SET stock=stock-?, sold=sold+?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND stock>=?' : 'UPDATE inventory_items SET stock=stock+?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND stock+? >= 0'; const params = action === 'restock' ? [quantity,id] : action === 'sell' ? [quantity,quantity,id,quantity] : [Number(body.quantity),id,Number(body.quantity)]; const result = db.prepare(sql).run(...params); if (!result.changes) throw new Error('Stock update would produce negative inventory'); return db.prepare('SELECT * FROM inventory_items WHERE id=?').get(id); }
  if (item && method === 'put') { const allowed = ['name','category','unit','stock','threshold','cost','price','supplier_id']; const keys = allowed.filter(k => body[k] !== undefined); db.prepare(`UPDATE inventory_items SET ${keys.map(k => `${k}=?`).join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...keys.map(k => body[k]), Number(item[1])); return db.prepare('SELECT * FROM inventory_items WHERE id=?').get(Number(item[1])); }
  if (item && method === 'delete') { db.prepare('DELETE FROM inventory_items WHERE id=?').run(Number(item[1])); return { success: true }; }
  if (method === 'post' && url === '/journal-entries') { const r = db.prepare('INSERT INTO journal_entries (posting_date,description,reference) VALUES (?,?,?)').run(body.posting_date || new Date().toISOString().slice(0,10), body.description || '', body.reference || null); const line = db.prepare('INSERT INTO journal_entry_lines (journal_entry_id,account_id,debit,credit,description) VALUES (?,?,?,?,?)'); for (const x of body.lines || []) line.run(r.lastInsertRowid, x.account_id, x.debit || 0, x.credit || 0, x.description || ''); return db.prepare('SELECT * FROM journal_entries WHERE id=?').get(r.lastInsertRowid); }
  if (method === 'put' && url === '/business-settings') { for (const [key, value] of Object.entries(body)) db.prepare('INSERT INTO app_settings(setting_key,setting_value) VALUES (?,?) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value').run(key, JSON.stringify(value)); return body; }
  if (method === 'post' && url === '/shifts') { const r = db.prepare("INSERT INTO shifts (opening_float,status) VALUES (?, 'open')").run(Number(body.openingFloat || 0)); return db.prepare('SELECT * FROM shifts WHERE id=?').get(r.lastInsertRowid); }
  const close = url.match(/^\/shifts\/(\d+)\/close$/);
  if (method === 'patch' && close) { const id = Number(close[1]); const shift = db.prepare('SELECT * FROM shifts WHERE id=?').get(id); if (!shift || shift.status !== 'open') throw new Error('Shift is not open'); const sales = db.prepare("SELECT COALESCE(SUM(total),0) AS total FROM sales WHERE shift_id=? AND payment_method='cash'").get(id).total; const expected = Number(shift.opening_float) + Number(sales); db.prepare("UPDATE shifts SET closed_at=CURRENT_TIMESTAMP, actual_cash=?, expected_cash=?, status='closed' WHERE id=?").run(Number(body.actualCash || 0), expected, id); return { ...db.prepare('SELECT * FROM shifts WHERE id=?').get(id), variance: Number(body.actualCash || 0) - expected }; }
  if (method === 'post' && url === '/sales') {
    const items = body.items || [];
    return db.transaction(() => { const shift = db.prepare("SELECT id FROM shifts WHERE status='open' ORDER BY id DESC LIMIT 1").get(); const total = items.reduce((s, x) => s + Number(x.quantity) * Number(x.unitPrice || 0), 0); const sale = db.prepare('INSERT INTO sales (shift_id,user_id,payment_method,total) VALUES (?,?,?,?)').run(shift?.id || null, null, body.paymentMethod || 'cash', total); const line = db.prepare('INSERT INTO sale_items (sale_id,item_id,quantity,unit_price) VALUES (?,?,?,?)'); const stock = db.prepare('UPDATE inventory_items SET stock=stock-?, sold=sold+?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND stock>=?'); for (const x of items) { const result = stock.run(x.quantity, x.quantity, x.itemId, x.quantity); if (!result.changes) throw new Error('Insufficient stock'); line.run(sale.lastInsertRowid, x.itemId, x.quantity, x.unitPrice || 0); } const journal = db.prepare("INSERT INTO journal_entries (posting_date,description,reference) VALUES (date('now'),?,?)").run('Sale', `SALE-${sale.lastInsertRowid}`); const cash = db.prepare("SELECT id FROM chart_of_accounts WHERE account_code='1000'").get().id; const revenue = db.prepare("SELECT id FROM chart_of_accounts WHERE account_code='4000'").get().id; const journalLine = db.prepare('INSERT INTO journal_entry_lines (journal_entry_id,account_id,debit,credit,description) VALUES (?,?,?,?,?)'); journalLine.run(journal.lastInsertRowid, cash, total, 0, 'Cash received'); journalLine.run(journal.lastInsertRowid, revenue, 0, total, 'Sales revenue'); return { id: sale.lastInsertRowid, total }; })();
  }
  throw new Error(`Offline IPC endpoint not implemented: ${method.toUpperCase()} ${url}`);
}

function hashPassword(password) { const salt = crypto.randomBytes(16).toString('hex'); return `${salt}:${crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256').toString('hex')}`; }
function verifyPassword(password, stored) { const [salt, hash] = String(stored).split(':'); return salt && hash && crypto.timingSafeEqual(Buffer.from(hash, 'hex'), crypto.pbkdf2Sync(password, salt, 120000, 32, 'sha256')); }
function safeUser(user) { if (!user) return null; const { password, ...result } = user; return result; }

module.exports = { openDatabase, apiRequest };
