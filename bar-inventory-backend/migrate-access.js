require('dotenv').config();
const {db}=require('./src/config/db');
(async()=>{const conn=await db.getConnection();try{await require('./src/config/accessMigration').migrateAccess(conn);console.log('Package, role and location schema is ready');}finally{conn.release();await db.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
