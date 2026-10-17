const policy=require('../bar-inventory-backend/src/utils/accessPolicy');
const accessService=require('./access');
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
function authenticate(db,authorization){const key=String(authorization||'').replace(/^Bearer /,'');const session=sessions.get(db)?.get(key);if(!session||session.expires<Date.now())fail('Please sign in',401);const user=db.prepare('SELECT * FROM users WHERE id=?').get(session.id);if(!user?.active||user.role!==session.role||user.business_id!==session.businessId)fail('Account access has changed. Please sign in again.',401);if(session.supportSessionId){const support=db.prepare('SELECT s.*,u.name actor_name,u.theme_color actor_theme_color,u.active actor_active,u.is_superadmin FROM support_sessions s JOIN users u ON u.id=s.actor_user_id WHERE s.id=? AND s.ended_at IS NULL AND s.expires_at>CURRENT_TIMESTAMP').get(session.supportSessionId);if(!support||!support.actor_active||!support.is_superadmin||support.target_user_id!==user.id||support.business_id!==user.business_id)fail('Support session expired or revoked',401);user.supportSession={id:support.id,actorId:support.actor_user_id,actorName:support.actor_name,businessName:db.prepare('SELECT name FROM businesses WHERE id=?').get(user.business_id).name,expiresAt:support.expires_at,themeColor:support.actor_theme_color};user.is_superadmin=0;}
 user.access=accessService.loadAccess(db,user);return user;}
