async function migrateTreasury(connection){
 const[rows]=await connection.query("SHOW COLUMNS FROM treasury LIKE 'details'");
 if(!rows.length)await connection.query('ALTER TABLE treasury ADD COLUMN details JSON NULL');
}
module.exports={migrateTreasury};
