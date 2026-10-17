const {query,getClient}=require('../config/db');
const {getBusinessId}=require('../utils/tenant');
const policy=require('../utils/referencePolicy');
const {fail}=require('../utils/inventoryPolicy');
const columns={categories:'category',units:'unit',brands:'brand'};
async function getAll(req,res,next){
  try{
    const table=policy.pick(req.params.type),bid=getBusinessId(req);
    const params = [bid];
    let sql = `SELECT * FROM ${table} WHERE business_id=?`;
    if (req.query.locationId) {
      sql += ' AND location_id=?';
      params.push(req.query.locationId);
    }
    if (req.query.search) {
      sql += ' AND name LIKE ?';
      params.push(`%${req.query.search}%`);
    }
    sql += ' ORDER BY name';
    const { rows } = await query(sql, params);
    
    // We still need all rows for decoration (parent/base unit names) if we don't join
    // but decoration only needs the list of rows to find names.
    // If the list is filtered, we might miss parents not in the filter.
    // However, policy.decorate uses the 'rows' passed to it.
    // If we only pass filtered rows, decorate might fail to find parents.
    // Let's fetch all rows for the business once if needed, or better, join in SQL.
    
    const allRows = (await query(`SELECT id, name FROM ${table} WHERE business_id=?`, [bid])).rows;
    res.json(rows.map(r => policy.decorate(table, r, allRows)));
  } catch(e) { next(e); }
}
async function mutate(req,res,next,action){const c=await getClient(),bid=getBusinessId(req);try{await c.query('BEGIN');await c.query('SELECT id FROM businesses WHERE id=? FOR UPDATE',[bid]);const table=policy.pick(req.params.type),rows=(await c.query(`SELECT * FROM ${table} WHERE business_id=?`,[bid])).rows,id=Number(req.params.id)||null,old=id?rows.find(r=>r.id===id):null;if(action!=='create'&&!old)fail('Record not found',404);
 const legacyUnique=!old||rows.filter(r=>r.name.toLowerCase()===old.name.toLowerCase()&&r.location_id===old.location_id).length===1;const field=columns[table],used=old&&(await c.query(`SELECT id FROM inventory_items WHERE business_id=? AND (${field}_id=? OR (${field}_id IS NULL AND ${field}=? AND location_id=?)) LIMIT 1`,[bid,id,old.name,old.location_id])).rows.length>0;
 let result;
 if(action==='remove'){const link=table==='categories'?'parent_id':table==='units'?'base_unit_id':null;if(used||rows.some(r=>link&&r[link]===id))fail('This record is used by products or child records. Keep it for its history.',409);await c.query(`DELETE FROM ${table} WHERE id=? AND business_id=?`,[id,bid]);result={message:'Record deleted'};}
 else{const data=policy.normalize(table,req.body);const location=(await c.query('SELECT id FROM locations WHERE id=? AND business_id=? AND active=TRUE',[data.location_id,bid])).rows[0];if(!location)fail('Choose an active business location');policy.validate(table,data,rows,old,used);const keys=Object.keys(data);let savedId=id;if(old){await c.query(`UPDATE ${table} SET ${keys.map(k=>k+'=?').join(',')},updated_at=NOW() WHERE id=? AND business_id=?`,[...keys.map(k=>data[k]),id,bid]);await c.query(`UPDATE inventory_items SET ${field}=?,${field}_id=? WHERE business_id=? AND (${field}_id=? OR (${field}_id IS NULL AND ${field}=? AND location_id=? AND ${legacyUnique?1:0}=1))`,[data.name,id,bid,id,old.name,old.location_id]);}else savedId=(await c.query(`INSERT INTO ${table}(business_id,${keys.join(',')}) VALUES (${Array(keys.length+1).fill('?').join(',')})`,[bid,...keys.map(k=>data[k])])).insertId;result=policy.decorate(table,{...data,id:savedId,business_id:bid},rows);}
 await c.query('COMMIT');res.status(action==='create'?201:200).json(result);
 }catch(e){await c.query('ROLLBACK');next(e);}finally{c.release();}}
module.exports={getAll,create:(req,res,next)=>mutate(req,res,next,'create'),update:(req,res,next)=>mutate(req,res,next,'update'),remove:(req,res,next)=>mutate(req,res,next,'remove')};
