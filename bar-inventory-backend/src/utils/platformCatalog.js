const {packageRecord,quote}=require('./platformPolicy');
const {parse,fail,PACKAGES}=require('./accessPolicy');
async function ensureBuiltInPackages(db){for(const p of Object.values(PACKAGES))await db.query('INSERT IGNORE INTO platform_packages (id,name,price,max_locations,max_members,modules_json) VALUES (?,?,?,?,?,?)',[p.id,p.name,p.price,p.maxLocations,p.maxMembers,JSON.stringify(p.modules)]);}
async function packages(db,all=false){db=db||require('../config/db');await ensureBuiltInPackages(db);return (await db.query(`SELECT * FROM platform_packages ${all?'':'WHERE active=1'} ORDER BY price,id`)).rows.map(packageRecord);}
async function getPackage(id,db){db=db||require('../config/db');await ensureBuiltInPackages(db);return packageRecord((await db.query('SELECT * FROM platform_packages WHERE id=?',[id])).rows[0]);}
async function settings(db){db=db||require('../config/db');return parse((await db.query('SELECT settings_json FROM platform_settings WHERE id=1')).rows[0]?.settings_json,{});}
async function subscriptionQuote(planId,code,bid,db){db=db||require('../config/db');const plan=await getPackage(planId,db);const coupon=code?(await db.query('SELECT * FROM platform_coupons WHERE code=?',[String(code).trim().toUpperCase()])).rows[0]:null;if(code&&!coupon)fail('Coupon not found',400);return quote(plan,coupon,bid);}
module.exports={packages,getPackage,settings,subscriptionQuote,ensureBuiltInPackages};
