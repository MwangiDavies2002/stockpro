require('dotenv').config();
const {db}=require('./src/config/db');
(async()=>{const connection=await db.getConnection();try{await require('./src/config/accountingDetailMigration').migrateAccountingDetails(connection);console.log('Accounting detail names support at least 100 characters');}finally{connection.release();await db.end();}})().catch(error=>{console.error(error.message);process.exitCode=1;});
