const policy=require('../bar-inventory-backend/src/utils/accessPolicy');
function ensureCashierRole(db,bid){
 let role=db.prepare("SELECT * FROM access_roles WHERE business_id=? AND name='Cashier'").get(bid);
 if(!role){db.prepare('INSERT OR IGNORE INTO access_roles(business_id,name,permissions_json,is_builtin) VALUES (?,?,?,1)').run(bid,'Cashier',JSON.stringify(policy.permissionDefaults(false)));role=db.prepare("SELECT * FROM access_roles WHERE business_id=? AND name='Cashier'").get(bid);}
 else if(!role.is_builtin){db.prepare('UPDATE access_roles SET is_builtin=1 WHERE id=? AND business_id=?').run(role.id,bid);role.is_builtin=1;}
 if(role?.is_builtin){const permissions=policy.normalizePermissions(role.permissions_json);if(permissions.supermarket.view==='none'){permissions.supermarket.view='all';db.prepare('UPDATE access_roles SET permissions_json=? WHERE id=? AND business_id=?').run(JSON.stringify(permissions),role.id,bid);role.permissions_json=JSON.stringify(permissions);}}
 return role;
}
function loadAccess(db,user){
 const business=db.prepare('SELECT * FROM businesses WHERE id=?').get(user.business_id)||{};
 const subscription=db.prepare("SELECT plan FROM subscriptions WHERE business_id=? AND status='approved' AND datetime(start_date)<=CURRENT_TIMESTAMP AND datetime(end_date)>=CURRENT_TIMESTAMP ORDER BY approved_at DESC,id DESC LIMIT 1").get(user.business_id);
 const role=user.access_role_id?db.prepare('SELECT * FROM access_roles WHERE id=? AND business_id=?').get(user.access_role_id,user.business_id):user.role==='employee'?ensureCashierRole(db,user.business_id):null;
 if(user.access_role_id&&!role)policy.fail('Assigned role no longer exists');
 const locations=db.prepare('SELECT location_id FROM user_locations WHERE user_id=? AND business_id=?').all(user.id,user.business_id);
 const plan=require('../bar-inventory-backend/src/utils/platformPolicy').packageRecord(db.prepare('SELECT * FROM platform_packages WHERE id=?').get(subscription?.plan||business.registration_plan||'basic'));
 return policy.buildAccess(user,business,role,locations,subscription,plan);
}
function assignment(db,body,bid,owner=false){
 const ids=[...new Set((body.locationIds||[]).map(Number))];if(!owner&&!ids.length)policy.fail('Assign at least one location to this member',400);
 for(const id of ids)if(!Number.isInteger(id)||!db.prepare('SELECT id FROM locations WHERE id=? AND business_id=?').get(id,bid))policy.fail('Invalid business location',400);
 const roleId=body.accessRoleId?Number(body.accessRoleId):null;
 if(roleId&&!db.prepare('SELECT id FROM access_roles WHERE id=? AND business_id=?').get(roleId,bid))policy.fail('Invalid business role',400);
 return {ids,roleId};
}
function saveAssignment(db,id,bid,value){db.prepare('UPDATE users SET access_role_id=? WHERE id=? AND business_id=?').run(value.roleId,id,bid);db.prepare('DELETE FROM user_locations WHERE user_id=? AND business_id=?').run(id,bid);for(const location of value.ids)db.prepare('INSERT INTO user_locations(business_id,user_id,location_id) VALUES (?,?,?)').run(bid,id,location);}
function roles(db,user,method,url,body){
 const bid=user.business_id;if(!user.is_owner)policy.fail('Only the owner can manage roles');
 if(method==='get'){ensureCashierRole(db,bid);return{roles:db.prepare('SELECT * FROM access_roles WHERE business_id=? ORDER BY is_builtin DESC,name').all(bid).map(r=>({...r,is_builtin:!!r.is_builtin,permissions:policy.normalizePermissions(r.permissions_json)})),modules:policy.MODULES,package:user.access.plan};}
 const id=Number(url.split('/')[2]);
 if(method==='delete'){
  const role=db.prepare('SELECT id,is_builtin FROM access_roles WHERE id=? AND business_id=?').get(id,bid);if(!role)policy.fail('Role not found',404);if(role.is_builtin)policy.fail('The built-in Cashier role cannot be deleted',400);
  if(db.prepare('SELECT id FROM users WHERE access_role_id=? AND business_id=?').get(id,bid))policy.fail('Assign members to another role before deleting this role',409);
  if(!db.prepare('DELETE FROM access_roles WHERE id=? AND business_id=?').run(id,bid).changes)policy.fail('Role not found',404);return{message:'Role deleted'};
 }
 const name=String(body.name||'').trim();if(!name||name.length>100)policy.fail('Enter a role name up to 100 characters',400);
 if(db.prepare('SELECT id FROM access_roles WHERE business_id=? AND name=? AND id<>?').get(bid,name,id||0))policy.fail('A role with this name already exists',409);
 const permissions=policy.normalizePermissions(body.permissions);for(const m of policy.MODULES)if(!user.access.plan.modules.includes(m.key)){for(const k of Object.keys(permissions[m.key]))permissions[m.key][k]=k==='view'?'none':false;}
 if(id){const role=db.prepare('SELECT id,name,is_builtin FROM access_roles WHERE id=? AND business_id=?').get(id,bid);if(!role)policy.fail('Role not found',404);if(role.is_builtin&&name!==role.name)policy.fail('The built-in Cashier role cannot be renamed',400);if(!db.prepare('UPDATE access_roles SET name=?,permissions_json=? WHERE id=? AND business_id=?').run(name,JSON.stringify(permissions),id,bid).changes)policy.fail('Role not found',404);return{id,name,permissions,is_builtin:!!role.is_builtin};}
 return{id:Number(db.prepare('INSERT INTO access_roles(business_id,name,permissions_json) VALUES (?,?,?)').run(bid,name,JSON.stringify(permissions)).lastInsertRowid),name,permissions};
}
module.exports={loadAccess,assignment,saveAssignment,ensureCashierRole,roles};
