const assert=require('node:assert/strict');
const {PACKAGES}=require('../bar-inventory-backend/src/utils/accessPolicy');
async function scenarios(t,d){
 const key=`plat${Date.now()}${process.pid}`,fixtures=[],custom=key.toLowerCase().slice(0,30);let admin,target,ordinary,subscription,support,coupon;
 const request=async(token,url,method='GET',body)=>d.request(token,url,method,body);
 async function register(suffix,plan='basic',extra={}){const result=await request(null,'/auth/business-registration','POST',{plan,is_superadmin:true,business:{name:`${key}-${suffix}`,currency:'KES',country:'Kenya',state:'Nairobi',city:'Nairobi',zipCode:'00100',landmark:'Test',timezone:'Africa/Nairobi'},settings:{},owner:{firstName:'Platform test',username:`${key}-${suffix}`,email:`${key}-${suffix}@example.invalid`,password:'PlatformOnlyStrong123!',confirmPassword:'PlatformOnlyStrong123!',is_superadmin:true},...extra});assert.equal(result.status,201,JSON.stringify(result.body));fixtures.push(result.body);return result.body;}
 t.after(()=>d.cleanup(fixtures,custom,key));
 await t.test('platform privileges are explicit and registration cannot grant them',async()=>{
  admin=await register('admin','erp');target=await register('target');ordinary=await register('ordinary');
  assert.equal((await request(target.token,'/auth/me')).body.access.superadmin,false);
  for(const endpoint of ['/superadmin/overview','/superadmin/businesses','/superadmin/subscriptions','/superadmin/packages','/superadmin/coupons','/superadmin/settings','/superadmin/audit'])assert.equal((await request(ordinary.token,endpoint)).status,403,endpoint);
  await d.grant(admin.user.id,true);
  assert.equal((await request(admin.token,'/auth/me')).body.access.superadmin,true);
  const list=await request(admin.token,`/superadmin/businesses?search=${key}`);assert.equal(list.status,200,JSON.stringify(list.body));assert.equal(list.body.businesses.length,3);
 });
 await t.test('Superadmin registers a business without replacing their own login',async()=>{
  const payload={plan:'basic',business:{name:`${key}-created`,country:'Kenya',currency:'KES',city:'Nairobi',state:'Nairobi',timezone:'Africa/Nairobi',contactNumber:'0712345678',locationName:'Main Branch'},owner:{prefix:'Mr',firstName:'New',lastName:'Owner',username:`${key}-created`,email:`${key}-created@example.invalid`,password:'PlatformOnlyStrong123!',confirmPassword:'PlatformOnlyStrong123!'},subscription:{paymentMethod:'offline',reference:'OFFLINE-TEST',endDate:new Date(Date.now()+86400000*30).toISOString()}};
  assert.equal((await request(ordinary.token,'/superadmin/businesses','POST',payload)).status,403);
  const created=await request(admin.token,'/superadmin/businesses','POST',payload);assert.equal(created.status,201,JSON.stringify(created.body));fixtures.push(created.body);
  const login=await request(null,'/auth/login','POST',{email:payload.owner.email,password:payload.owner.password});assert.equal(login.status,200,JSON.stringify(login.body));assert.equal(login.body.user.business_id,created.body.businessId);assert.equal(login.body.user.access.plan.id,'basic');assert.equal(login.body.user.access.superadmin,false);
  const details=await request(admin.token,`/superadmin/businesses/${created.body.businessId}`);assert.equal(details.body.subscriptions[0].payment_reference,'OFFLINE-TEST');assert.equal(details.body.subscriptions[0].recorded_payment_method,'offline');assert.equal(details.body.locations.length,1);
  assert.equal((await request(admin.token,'/auth/me')).body.id,admin.user.id);
  assert.equal((await request(admin.token,'/superadmin/businesses','POST',payload)).status,409);
  assert.equal((await request(admin.token,`/superadmin/businesses?search=${key}-created`)).body.total,1);
 });
 await t.test('theme colors are validated and saved independently for each account',async()=>{
  assert.equal((await request(admin.token,'/auth/theme','PUT',{color:'#2459A6'})).status,200);
  assert.equal((await request(admin.token,'/auth/me')).body.access.themeColor,'#2459a6');
  assert.equal((await request(target.token,'/auth/theme','PUT',{color:'#eac132'})).status,200);
  assert.equal((await request(target.token,'/auth/me')).body.access.themeColor,'#eac132');
  assert.equal((await request(ordinary.token,'/auth/me')).body.access.themeColor,null);
  assert.equal((await request(admin.token,'/auth/theme','PUT',{color:'javascript:alert(1)'})).status,400);
 });
 await t.test('Superadmin manages subscription dates, features and business status',async()=>{
  const now=Date.now(),res=await request(admin.token,`/superadmin/businesses/${target.businessId}/subscriptions`,'POST',{plan:'growth',status:'approved',startDate:new Date(now-60000).toISOString(),endDate:new Date(now+86400000).toISOString(),amount:5000,note:'Test grant'});assert.equal(res.status,200,JSON.stringify(res.body));subscription=res.body.id;
  let access=(await request(target.token,'/auth/me')).body.access;assert.equal(access.plan.id,'growth');assert.equal(access.subscriptionRequired,false);
  assert.equal((await request(target.token,'/accounts')).status,200);
  const expired=await request(admin.token,`/superadmin/subscriptions/${subscription}`,'PUT',{plan:'growth',status:'expired',startDate:new Date(now-86400000*2).toISOString(),endDate:new Date(now-86400000).toISOString(),amount:5000});assert.equal(expired.status,200,JSON.stringify(expired.body));
  assert.equal((await request(target.token,'/inventory')).status,403);assert.equal((await request(target.token,'/subscriptions')).status,200);
  const renewed=await request(admin.token,`/superadmin/businesses/${target.businessId}/subscriptions`,'POST',{plan:'basic',status:'approved',startDate:new Date(now-60000).toISOString(),endDate:new Date(now+86400000).toISOString(),amount:1000});assert.equal(renewed.status,200,JSON.stringify(renewed.body));
  assert.equal((await request(target.token,'/accounts')).status,403);assert.equal((await request(target.token,'/inventory')).status,200);
  assert.equal((await request(admin.token,`/superadmin/businesses/${target.businessId}/status`,'PATCH',{status:'suspended'})).status,200);
  assert.equal((await request(target.token,'/inventory')).status,403);
  assert.equal((await request(admin.token,`/superadmin/businesses/${target.businessId}/status`,'PATCH',{status:'active'})).status,200);
 });
 await t.test('editable packages drive registration and coupons drive authoritative prices',async()=>{
  const plan={id:custom,name:'Platform test package',price:2000,maxLocations:3,maxMembers:4,modules:PACKAGES.basic.modules,active:true};
  assert.equal((await request(admin.token,'/superadmin/packages','POST',plan)).status,200);
  const code=key.toUpperCase().slice(0,35);const created=await request(admin.token,'/superadmin/coupons','POST',{code,discountType:'percent',value:25,packageIds:[custom],businessId:target.businessId,expiresAt:new Date(Date.now()+86400000).toISOString(),active:true});assert.equal(created.status,200,JSON.stringify(created.body));coupon=created.body;
  const pricing=await request(target.token,'/subscriptions/quote','POST',{plan:custom,couponCode:code});assert.equal(pricing.status,200,JSON.stringify(pricing.body));assert.equal(pricing.body.amount,1500);
  assert.equal((await request(ordinary.token,'/subscriptions/quote','POST',{plan:custom,couponCode:code})).status,400);
  const sub=await request(target.token,'/subscriptions','POST',{plan:custom,amount:1,paymentMethod:'offline',couponCode:code});assert.equal(sub.status,201,JSON.stringify(sub.body));assert.equal(Number(sub.body.amount),1500);
  const customOwner=await register('custom',custom);assert.equal((await request(customOwner.token,'/auth/me')).body.access.plan.maxMembers,4);
  assert.equal((await request(admin.token,`/superadmin/packages/${custom}`,'PUT',{...plan,active:false})).status,200);
  assert.ok(!(await request(null,'/auth/packages')).body.some(p=>p.id===custom));
 });
 await t.test('support access is temporary, bounded and cannot reach platform controls',async()=>{
  const started=await request(admin.token,`/superadmin/businesses/${target.businessId}/support-session`,'POST',{reason:'Investigate reported stock issue'});assert.equal(started.status,200,JSON.stringify(started.body));support=started.body;
  const me=await request(support.token,'/auth/me');assert.equal(me.status,200,JSON.stringify(me.body));assert.equal(me.body.business_id,target.businessId);assert.ok(me.body.access.supportSession);assert.equal(me.body.access.superadmin,false);assert.equal(me.body.access.themeColor,'#2459a6');
  assert.equal((await request(support.token,'/superadmin/businesses')).status,403);
  assert.equal((await request(support.token,'/accounts')).status,403);
  assert.equal((await request(support.token,`/users/${target.user.id}`,'PUT',{name:'Changed',email:'changed@example.invalid',role:'admin'})).status,403);
  assert.equal((await request(support.token,'/auth/support-session/end','POST',{})).status,200);
  assert.equal((await request(support.token,'/auth/me')).status,401);
  assert.equal((await request(admin.token,'/superadmin/overview')).status,200);
 });
 await t.test('revoking Superadmin invalidates existing support access and audit retains the actor',async()=>{
  const started=await request(admin.token,`/superadmin/businesses/${target.businessId}/support-session`,'POST',{reason:'Verify permission revocation'});assert.equal(started.status,200);support=started.body;
  const audit=await request(admin.token,'/superadmin/audit');assert.equal(audit.status,200);assert.ok(audit.body.some(a=>a.action==='support.start'&&a.actor_user_id===admin.user.id));assert.ok(audit.body.some(a=>a.action==='subscription.create'&&a.business_id===target.businessId));
  await d.grant(admin.user.id,false);assert.equal((await request(admin.token,'/superadmin/businesses')).status,403);assert.equal((await request(support.token,'/auth/me')).status,401);
 });
}
module.exports={scenarios};
