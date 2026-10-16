require('dotenv').config();const{db}=require('./src/config/db');
(async()=>{const c=await db.getConnection();try{await require('./src/config/salesWorkflowMigration').migrateSalesWorkflow(c);console.log('Sales document workflow schema is ready');}finally{c.release();await db.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
