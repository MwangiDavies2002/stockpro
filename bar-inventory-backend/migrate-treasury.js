require('dotenv').config();const{db}=require('./src/config/db');
(async()=>{const c=await db.getConnection();try{await require('./src/config/treasuryMigration').migrateTreasury(c);console.log('Treasury account details are ready');}finally{c.release();await db.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
