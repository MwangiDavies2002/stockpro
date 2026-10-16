async function migrateSalesWorkflow(c){
 const add=async(table,name,type)=>{const[rows]=await c.query(`SHOW COLUMNS FROM ${table} LIKE ?`,[name]);if(!rows.length)await c.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);};
 for(const [name,type] of [['due_date','DATE NULL'],['valid_until','DATE NULL'],['terms','TEXT NULL'],['staff_notes','TEXT NULL'],['customer_snapshot','JSON NULL'],['seller_snapshot','JSON NULL']])await add('sales_documents',name,type);
 await add('sales_document_items','sku','VARCHAR(100) NULL');await add('sales_document_items','unit','VARCHAR(50) NULL');
 await c.query('CREATE TABLE IF NOT EXISTS sales_document_events(id INT AUTO_INCREMENT PRIMARY KEY,business_id INT NOT NULL,document_id INT NOT NULL,user_id INT NULL,action VARCHAR(40) NOT NULL,details_json JSON NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,INDEX(document_id,business_id))');
}
module.exports={migrateSalesWorkflow};
