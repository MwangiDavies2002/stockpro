const {PACKAGES}=require('../utils/accessPolicy');
async function migratePlatform(connection){
 const add=async(table,column,type)=>{const [rows]=await connection.query(`SHOW COLUMNS FROM ${table} LIKE ?`,[column]);if(!rows.length)await connection.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);};
 await connection.query("ALTER TABLE businesses MODIFY registration_plan VARCHAR(30) NOT NULL DEFAULT 'basic'");
 await add('users','theme_color','VARCHAR(7) NULL');
 await add('businesses','created_by','INT NULL');
 await add('subscriptions','recorded_payment_method','VARCHAR(20) NULL');await add('subscriptions','payment_reference','VARCHAR(100) NULL');
 await add('users','is_superadmin','BOOLEAN NOT NULL DEFAULT FALSE');
 await add('businesses','platform_status',"VARCHAR(20) NOT NULL DEFAULT 'active'");
 await add('businesses','subscription_mode',"VARCHAR(20) NOT NULL DEFAULT 'registration'");
 await add('subscriptions','coupon_code','VARCHAR(40) NULL');await add('subscriptions','original_amount','DECIMAL(12,2) NULL');await add('subscriptions','admin_note','VARCHAR(500) NULL');
 await connection.query('CREATE TABLE IF NOT EXISTS platform_packages (id VARCHAR(30) PRIMARY KEY,name VARCHAR(100) NOT NULL,price DECIMAL(12,2) NOT NULL,max_locations INT NULL,max_members INT NULL,modules_json JSON NOT NULL,active BOOLEAN NOT NULL DEFAULT TRUE)');
 await connection.query('CREATE TABLE IF NOT EXISTS platform_settings (id INT PRIMARY KEY,settings_json JSON NOT NULL)');
 await connection.query('CREATE TABLE IF NOT EXISTS platform_coupons (id INT AUTO_INCREMENT PRIMARY KEY,code VARCHAR(40) NOT NULL UNIQUE,discount_type VARCHAR(20) NOT NULL,value DECIMAL(12,2) NOT NULL,active BOOLEAN NOT NULL DEFAULT TRUE,expires_at DATETIME NULL,business_id INT NULL,package_ids_json JSON NOT NULL)');
 await connection.query('CREATE TABLE IF NOT EXISTS platform_audit (id BIGINT AUTO_INCREMENT PRIMARY KEY,actor_user_id INT NOT NULL,business_id INT NULL,action VARCHAR(100) NOT NULL,details_json JSON NOT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)');
 await connection.query('CREATE TABLE IF NOT EXISTS support_sessions (id VARCHAR(64) PRIMARY KEY,actor_user_id INT NOT NULL,target_user_id INT NOT NULL,business_id INT NOT NULL,reason VARCHAR(500) NOT NULL,expires_at DATETIME NOT NULL,ended_at DATETIME NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)');
 for(const p of Object.values(PACKAGES))await connection.query('INSERT IGNORE INTO platform_packages (id,name,price,max_locations,max_members,modules_json) VALUES (?,?,?,?,?,?)',[p.id,p.name,p.price,p.maxLocations,p.maxMembers,JSON.stringify(p.modules)]);
 await connection.query('INSERT IGNORE INTO platform_settings (id,settings_json) VALUES (1,?)',[JSON.stringify({appName:'StockPro',supportEmail:'',registrationEnabled:true,expiryAlertDays:7})]);
}
module.exports={migratePlatform};
