// Real MySQL database connection (Laragon)
// Drop-in replacement for the old in-memory db.js.
// Keeps the same exports: { db, query, testConnection, initializeDatabase }
// so existing controllers that call query(text, params) do NOT need to change,
// EXCEPT: query() is now async and returns a Promise — any call site that
// wasn't already using `await query(...)` must add `await`.

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'barstockpro',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
});

/**
 * Run a query against MySQL.
 * Accepts Postgres-style "$1, $2" placeholders (converted to "?") so
 * existing controller code written for the old fake db keeps working.
 * @param {string} text - SQL text, may use $1/$2 or ? placeholders
 * @param {Array} [params] - bound parameter values
 * @returns {Promise<{rows: Array, rowCount: number, insertId?: number}>}
 */
async function query(text, params = []) {
  // Convert Postgres-style $1, $2... placeholders to MySQL ? placeholders
  const sql = text.includes('$') ? text.replace(/\$\d+/g, '?') : text;

  try {
    // Using query() instead of execute(): execute() uses MySQL's prepared
    // statement protocol, which does NOT support transaction control
    // commands (BEGIN/COMMIT/ROLLBACK). query() supports both.
    const [result] = await pool.query(sql, params);

    // SELECT queries return an array of rows directly
    if (Array.isArray(result)) {
      return { rows: result, rowCount: result.length };
    }

    // INSERT/UPDATE/DELETE return a ResultSetHeader
    return {
      rows: [],
      rowCount: result.affectedRows || 0,
      insertId: result.insertId,
    };
  } catch (err) {
    console.error('Query error:', err.message);
    throw err;
  }
}

/**
 * Get a dedicated connection for transactions (BEGIN/COMMIT/ROLLBACK
 * must all run on the SAME connection, not the shared pool).
 * Returns an object with the same query(text, params) interface as
 * above, plus release(). Always call release() in a finally block.
 * @returns {Promise<{query: Function, release: Function}>}
 */
async function getClient() {
  const conn = await pool.getConnection();
  return {
    query: async (text, params = []) => {
      const sql = text.includes('$') ? text.replace(/\$\d+/g, '?') : text;
      const [result] = await conn.query(sql, params);
      if (Array.isArray(result)) {
        return { rows: result, rowCount: result.length };
      }
      return { rows: [], rowCount: result.affectedRows || 0, insertId: result.insertId };
    },
    release: () => conn.release(),
  };
}

/**
 * Verify the MySQL connection works. Exits the process on failure,
 * matching the previous db.js behavior.
 */
async function testConnection() {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    console.log('✅  MySQL database connected');
  } catch (err) {
    console.error('❌  Database connection failed:', err.message);
    process.exit(1);
  }
}

/**
 * Schema is created via schema_mysql_real.sql in HeidiSQL, not at runtime.
 * Kept as a no-op so existing startup code that calls initializeDatabase()
 * doesn't break.
 */
function initializeDatabase() {
  console.log('ℹ️  Schema is managed via schema_mysql_real.sql — run it in HeidiSQL if tables are missing.');
}

module.exports = { db: pool, query, getClient, testConnection, initializeDatabase };