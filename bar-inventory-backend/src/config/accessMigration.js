async function migrateAccess(connection){
 const add=async(table,column,type)=>{const [rows]=await connection.query(`SHOW COLUMNS FROM ${table} LIKE ?`,[column]);if(!rows.length)await connection.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);};
 await add('businesses','registration_plan',"VARCHAR(20) NOT NULL DEFAULT 'basic'");await add('users','access_role_id','INT NULL');
 await connection.query('CREATE TABLE IF NOT EXISTS access_roles (id INT AUTO_INCREMENT PRIMARY KEY,business_id INT NOT NULL,name VARCHAR(100) NOT NULL,permissions_json JSON NOT NULL,UNIQUE KEY role_shop_name(business_id,name))');
 await connection.query('CREATE TABLE IF NOT EXISTS user_locations (business_id INT NOT NULL,user_id INT NOT NULL,location_id INT NOT NULL,PRIMARY KEY(user_id,location_id),INDEX(business_id,location_id))');
}
module.exports={migrateAccess};
