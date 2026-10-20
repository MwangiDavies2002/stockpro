const crypto=require('node:crypto');
const {fail,parse,MODULES}=require('../utils/accessPolicy');
const {packageRecord,validatePackage,validateCoupon,dateTime}=require('../utils/platformPolicy');
const catalog=require('../utils/platformCatalog');
function positiveId(value){const n=Number(value);if(!Number.isInteger(n)||n<1)fail('Invalid record ID',400);return n;}
async function dispatch(db,user,method,path,body={},params={},options={}){
 if(!user.is_superadmin||user.supportSession)fail('Superadmin access required');
 method=method.toLowerCase();path=path.replace(/^\/superadmin/,'').replace(/\/$/,'')||'/';
 const rows=async(sql,args=[]) =>(await db.query(sql,args)).rows;
 const one=async(sql,args=[]) =>(await rows(sql,args))[0];
 const audit=async(tx,action,bid,details)=>tx.query('INSERT INTO platform_audit (actor_user_id,business_id,action,details_json) VALUES (?,?,?,?)',[user.id,bid||null,action,JSON.stringify(details)]);
 async function transaction(action,bid,fn){const tx=await db.getClient();try{await tx.query('BEGIN');const result=await fn(tx);await audit(tx,action,bid,result.audit||{});await tx.query('COMMIT');return result.data;}catch(e){await tx.query('ROLLBACK');throw e;}finally{tx.release();}}
 if(method==='get'&&path==='/overview'){
  const settings=await catalog.settings(db),until=dateTime(Date.now()+(Number(settings.expiryAlertDays??7))*86400000);
  return {businesses:await one("SELECT COUNT(*) total,SUM(CASE WHEN platform_status='active' THEN 1 ELSE 0 END) active,SUM(CASE WHEN platform_status='suspended' THEN 1 ELSE 0 END) suspended FROM businesses"),subscriptions:await one("SELECT SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending,SUM(CASE WHEN status='approved' AND start_date<=CURRENT_TIMESTAMP AND end_date>=CURRENT_TIMESTAMP THEN 1 ELSE 0 END) active,SUM(CASE WHEN status='approved' AND end_date>=CURRENT_TIMESTAMP AND end_date<=? THEN 1 ELSE 0 END) expiring FROM subscriptions",[until]),settings};
 }
 if(method==='post'&&path==='/businesses')return require('./platformBusiness').createBusiness(db,user,body,options);
 if(method==='get'&&path==='/businesses'){
  const search=String(params.search||'').trim().slice(0,100),page=Math.min(1000000,Math.max(1,Math.trunc(Number(params.page)||1))),limit=25;
  const where=search?' WHERE (b.name LIKE ? OR EXISTS (SELECT 1 FROM users u WHERE u.business_id=b.id AND u.is_owner=1 AND u.email LIKE ?))':'';const args=search?[`%${search}%`,`%${search}%`]:[];
  const total=(await one('SELECT COUNT(*) total FROM businesses b'+where,args)).total;
  const businesses=await rows(`SELECT b.id,b.name,b.currency,b.platform_status,b.registration_plan,b.subscription_mode,b.created_at,b.contact_number,b.country,b.state,b.city,b.zip_code,(SELECT name FROM users WHERE id=b.created_by) created_by_name,COALESCE((SELECT plan FROM subscriptions WHERE business_id=b.id AND status='approved' AND start_date<=CURRENT_TIMESTAMP AND end_date>=CURRENT_TIMESTAMP ORDER BY start_date DESC,id DESC LIMIT 1),CASE WHEN b.subscription_mode='registration' THEN b.registration_plan ELSE NULL END) current_plan,(SELECT name FROM users WHERE business_id=b.id AND is_owner=1 ORDER BY id LIMIT 1) owner_name,(SELECT email FROM users WHERE business_id=b.id AND is_owner=1 ORDER BY id LIMIT 1) owner_email,(SELECT COUNT(*) FROM locations WHERE business_id=b.id) locations,(SELECT COUNT(*) FROM users WHERE business_id=b.id) members FROM businesses b${where} ORDER BY b.id DESC LIMIT ? OFFSET ?`,[...args,limit,(page-1)*limit]);
  return{businesses,total,page,pageSize:limit};
 }
 const businessRoute=path.match(/^\/businesses\/(\d+)(?:\/(status|subscriptions|support-session))?$/);
 if(businessRoute){const bid=positiveId(businessRoute[1]),action=businessRoute[2];const business=await one('SELECT id,name,currency,platform_status,registration_plan,subscription_mode FROM businesses WHERE id=?',[bid]);if(!business)fail('Business not found',404);
  if(method==='get'&&!action)return{business,members:await rows('SELECT id,name,email,role,is_owner,active FROM users WHERE business_id=? ORDER BY is_owner DESC,name',[bid]),locations:await rows('SELECT id,name,active FROM locations WHERE business_id=? ORDER BY name',[bid]),subscriptions:await rows('SELECT * FROM subscriptions WHERE business_id=? ORDER BY created_at DESC,id DESC',[bid])};
  if(method==='patch'&&action==='status'){if(!['active','suspended'].includes(body.status))fail('Invalid business status',400);if(bid===Number(user.business_id)&&body.status==='suspended')fail('You cannot suspend the business used by your Superadmin account',400);return transaction('business.status',bid,async tx=>{await tx.query('UPDATE businesses SET platform_status=? WHERE id=?',[body.status,bid]);return{data:{message:'Business status updated'},audit:{from:business.platform_status,to:body.status}};});}
  if(method==='post'&&action==='support-session'){
   const reason=String(body.reason||'').trim();if(reason.length<5||reason.length>500)fail('Enter a support reason of 5-500 characters',400);
   if(business.platform_status!=='active')fail('Reactivate this business before opening its workspace',400);
   const target=await one('SELECT id,business_id,name,email,role,is_owner,active FROM users WHERE business_id=? AND is_owner=1 AND active=1 ORDER BY id LIMIT 1',[bid]);if(!target)fail('This business has no active owner account',400);
   const id=crypto.randomBytes(24).toString('hex'),expiresAt=dateTime(Date.now()+20*60000);
   await transaction('support.start',bid,async tx=>{await tx.query('INSERT INTO support_sessions (id,actor_user_id,target_user_id,business_id,reason,expires_at) VALUES (?,?,?,?,?,?)',[id,user.id,target.id,bid,reason,expiresAt]);return{data:{},audit:{sessionId:id,targetUserId:target.id,reason,expiresAt}};});
   return options.createSupport(target,{id,actorId:user.id,actorName:user.name,businessName:business.name,expiresAt});
  }
  if(method==='post'&&action==='subscriptions')return saveSubscription(bid,null);
 }
 if(method==='get'&&path==='/subscriptions')return rows('SELECT s.*,b.name business_name FROM subscriptions s JOIN businesses b ON b.id=s.business_id ORDER BY s.created_at DESC,s.id DESC LIMIT 250');
 const subscriptionRoute=path.match(/^\/subscriptions\/(\d+)$/);
 if(method==='put'&&subscriptionRoute){const id=positiveId(subscriptionRoute[1]);const existing=await one('SELECT * FROM subscriptions WHERE id=?',[id]);if(!existing)fail('Subscription not found',404);return saveSubscription(existing.business_id,id,existing);}
 async function saveSubscription(bid,id,existing){
  const plan=await catalog.getPackage(body.plan||existing?.plan,db);if(!plan?.active)fail('Choose an active package',400);
  const status=body.status||existing?.status||'approved';if(!['approved','pending','cancelled','expired'].includes(status))fail('Invalid subscription status',400);
  if(existing?.payment_method==='mpesa'&&status==='approved'&&existing.status!=='approved'){const payment=await one("SELECT id FROM mpesa_payments WHERE transaction_id=? AND business_id=? AND status='completed' AND verified_at IS NOT NULL",[existing.checkout_request_id,bid]);if(!payment)fail('M-Pesa subscriptions require verified provider payment. Add a separate manual subscription for an administrative grant.',400);}
  const start=dateTime(body.startDate||existing?.start_date||Date.now()),end=dateTime(body.endDate||existing?.end_date||Date.now()+30*86400000);
  if(end<=start)fail('End date must be after start date',400);
  const amount=Number(body.amount??existing?.amount??plan.price),note=String(body.note||existing?.admin_note||'').trim();if(!Number.isFinite(amount)||amount<0||amount>99999999||note.length>500)fail('Enter a valid amount and a note up to 500 characters',400);
  return transaction(id?'subscription.update':'subscription.create',bid,async tx=>{
   await tx.query('SELECT id FROM businesses WHERE id=?'+(tx.lockClause||''),[bid]);
   let saved=id;
   if(status==='approved'&&start<=dateTime(Date.now()))await tx.query("UPDATE subscriptions SET status='expired',end_date=? WHERE business_id=? AND status='approved' AND end_date>CURRENT_TIMESTAMP AND id<>?",[dateTime(Date.now()),bid,id||0]);
   if(id)await tx.query('UPDATE subscriptions SET plan=?,amount=?,status=?,start_date=?,end_date=?,admin_note=?,approved_at=? WHERE id=? AND business_id=?',[plan.id,amount,status,start,end,note||null,status==='approved'?dateTime(Date.now()):existing.approved_at,id,bid]);
   else saved=(await tx.query('INSERT INTO subscriptions (business_id,plan,amount,payment_method,status,created_by,start_date,end_date,approved_at,original_amount,admin_note) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[bid,plan.id,amount,'manual',status,user.id,start,end,status==='approved'?dateTime(Date.now()):null,plan.price,note||null])).insertId;
   await tx.query("UPDATE businesses SET subscription_mode='managed' WHERE id=?",[bid]);
   return{data:{id:saved,message:'Subscription saved'},audit:{id:saved,plan:plan.id,status,startDate:start,endDate:end,amount,note}};
  });
 }
 if(method==='get'&&path==='/packages')return{packages:await catalog.packages(db,true),modules:MODULES};
 const packageRoute=path.match(/^\/packages\/([a-z][a-z0-9_-]{1,29})$/);
 if(method==='post'&&path==='/packages'||method==='put'&&packageRoute){const p=validatePackage(body,packageRoute?.[1]);const exists=await catalog.getPackage(p.id,db);if(method==='post'&&exists)fail('Package ID already exists',409);if(method==='put'&&!exists)fail('Package not found',404);
  return transaction('package.save',null,async tx=>{const values=[p.name,p.price,p.maxLocations,p.maxMembers,JSON.stringify(p.modules),p.active?1:0];if(exists)await tx.query('UPDATE platform_packages SET name=?,price=?,max_locations=?,max_members=?,modules_json=?,active=? WHERE id=?',[...values,p.id]);else await tx.query('INSERT INTO platform_packages (name,price,max_locations,max_members,modules_json,active,id) VALUES (?,?,?,?,?,?,?)',[...values,p.id]);return{data:p,audit:p};});
 }
 if(method==='get'&&path==='/coupons')return (await rows('SELECT * FROM platform_coupons ORDER BY id DESC')).map(c=>({...c,packageIds:parse(c.package_ids_json,[]),businessId:c.business_id,discountType:c.discount_type,expiresAt:c.expires_at,active:!!c.active}));
 const couponRoute=path.match(/^\/coupons\/(\d+)$/);
 if(method==='post'&&path==='/coupons'||method==='put'&&couponRoute){const c=validateCoupon(body);for(const id of c.packageIds)if(!await catalog.getPackage(id,db))fail('Coupon package not found',400);if(c.businessId&&!await one('SELECT id FROM businesses WHERE id=?',[c.businessId]))fail('Coupon business not found',400);
  const existing=await one('SELECT id FROM platform_coupons WHERE code=?',[c.code]);if(existing&&Number(existing.id)!==Number(couponRoute?.[1]))fail('Coupon code already exists',409);
  return transaction('coupon.save',c.businessId,async tx=>{let id=couponRoute?positiveId(couponRoute[1]):null;const values=[c.code,c.discountType,c.value,c.active?1:0,c.expiresAt,c.businessId,JSON.stringify(c.packageIds)];if(id){const result=await tx.query('UPDATE platform_coupons SET code=?,discount_type=?,value=?,active=?,expires_at=?,business_id=?,package_ids_json=? WHERE id=?',[...values,id]);if(!result.rowCount)fail('Coupon not found',404);}else id=(await tx.query('INSERT INTO platform_coupons (code,discount_type,value,active,expires_at,business_id,package_ids_json) VALUES (?,?,?,?,?,?,?)',values)).insertId;return{data:{...c,id},audit:{...c,id}};});
 }
 if(method==='get'&&path==='/settings')return catalog.settings(db);
 if(method==='put'&&path==='/settings'){const appName=String(body.appName||'').trim(),supportEmail=String(body.supportEmail||'').trim(),expiryAlertDays=Number(body.expiryAlertDays);if(!appName||appName.length>100||supportEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)||!Number.isInteger(expiryAlertDays)||expiryAlertDays<0||expiryAlertDays>365||typeof body.registrationEnabled!=='boolean')fail('Enter valid platform settings',400);const value={appName,supportEmail,expiryAlertDays,registrationEnabled:body.registrationEnabled};return transaction('settings.save',null,async tx=>{await tx.query('UPDATE platform_settings SET settings_json=? WHERE id=1',[JSON.stringify(value)]);return{data:value,audit:value};});}
 if(method==='get'&&path==='/audit'){
  const search=String(params.search||'').trim().slice(0,100),businessId=Number(params.businessId)||0;
  const events=await rows(`SELECT activity.*,u.name actor_name,u.email actor_email,b.name business_name FROM (
   SELECT a.id,a.actor_user_id user_id,a.business_id,a.action,a.details_json,a.created_at,'Platform' source,NULL entity_id FROM platform_audit a
   UNION ALL
   SELECT e.id,e.user_id,e.business_id,e.action,e.details_json,e.created_at,'Sales' source,e.document_id entity_id FROM sales_document_events e
   UNION ALL
   SELECT e.id,e.user_id,e.business_id,e.action,e.details_json,e.created_at,'Purchases' source,e.order_id entity_id FROM purchase_events e
  ) activity LEFT JOIN users u ON u.id=activity.user_id LEFT JOIN businesses b ON b.id=activity.business_id
  WHERE (?=0 OR activity.business_id=?) AND (?='' OR u.name LIKE ? OR u.email LIKE ? OR b.name LIKE ? OR activity.action LIKE ?)
  ORDER BY activity.created_at DESC,activity.id DESC LIMIT 500`,[businessId,businessId,search,`%${search}%`,`%${search}%`,`%${search}%`,`%${search}%`]);
  return events.map(row=>({...row,details:parse(row.details_json,{})}));
 }
 fail('Superadmin endpoint not found',404);
}
module.exports={dispatch};
