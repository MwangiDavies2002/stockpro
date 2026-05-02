// Simple in-memory SQLite-like database for development
// This stores data in memory and provides a database-like API

class SimpleDatabase {
  constructor() {
    this.tables = {};
    this.nextIds = {};
    const fs = require('fs');
    const path = require('path');
    this._dataFile = path.join(__dirname, '../../bar_inventory_data.json');
    this._fs = fs;
  }

  createTable(name, schema) {
    if (!this.tables[name]) {
      this.tables[name] = [];
      this.nextIds[name] = 1;
    }
  }

  insert(table, data) {
    if (!this.tables[table]) this.tables[table] = [];
    const record = { id: this.nextIds[table]++, ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    this.tables[table].push(record);
    this._save();
    return record;
  }

  select(table, where = null) {
    let results = this.tables[table] || [];
    if (where) {
      results = results.filter(record => {
        return Object.entries(where).every(([key, value]) => record[key] === value);
      });
    }
    return results;
  }

  selectOne(table, where = null) {
    return this.select(table, where)[0] || null;
  }

  update(table, data, where) {
    const records = this.tables[table] || [];
    records.forEach(record => {
      if (Object.entries(where).every(([key, value]) => record[key] === value)) {
        Object.assign(record, data, { updated_at: new Date().toISOString() });
      }
    });
    this._save();
  }

  delete(table, where) {
    this.tables[table] = (this.tables[table] || []).filter(record => {
      return !Object.entries(where).every(([key, value]) => record[key] === value);
    });
    this._save();
  }

  initialize() {
    // Initialize tables
    this.createTable('users', {});
    this.createTable('suppliers', {});
    this.createTable('inventory_items', {});
    this.createTable('orders', {});
    this.createTable('order_items', {});
    this.createTable('mpesa_payments', {});

    // Seed suppliers
    if (this.tables.suppliers.length === 0) {
      this.insert('suppliers', { name: 'EABL Kenya', email: 'orders@eabl.co.ke', phone: '0800720720' });
      this.insert('suppliers', { name: 'Diageo Kenya', email: 'supply@diageo.co.ke', phone: '0800723888' });
      this.insert('suppliers', { name: 'Beverage World', email: 'info@beverageworld.co.ke', phone: '0711223344' });
      this.insert('suppliers', { name: 'Wine World KE', email: 'orders@wineworld.co.ke', phone: '0733445566' });
    }

    // Seed inventory
    if (this.tables.inventory_items.length === 0) {
      this.insert('inventory_items', { name: 'Tusker Lager', category: 'Beers', unit: 'Bottles', stock: 48, threshold: 20, price: 200, sold: 234, supplier_id: 1 });
      this.insert('inventory_items', { name: 'White Cap', category: 'Beers', unit: 'Bottles', stock: 8, threshold: 15, price: 180, sold: 189, supplier_id: 1 });
      this.insert('inventory_items', { name: 'Johnnie Walker Black', category: 'Spirits', unit: 'Bottles', stock: 5, threshold: 10, price: 2200, sold: 42, supplier_id: 2 });
      this.insert('inventory_items', { name: 'Gilbeys Gin', category: 'Spirits', unit: 'Bottles', stock: 22, threshold: 8, price: 950, sold: 78, supplier_id: 2 });
      this.insert('inventory_items', { name: 'Coca Cola', category: 'Soft Drinks', unit: 'Bottles', stock: 120, threshold: 50, price: 100, sold: 520, supplier_id: 3 });
      this.insert('inventory_items', { name: 'Fanta Orange', category: 'Soft Drinks', unit: 'Bottles', stock: 95, threshold: 40, price: 80, sold: 380, supplier_id: 3 });
    }

    console.log('✅  Database schema initialized');
  }

  _save() {
    try {
      const out = { tables: this.tables, nextIds: this.nextIds };
      this._fs.writeFileSync(this._dataFile, JSON.stringify(out, null, 2));
    } catch (err) {
      console.error('Failed to save DB file:', err.message);
    }
  }

  _load() {
    try {
      if (this._fs.existsSync(this._dataFile)) {
        const content = this._fs.readFileSync(this._dataFile, 'utf8');
        const parsed = JSON.parse(content);
        this.tables = parsed.tables || this.tables;
        this.nextIds = parsed.nextIds || this.nextIds;
      }
    } catch (err) {
      console.error('Failed to load DB file:', err.message);
    }
  }
}

const db = new SimpleDatabase();
db._load();
db.initialize();

async function testConnection() {
  try {
    console.log('✅  In-memory database connected');
  } catch (err) {
    console.error('❌  Database connection failed:', err.message);
    process.exit(1);
  }
}

function initializeDatabase() {
  db.initialize();
}

// Helper: Parse queries and execute them
function query(text, params) {
  try {
    // Convert PostgreSQL $N syntax to ? syntax
    let sql = text;
    if (sql.includes('$')) {
      let paramIndex = 1;
      sql = sql.replace(/\$\d+/g, () => '?');
    }

    // Parse and execute the query
    const upperSql = sql.toUpperCase().trim();

    if (upperSql.startsWith('SELECT')) {
      // Handle SELECT queries
      const match = sql.match(/FROM\s+(\w+)/i);
      const table = match ? match[1] : null;
      if (!table) throw new Error('Invalid SELECT query');

      let results = db.select(table);

      // Simple WHERE clause parsing
      if (sql.includes('WHERE')) {
        const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+(?:LIMIT|ORDER|GROUP|$))/i);
        if (whereMatch && params && params.length) {
          const whereClause = whereMatch[1];
          const conditions = whereClause.split('AND').map(c => c.trim());
          
          results = results.filter(record => {
            return conditions.every((condition, idx) => {
              const [field] = condition.split('=').map(p => p.trim());
              return record[field] === params[idx];
            });
          });
        }
      }

      return { rows: results, rowCount: results.length };
    } else if (upperSql.startsWith('INSERT')) {
      const match = sql.match(/INSERT INTO\s+(\w+)\s*\((.*?)\)\s*VALUES/i);
      const table = match ? match[1] : null;
      const fields = match ? match[2].split(',').map(f => f.trim()) : [];

      if (!table || !fields.length) throw new Error('Invalid INSERT query');

      const data = {};
      fields.forEach((field, idx) => {
        data[field] = params[idx];
      });

      const record = db.insert(table, data);
      return { rows: [record], rowCount: 1, lastID: record.id };
    } else if (upperSql.startsWith('UPDATE')) {
      const match = sql.match(/UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE/i);
      const table = match ? match[1] : null;

      if (!table) throw new Error('Invalid UPDATE query');

      // Simple UPDATE - update first matching record
      const records = db.select(table);
      if (records.length > 0 && params.length > 0) {
        records[0].updated_at = new Date().toISOString();
        // Assuming single param for WHERE clause
        db.update(table, { ...records[0] }, { id: records[0].id });
      }

      return { rows: [], rowCount: 1 };
    } else if (upperSql.startsWith('DELETE')) {
      return { rows: [], rowCount: 0 };
    }

    throw new Error('Unsupported query type');
  } catch (err) {
    console.error('Query error:', err.message);
    throw err;
  }
}

module.exports = { db, query, testConnection, initializeDatabase };
