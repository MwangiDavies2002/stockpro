const {fail}=require('../utils/accessPolicy');
const {dateTime}=require('../utils/platformPolicy');
async function createBusiness(db,actor,body,options){
 const b=body.business||{},o=body.owner||{},subscription=body.subscription||{};
 const required=(obj,key,label)=>{const value=String(obj[key]||'').trim();if(!value)fail(`${label} is required`,400);return value;};
 const name=required(b,'name','Business name'),country=required(b,'country','Country'),currency=required(b,'currency','Currency').toUpperCase(),city=required(b,'city','City'),state=required(b,'state','State'),timezone=required(b,'timezone','Time zone');
 const first=required(o,'firstName','Owner first name'),email=required(o,'email','Owner email').toLowerCase(),username=required(o,'username','Username'),password=String(o.password||'');
 if(!/^[A-Z]{3}$/.test(currency))fail('Currency must be a three-letter code, for example KES',400);
 if(!/^\S+@\S+\.\S+$/.test(email))fail('Enter a valid owner email address, for example owner@example.com',400);
 if(!/^[-a-zA-Z0-9_.]{3,80}$/.test(username))fail('Username must contain 3 to 80 letters, numbers, dots, hyphens or underscores. Spaces and @ are not allowed. Example: davies.mwangi',400);
 if(password.length<10||!/[A-Z]/.test(password)||!/[a-z]/.test(password)||!/[0-9]/.test(password))fail('Password must have at least 10 characters, uppercase, lowercase and a number',400);
 if(password!==o.confirmPassword)fail('Passwords do not match',400);
 try{new Intl.DateTimeFormat('en',{timeZone:timezone});}catch{fail('Choose a valid time zone',400);}
 const plan=await require('../utils/platformCatalog').getPackage(body.plan,db);if(!plan?.active)fail('Choose an active package',400);
 const method=subscription.paymentMethod;if(!['offline','mpesa'].includes(method))fail('Choose Offline or M-Pesa for the recorded payment',400);
 const reference=String(subscription.reference||'').trim();if(method==='mpesa'&&!reference)fail('Enter the M-Pesa transaction reference for the payment already received',400);if(reference.length>100)fail('Payment reference must be at most 100 characters',400);
 const end=dateTime(subscription.endDate||Date.now()+30*86400000),start=dateTime(Date.now());if(end<=start)fail('Subscription end date must be in the future',400);
 const hash=await options.hashPassword(password),tx=await db.getClient();
 try{await tx.query('BEGIN');
  const existing=await tx.query('SELECT id FROM users WHERE email=? OR username=?',[email,username]);if(existing.rows.length)fail('Email or username already belongs to an account. Each business needs a new owner login.',409);
  const {insertId:bid}=await tx.query('INSERT INTO businesses (name,currency,country,state,city,zip_code,landmark,timezone,locale,logo_url,website,contact_number,alternate_contact_number,registration_plan,subscription_mode,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[name,currency,country,state,city,String(b.zipCode||''),String(b.landmark||''),timezone,'en-KE',b.logoUrl||null,b.website||null,b.contactNumber||null,b.alternateContactNumber||null,plan.id,'managed',actor.id,start]);
  const {insertId:locationId}=await tx.query('INSERT INTO locations (business_id,name,address) VALUES (?,?,?)',[bid,String(b.locationName||'Main Branch').trim()||'Main Branch',`${city}, ${state}`]);
  const ownerName=[first,String(o.lastName||'').trim()].filter(Boolean).join(' ');
  const {insertId:userId}=await tx.query('INSERT INTO users (business_id,prefix,first_name,last_name,username,name,email,password,role,is_owner,phone) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[bid,o.prefix||null,first,o.lastName||null,username,ownerName,email,hash,'admin',1,b.contactNumber||null]);
  const {insertId:subscriptionId}=await tx.query('INSERT INTO subscriptions (business_id,plan,amount,original_amount,payment_method,recorded_payment_method,payment_reference,status,created_by,approved_at,start_date,end_date,admin_note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',[bid,plan.id,plan.price,plan.price,'manual',method,reference||null,'approved',actor.id,start,start,end,'Business created by Superadmin; payment recorded manually']);
  await tx.query('INSERT INTO platform_audit (actor_user_id,business_id,action,details_json) VALUES (?,?,?,?)',[actor.id,bid,'business.create',JSON.stringify({name,ownerId:userId,ownerEmail:email,plan:plan.id,paymentMethod:method,paymentReference:reference||null,subscriptionId})]);
  await tx.query('COMMIT');return{businessId:bid,locationId,subscriptionId,owner:{id:userId,name:ownerName,email}};
 }catch(e){await tx.query('ROLLBACK');if(e.code==='ER_DUP_ENTRY'||e.code==='SQLITE_CONSTRAINT_UNIQUE')fail('Email or username already belongs to an account',409);throw e;}finally{tx.release();}
}
module.exports={createBusiness};
