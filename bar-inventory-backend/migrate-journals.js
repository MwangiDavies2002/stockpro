require('dotenv').config();const{db}=require('./src/config/db');
(async()=>{const c=await db.getConnection();try{await require('./src/config/journalMigration').migrateJournals(c);console.log('Journal entry classification is ready');}finally{c.release();await db.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
