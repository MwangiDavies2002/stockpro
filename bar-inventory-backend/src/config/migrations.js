async function migrate(connection) {
  const q = (sql, params=[]) => connection.query(sql,params);
  const add = async (table,column,type) => { const [rows]=await q(`SHOW COLUMNS FROM ${table} LIKE ?`,[column]); if (!rows.length) await q(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`); };
  await q('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(100) PRIMARY KEY,applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
  const step = async (version, fn) => { const [rows]=await q('SELECT version FROM schema_migrations WHERE version=?',[version]); if (!rows.length) { await fn(); await q('INSERT INTO schema_migrations(version) VALUES (?)',[version]); } };
  await step('001-shop-financial-scope', async () => {
    for (const table of ['accounting_settings','journal_entries','shifts']) await add(table,'business_id','INT NOT NULL DEFAULT 1');
    await q('UPDATE journal_entries j JOIN users u ON u.id=j.created_by SET j.business_id=u.business_id');
    await q('UPDATE shifts s JOIN users u ON u.id=s.user_id SET s.business_id=u.business_id');
    await q('UPDATE accounting_settings s LEFT JOIN chart_of_accounts a ON a.id=s.account_id LEFT JOIN treasury t ON t.id=s.treasury_id SET s.business_id=COALESCE(a.business_id,t.business_id,s.business_id)');
    const [primary]=await q("SHOW INDEX FROM accounting_settings WHERE Key_name='PRIMARY'");
    if (!primary.some(row=>row.Column_name==='business_id')) await q('ALTER TABLE accounting_settings DROP PRIMARY KEY, ADD PRIMARY KEY(business_id,setting_key)');
    for (const [table,column,index] of [['chart_of_accounts','account_code','shop_account_code'],['journal_entries','reference','shop_journal_reference']]) {
      const [indices]=await q(`SHOW INDEX FROM ${table}`);
      const single=indices.filter(row=>!row.Non_unique && row.Column_name===column && row.Key_name!=='PRIMARY' && indices.filter(other=>other.Key_name===row.Key_name).length===1);
      for (const row of single) await q(`ALTER TABLE ${table} DROP INDEX \`${row.Key_name}\``);
      if (!indices.some(row=>row.Key_name===index)) await q(`ALTER TABLE ${table} ADD UNIQUE KEY ${index}(business_id,${column})`);
    }
  });
  await step('002-import-and-retries', async () => {
    await q("ALTER TABLE inventory_items MODIFY category VARCHAR(512) NOT NULL DEFAULT ''");
    await q('CREATE TABLE IF NOT EXISTS operation_requests (business_id INT NOT NULL,operation VARCHAR(40) NOT NULL,request_key VARCHAR(100) NOT NULL,result_json JSON NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(business_id,operation,request_key))');
  });
  await step('003-provider-tables', async () => {
    await q('CREATE TABLE IF NOT EXISTS owner_network_members (business_id INT PRIMARY KEY,region VARCHAR(80) NOT NULL,segment VARCHAR(80) NOT NULL,opted_in BOOLEAN NOT NULL DEFAULT FALSE,verified BOOLEAN NOT NULL DEFAULT FALSE,joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
    await q('CREATE TABLE IF NOT EXISTS owner_network_invites (code_hash CHAR(64) PRIMARY KEY,business_id INT NOT NULL,expires_at DATETIME NOT NULL,used_by INT NULL,INDEX(business_id))');
    await q("CREATE TABLE IF NOT EXISTS mpesa_payments (id INT AUTO_INCREMENT PRIMARY KEY,business_id INT NOT NULL,transaction_id VARCHAR(100) NOT NULL UNIQUE,phone VARCHAR(30),amount DECIMAL(15,2) NOT NULL,price_group VARCHAR(30),mpesa_receipt VARCHAR(100) UNIQUE,status VARCHAR(30) NOT NULL DEFAULT 'pending',item_id INT NULL,item_name VARCHAR(150),purpose VARCHAR(30) DEFAULT 'sale',reference_id INT NULL,result_code INT NULL,verified_at DATETIME NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
    await q("CREATE TABLE IF NOT EXISTS notifications (id INT AUTO_INCREMENT PRIMARY KEY,business_id INT NOT NULL,type VARCHAR(40) NOT NULL,title VARCHAR(200) NOT NULL,message TEXT NOT NULL,read_at DATETIME NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
    await q("CREATE TABLE IF NOT EXISTS integration_jobs (id INT AUTO_INCREMENT PRIMARY KEY,business_id INT NOT NULL,provider VARCHAR(30) NOT NULL,reference_id INT NULL,payload JSON NOT NULL,status VARCHAR(30) DEFAULT 'pending',attempts INT DEFAULT 0,response_json JSON NULL,last_error TEXT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)");
  });
  await step('004-historical-costs', async () => {
    await add('sale_items','unit_cost','DECIMAL(15,4) NULL'); await add('sale_items','net_revenue','DECIMAL(15,2) NULL'); await add('sales_document_items','unit_cost','DECIMAL(15,4) NULL');
  });
  await step('005-provider-state',async()=>{
    await add('mpesa_payments','payload_json','JSON NULL');await add('mpesa_payments','created_by','INT NULL');
    await add('businesses','etims_branch_id',"VARCHAR(2) NOT NULL DEFAULT '00'");
    await add('businesses','etims_last_invoice_no','BIGINT NOT NULL DEFAULT 0');
    await add('businesses','etims_initialized','BOOLEAN NOT NULL DEFAULT FALSE');
    await add('sales_documents','etims_invoice_number','BIGINT NULL');await add('sales_documents','etims_receipt_json','JSON NULL');
    for(const[column,type]of [['etims_item_code','VARCHAR(60) NULL'],['etims_class_code','VARCHAR(20) NULL'],['etims_tax_category','VARCHAR(5) NULL'],['etims_qty_unit','VARCHAR(5) NULL'],['etims_pkg_unit','VARCHAR(5) NULL']])await add('inventory_items',column,type);
  });
  await step('006-shift-sale-boundary',async()=>{
    await add('shifts','sales_start_id','BIGINT NULL');
  });
  await step('007-packages-roles-locations',()=>require('./accessMigration').migrateAccess(connection));

  await step('008-platform-superadmin',()=>require('./platformMigration').migratePlatform(connection));

  await step('009-themes-business-creation',()=>require('./platformMigration').migratePlatform(connection));
  await step('010-accounting-detail-length',()=>require('./accountingDetailMigration').migrateAccountingDetails(connection));
  await step('011-opening-journal-policy',()=>require('./journalMigration').migrateJournals(connection));
  await step('012-treasury-details',()=>require('./treasuryMigration').migrateTreasury(connection));
  await step('013-sales-document-workflow',()=>require('./salesWorkflowMigration').migrateSalesWorkflow(connection));
  await step('014-purchase-payables',()=>require('./purchaseWorkflowMigration').migratePurchases(connection));
  await step('015-inventory-catalog-integrity',()=>require('./inventoryMigration').migrateInventory(connection));
  await step('016-stock-transfers-expenses',()=>require('./operationsMigration').migrateOperations(connection));
  await step('017-discount-customer-restrictions',async()=>{
    await add('discounts','customer_restriction_id','INT NULL');
    await add('users','google_sub','VARCHAR(255) NULL');
  });
  await step('018-product-identifiers-and-sellability',async()=>{
    await add('inventory_items','barcode_type',"VARCHAR(20) NOT NULL DEFAULT 'code128'");
    await add('inventory_items','track_serial_numbers','BOOLEAN NOT NULL DEFAULT FALSE');
    await add('inventory_items','serial_number','VARCHAR(150) NULL');
    await add('inventory_items','chassis_number','VARCHAR(100) NULL');
    await add('inventory_items','color','VARCHAR(80) NULL');
    await add('inventory_items','lot_number','VARCHAR(100) NULL');
    await add('inventory_items','not_for_selling','BOOLEAN NOT NULL DEFAULT FALSE');
  });
  await step('019-customer-contact-details',async()=>{
    for(const[column,type]of [['contact_type',"VARCHAR(20) NOT NULL DEFAULT 'customer'"],['entity_type',"VARCHAR(20) NOT NULL DEFAULT 'individual'"],['contact_id','VARCHAR(40) NULL'],['customer_group','VARCHAR(100) NULL'],['currency_code',"VARCHAR(3) NOT NULL DEFAULT 'KES'"],['alternate_phone','VARCHAR(20) NULL'],['landline','VARCHAR(20) NULL'],['email','VARCHAR(150) NULL'],['assigned_to','VARCHAR(120) NULL'],['account_type','VARCHAR(30) NULL'],['tax_number','VARCHAR(50) NULL'],['address_line1','VARCHAR(200) NULL'],['address_line2','VARCHAR(200) NULL'],['city','VARCHAR(100) NULL'],['state','VARCHAR(100) NULL'],['country','VARCHAR(100) NULL'],['zip_code','VARCHAR(20) NULL']])await add('customers',column,type);
    const[indices]=await q('SHOW INDEX FROM customers');if(!indices.some(row=>row.Key_name==='uq_customer_business_contact'))await q('ALTER TABLE customers ADD UNIQUE KEY uq_customer_business_contact(business_id,contact_id)');
  });
  await step('020-customer-opening-and-address-details',async()=>{
    for(const[column,type]of [['opening_balance','DECIMAL(15,2) NOT NULL DEFAULT 0'],['payment_term_value','INT NULL'],['payment_term_unit','VARCHAR(20) NULL'],['landmark','VARCHAR(150) NULL'],['street_name','VARCHAR(150) NULL'],['building_number','VARCHAR(50) NULL'],['additional_number','VARCHAR(50) NULL'],['id_number','VARCHAR(80) NULL'],...Array.from({length:10},(_,i)=>[`custom_field_${i+1}`,'VARCHAR(200) NULL'])])await add('customers',column,type);
  });
  await step('021-built-in-cashier-role',async()=>{
    const access=require('../utils/accessPolicy');
    await add('access_roles','is_builtin','BOOLEAN NOT NULL DEFAULT FALSE');
    const permissions=JSON.stringify(access.permissionDefaults(false));
    const [businesses]=await q('SELECT id FROM businesses');
    for(const business of businesses){
      await q('INSERT IGNORE INTO access_roles (business_id,name,permissions_json,is_builtin) VALUES (?,?,?,TRUE)',[business.id,'Cashier',permissions]);
      await q('UPDATE access_roles SET is_builtin=TRUE WHERE business_id=? AND name=?',[business.id,'Cashier']);
      await q("UPDATE users u JOIN access_roles r ON r.business_id=u.business_id AND r.name='Cashier' SET u.access_role_id=r.id WHERE u.business_id=? AND u.role='employee' AND u.access_role_id IS NULL",[business.id]);
    }
  });

}
module.exports = { migrate };
