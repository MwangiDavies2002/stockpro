const {query}=require('../config/db');
const policy=require('./accessPolicy');
const mysql=require('mysql2');
async function loadAccess(user,db={query}){
 const {rows:[business]}=await db.query('SELECT * FROM businesses WHERE id=?',[user.business_id]);
 const {rows:[subscription]}=await db.query("SELECT plan FROM subscriptions WHERE business_id=? AND status='approved' AND start_date<=CURRENT_TIMESTAMP AND end_date>=CURRENT_TIMESTAMP ORDER BY approved_at DESC,id DESC LIMIT 1",[user.business_id]);
 const {rows:[role]}=user.access_role_id?await db.query('SELECT * FROM access_roles WHERE id=? AND business_id=?',[user.access_role_id,user.business_id]):{rows:[]};
 if(user.access_role_id&&!role)policy.fail('Assigned role no longer exists');
 const {rows:locations}=await db.query('SELECT location_id FROM user_locations WHERE user_id=? AND business_id=?',[user.id,user.business_id]);
 const plan=await require('./platformCatalog').getPackage(subscription?.plan||business?.registration_plan||'basic',db);
 return policy.buildAccess(user,business||{},role,locations,subscription,plan);
}
async function validateAssignments(body,bid,db={query},owner=false){
 const locationIds=[...new Set((Array.isArray(body.locationIds)?body.locationIds:[]).map(Number))];
 if(!owner&&!locationIds.length)policy.fail('Assign at least one location to this member',400);
 for(const id of locationIds){if(!Number.isInteger(id)||id<1)policy.fail('Invalid location',400);const {rows}=await db.query('SELECT id FROM locations WHERE id=? AND business_id=?',[id,bid]);if(!rows.length)policy.fail('Location does not belong to this business',400);}
 const roleId=body.accessRoleId?Number(body.accessRoleId):null;
 if(roleId){const {rows}=await db.query('SELECT id FROM access_roles WHERE id=? AND business_id=?',[roleId,bid]);if(!rows.length)policy.fail('Role does not belong to this business',400);}
 return {locationIds,roleId};
}
async function saveAssignments(id,bid,assignment,db={query}){
 await db.query('UPDATE users SET access_role_id=? WHERE id=? AND business_id=?',[assignment.roleId,id,bid]);
 await db.query('DELETE FROM user_locations WHERE user_id=? AND business_id=?',[id,bid]);
 for(const locationId of assignment.locationIds)await db.query('INSERT INTO user_locations (business_id,user_id,location_id) VALUES (?,?,?)',[bid,id,locationId]);
}
async function member(row,db={query}){const {rows}=await db.query('SELECT location_id FROM user_locations WHERE user_id=? AND business_id=?',[row.id,row.business_id]);const {password,...safe}=row;return {...safe,locationIds:rows.map(r=>r.location_id),accessRoleId:row.access_role_id||null};}
async function checkReferences(req){
 const {user}=req,access=user.access,bid=user.business_id;
 const check=async(table,id)=>{if(id===undefined||id===null||id==='')return;const value=Number(id);if(!Number.isInteger(value)||value<1)policy.fail('Invalid record reference',400);const {rows:[row]}=await query(`SELECT * FROM ${mysql.escapeId(table)} WHERE id=? AND business_id=?`,[value,bid]);if(!row)policy.fail('Record not found in your assigned locations',404);if(table==='locations'&&!policy.allowedLocation(access,row.id))policy.fail('Location access denied');if(row.location_id&&!policy.allowedLocation(access,row.location_id))policy.fail('Location access denied');return row;};
 const path=(req.baseUrl.replace(/^\/api/,'')+req.path).replace(/\/$/,'');
 const match=path.match(/^\/(inventory|sales|sales-documents|orders|locations|shifts|discounts)\/(\d+)/);
 const tables={inventory:'inventory_items',sales:'sales','sales-documents':'sales_documents',orders:'orders',locations:'locations',shifts:'shifts',discounts:'discounts'};
 if(match){const row=await check(tables[match[1]],match[2]);if(row&&match[1]==='shifts'&&!access.owner&&row.user_id!==user.id)policy.fail('Shift access denied');const module=policy.moduleFor(path);if(row&&access.permissions[module]?.view==='own'&&row.created_by!==user.id)policy.fail('You can only access your own records');}
 const etims=path.match(/^\/etims\/items\/(\d+)/);if(etims)await check('inventory_items',etims[1]);
 const walk=async value=>{if(!value||typeof value!=='object')return;for(const[key,v]of Object.entries(value)){
  const table={fromLocationId:'locations',toLocationId:'locations',locationId:'locations',location_id:'locations',itemId:'inventory_items',item_id:'inventory_items',productId:'inventory_items',categoryId:path.startsWith('/expenses')?'expense_categories':'categories',unitId:'units',brandId:'brands',referenceInvoiceId:'sales_documents',convertedFromId:'sales_documents',shiftId:'shifts'}[key];
  if(table&&v)await check(table,v);else if(typeof v==='object')await walk(v);
 }};
 await walk(req.query);await walk(req.body);
 if(path.startsWith('/reference-data/')){const ref=path.match(/^\/reference-data\/(categories|units|brands)\/(\d+)/);if(ref)await check(ref[1],ref[2]);}
 if(req.body?.sale)policy.assertAccess(access,'/sales-documents','post',req.body.sale);
 if(!access.owner&&(['sales','pos'].includes(policy.moduleFor(path))||req.body?.sale)){for(const line of req.body?.sale?.items||req.body?.items||[]){if(line.discountPercent>0&&!access.permissions.sales.discount)policy.fail('Your role cannot apply sales discounts');if(line.unitPrice!==undefined){const row=await check('inventory_items',line.itemId);if(row&&Number(line.unitPrice)!==Number(row.price)&&!access.permissions.sales.price)policy.fail('Your role cannot change selling prices');}}}
}
module.exports={loadAccess,validateAssignments,saveAssignments,member,checkReferences};
