require('dotenv').config();
const {test,before,after}=require('node:test');const assert=require('node:assert/strict');
const {db}=require('../src/config/db');const app=require('../server');
let server,origin,owner,staff,location,product,otherProduct,role;const businesses=[];
const key=`access-${Date.now()}-${process.pid}`;
async function request(token,url,method='GET',data){const res=await fetch(origin+'/api'+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:data===undefined?undefined:JSON.stringify(data)});const body=await res.json();return{status:res.status,body};}
before(async()=>{server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));origin=`http://127.0.0.1:${server.address().port}`;});
test('registration requires a package and immediately grants its bounded features',async()=>{
 const invalid=await request(null,'/auth/business-registration','POST',{plan:'invalid'});assert.equal(invalid.status,400);
 const res=await request(null,'/auth/business-registration','POST',{plan:'basic',business:{name:key,currency:'KES',country:'Kenya',state:'Nairobi',city:'Nairobi',zipCode:'00100',landmark:'Test',timezone:'Africa/Nairobi'},settings:{defaultBusinessLocation:'Main'},owner:{firstName:'Test',username:key,email:key+'@example.invalid',password:'AccessOnlyStrong123!',confirmPassword:'AccessOnlyStrong123!'}});
 assert.equal(res.status,201,JSON.stringify(res.body));owner=res.body;businesses.push(owner.businessId);
 const me=await request(owner.token,'/auth/me');assert.equal(me.body.access.plan.maxLocations,2);assert.equal(me.body.access.plan.maxMembers,5);
 for(const route of ['/accounts','/treasury','/journal-entries','/accounting-settings','/reports/ledger'])assert.equal((await request(owner.token,route)).status,403,route);
});
test('concurrent location creation cannot exceed the package cap',async()=>{
 const responses=await Promise.all(['Second','Third'].map(name=>request(owner.token,'/locations','POST',{name})));
 assert.deepEqual(responses.map(r=>r.status).sort(),[201,403]);location=responses.find(r=>r.status===201).body.id;
 const p=await request(owner.token,'/inventory','POST',{name:'Assigned product',locationId:location,stock:5,price:10,cost:1});assert.equal(p.status,201,JSON.stringify(p.body));product=p.body;
 otherProduct=(await request(owner.token,'/inventory','POST',{name:'Other product',locationId:owner.locationId,stock:5,price:10,cost:1})).body;
});
test('role and location assignments apply to direct REST requests and reports',async()=>{
 const permissions=require('../src/utils/accessPolicy').permissionDefaults(false);permissions.reports.view='all';
 const rr=await request(owner.token,'/roles','POST',{name:'Branch cashier',permissions});assert.equal(rr.status,200,JSON.stringify(rr.body));role=rr.body;
 const member=await request(owner.token,'/users','POST',{name:'Staff',email:key+'-staff@example.invalid',password:'AccessOnlyStrong123!',role:'employee',locationIds:[location],accessRoleId:role.id});assert.equal(member.status,201,JSON.stringify(member.body));
 const login=await request(null,'/auth/login','POST',{email:member.body.email,password:'AccessOnlyStrong123!'});assert.equal(login.status,200,JSON.stringify(login.body));staff=login.body;
 assert.deepEqual((await request(staff.token,'/inventory')).body.map(r=>r.id),[product.id]);
 assert.deepEqual((await request(staff.token,'/reports/stock')).body.map(r=>r.id),[product.id]);
 assert.deepEqual((await request(staff.token,'/locations')).body.map(r=>r.id),[location]);
 assert.equal((await request(staff.token,`/inventory/${otherProduct.id}`)).status,403);
 assert.equal((await request(staff.token,`/inventory/${otherProduct.id}/history`)).status,403);
 assert.equal((await request(staff.token,`/inventory?locationId=${owner.locationId}`)).status,403);
 assert.equal((await request(staff.token,`/inventory/${product.id}`,'PUT',{name:'Hack',locationId:location})).status,403);
 assert.equal((await request(staff.token,'/sales','POST',{locationId:location,items:[{itemId:otherProduct.id,quantity:1}]})).status,403);
 assert.equal((await request(staff.token,'/users')).status,403);
 const report=await request(staff.token,'/reports/profit');assert.equal(report.status,200,JSON.stringify(report.body));
});
test('valid scoped sales, stock history and aggregates work through MySQL transactions',async()=>{
 const first=await request(owner.token,'/sales','POST',{locationId:owner.locationId,items:[{itemId:otherProduct.id,quantity:1}]});assert.equal(first.status,201,JSON.stringify(first.body));
 const sold=await request(staff.token,'/sales','POST',{locationId:location,items:[{itemId:product.id,quantity:2}]});assert.equal(sold.status,201,JSON.stringify(sold.body));
 const rows=await request(staff.token,'/sales');assert.equal(rows.status,200,JSON.stringify(rows.body));assert.equal(rows.body.length,1);
 const history=await request(staff.token,`/inventory/${product.id}/history`);assert.equal(history.status,200,JSON.stringify(history.body));assert.equal(history.body.length,2);assert.equal(history.body.filter(r=>r.change_type==='sale').length,1);assert.equal(history.body.filter(r=>r.change_type==='opening_stock').length,1);
 const usage=await request(staff.token,'/reports/usage');assert.equal(usage.status,200,JSON.stringify(usage.body));assert.deepEqual(usage.body.map(r=>r.id),[product.id]);
 const trend=await request(staff.token,'/reports/sales-trend');assert.equal(trend.status,200,JSON.stringify(trend.body));assert.equal(Number(trend.body[0].revenue),20);
 const cross=await request(staff.token,'/mpesa/stk-push','POST',{sale:{type:'pos',locationId:location,items:[{itemId:product.id,quantity:1,unitPrice:1}]}});assert.equal(cross.status,403);
});
test('concurrent member creation respects five members including the owner',async()=>{
 const responses=await Promise.all(Array.from({length:5},(_,i)=>request(owner.token,'/users','POST',{name:`Member ${i}`,email:`${key}-${i}@example.invalid`,password:'AccessOnlyStrong123!',role:'employee',locationIds:[location]})));
 assert.equal(responses.filter(r=>r.status===201).length,3,JSON.stringify(responses));assert.equal(responses.filter(r=>r.status===403).length,2);
 assert.equal((await request(owner.token,'/users')).body.length,5);
});
after(async()=>{
 if(server)await new Promise(r=>server.close(r));
 // Remove only fixtures belonging to the businesses created by this test run.
 for(const bid of businesses){assert.ok(Number.isInteger(bid)&&bid>0);await db.query('DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE business_id=?)',[bid]);await db.query('DELETE FROM inventory_stock_log WHERE item_id IN (SELECT id FROM inventory_items WHERE business_id=?)',[bid]);for(const table of ['sales','user_locations','access_roles','inventory_items','users','locations'])await db.query(`DELETE FROM ${table} WHERE business_id=?`,[bid]);await db.query('DELETE FROM businesses WHERE id=? AND name=?',[bid,key]);}
 await db.end();
});
