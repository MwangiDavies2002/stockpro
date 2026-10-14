const {getClient}=require('../config/db');
const {getBusinessId}=require('../utils/tenant');
const {once}=require('../utils/idempotency');
const crypto=require('node:crypto');
async function bulkImport(req,res,next){
  const {items,requestId}=req.body;
  if(!Array.isArray(items)||!items.length) return res.status(400).json({message:'No items to import'});
  const client=await getClient();
  try{
    const businessId=getBusinessId(req);
    const locations=await client.query('SELECT id FROM locations WHERE business_id=? AND active=TRUE ORDER BY id',[businessId]);
    const locationId=Number(req.body.locationId||locations.rows[0]?.id);
    if(!locations.rows.some(row=>row.id===locationId))return res.status(400).json({message:'Choose an active location belonging to your shop'});
    await client.query('BEGIN');
    const result=await once(client,businessId,'inventory-import',requestId,async()=>{
      const created=[],errors=[],pending=[],existing=(await client.query('SELECT sku FROM inventory_items WHERE business_id=? AND location_id=?',[businessId,locationId])).rows;
      const skus=new Set(existing.map(row=>row.sku).filter(Boolean)); let skippedCount=0;
      items.forEach((row,index)=>{
        const number=index+2;
        try{
          const name=String(row.name||'').trim(),category=String(row.category||'').trim(),unit=String(row.unit||'Pieces').trim();
          const sku=String(row.sku||'').trim()||`SKU-${crypto.randomUUID()}`;
          if(!name)throw new Error('name is required');
          if(name.length>150||category.length>512||unit.length>30||sku.length>100)throw new Error('Name, category, unit or SKU exceeds the allowed length');
          const values=['stock','threshold','cost','price'].map(key=>Number(row[key]??(key==='threshold'?5:0)));
          if(values.some(value=>!Number.isFinite(value)||value<0)||!Number.isInteger(values[0])||!Number.isInteger(values[1])||values[2]>99999999.99||values[3]>99999999.99)throw new Error('Stock, threshold, cost and price must be valid non-negative values');
          if(skus.has(sku)){skippedCount++;return;} skus.add(sku);
          pending.push({row:number,name,sku,values:[businessId,name,category,unit,...values,row.supplierId||null,sku,locationId]});
        }catch(error){errors.push({row:number,name:row.name||'(blank)',message:error.message});}
      });
      const insert='INSERT INTO inventory_items(business_id,name,category,unit,stock,threshold,cost,price,supplier_id,sku,location_id) VALUES ';
      for(let index=0;index<pending.length;index+=100){
        const batch=pending.slice(index,index+100);
        try{
          await client.query(insert+batch.map(()=>'(?,?,?,?,?,?,?,?,?,?,?)').join(','),batch.flatMap(row=>row.values));
          for(const row of batch)created.push({row:row.row,name:row.name,sku:row.sku});
        }catch(error){
          for(const row of batch){try{const result=await client.query(insert+'(?,?,?,?,?,?,?,?,?,?,?)',row.values);created.push({row:row.row,id:result.insertId,name:row.name});}catch(failure){errors.push({row:row.row,name:row.name,message:failure.message});}}
        }
      }
      return {createdCount:created.length,errorCount:errors.length,skippedCount,locationId,created,errors};
    });
    await client.query('COMMIT');res.status(result.errorCount===items.length?400:201).json(result);
  }catch(error){await client.query('ROLLBACK');next(error);}finally{client.release();}
}
module.exports={bulkImport};
