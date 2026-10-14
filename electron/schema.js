function upgrade(db){
  const add=(table,name,type)=>{if(!db.prepare(`PRAGMA table_info(${table})`).all().some(row=>row.name===name))db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);};
  db.exec(`
    CREATE TABLE IF NOT EXISTS businesses(id INTEGER PRIMARY KEY,name TEXT NOT NULL,currency TEXT DEFAULT 'KES',timezone TEXT DEFAULT 'Africa/Nairobi',settings_json TEXT DEFAULT '{}',etims_config TEXT DEFAULT '{}');
    CREATE TABLE IF NOT EXISTS units(id INTEGER PRIMARY KEY, business_id INTEGER NOT NULL,location_id INTEGER NOT NULL,name TEXT NOT NULL,short_name TEXT,allow_decimal INTEGER DEFAULT 0,base_unit_id INTEGER,multiplier REAL,description TEXT);
    CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY,business_id INTEGER NOT NULL,location_id INTEGER NOT NULL,name TEXT NOT NULL,code TEXT,parent_id INTEGER,description TEXT);
    CREATE TABLE IF NOT EXISTS brands(id INTEGER PRIMARY KEY,business_id INTEGER NOT NULL,location_id INTEGER NOT NULL,name TEXT NOT NULL,description TEXT);
    CREATE TABLE IF NOT EXISTS accounting_settings(business_id INTEGER NOT NULL,setting_key TEXT NOT NULL,account_id INTEGER,treasury_id INTEGER,PRIMARY KEY(business_id,setting_key));
    CREATE TABLE IF NOT EXISTS customer_payments(id INTEGER PRIMARY KEY,business_id INTEGER NOT NULL,customer_id INTEGER NOT NULL,amount REAL NOT NULL,method TEXT,notes TEXT,created_by INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS sales_documents(id INTEGER PRIMARY KEY,business_id INTEGER NOT NULL,type TEXT NOT NULL,status TEXT NOT NULL,customer_id INTEGER,reference_no TEXT,document_date TEXT,location_id INTEGER,converted_from_id INTEGER,reference_invoice_id INTEGER,sale_id INTEGER,subtotal REAL DEFAULT 0,discount_total REAL DEFAULT 0,tax_total REAL DEFAULT 0,total REAL DEFAULT 0,paid_amount REAL DEFAULT 0,balance_due REAL DEFAULT 0,notes TEXT,created_by INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS sales_document_items(id INTEGER PRIMARY KEY,document_id INTEGER NOT NULL,item_id INTEGER,item_name TEXT,quantity INTEGER,unit_price REAL,unit_cost REAL,discount_percent REAL,discount_amount REAL,tax_percent REAL,tax_amount REAL,subtotal REAL,line_total REAL);
    CREATE TABLE IF NOT EXISTS sales_document_payments(id INTEGER PRIMARY KEY,document_id INTEGER NOT NULL,amount REAL,method TEXT,reference_no TEXT,notes TEXT,created_by INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS discounts(id INTEGER PRIMARY KEY,business_id INTEGER NOT NULL,location_id INTEGER NOT NULL,name TEXT,discount_type TEXT,value REAL,applies_to TEXT,product_id INTEGER,category_id INTEGER,customer_id INTEGER,active INTEGER DEFAULT 1);
    CREATE TABLE IF NOT EXISTS treasury_transactions(id INTEGER PRIMARY KEY,treasury_id INTEGER NOT NULL,transaction_type TEXT NOT NULL,amount REAL NOT NULL,reference TEXT,description TEXT,date TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS subscriptions(id INTEGER PRIMARY KEY,business_id INTEGER NOT NULL,plan TEXT,amount REAL,payment_method TEXT,phone TEXT,status TEXT DEFAULT 'pending',checkout_request_id TEXT,start_date TEXT,end_date TEXT,approved_at TEXT,created_by INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS loyalty_redemptions(id INTEGER PRIMARY KEY,business_id INTEGER NOT NULL,customer_id INTEGER,reward TEXT,points INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS owner_network_members(business_id INTEGER PRIMARY KEY,region TEXT,segment TEXT,opted_in INTEGER DEFAULT 0,verified INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS mpesa_payments(id INTEGER PRIMARY KEY,business_id INTEGER NOT NULL,transaction_id TEXT UNIQUE,phone TEXT,amount REAL,status TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS operation_requests(business_id INTEGER NOT NULL,operation TEXT NOT NULL,request_key TEXT NOT NULL,result_json TEXT,PRIMARY KEY(business_id,operation,request_key));
    CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY,business_id INTEGER NOT NULL,type TEXT,title TEXT,message TEXT,read_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  `);
  for(const table of ['users','suppliers','inventory_items','shifts','sales','journal_entries','chart_of_accounts','locations','customers','treasury','orders'])add(table,'business_id','INTEGER NOT NULL DEFAULT 1');
  const fields={
    users:{username:'TEXT',is_owner:'INTEGER DEFAULT 0'},
    inventory_items:{location_id:'INTEGER DEFAULT 1',category_id:'INTEGER',unit_id:'INTEGER',brand_id:'INTEGER',brand:'TEXT',barcode:'TEXT',sku:'TEXT',image_url:'TEXT',previous_unit_price:'REAL',previous_discount:'REAL'},
    locations:{active:'INTEGER DEFAULT 1',payment_options:'TEXT'},customers:{active:'INTEGER DEFAULT 1'},
    shifts:{user_id:'INTEGER',closing_expected:'REAL DEFAULT 0',closing_actual:'REAL DEFAULT 0',variance:'REAL DEFAULT 0',notes:'TEXT'},
    sales:{created_by:'INTEGER',location_id:'INTEGER DEFAULT 1',customer_id:'INTEGER',notes:'TEXT'},
    sale_items:{item_name:'TEXT',unit_cost:'REAL',net_revenue:'REAL'},
    chart_of_accounts:{parent_id:'INTEGER',account_subtype:'TEXT',detail_type:'TEXT',details:'TEXT'},
    treasury:{account_number:'TEXT',linked_gl_account:'INTEGER',opening_balance:'REAL DEFAULT 0',notes:'TEXT',updated_at:'TEXT'},
    order_items:{cost_before_discount:'REAL',discount_percent:'REAL DEFAULT 0',tax_percent:'REAL DEFAULT 0',profit_margin:'REAL DEFAULT 0',selling_price:'REAL',net_cost:'REAL',subtotal:'REAL'},
    orders:{reference_no:'TEXT',purchase_date:'TEXT',pay_term:'TEXT',created_by:'INTEGER'},inventory_stock_log:{user_id:'INTEGER',created_at:'TEXT'},journal_entries:{notes:'TEXT'},
  };
  for(const[table,columns]of Object.entries(fields))for(const[name,type]of Object.entries(columns))add(table,name,type);
  const columns=db.prepare('PRAGMA table_info(chart_of_accounts)').all();
  const ddl=db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='chart_of_accounts'").get().sql;
  if(/account_code\s+TEXT\s+UNIQUE/i.test(ddl)){
    db.exec('PRAGMA foreign_keys=OFF');
    db.transaction(()=>{
      db.exec('ALTER TABLE chart_of_accounts RENAME TO old_chart_of_accounts');
      db.exec(`CREATE TABLE chart_of_accounts(${columns.map(column=>`"${column.name}" ${column.type}${column.pk?' PRIMARY KEY':column.notnull?' NOT NULL':''}${column.dflt_value!==null?' DEFAULT '+column.dflt_value:''}`).join(',')},UNIQUE(business_id,account_code))`);
      const names=columns.map(column=>`"${column.name}"`).join(',');
      db.exec(`INSERT INTO chart_of_accounts(${names}) SELECT ${names} FROM old_chart_of_accounts`);db.exec('DROP TABLE old_chart_of_accounts');
    })();
    db.exec('PRAGMA foreign_keys=ON');
  }
  db.exec("INSERT OR IGNORE INTO businesses(id,name) VALUES (1,'My business'); INSERT OR IGNORE INTO locations(id,business_id,name) VALUES (1,1,'Main Branch'); PRAGMA user_version=2;");
}
module.exports={upgrade};
