async function migrateJournals(connection){
 const[rows]=await connection.query("SHOW COLUMNS FROM journal_entries LIKE 'entry_type'");
 if(!rows.length)await connection.query("ALTER TABLE journal_entries ADD COLUMN entry_type VARCHAR(20) NOT NULL DEFAULT 'system'");
}
module.exports={migrateJournals};
