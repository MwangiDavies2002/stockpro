const {fail,text}=require('./inventoryPolicy');
const tables=['units','categories','brands'];
const pick=type=>{if(!tables.includes(type))fail('Unknown reference type');return type;};
function normalize(type,body){pick(type);const location_id=Number(body.locationId??body.location_id);if(!Number.isInteger(location_id)||location_id<1)fail('Business location is required');const name=text(body.name,type==='units'?30:150,'Name');if(!name)fail('Name is required');const result={location_id,name};
 if(type==='units'){result.short_name=text(body.shortName??body.short_name,30,'Short name')||null;result.allow_decimal=Number(body.allowDecimal===true||body.allow_decimal===true||body.allow_decimal===1);if(result.allow_decimal)fail('This edition tracks whole stock units. Fractional quantities are not supported.');result.base_unit_id=body.baseUnitId||body.base_unit_id?Number(body.baseUnitId??body.base_unit_id):null;result.multiplier=result.base_unit_id?Number(body.multiplier):null;if(result.base_unit_id&&(!Number.isInteger(result.base_unit_id)||result.base_unit_id<1||!Number.isFinite(result.multiplier)||result.multiplier<=0||result.multiplier>1000000))fail('Choose a valid base unit and positive multiplier');}
 if(type==='categories'){result.code=text(body.code,50,'Category code')||null;result.parent_id=body.parentId||body.parent_id?Number(body.parentId??body.parent_id):null;if(result.parent_id&&(!Number.isInteger(result.parent_id)||result.parent_id<1))fail('Invalid parent category');}
 if(type!=='units')result.description=text(body.description,4000,'Description')||null;return result;
}
function validate(type,data,rows,old=null,used=false){
 const id=old?.id,link=type==='categories'?'parent_id':type==='units'?'base_unit_id':null;
 if(rows.some(r=>r.id!==id&&Number(r.location_id)===data.location_id&&r.name.trim().toLowerCase()===data.name.toLowerCase()&&(type!=='categories'||Number(r.parent_id||0)===Number(data.parent_id||0))))fail('A record with this name already exists here',409);
 if(type==='categories'&&data.code&&rows.some(r=>r.id!==id&&Number(r.location_id)===data.location_id&&String(r.code||'').toLowerCase()===data.code.toLowerCase()))fail('Category code already exists here',409);
 if(link&&data[link]){let next=data[link];const visited=new Set(id?[id]:[]);while(next){if(visited.has(next))fail('This relationship would create a cycle');visited.add(next);const parent=rows.find(r=>r.id===next&&Number(r.location_id)===data.location_id);if(!parent)fail('Parent or base unit must belong to the same business location');next=parent[link];}}
 if(old&&data.location_id!==Number(old.location_id)&&(used||rows.some(r=>link&&r[link]===id)))fail('This record is in use and cannot move to another location');
 if(old&&type==='units'&&(used||rows.some(r=>r.base_unit_id===id))&&(data.base_unit_id!==old.base_unit_id||Number(data.multiplier||0)!==Number(old.multiplier||0)||data.allow_decimal!==Number(old.allow_decimal||0)))fail('Unit quantity rules cannot change while products or derived units use it');
}
function decorate(type,row,rows){return{...row,...type==='categories'?{parent_name:rows.find(r=>r.id===row.parent_id)?.name||null}:type==='units'?{base_unit_name:rows.find(r=>r.id===row.base_unit_id)?.name||null}:{}};}
module.exports={pick,normalize,validate,decorate};
