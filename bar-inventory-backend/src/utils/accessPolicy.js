const mysql = require('mysql2');
const MODULES = [
  ['pos','Point of sale'],['inventory','Products and stock'],['sales','Sales and sales documents'],
  ['customers','Customers'],['reports','Reports'],['expenses','Expenses'],['purchases','Purchases'],['suppliers','Suppliers'],
  ['discounts','Discounts'],['loyalty','Loyalty'],['network','Business network'],['marketplace','Public product marketplace'],['accounting','Accounting and treasury'],
  ['users','Members'],['roles','Roles'],['locations','Locations'],['settings','Business settings'],['payments','M-Pesa payments'],['integrations','Integrations'],['supermarket','Supermarket operations'],['fleet','Fleet management']
].map(([key,label])=>({key,label,own:['sales','purchases'].includes(key)}));
const COMMON=['expenses','pos','inventory','sales','customers','reports','users','roles','locations','settings','payments','integrations','marketplace'];
const PACKAGES={
  basic:{id:'basic',name:'Basic POS',price:1000,maxLocations:2,maxMembers:5,modules:COMMON},
  growth:{id:'growth',name:'Growth',price:5000,maxLocations:5,maxMembers:null,modules:[...COMMON,'purchases','suppliers','discounts','loyalty','accounting']},
  erp:{id:'erp',name:'ERP',price:30000,maxLocations:null,maxMembers:null,modules:MODULES.map(m=>m.key)},
  supermarket:{id:'supermarket',name:'Supermarket Pro',price:12000,maxLocations:5,maxMembers:null,modules:[...new Set([...MODULES.map(m=>m.key),'supermarket'])]},
  fleet:{id:'fleet',name:'Fleet Pro',price:15000,maxLocations:5,maxMembers:null,modules:MODULES.map(m=>m.key).filter(key=>key!=='supermarket')}
};
const fail=(message,status=403)=>{throw Object.assign(new Error(message),{status});};
function parse(value,fallback){try{return typeof value==='string'?JSON.parse(value):value||fallback;}catch{return fallback;}}
function planFor(id){return PACKAGES[id]||PACKAGES.basic;}
function permissionDefaults(admin=false){return Object.fromEntries(MODULES.map(({key})=>[key,{view:admin?'all':['pos','inventory','sales','customers','locations','payments','supermarket'].includes(key)?(key==='sales'?'own':'all'):'none',create:admin||['pos','sales','customers','payments'].includes(key),update:admin||key==='pos',delete:admin,payments:admin||key==='sales',price:admin,discount:admin,export:admin}]));}
function normalizePermissions(value){
 const source=parse(value,{}),result={};
 for(const module of MODULES){const p=source[module.key]||{};result[module.key]={view:['none','all',...(module.own?['own']:[])].includes(p.view)?p.view:'none'};for(const action of ['create','update','delete','payments','price','discount','export'])result[module.key][action]=p[action]===true;}
 return result;
}
function buildAccess(user,business,role,locations,subscription,catalogPlan=null){
 const plan=catalogPlan||planFor(subscription?.plan||business.registration_plan);
 const owner=!!user.is_owner;
 return {owner,plan,themeColor:user.supportSession?.themeColor||user.theme_color||null,superadmin:!!user.is_superadmin&&!user.supportSession,businessStatus:business.platform_status||'active',subscriptionRequired:business.subscription_mode==='managed'&&!subscription,supportSession:user.supportSession||null,roleId:role?.id||null,roleName:owner?'Owner':role?.name||(user.role==='admin'?'Administrator':'Cashier'),
  locationIds:owner?null:locations.map(row=>Number(row.location_id)),
  permissions:owner?permissionDefaults(true):role?normalizePermissions(role.permissions_json):permissionDefaults(user.role==='admin')};
}
function moduleFor(path,body={}){
 const url=path.replace(/^\/api/,'').split('?')[0];
 if(/^\/(accounts|treasury|accounting-settings|journal-entries)(\/|$)/.test(url)||url==='/reports/ledger')return 'accounting';
 if(url.startsWith('/sales-documents')||url.startsWith('/sales'))return 'sales';
 if(url.startsWith('/inventory')||url.startsWith('/reference-data')||url.startsWith('/stock-transfers'))return 'inventory';
 if(url.startsWith('/reports')||url.startsWith('/notifications'))return 'reports';
 if(url.startsWith('/orders'))return 'purchases';
 if(url.startsWith('/business-settings'))return 'settings';
 if(url.startsWith('/marketplace'))return 'marketplace';
 if(url.startsWith('/etims'))return 'integrations';
 if(url.startsWith('/mpesa'))return 'payments';
 if(url.startsWith('/owner-network'))return 'network';
 if(url.startsWith('/supermarket'))return 'supermarket';
 if(url.startsWith('/shifts'))return 'pos';
 return MODULES.find(m=>url===`/${m.key}`||url.startsWith(`/${m.key}/`))?.key||null;
}
function assertAccess(access,path,method='get',body={}){
 if(path.startsWith('/superadmin')){if(!access.superadmin)fail('Superadmin access required');return;}
 if(!path.startsWith('/auth/')&&access.businessStatus==='suspended')fail('This business has been suspended. Contact platform support.');
 if(access.subscriptionRequired&&!path.startsWith('/auth/')&&!path.startsWith('/subscriptions')&&!(path.startsWith('/mpesa')&&body.purpose==='subscription'))fail('This business needs an active subscription');
 if(path.startsWith('/subscriptions')&&!access.owner)fail('Only the owner can manage packages');
 const module=moduleFor(path,body);if(!module)return;
 if(!access.plan.modules.includes(module))fail(`${access.plan.name} does not include ${MODULES.find(m=>m.key===module).label}. Choose another package to use this feature.`);
 const p=access.permissions[module]||{};
 const action=path.startsWith('/stock-transfers')&&method.toLowerCase()!=='get'?'update':/\/convert$/.test(path)?'create':method.toLowerCase()==='get'?'view':method.toLowerCase()==='delete'?'delete':/\/(payments?|pay)(\/|$)/.test(path)?'payments':method.toLowerCase()==='post'&&!/\/\d+\//.test(path)?'create':'update';
 if((action==='view'?(!p.view||p.view==='none'):!p[action]))fail('Your role does not allow this action');
 if(['roles','users'].includes(module)&&!access.owner)fail('Only the business owner can manage members and roles');
 if(module==='accounting'&&!access.owner)fail('Accounting access is restricted to the business owner');
 if(module==='locations'&&method.toLowerCase()!=='get'&&!access.owner)fail('Only the business owner can change locations');
}
function allowedLocation(access,id){return access.locationIds===null||access.locationIds.includes(Number(id));}
// Scoped table sources protect lists, joins, aggregates and direct record reads.
const LOCATION_TABLES=['expenses','stock_transfers','inventory_items','locations','sales','orders','sales_documents','categories','units','brands','discounts'];
const CHILDREN={stock_transfer_items:['stock_transfers','transfer_id'],purchase_payments:['orders','order_id'],purchase_events:['orders','order_id'],sale_items:['sales','sale_id'],order_items:['orders','order_id'],sales_document_items:['sales_documents','document_id'],sales_document_payments:['sales_documents','document_id'],inventory_stock_log:['inventory_items','item_id']};
function scopeSelect(sql,user){
 if(!user?.access||user.platformRequest||user.access.owner||!/^\s*SELECT\b/i.test(sql))return sql;
 const access=user.access,bid=Number(user.business_id),uid=Number(user.id);
 if(!Number.isInteger(bid)||!Number.isInteger(uid))fail('Invalid account context');
 const ids=(access.locationIds||[]).filter(id=>Number.isInteger(id)&&id>0);
 const condition=table=>{
  const location=table==='locations'?'id':'location_id';
  const clauses=[`business_id=${mysql.escape(bid)}`];
  if(table==='stock_transfers')clauses.push(`from_location_id IN (${ids.map(id=>mysql.escape(id)).join(',')||'NULL'}) AND to_location_id IN (${ids.map(id=>mysql.escape(id)).join(',')||'NULL'})`);else if(LOCATION_TABLES.includes(table))clauses.push(`${mysql.escapeId(location)} IN (${ids.map(id=>mysql.escape(id)).join(',')||'NULL'})`);
  if(table==='shifts')clauses.push(`user_id=${mysql.escape(uid)}`);
  if(['mpesa_payments','customer_payments'].includes(table))clauses.push(`created_by=${mysql.escape(uid)}`);
  const module=table==='orders'?'purchases':['sales','sales_documents'].includes(table)?'sales':null;
  if(module&&access.permissions[module]?.view==='own')clauses.push(`created_by=${mysql.escape(uid)}`);
  return clauses.join(' AND ');
 };
 const tables=[...LOCATION_TABLES,'shifts','mpesa_payments','customer_payments',...Object.keys(CHILDREN)].join('|');
 const reserved=new Set(['where','join','left','right','inner','outer','cross','on','group','order','limit','having','union','for','set','as','offset']);
 return sql.replace(new RegExp(`\\b(FROM|JOIN)\\s+(${tables})\\b(?:\\s+(?:AS\\s+)?([a-zA-Z_][a-zA-Z0-9_]*))?`,'gi'),(whole,keyword,raw,alias)=>{
  const table=raw.toLowerCase();const suffix=alias&&reserved.has(alias.toLowerCase())?` ${alias}`:'';const name=suffix||!alias?table:alias;
  let where;
  if(CHILDREN[table]){const[parent,key]=CHILDREN[table];where=`${mysql.escapeId(key)} IN (SELECT id FROM ${mysql.escapeId(parent)} WHERE ${condition(parent)})`;}
  else where=condition(table);
  return `${keyword} (SELECT * FROM ${mysql.escapeId(table)} WHERE ${where}) ${name}${suffix}`;
 });
}
function assertCapacity(plan,resource,count){const max=resource==='locations'?plan.maxLocations:plan.maxMembers;if(max!==null&&Number(count)>=max)fail(`${plan.name} allows ${max} ${resource==='locations'?'locations':'members, including the owner'}. Choose another package to add more.`);}
module.exports={MODULES,PACKAGES,planFor,parse,permissionDefaults,normalizePermissions,buildAccess,moduleFor,assertAccess,allowedLocation,scopeSelect,assertCapacity,fail};
