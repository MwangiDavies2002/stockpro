const {getClient}=require('../config/db');
const {getBusinessId}=require('../utils/tenant');
const {once}=require('../utils/idempotency');
const p=require('../utils/inventoryPolicy');
async function bulkImport(req,res,next){
 const {items,requestId}=req.body;if(!Array.isArray(items)||!items.length||items.length>20000)return res.status(400).json({message:'Import between 1 and 20,000 products at a time'});
 const c=await getClient(),bid=getBusinessId(req);try{
 await c.query('BEGIN');await c.query('SELECT id FROM businesses WHERE id=? FOR UPDATE',[bid]);require('../utils/treasuryPolicy').requestKey(requestId);
 const locations=(await c.query('SELECT id FROM locations WHERE business_id=? AND active=TRUE ORDER BY id',[bid])).rows,locationId=Number(req.body.locationId||locations[0]?.id);if(!locations.some(l=>l.id===locationId))p.fail('Choose an active location belonging to your shop');
 const result=await once(c,bid,'inventory-import',requestId,async()=>{
  const existing=(await c.query('SELECT sku,barcode FROM inventory_items WHERE business_id=? AND location_id=?',[bid,locationId])).rows,skus=new Set(existing.map(r=>String(r.sku||'').toLowerCase()).filter(Boolean)),barcodes=new Set(existing.map(r=>String(r.barcode||'').toLowerCase()).filter(Boolean)),refs={};
  for(const table of ['categories','units','brands'])refs[table]=(await c.query(`SELECT * FROM ${table} WHERE business_id=? AND location_id=?`,[bid,locationId])).rows;
  const suppliers=new Set((await c.query('SELECT id FROM suppliers WHERE business_id=?',[bid])).rows.map(s=>s.id)),pending=[],created=[],errors=[];let skippedCount=0;
  for(const[index,row]of items.entries()){try{const data=p.normalize({...row,locationId},null,locationId);if(skus.has(data.sku.toLowerCase())){skippedCount++;continue;}if(data.barcode&&barcodes.has(data.barcode.toLowerCase()))p.fail('Barcode already exists at this location');
   if(data.supplier_id&&!suppliers.has(data.supplier_id))p.fail('Supplier must belong to your business');
   for(const[column,table,field]of [['category_id','categories','category'],['unit_id','units','unit'],['brand_id','brands','brand']]){const matches=refs[table].filter(r=>data[column]?r.id===data[column]:r.name.toLowerCase()===data[field].toLowerCase());if(data[column]&&!matches.length)p.fail(field+' must belong to the selected location');if(matches.length===1){data[column]=matches[0].id;data[field]=matches[0].name;if(table==='units'&&matches[0].allow_decimal)p.fail('Choose a whole stock unit');}}
   skus.add(data.sku.toLowerCase());if(data.barcode)barcodes.add(data.barcode.toLowerCase());pending.push({row:index+2,data});
  }catch(e){errors.push({row:index+2,name:row?.name||'(blank)',message:e.message});}}
  const fields=['business_id','name','category','unit','brand','stock','threshold','cost','price','supplier_id','sku','barcode','image_url','location_id','category_id','unit_id','brand_id'];const insert='INSERT INTO inventory_items('+fields.join(',')+') VALUES ';
  const values=r=>fields.map(f=>f==='business_id'?bid:r.data[f]);const added=[];
  for(let index=0;index<pending.length;index+=100){const batch=pending.slice(index,index+100);try{await c.query(insert+batch.map(()=>`(${fields.map(()=>'?').join(',')})`).join(','),batch.flatMap(values));added.push(...batch);}catch(e){for(const row of batch){try{await c.query(insert+`(${fields.map(()=>'?').join(',')})`,values(row));added.push(row);}catch(failure){errors.push({row:row.row,name:row.data.name,message:failure.message});}}}}
  for(let i=0;i<added.length;i+=100){const batch=added.slice(i,i+100),rows=(await c.query(`SELECT id,sku,stock FROM inventory_items WHERE business_id=? AND location_id=? AND sku IN (${batch.map(()=>'?').join(',')})`,[bid,locationId,...batch.map(r=>r.data.sku)])).rows;const stock=rows.filter(r=>Number(r.stock)>0);if(stock.length)await c.query('INSERT INTO inventory_stock_log(item_id,change_type,qty_change,before_stock,after_stock,user_id,note) VALUES '+stock.map(()=>"(?,'opening_stock',?,0,?,?,?)").join(','),stock.flatMap(r=>[r.id,r.stock,r.stock,req.user.id,'Imported initial quantity; opening journal is recorded separately']));for(const row of batch)created.push({row:row.row,id:rows.find(r=>r.sku===row.data.sku)?.id,name:row.data.name,sku:row.data.sku});}
  return{createdCount:created.length,errorCount:errors.length,skippedCount,locationId,created,errors};
 });await c.query('COMMIT');res.status(!result.createdCount&&result.errorCount>0?400:201).json(result);
 }catch(e){await c.query('ROLLBACK');next(e);}finally{c.release();}
}
module.exports={bulkImport};
