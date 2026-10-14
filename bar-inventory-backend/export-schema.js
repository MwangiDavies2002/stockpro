require('dotenv').config();
const fs = require('node:fs');
const { db } = require('./src/config/db');
(async () => {
  const connection = await db.getConnection();
  try {
    const [rows] = await connection.query("SHOW FULL TABLES WHERE Table_type='BASE TABLE'");
    const statements = ['-- MySQL baseline: schema only; no application records or secrets.', 'SET FOREIGN_KEY_CHECKS=0;'];
    for (const row of rows) {
      const table = Object.values(row)[0];
      if (!/^[a-zA-Z0-9_]+$/.test(table) || table.startsWith('test_') || table === 'schema_migrations') continue;
      const [ddl] = await connection.query(`SHOW CREATE TABLE \`${table}\``);
      statements.push(ddl[0]['Create Table'].replace(/^CREATE TABLE /, 'CREATE TABLE IF NOT EXISTS ').replace(/ AUTO_INCREMENT=\d+/g, '') + ';');
    }
    statements.push('SET FOREIGN_KEY_CHECKS=1;');
    fs.mkdirSync('migrations', { recursive: true });
    fs.writeFileSync('migrations/000-baseline.sql', statements.join('\n\n'));
    console.log('Schema-only baseline saved');
  } finally { connection.release(); await db.end(); }
})().catch(error => { console.error(error.message); process.exitCode=1; });
