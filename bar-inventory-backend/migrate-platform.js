require('dotenv').config();
const {db}=require('./src/config/db');
(async()=>{const conn=await db.getConnection();try{await require('./src/config/platformMigration').migratePlatform(conn);console.log('Superadmin schema ready');}finally{conn.release();await db.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
