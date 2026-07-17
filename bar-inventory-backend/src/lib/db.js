const mysql = require('mysql2/promise');

// Serverless connection pool manager
const globalForMysql = global;
const pool = globalForMysql.mysqlPool || mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || '3306'),
  
  // Vercel Serverless Limits
  waitForConnections: true,
  connectionLimit: 2, 
  queueLimit: 0,
  idleTimeout: 5000,
});

if (process.env.NODE_ENV !== 'production') {
  globalForMysql.mysqlPool = pool;
}

/**
 * Wraps standard queries to return { rows, insertId, rowCount }
 * matching your controller's expectations.
 */
const query = async (sql, params) => {
  const [result] = await pool.query(sql, params);
  return {
    rows: Array.isArray(result) ? result : [],
    insertId: result.insertId,
    rowCount: result.affectedRows
  };
};

/**
 * Creates a dedicated client for your BEGIN/COMMIT/ROLLBACK transactions
 */
const getClient = async () => {
  const connection = await pool.getConnection();
  return {
    query: async (sql, params) => {
      const [result] = await connection.query(sql, params);
      return {
        rows: Array.isArray(result) ? result : [],
        insertId: result.insertId,
        rowCount: result.affectedRows
      };
    },
    release: () => connection.release()
  };
};

module.exports = { pool, query, getClient };