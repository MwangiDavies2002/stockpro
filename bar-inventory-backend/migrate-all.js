require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');
const { migrate } = require('./src/config/migrations');
(async () => {
  const name = process.env.DB_NAME || 'barstockpro';
  if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error('Invalid database name');
  const connection = await mysql.createConnection({ host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306), user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', ssl: process.env.DB_SSL==='true' ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED!=='false' } : undefined });
  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${name}\``);
    await connection.query(`USE \`${name}\``);
    const sql = fs.readFileSync(path.join(__dirname,'migrations/000-baseline.sql'),'utf8');
    for (const statement of sql.split(/;\s*(?:\r?\n|$)/).filter(text => text.trim())) await connection.query(statement);
    await migrate(connection);
    console.log('All schema migrations complete');
  } finally { await connection.end(); }
})().catch(error => { console.error(error.message); process.exitCode=1; });