function defaults(db,businessId){
  const definitions=[['payment_cash','1000','Cash','Assets','Debit'],['sales_receivable','1100','Accounts Receivable','Assets','Debit'],['inventory_asset','1200','Inventory','Assets','Debit'],['purchases_payable','2000','Accounts Payable','Liabilities','Credit'],['opening_balance_equity','3000','Opening Balance Equity','Equity','Credit'],['sales_revenue','4000','Sales Revenue','Income','Credit'],['inventory_cogs','5000','Cost of Sales','Expenses','Debit'],['purchases_expense','5100','Purchase Expense','Expenses','Debit'],['inventory_adjustment','5200','Inventory Adjustment','Expenses','Debit']];
  for(const[key,code,name,type,normal]of definitions){db.prepare('INSERT OR IGNORE INTO chart_of_accounts(business_id,account_code,account_name,account_type,normal_balance) VALUES (?,?,?,?,?)').run(businessId,code,name,type,normal);const account=db.prepare('SELECT id FROM chart_of_accounts WHERE business_id=? AND account_code=?').get(businessId,code);db.prepare('INSERT OR IGNORE INTO accounting_settings(business_id,setting_key,account_id) VALUES (?,?,?)').run(businessId,key,account.id);}
}
function apiRequest(db,request){
  const method=String(request.method||'get').toLowerCase(),url=String(request.url||'').replace(/^\/api/,'').split('?')[0],body=request.data||{},params=request.params||{};
  let scopedUser=null;
  const safe=row=>{if(!row)return null;const {password,...result}=row;return {...result,accessRoleId:row.access_role_id||null,locationIds:db.prepare('SELECT location_id FROM user_locations WHERE user_id=? AND business_id=?').all(row.id,row.business_id).map(r=>r.location_id)};};
  const all=(sql,...args)=>db.prepare(policy.scopeSelect(sql,scopedUser)).all(...args),one=(sql,...args)=>db.prepare(policy.scopeSelect(sql,scopedUser)).get(...args),run=(sql,...args)=>db.prepare(sql).run(...args);
  if(method==='get'&&url==='/auth/packages')return all('SELECT * FROM platform_packages WHERE active=1 ORDER BY price,id').map(require('../bar-inventory-backend/src/utils/platformPolicy').packageRecord);
  if(method==='post'&&url==='/auth/login'){
    const user=one('SELECT * FROM users WHERE lower(email)=lower(?)',String(body.email||''));if(!user?.active||!verify(String(body.password||''),user.password))fail('Invalid credentials',401);
    if(!sessions.has(db))sessions.set(db,new Map());const token=crypto.randomBytes(32).toString('hex');sessions.get(db).set(token,{id:user.id,role:user.role,businessId:user.business_id,expires:Date.now()+86400000*7});return {token,user:{...safe(user),access:accessService.loadAccess(db,user)}};
  }
  if(method==='post'&&(url==='/auth/register'||url==='/auth/business-registration'))return db.transaction(()=>{
    const onboarding=url.endsWith('business-registration'),owner=onboarding?body.owner:body,business=body.business||{},settings=body.settings||{};
    if(onboarding&&!one('SELECT id FROM platform_packages WHERE id=? AND active=1',body.plan))fail('Choose a valid package');
    if(onboarding&&JSON.parse(one('SELECT settings_json FROM platform_settings WHERE id=1').settings_json).registrationEnabled===false)fail('New business registration is currently closed',403);
    if(!owner?.email||!(owner.name||owner.firstName))fail('Owner name and email are required');validatePassword(owner.password);
    if(onboarding&&owner.password!==owner.confirmPassword)fail('Passwords do not match');
    if(one('SELECT id FROM users WHERE lower(email)=lower(?)',owner.email))fail('Email already registered',409);
    const first=one('SELECT COUNT(*) count FROM users').count===0;
    if(!onboarding&&!first)fail('Use business registration to create a new shop',403);
    let businessId=1,locationId=1;
    if(onboarding&&!first){businessId=Number(run('INSERT INTO businesses(name,currency,timezone,settings_json) VALUES (?,?,?,?)',business.name||'My business',business.currency||'KES',business.timezone||'Africa/Nairobi',JSON.stringify(settings)).lastInsertRowid);locationId=Number(run('INSERT INTO locations(business_id,name,address) VALUES (?,?,?)',businessId,settings.defaultBusinessLocation||'Main Branch',business.city||'').lastInsertRowid);}
    else if(onboarding){run('UPDATE businesses SET name=?,currency=?,timezone=?,settings_json=? WHERE id=1',business.name||'My business',business.currency||'KES',business.timezone||'Africa/Nairobi',JSON.stringify(settings));run('UPDATE locations SET name=? WHERE id=1',settings.defaultBusinessLocation||'Main Branch');}
    run('UPDATE businesses SET registration_plan=? WHERE id=?',onboarding?body.plan:'basic',businessId);
    const id=Number(run('INSERT INTO users(business_id,name,email,username,password,role,is_owner) VALUES (?,?,?,?,?,?,1)',businessId,owner.name||[owner.firstName,owner.lastName].filter(Boolean).join(' '),owner.email,owner.username||null,hash(owner.password),'admin').lastInsertRowid);defaults(db,businessId);
    const login=apiRequest(db,{method:'post',url:'/auth/login',data:{email:owner.email,password:owner.password}});return {...login,businessId,locationId};
  })();
  const user=authenticate(db,request.authorization),bid=user.business_id;
  policy.assertAccess(user.access,url,method,body);
  if(url.startsWith('/superadmin'))return require('./platform').dispatch(db,user,method,url,body,params,{hashPassword:async value=>hash(value),createSupport:(target,session)=>{const token=crypto.randomBytes(32).toString('hex');sessions.get(db).set(token,{id:target.id,role:target.role,businessId:target.business_id,expires:Date.now()+20*60000,supportSessionId:session.id});return{token,session};}});
  if(user.supportSession){
    if(method!=='get'&&(url.startsWith('/users')||url==='/auth/register'))fail('Account credentials cannot be changed during a support session',403);
    if(url==='/auth/support-session/end'&&method==='post'){run('UPDATE support_sessions SET ended_at=CURRENT_TIMESTAMP WHERE id=?',user.supportSession.id);run('INSERT INTO platform_audit(actor_user_id,business_id,action,details_json) VALUES (?,?,?,?)',user.supportSession.actorId,bid,'support.end',JSON.stringify({sessionId:user.supportSession.id}));return{message:'Support session ended'};}
    if(!['get','options'].includes(method))run('INSERT INTO platform_audit(actor_user_id,business_id,action,details_json) VALUES (?,?,?,?)',user.supportSession.actorId,bid,'support.request',JSON.stringify({sessionId:user.supportSession.id,method,path:url}));
  }
  scopedUser=user;
  const own=(table,id)=>{const row=table==='businesses'?one('SELECT * FROM businesses WHERE id=? AND id=?',Number(id),bid):one(`SELECT * FROM ${table} WHERE id=? AND business_id=?`,Number(id),bid);if(!row)fail('Record not found',404);return row;};
  const admin=()=>policy.assertAccess(user.access,url,method,body);
  const checkRefs=value=>{if(!value||typeof value!=='object')return;for(const[key,v]of Object.entries(value)){const table={locationId:'locations',location_id:'locations',itemId:'inventory_items',item_id:'inventory_items',productId:'inventory_items',categoryId:url.startsWith('/expenses')?'expense_categories':'categories',unitId:'units',brandId:'brands',referenceInvoiceId:'sales_documents',convertedFromId:'sales_documents',shiftId:'shifts'}[key];if(table&&v)own(table,v);else if(v&&typeof v==='object')checkRefs(v);}};
  checkRefs(body);checkRefs(params);
  if(url.startsWith('/roles'))return accessService.roles(db,user,method,url,body);
  const target=url.match(/^\/(inventory|sales|sales-documents|orders|locations|shifts|discounts)\/(\d+)/);
  if(target)own({inventory:'inventory_items',sales:'sales','sales-documents':'sales_documents',orders:'orders',locations:'locations',shifts:'shifts',discounts:'discounts'}[target[1]],target[2]);
  if(body.sale)policy.assertAccess(user.access,'/sales-documents','post',body.sale);
  if(!user.access.owner&&(['sales','pos'].includes(policy.moduleFor(url))||body.sale))for(const line of body.sale?.items||body.items||[]){if(line.discountPercent>0&&!user.access.permissions.sales.discount)fail('Your role cannot apply sales discounts',403);if(line.unitPrice!==undefined&&Number(line.unitPrice)!==Number(own('inventory_items',line.itemId).price)&&!user.access.permissions.sales.price)fail('Your role cannot change selling prices',403);}
  if(url==='/auth/theme'&&method==='put'){const color=String(body.color||'').toLowerCase();if(!/^#[0-9a-f]{6}$/.test(color))fail('Enter a six-digit hex color',400);run('UPDATE users SET theme_color=? WHERE id=?',color,user.supportSession?.actorId||user.id);return{color};}
  if(url==='/auth/me'){const b=one('SELECT name,currency,timezone FROM businesses WHERE id=?',user.business_id);return{...safe(user),business:b};}
  if(url==='/auth/logout'){sessions.get(db).delete(String(request.authorization).replace(/^Bearer /,''));return {message:'Logged out'};}
  if(/^\/(accounts|accounting-settings|journal-entries|treasury|users|business-settings|etims|owner-network|subscriptions\/.*approve)/.test(url))admin();
  if(method!=='get'&&/^\/(inventory|orders|suppliers|locations|reference-data|discounts)/.test(url))admin();
  defaults(db,bid);
  const mapping=key=>{
    const setting=one('SELECT account_id,treasury_id FROM accounting_settings WHERE business_id=? AND setting_key=?',bid,key);
    if(!setting)return null;
    const treasury=setting.treasury_id?own('treasury',setting.treasury_id):null;
    if(treasury&&treasury.status!=='active')fail('The mapped Treasury account is closed');
    const id=treasury?treasury.linked_gl_account:setting.account_id;
    if(id&&!own('chart_of_accounts',id).active)fail('The mapped GL account is inactive');
    return id;
  };
  const journal=(description,lines,reference=null)=>require('./journal').postJournal(db,user,{description,reference},lines);

  const log=(item,quantity,type,note)=>run('INSERT INTO inventory_stock_log(item_id,change_type,qty_change,before_stock,after_stock,note,user_id,created_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)',item.id,type,quantity,item.stock,Number(item.stock)+quantity,note,user.id);
  const once=(operation,fn)=>{if(!body.requestId)return fn();const previous=one('SELECT result_json FROM operation_requests WHERE business_id=? AND operation=? AND request_key=?',bid,operation,body.requestId);if(previous)return {...JSON.parse(previous.result_json),replayed:true};const result=fn();run('INSERT INTO operation_requests(business_id,operation,request_key,result_json) VALUES (?,?,?,?)',bid,operation,body.requestId,JSON.stringify(result));return result;};
  const insert=(table,values)=>{const keys=Object.keys(values);return Number(run(`INSERT INTO ${table}(${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`,...keys.map(key=>values[key]??null)).lastInsertRowid);};
  const numeric=(value,label='Amount',positive=false)=>{const number=Number(value);if(!Number.isFinite(number)||number<0||(positive&&number===0))fail(`${label} must be ${positive?'positive':'non-negative'}`);return number;};
  if(url.startsWith('/stock-transfers')||url.startsWith('/expenses'))return require('./operations').dispatch({db,request,url,method,body,params,bid,user,own,all,one,run,insert,once,log,journal,mapping});
  if(url.startsWith('/inventory'))return require('./inventory').dispatch({db,request,url,method,body,params,bid,user,own,all,one,run,insert,once,log,journal,mapping,apiRequest});
  if(url==='/accounts/opening-balance-equity'&&method==='post')return db.transaction(()=>{
    const selected=mapping('opening_balance_equity');
    let account=selected?own('chart_of_accounts',selected):one("SELECT * FROM chart_of_accounts WHERE business_id=? AND account_code='3000'",bid);
    if(account&&(!account.active||account.account_type!=='Equity'))fail('Choose an active Opening Balance Equity account in Posting settings');
    if(!account)account=own('chart_of_accounts',insert('chart_of_accounts',{business_id:bid,account_code:'3000',account_name:'Opening Balance Equity',account_type:'Equity',account_subtype:"Owner's Equity",detail_type:'Opening Balance Equity',normal_balance:'Credit',active:1}));
    run("INSERT INTO accounting_settings(business_id,setting_key,account_id,treasury_id) VALUES (?,'opening_balance_equity',?,NULL) ON CONFLICT(business_id,setting_key) DO UPDATE SET account_id=excluded.account_id,treasury_id=NULL",bid,account.id);
    return account;
  })();
  const accountRoute=url.match(/^\/accounts(?:\/(\d+))?$/);
  if(accountRoute){
    const id=accountRoute[1]?Number(accountRoute[1]):null;
    const list=()=>all(`SELECT a.*,COALESCE(b.debit_total,0) debit_total,COALESCE(b.credit_total,0) credit_total,(CASE WHEN a.normal_balance='Credit' THEN -1 ELSE 1 END)*COALESCE(b.net,0) balance FROM chart_of_accounts a LEFT JOIN (SELECT l.account_id,SUM(l.debit) debit_total,SUM(l.credit) credit_total,SUM(l.debit-l.credit) net FROM journal_entry_lines l JOIN journal_entries j ON j.id=l.journal_entry_id WHERE j.business_id=? GROUP BY l.account_id) b ON b.account_id=a.id WHERE a.business_id=? ORDER BY a.account_code`,bid,bid);
    if(method==='get')return id?(own('chart_of_accounts',id),list().find(a=>a.id===id)):list();
    return db.transaction(()=>{
      const old=id?own('chart_of_accounts',id):null;
      if(method==='delete'){
        if(one('SELECT id FROM journal_entry_lines WHERE account_id=?',id)||one('SELECT id FROM chart_of_accounts WHERE parent_id=? AND business_id=?',id,bid)||one('SELECT id FROM treasury WHERE linked_gl_account=? AND business_id=?',id,bid)||one('SELECT account_id FROM accounting_settings WHERE account_id=? AND business_id=?',id,bid))fail('This account has postings, children or mappings. Keep it for its history.');
        run('DELETE FROM chart_of_accounts WHERE id=? AND business_id=?',id,bid);return{success:true};
      }
      if(!['post','put'].includes(method))fail('Unsupported account operation');
      const policy=require('../bar-inventory-backend/src/utils/accountPolicy'),data=policy.normalize(body,list(),old);
      if(old&&one('SELECT id FROM journal_entry_lines WHERE account_id=?',id)&&(data.account_type!==old.account_type||data.normal_balance!==old.normal_balance))fail('Account type and normal balance cannot change after postings');
      const values={business_id:bid};for(const key of ['account_code','account_name','account_type','account_subtype','detail_type','normal_balance','parent_id'])values[key]=data[key]||null;
      values.active=Number(data.active);values.details=typeof data.details==='string'?data.details:JSON.stringify(data.details||{});
      let savedId=id;
      if(id){const keys=Object.keys(values);run(`UPDATE chart_of_accounts SET ${keys.map(k=>`${k}=?`).join(',')} WHERE id=? AND business_id=?`,...keys.map(k=>values[k]),id,bid);}
      else{
        const value=policy.opening(body);savedId=insert('chart_of_accounts',values);
        if(value){const net=(data.normal_balance==='Credit'?-1:1)*value;const je=journal(`Opening balance: ${data.account_name}`,[{account_id:savedId,debit:Math.max(net,0),credit:Math.max(-net,0)},{account_id:mapping('opening_balance_equity'),debit:Math.max(-net,0),credit:Math.max(net,0)}],`OPEN-GL-${savedId}`);run("UPDATE journal_entries SET entry_type='opening_balance',posting_date=? WHERE id=? AND business_id=?",body.as_of,je,bid);}
      }
      return list().find(a=>a.id===savedId);
    })();
  }
  const entityRoute=url.match(/^\/(suppliers|customers|locations|users|accounts)(?:\/(\d+))?$/);
  if(entityRoute){const resource=entityRoute[1],table=resource==='accounts'?'chart_of_accounts':resource,id=entityRoute[2];
    let assigned;
    if(resource==='users'&&['post','put'].includes(method)){const target=id?own('users',id):null;if(target?.is_owner&&(body.active===false||body.role!=='admin'||body.accessRoleId))fail('The owner must remain an active administrator');assigned=accessService.assignment(db,body,bid,!!target?.is_owner);}
    if(method==='post'&&['users','locations'].includes(resource))policy.assertCapacity(user.access.plan,resource==='users'?'members':'locations',one(`SELECT COUNT(*) count FROM ${table} WHERE business_id=?`,bid).count);
    if(method==='get'){const rows=id?[own(table,id)]:all(`SELECT * FROM ${table} WHERE business_id=? ORDER BY id DESC`,bid);return id?(resource==='users'?safe(rows[0]):rows[0]):resource==='users'?rows.map(safe):rows;}
    const allowed={suppliers:['name','email','phone','address','items_supplied'],customers:['name','phone','credit_limit','active'],locations:['name','address','active','payment_options'],users:['name','email','phone','role','active','password'],accounts:['account_code','account_name','account_type','normal_balance','parent_id','account_subtype','detail_type','active','details']}[resource];
    const values={business_id:bid};for(const key of allowed){const value=body[key]??(key==='credit_limit'?body.creditLimit:undefined);if(value!==undefined)values[key]=typeof value==='object'?JSON.stringify(value):typeof value==='boolean'?Number(value):value;}
    if(resource==='users'){if(body.password){validatePassword(body.password);values.password=hash(body.password);}if(!['admin','employee'].includes(body.role||'employee'))fail('Invalid staff role');}
    if(resource==='customers')values.credit_limit=numeric(body.creditLimit??body.credit_limit??0,'Credit limit');
    if(method==='post'){if(!(values.name||values.account_name))fail('Name is required');const saved=own(table,insert(table,values));if(assigned){accessService.saveAssignment(db,saved.id,bid,assigned);saved.access_role_id=assigned.roleId;}return resource==='users'?safe(saved):saved;}
    if(id){const old=own(table,id);if(method==='delete'){if(resource==='locations'&&(one('SELECT user_id FROM user_locations WHERE location_id=? AND business_id=?',Number(id),bid)||one('SELECT id FROM inventory_items WHERE location_id=? AND business_id=?',Number(id),bid)))fail('Reassign members and products before deleting this location',409);if(resource==='users'&&(old.is_owner||Number(id)===user.id))fail('Cannot delete your current user');run(`DELETE FROM ${table} WHERE id=? AND business_id=?`,Number(id),bid);return{success:true};}if(method==='put'){const keys=Object.keys(values);run(`UPDATE ${table} SET ${keys.map(key=>`${key}=?`).join(',')} WHERE id=? AND business_id=?`,...keys.map(key=>values[key]),Number(id),bid);const saved=own(table,id);if(assigned){accessService.saveAssignment(db,saved.id,bid,assigned);saved.access_role_id=assigned.roleId;}return resource==='users'?safe(saved):saved;}}
  }
  if(url.startsWith('/reference-data/'))return require('./reference-data').dispatch({db,url,method,body,params,bid,own,all,one,run,insert});
  const toggle=url.match(/^\/users\/(\d+)\/toggle-active$/);if(toggle&&method==='patch'){const target=own('users',toggle[1]);if(target.is_owner||target.id===user.id)fail('Cannot deactivate your current user');run('UPDATE users SET active=? WHERE id=?',target.active?0:1,target.id);return safe(own('users',target.id));}
  if(url==='/business-settings'){
    const business=own('businesses',bid),stored=JSON.parse(business.settings_json||'{}');
    if(method==='get')return{...stored,businessName:business.name||stored.businessName||'',startDate:stored.startDate||'',currency:business.currency||stored.currency||'KES',logoUrl:stored.logoUrl||'',timezone:business.timezone||stored.timezone||'Africa/Nairobi',stockAccountingMethod:stored.stockAccountingMethod||'weighted_average',financialYearStartMonth:Number(stored.financialYearStartMonth||1)};
    const next={...stored,...body};
    const name=String(body.businessName??business.name).trim(),currency=String(body.currency??business.currency).trim().toUpperCase(),timezone=String(body.timezone??business.timezone).trim(),month=Number(body.financialYearStartMonth??stored.financialYearStartMonth??1),method=String(body.stockAccountingMethod??stored.stockAccountingMethod??'weighted_average');
    if(!name||name.length>180)fail('Business name is required and must be 180 characters or fewer');
    if(!/^[A-Z]{3}$/.test(currency))fail('Choose a valid three-letter currency code');
    if(!timezone||timezone.length>80)fail('Enter a valid time zone');
    if(!Number.isInteger(month)||month<1||month>12)fail('Financial year start month must be between 1 and 12');
    if(!['fifo','lifo','weighted_average'].includes(method))fail('Choose a valid stock accounting method');
    if(!Number.isInteger(Number(next.transactionEditDays??30))||Number(next.transactionEditDays??30)<0||Number(next.transactionEditDays??30)>3650)fail('Transaction edit days must be from 0 to 3650');
    if(!Number.isFinite(Number(next.defaultProfitPercent??0))||Number(next.defaultProfitPercent??0)<0||Number(next.defaultProfitPercent??0)>1000)fail('Default profit percent must be from 0 to 1000');
    run('UPDATE businesses SET name=?,currency=?,timezone=?,settings_json=? WHERE id=?',name,currency,timezone,JSON.stringify(next),bid);
    return{message:'Business settings saved',settings:{...next,businessName:name,currency,timezone,stockAccountingMethod:method,financialYearStartMonth:month}};
  }
  // Remaining transactional modules are implemented in a separate dispatch module.
  return require('./desktop-transactions').dispatch({db,request,method,url,body,params,user,bid,own,all,one,run,insert,numeric,journal,mapping,log,once,admin});
}
module.exports={apiRequest,authenticate};
