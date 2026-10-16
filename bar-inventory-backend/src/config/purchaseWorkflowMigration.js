async function migratePurchases(c){
 const add=async(table,name,type)=>{const[rows]=await c.query(`SHOW COLUMNS FROM ${table} LIKE ?`,[name]);if(!rows.length)await c.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);};
 for(const [name,type]of [['payable_account_id','INT NULL'],['paid_amount','DECIMAL(15,2) NOT NULL DEFAULT 0'],['due_date','DATE NULL'],['tax_treatment',"VARCHAR(20) NOT NULL DEFAULT 'included'"],['shipping_cost','DECIMAL(15,2) NOT NULL DEFAULT 0'],['other_cost','DECIMAL(15,2) NOT NULL DEFAULT 0'],['shipping_details','TEXT NULL'],['other_cost_note','TEXT NULL'],['supplier_snapshot','JSON NULL']])await add('orders',name,type);
 await add('order_items','lot_number','VARCHAR(100) NULL');
 await c.query('CREATE TABLE IF NOT EXISTS purchase_payments(id INT AUTO_INCREMENT PRIMARY KEY,business_id INT NOT NULL,order_id INT NOT NULL,amount DECIMAL(15,2) NOT NULL,method VARCHAR(20) NOT NULL,treasury_id INT NULL,cash_account_id INT NOT NULL,reference_no VARCHAR(100) NULL,notes TEXT NULL,created_by INT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,INDEX(order_id,business_id))');
 await c.query('CREATE TABLE IF NOT EXISTS purchase_events(id INT AUTO_INCREMENT PRIMARY KEY,business_id INT NOT NULL,order_id INT NOT NULL,user_id INT NULL,action VARCHAR(40) NOT NULL,details_json JSON NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,INDEX(order_id,business_id))');
}
module.exports={migratePurchases};
