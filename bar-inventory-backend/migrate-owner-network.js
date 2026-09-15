require('dotenv').config();
const { query, db } = require('./src/config/db');
(async () => {
  await query(`CREATE TABLE IF NOT EXISTS owner_network_members (business_id INT PRIMARY KEY, region VARCHAR(80) NOT NULL, segment VARCHAR(80) NOT NULL, opted_in BOOLEAN NOT NULL DEFAULT FALSE, verified BOOLEAN NOT NULL DEFAULT FALSE, joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
  await query(`CREATE TABLE IF NOT EXISTS owner_network_invites (code_hash CHAR(64) PRIMARY KEY, business_id INT NOT NULL, expires_at DATETIME NOT NULL, used_by INT NULL, INDEX (business_id))`);
  console.log('Owner network tables ready');
})().catch(e => { console.error(e.message); process.exitCode=1; }).finally(() => db.end());
