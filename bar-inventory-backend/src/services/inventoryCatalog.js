const {getClient}=require('../config/db');
const {getBusinessId}=require('../utils/tenant');
const policy=require('../utils/inventoryPolicy');
const {once}=require('../utils/idempotency');
const tables=['inventory_stock_log','sale_items','order_items','sales_document_items'];
async function used(c,id){for(const table of tables)if((await c.query(`SELECT id FROM ${table} WHERE item_id=? LIMIT 1`,[id])).rows.length)return true;return false;}
async function resolve(c,data,bid,body){
 const loc=(await c.query('SELECT id FROM locations WHERE id=? AND business_id=? AND active=TRUE',[data.location_id,bid])).rows[0];if(!loc)policy.fail('Choose an active location belonging to your business');
 for(const [column,table,field,key]of [['category_id','categories','category','categoryId'],['unit_id','units','unit','unitId'],['brand_id','brands','brand','brandId']]){
  if(!data[column]&&body[key]===undefined&&data[field]){const matches=(await c.query(`SELECT * FROM ${table} WHERE business_id=? AND location_id=? AND LOWER(name)=LOWER(?)`,[bid,data.location_id,data[field]])).rows;if(matches.length===1)data[column]=matches[0].id;}
  if(data[column]){const ref=(await c.query(`SELECT * FROM ${table} WHERE id=? AND business_id=? AND location_id=?`,[data[column],bid,data.location_id])).rows[0];if(!ref)policy.fail(`${field} must belong to the selected business location`);data[field]=ref.name;if(field==='unit'&&ref.allow_decimal)policy.fail('Choose a whole stock unit; fractional units are not supported');}
  else if(body[key]===null||body[key]==='')data[field]=String(body[field]||'').trim()||(field==='unit'?'Pieces':'');
 }
 if(data.unit.length>30)policy.fail('Unit name must be at most 30 characters');
 if(data.supplier_id&&!(await c.query('SELECT id FROM suppliers WHERE id=? AND business_id=?',[data.supplier_id,bid])).rows.length)policy.fail('Supplier must belong to your business');
}
async function mutate(req,res,next,action){const c=await getClient(),bid=getBusinessId(req);try{await c.query('BEGIN');await c.query('SELECT id FROM businesses WHERE id=? FOR UPDATE',[bid]);require('../utils/treasuryPolicy').requestKey(req.body?.requestId);const work=async()=>{const id=Number(req.params?.id)||null,old=id?(await c.query('SELECT * FROM inventory_items WHERE id=? AND business_id=? FOR UPDATE',[id,bid])).rows[0]:null;if(action!=='create'&&!old)policy.fail('Item not found',404);
 if(action==='remove'){if(Number(old.stock)>0||Number(old.sold)>0||await used(c,id))policy.fail('This product has stock or transaction history. Keep it for its records.',409);await c.query('DELETE FROM inventory_items WHERE id=? AND business_id=?',[id,bid]);return{message:'Item deleted'};}
 const defaultLocation=(await c.query('SELECT id FROM locations WHERE business_id=? AND active=TRUE ORDER BY id LIMIT 1',[bid])).rows[0]?.id;
 const data=policy.normalize(req.body,old,defaultLocation);await resolve(c,data,bid,req.body);policy.guardIdentity(data,old,old?await used(c,id):false);
 for(const field of ['sku','barcode'])if(data[field]&&(await c.query(`SELECT id FROM inventory_items WHERE business_id=? AND location_id=? AND LOWER(${field})=LOWER(?) AND id<>? LIMIT 1`,[bid,data.location_id,data[field],id||0])).rows.length)policy.fail(`${field==='sku'?'SKU':'Barcode'} already exists at this location`,409);
 const keys=Object.keys(data);let savedId=id;if(old){await c.query(`UPDATE inventory_items SET ${keys.map(k=>k+'=?').join(',')},updated_at=NOW() WHERE id=? AND business_id=?`,[...keys.map(k=>data[k]),id,bid]);}else{savedId=(await c.query(`INSERT INTO inventory_items(business_id,${keys.join(',')}) VALUES (${Array(keys.length+1).fill('?').join(',')})`,[bid,...keys.map(k=>data[k])])).insertId;if(data.stock>0)await c.query("INSERT INTO inventory_stock_log(item_id,change_type,qty_change,before_stock,after_stock,user_id,note) VALUES (?,'opening_stock',?,0,?,?,?)",[savedId,data.stock,data.stock,req.user.id,'Initial product quantity; opening journal is recorded separately']);}
 return(await c.query('SELECT * FROM inventory_items WHERE id=? AND business_id=?',[savedId,bid])).rows[0];};
 let result=action==='create'?await once(c,bid,'inventory-create',req.body.requestId,work):await work();if(result.replayed){const latest=(await c.query('SELECT * FROM inventory_items WHERE id=? AND business_id=?',[result.id,bid])).rows[0];if(latest)result={...latest,replayed:true};}await c.query('COMMIT');res.status(action==='create'?201:200).json(result);
 }catch(e){await c.query('ROLLBACK');next(e);}finally{c.release();}}
module.exports={create:(q,s,n)=>mutate(q,s,n,'create'),update:(q,s,n)=>mutate(q,s,n,'update'),remove:(q,s,n)=>mutate(q,s,n,'remove')};
