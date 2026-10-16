const {MODULES,parse,fail}=require('./accessPolicy');
function packageRecord(row){if(!row)return null;return {id:row.id,name:row.name,price:Number(row.price),maxLocations:row.max_locations===null?null:Number(row.max_locations),maxMembers:row.max_members===null?null:Number(row.max_members),modules:parse(row.modules_json,[]),active:!!row.active};}
function validatePackage(body,id){
 id=String(id||body.id||'').trim();if(!/^[a-z][a-z0-9_-]{1,29}$/.test(id))fail('Use a package ID of 2-30 lowercase letters, numbers, underscores or hyphens',400);
 const name=String(body.name||'').trim(),price=Number(body.price);if(!name||name.length>100||!Number.isFinite(price)||price<0||price>99999999)fail('Enter a package name and a valid price',400);
 const limit=value=>{if(value===null||value==='')return null;const n=Number(value);if(!Number.isInteger(n)||n<1||n>1000000)fail('Limits must be positive whole numbers, or blank for unlimited',400);return n;};
 if(!Array.isArray(body.modules)||body.modules.some(key=>!MODULES.some(m=>m.key===key)))fail('Invalid package features',400);
 return{id,name,price:Math.round(price*100)/100,maxLocations:limit(body.maxLocations),maxMembers:limit(body.maxMembers),modules:[...new Set(body.modules)],active:body.active!==false};
}
function validateCoupon(body){const code=String(body.code||'').trim().toUpperCase(),type=body.discountType,value=Number(body.value);
 if(!/^[A-Z0-9_-]{3,40}$/.test(code)||!['percent','fixed'].includes(type)||!Number.isFinite(value)||value<=0||type==='percent'&&value>100)fail('Enter a valid coupon code, discount type and value',400);
 const businessId=body.businessId?Number(body.businessId):null;if(businessId&&(!Number.isInteger(businessId)||businessId<1))fail('Invalid business',400);
 const packageIds=Array.isArray(body.packageIds)?body.packageIds:[];const expiresAt=body.expiresAt?dateTime(body.expiresAt):null;
 return{code,discountType:type,value,active:body.active!==false,expiresAt,businessId,packageIds};
}
function dateTime(value){const d=new Date(value);if(!Number.isFinite(d.getTime()))fail('Enter a valid date',400);return d.toISOString().slice(0,19).replace('T',' ');}
function quote(plan,coupon,businessId){
 if(!plan?.active)fail('This package is not available',400);let discount=0;
 if(coupon){const expiry=coupon.expires_at instanceof Date?coupon.expires_at.getTime():coupon.expires_at?new Date(String(coupon.expires_at).replace(' ','T')+'Z').getTime():null;const packages=parse(coupon.package_ids_json,[]);if(!coupon.active||expiry!==null&&(!Number.isFinite(expiry)||expiry<Date.now())||coupon.business_id&&Number(coupon.business_id)!==Number(businessId)||packages.length&&!packages.includes(plan.id))fail('This coupon is not available for this business and package',400);discount=coupon.discount_type==='percent'?plan.price*Number(coupon.value)/100:Number(coupon.value);}
 return{plan:plan.id,originalAmount:plan.price,discount:Math.round(Math.min(discount,plan.price)*100)/100,amount:Math.round(Math.max(0,plan.price-discount)*100)/100,couponCode:coupon?.code||null};
}
module.exports={packageRecord,validatePackage,validateCoupon,dateTime,quote};
