const fs = require('node:fs');
const path = require('node:path');
const { openDatabase } = require('../electron/db');

const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/migrate-json-to-sqlite.js <export.json> [userDataDirectory]');
const input = JSON.parse(fs.readFileSync(path.resolve(source), 'utf8'));
const db = openDatabase(path.resolve(process.argv[3] || './stockpro-user-data'));
const tables = input.tables || input;
const suppliers = tables.suppliers || [];
const addSupplier = db.prepare('INSERT OR REPLACE INTO suppliers (id,name,email,phone,address,items_supplied) VALUES (@id,@name,@email,@phone,@address,@items_supplied)');
db.transaction(() => suppliers.forEach(supplier => addSupplier.run({ id: supplier.id, name: supplier.name, email: supplier.email || null, phone: supplier.phone || null, address: supplier.address || null, items_supplied: supplier.items_supplied || null })))();
const rows = tables.inventory_items || tables.inventory || [];
const insert = db.prepare('INSERT OR REPLACE INTO inventory_items (id,name,category,unit,stock,threshold,cost,price,sold,supplier_id) VALUES (@id,@name,@category,@unit,@stock,@threshold,@cost,@price,@sold,@supplier_id)');
db.transaction(() => rows.forEach(row => insert.run({ id: row.id, name: row.name, category: row.category || 'General', unit: row.unit || 'Bottles', stock: Number(row.stock || 0), threshold: Number(row.threshold || 5), cost: Number(row.cost || 0), price: Number(row.price || 0), sold: Number(row.sold || 0), supplier_id: row.supplier_id || null })))();
const users = tables.users || [];
const addUser = db.prepare('INSERT OR REPLACE INTO users (id,name,email,password,role,phone) VALUES (@id,@name,@email,@password,@role,@phone)');
db.transaction(() => users.forEach(user => addUser.run({ id: user.id, name: user.name, email: user.email, password: user.password, role: user.role || 'employee', phone: user.phone || null })))();
console.log(`Imported ${rows.length} inventory item(s) into SQLite.`);
