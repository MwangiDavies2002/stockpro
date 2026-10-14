const crypto=require('node:crypto');
const {calculateSalesLine,calculateTotals}=require('../bar-inventory-backend/src/utils/salesMath');
const {calculateLine}=require('../bar-inventory-backend/src/utils/purchaseMath');
const {validateJournal}=require('../bar-inventory-backend/src/utils/journalValidation');
const sessions=new WeakMap();
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const safe=user=>{if(!user)return null;const{password,...result}=user;return result;};
const hash=value=>{const salt=crypto.randomBytes(16).toString('hex');return `${salt}:${crypto.pbkdf2Sync(value,salt,120000,32,'sha256').toString('hex')}`;};
function verify(value,stored){const[salt,digest]=String(stored).split(':');return /^[a-f0-9]{64}$/.test(digest||'')&&crypto.timingSafeEqual(Buffer.from(digest,'hex'),crypto.pbkdf2Sync(value,salt,120000,32,'sha256'));}
function validatePassword(value){if(String(value).length<10||!/[A-Z]/.test(value)||!/[a-z]/.test(value)||!/\d/.test(value))fail('Password must be at least 10 characters and include uppercase, lowercase and a number');}
function authenticate(db,authorization){const key=String(authorization||'').replace(/^Bearer /,'');const session=sessions.get(db)?.get(key);if(!session||session.expires<Date.now())fail('Please sign in',401);const user=db.prepare('SELECT * FROM users WHERE id=?').get(session.id);if(!user?.active||user.role!==session.role||user.business_id!==session.businessId)fail('Account access has changed. Please sign in again.',401);return user;}
function defaults(db,businessId){
  const definitions=[['payment_cash','1000','Cash','Assets','Debit'],['sales_receivable','1100','Accounts Receivable','Assets','Debit'],['inventory_asset','1200','Inventory','Assets','Debit'],['purchases_payable','2000','Accounts Payable','Liabilities','Credit'],['opening_balance_equity','3000','Opening Balance Equity','Equity','Credit'],['sales_revenue','4000','Sales Revenue','Income','Credit'],['inventory_cogs','5000','Cost of Sales','Expenses','Debit'],['purchases_expense','5100','Purchase Expense','Expenses','Debit'],['inventory_adjustment','5200','Inventory Adjustment','Expenses','Debit']];
  for(const[key,code,name,type,normal]of definitions){db.prepare('INSERT OR IGNORE INTO chart_of_accounts(business_id,account_code,account_name,account_type,normal_balance) VALUES (?,?,?,?,?)').run(businessId,code,name,type,normal);const account=db.prepare('SELECT id FROM chart_of_accounts WHERE business_id=? AND account_code=?').get(businessId,code);db.prepare('INSERT OR IGNORE INTO accounting_settings(business_id,setting_key,account_id) VALUES (?,?,?)').run(businessId,key,account.id);}
}
function apiRequest(db,request){
  const method=String(request.method||'get').toLowerCase(),url=String(request.url||'').replace(/^\/api/,'').split('?')[0],body=request.data||{},params=request.params||{};
  const all=(sql,...args)=>db.prepare(sql).all(...args),one=(sql,...args)=>db.prepare(sql).get(...args),run=(sql,...args)=>db.prepare(sql).run(...args);
  if(method==='post'&&url==='/auth/login'){
    const user=one('SELECT * FROM users WHERE lower(email)=lower(?)',String(body.email||''));if(!user?.active||!verify(String(body.password||''),user.password))fail('Invalid credentials',401);
    if(!sessions.has(db))sessions.set(db,new Map());const token=crypto.randomBytes(32).toString('hex');sessions.get(db).set(token,{id:user.id,role:user.role,businessId:user.business_id,expires:Date.now()+86400000*7});return {token,user:safe(user)};
  }
  if(method==='post'&&(url==='/auth/register'||url==='/auth/business-registration'))return db.transaction(()=>{
    const onboarding=url.endsWith('business-registration'),owner=onboarding?body.owner:body,business=body.business||{},settings=body.settings||{};
    if(!owner?.email||!(owner.name||owner.firstName))fail('Owner name and email are required');validatePassword(owner.password);
    if(onboarding&&owner.password!==owner.confirmPassword)fail('Passwords do not match');
    if(one('SELECT id FROM users WHERE lower(email)=lower(?)',owner.email))fail('Email already registered',409);
    const first=one('SELECT COUNT(*) count FROM users').count===0;
    if(!onboarding&&!first)fail('Use business registration to create a new shop',403);
    let businessId=1,locationId=1;
    if(onboarding&&!first){businessId=Number(run('INSERT INTO businesses(name,currency,timezone,settings_json) VALUES (?,?,?,?)',business.name||'My business',business.currency||'KES',business.timezone||'Africa/Nairobi',JSON.stringify(settings)).lastInsertRowid);locationId=Number(run('INSERT INTO locations(business_id,name,address) VALUES (?,?,?)',businessId,settings.defaultBusinessLocation||'Main Branch',business.city||'').lastInsertRowid);}
    else if(onboarding){run('UPDATE businesses SET name=?,currency=?,timezone=?,settings_json=? WHERE id=1',business.name||'My business',business.currency||'KES',business.timezone||'Africa/Nairobi',JSON.stringify(settings));run('UPDATE locations SET name=? WHERE id=1',settings.defaultBusinessLocation||'Main Branch');}
    const id=Number(run('INSERT INTO users(business_id,name,email,username,password,role,is_owner) VALUES (?,?,?,?,?,?,1)',businessId,owner.name||[owner.firstName,owner.lastName].filter(Boolean).join(' '),owner.email,owner.username||null,hash(owner.password),'admin').lastInsertRowid);defaults(db,businessId);
    const login=apiRequest(db,{method:'post',url:'/auth/login',data:{email:owner.email,password:owner.password}});return {...login,businessId,locationId};
  })();
  const user=authenticate(db,request.authorization),bid=user.business_id;
  const own=(table,id)=>{const row=table==='businesses'?one('SELECT * FROM businesses WHERE id=? AND id=?',Number(id),bid):one(`SELECT * FROM ${table} WHERE id=? AND business_id=?`,Number(id),bid);if(!row)fail('Record not found',404);return row;};
  const admin=()=>{if(user.role!=='admin')fail('Admin access required',403);};
  if(url==='/auth/me')return safe(user);
  if(url==='/auth/logout'){sessions.get(db).delete(String(request.authorization).replace(/^Bearer /,''));return {message:'Logged out'};}
  if(/^\/(accounts|accounting-settings|journal-entries|treasury|users|business-settings|etims|owner-network|subscriptions\/.*approve)/.test(url))admin();
  if(method!=='get'&&/^\/(inventory|orders|suppliers|locations|reference-data|discounts)/.test(url))admin();
  defaults(db,bid);
  const mapping=key=>one('SELECT account_id FROM accounting_settings WHERE business_id=? AND setting_key=?',bid,key)?.account_id;
  const journal=(description,lines,reference=null)=>{
    validateJournal(lines);for(const line of lines){const account=own('chart_of_accounts',line.account_id??line.accountId);if(!account.active)fail('Journal account is inactive');}
    const id=Number(run('INSERT INTO journal_entries(business_id,posting_date,description,reference,created_by) VALUES (?,date(\'now\'),?,?,?)',bid,description,reference,user.id).lastInsertRowid);
    for(const line of lines)run('INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit,credit,description) VALUES (?,?,?,?,?)',id,line.account_id??line.accountId,Number(line.debit||0),Number(line.credit||0),line.description||description);return id;
  };
  const log=(item,quantity,type,note)=>run('INSERT INTO inventory_stock_log(item_id,change_type,qty_change,before_stock,after_stock,note,user_id,created_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)',item.id,type,quantity,item.stock,Number(item.stock)+quantity,note,user.id);
  const once=(operation,fn)=>{if(!body.requestId)return fn();const previous=one('SELECT result_json FROM operation_requests WHERE business_id=? AND operation=? AND request_key=?',bid,operation,body.requestId);if(previous)return {...JSON.parse(previous.result_json),replayed:true};const result=fn();run('INSERT INTO operation_requests(business_id,operation,request_key,result_json) VALUES (?,?,?,?)',bid,operation,body.requestId,JSON.stringify(result));return result;};
  const insert=(table,values)=>{const keys=Object.keys(values);return Number(run(`INSERT INTO ${table}(${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`,...keys.map(key=>values[key]??null)).lastInsertRowid);};
  const numeric=(value,label='Amount',positive=false)=>{const number=Number(value);if(!Number.isFinite(number)||number<0||(positive&&number===0))fail(`${label} must be ${positive?'positive':'non-negative'}`);return number;};
  const inventoryPayload=()=>{
    if(!String(body.name||'').trim())fail('Item name is required');const locationId=Number(body.locationId||body.location_id||one('SELECT id FROM locations WHERE business_id=? ORDER BY id LIMIT 1',bid).id);own('locations',locationId);
    let category=String(body.category||''),unit=String(body.unit||'Pieces'),brand=String(body.brand||'');
    for(const[field,table]of[['categoryId','categories'],['unitId','units'],['brandId','brands']])if(body[field]){const ref=own(table,body[field]);if(ref.location_id!==locationId)fail('Reference must belong to selected location');if(field==='categoryId')category=ref.name;if(field==='unitId')unit=ref.name;if(field==='brandId')brand=ref.name;}
    const stock=numeric(body.stock??0,'Stock'),threshold=numeric(body.threshold??5,'Threshold');if(!Number.isInteger(stock)||!Number.isInteger(threshold))fail('Quantities must be whole numbers');
    return {business_id:bid,name:String(body.name).trim(),category,unit,brand,stock,threshold,cost:numeric(body.cost??0,'Purchase price'),price:numeric(body.price??0,'Selling price'),location_id:locationId,category_id:body.categoryId||null,unit_id:body.unitId||null,brand_id:body.brandId||null,supplier_id:body.supplierId||null,sku:body.sku||crypto.randomUUID(),barcode:body.barcode||null,image_url:body.imageUrl||null};
  };
  if(method==='post'&&url==='/inventory/import')return db.transaction(()=>once('inventory-import',()=>{
    if(!Array.isArray(body.items)||!body.items.length)fail('No items to import');const created=[],errors=[];let skippedCount=0;
    for(const[index,item]of body.items.entries()){try{const payload=apiRequest(db,{...request,url:'/inventory',data:{...item,locationId:body.locationId||item.locationId}});created.push({row:index+2,id:payload.id,name:payload.name});}catch(error){if(error.message==='SKU already exists')skippedCount++;else errors.push({row:index+2,name:item.name||'(blank)',message:error.message});}}
    return{createdCount:created.length,errorCount:errors.length,skippedCount,created,errors};
  }))();
  if(method==='get'&&url==='/inventory'){
    let sql='SELECT * FROM inventory_items WHERE business_id=?',args=[bid];if(params.locationId){sql+=' AND location_id=?';args.push(Number(params.locationId));}if(params.category){sql+=' AND category=?';args.push(params.category);}if(params.search){sql+=' AND (name LIKE ? OR sku LIKE ? OR barcode LIKE ?)';args.push(...Array(3).fill(`%${params.search}%`));}return all(sql+' ORDER BY name',...args);
  }
  if(method==='get'&&url==='/inventory/low-stock')return all('SELECT * FROM inventory_items WHERE business_id=? AND stock<=threshold ORDER BY name',bid);
  if(method==='post'&&url==='/inventory'){const values=inventoryPayload();if(body.sku&&one('SELECT id FROM inventory_items WHERE business_id=? AND location_id=? AND sku=?',bid,values.location_id,body.sku))fail('SKU already exists',409);return own('inventory_items',insert('inventory_items',values));}
  const itemRoute=url.match(/^\/inventory\/(\d+)(?:\/(history|restock|adjustment|sell))?$/);
  if(itemRoute){const item=own('inventory_items',itemRoute[1]),action=itemRoute[2];if(method==='get')return action==='history'?all('SELECT * FROM inventory_stock_log WHERE item_id=? ORDER BY id DESC',item.id):item;
    if(method==='put'){const values=inventoryPayload();delete values.sku;delete values.barcode;const keys=Object.keys(values);run(`UPDATE inventory_items SET ${keys.map(key=>`${key}=?`).join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=? AND business_id=?`,...keys.map(key=>values[key]),item.id,bid);return own('inventory_items',item.id);}
    if(method==='delete'){run('DELETE FROM inventory_items WHERE id=? AND business_id=?',item.id,bid);return{success:true};}
    if(method==='patch')return db.transaction(()=>{const quantity=Number(body.quantity);if(!Number.isInteger(quantity)||quantity===0||(action!=='adjustment'&&quantity<1))fail('Quantity must be a valid whole number');if(action==='sell')return apiRequest(db,{...request,url:'/sales',method:'post',data:{items:[{itemId:item.id,quantity,unitPrice:item.price}],paymentMethod:'cash',locationId:item.location_id}});if(action==='adjustment'&&String(body.reason||'').trim().length<5)fail('A correction reason of at least 5 characters is required');if(Number(item.stock)+quantity<0)fail('Stock cannot become negative');run('UPDATE inventory_items SET stock=stock+?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND business_id=?',quantity,item.id,bid);log(item,quantity,action==='restock'?'restock':'adjustment',body.reason||body.note||'Restock');if(action==='adjustment'&&item.cost*quantity!==0){const value=Math.abs(item.cost*quantity);journal('Stock adjustment',quantity>0?[{account_id:mapping('inventory_asset'),debit:value},{account_id:mapping('inventory_adjustment'),credit:value}]:[{account_id:mapping('inventory_adjustment'),debit:value},{account_id:mapping('inventory_asset'),credit:value}]);}return own('inventory_items',item.id);})();
  }
  const entityRoute=url.match(/^\/(suppliers|customers|locations|users|accounts)(?:\/(\d+))?$/);
  if(entityRoute){const resource=entityRoute[1],table=resource==='accounts'?'chart_of_accounts':resource,id=entityRoute[2];
    if(method==='get'){const rows=id?[own(table,id)]:all(`SELECT * FROM ${table} WHERE business_id=? ORDER BY id DESC`,bid);return id?(resource==='users'?safe(rows[0]):rows[0]):resource==='users'?rows.map(safe):rows;}
    const allowed={suppliers:['name','email','phone','address','items_supplied'],customers:['name','phone','credit_limit','active'],locations:['name','address','active','payment_options'],users:['name','email','phone','role','active','password'],accounts:['account_code','account_name','account_type','normal_balance','parent_id','account_subtype','detail_type','active','details']}[resource];
    const values={business_id:bid};for(const key of allowed){const value=body[key]??(key==='credit_limit'?body.creditLimit:undefined);if(value!==undefined)values[key]=typeof value==='object'?JSON.stringify(value):typeof value==='boolean'?Number(value):value;}
    if(resource==='users'){if(body.password){validatePassword(body.password);values.password=hash(body.password);}if(!['admin','employee'].includes(body.role||'employee'))fail('Invalid staff role');}
    if(resource==='customers')values.credit_limit=numeric(body.creditLimit??body.credit_limit??0,'Credit limit');
    if(method==='post'){if(!(values.name||values.account_name))fail('Name is required');const saved=own(table,insert(table,values));return resource==='users'?safe(saved):saved;}
    if(id){const old=own(table,id);if(method==='delete'){if(resource==='users'&&Number(id)===user.id)fail('Cannot delete your current user');run(`DELETE FROM ${table} WHERE id=? AND business_id=?`,Number(id),bid);return{success:true};}if(method==='put'){const keys=Object.keys(values);run(`UPDATE ${table} SET ${keys.map(key=>`${key}=?`).join(',')} WHERE id=? AND business_id=?`,...keys.map(key=>values[key]),Number(id),bid);const saved=own(table,id);return resource==='users'?safe(saved):saved;}}
  }
  const ref=url.match(/^\/reference-data\/(units|categories|brands)(?:\/(\d+))?$/);
  if(ref){const table=ref[1],id=ref[2];if(method==='get')return all(`SELECT * FROM ${table} WHERE business_id=?${params.locationId?' AND location_id=?':''} ORDER BY name`,bid,...(params.locationId?[Number(params.locationId)]:[]));if(method==='delete'){own(table,id);run(`DELETE FROM ${table} WHERE id=? AND business_id=?`,Number(id),bid);return{success:true};}const location=own('locations',body.locationId);if(!String(body.name||'').trim())fail('Name is required');const values={business_id:bid,location_id:location.id,name:body.name,description:body.description||null};if(table==='units'){values.short_name=body.shortName||null;values.allow_decimal=Number(!!body.allowDecimal);values.base_unit_id=body.baseUnitId||null;values.multiplier=body.multiplier||null;}if(table==='categories'){values.parent_id=body.parentId||null;values.code=body.code||null;}if(method==='post')return own(table,insert(table,values));if(method==='put'){own(table,id);const keys=Object.keys(values);run(`UPDATE ${table} SET ${keys.map(key=>`${key}=?`).join(',')} WHERE id=? AND business_id=?`,...keys.map(key=>values[key]),Number(id),bid);return own(table,id);}}
  const toggle=url.match(/^\/users\/(\d+)\/toggle-active$/);if(toggle&&method==='patch'){const target=own('users',toggle[1]);if(target.id===user.id)fail('Cannot deactivate your current user');run('UPDATE users SET active=? WHERE id=?',target.active?0:1,target.id);return safe(own('users',target.id));}
  if(url==='/business-settings'){if(method==='get')return JSON.parse(own('businesses',bid).settings_json||'{}');run('UPDATE businesses SET settings_json=? WHERE id=?',JSON.stringify(body),bid);return{settings:body};}
  // Remaining transactional modules are implemented in a separate dispatch module.
  return require('./desktop-transactions').dispatch({db,request,method,url,body,params,user,bid,own,all,one,run,insert,numeric,journal,mapping,log,once,admin});
}
module.exports={apiRequest,authenticate};
