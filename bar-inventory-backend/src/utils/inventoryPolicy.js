const crypto = require('node:crypto');
const fail = (message, status=400) => { throw Object.assign(new Error(message), {status}); };
const text = (value, max, label) => { if(value!==null&&typeof value==='object')fail('Invalid '+label);const s=String(value??'').trim(); if(s.length>max)fail(`${label} must be at most ${max} characters`); return s; };
function normalize(body, old=null, defaultLocation=1) {
 const get=(key,column=key,fallback='')=>body[key]!==undefined?body[key]:old?.[column]??fallback;
 const name=text(get('name'),150,'Product name');if(!name)fail('name is required');
 const number=(key,fallback=0)=>{const n=Number(get(key,key,fallback));const max=['stock','threshold'].includes(key)?2147483647:99999999.99;if(!Number.isFinite(n)||n<0||n>max||(['stock','threshold'].includes(key)&&!Number.isInteger(n)))fail('Prices and quantities must be valid non-negative values; quantities must be whole numbers');return n;};
 const location=Number(get('locationId','location_id',defaultLocation));if(!Number.isInteger(location)||location<1)fail('Choose a business location');
 const data={name,stock:number('stock'),threshold:number('threshold',5),cost:number('cost'),price:number('price'),location_id:location,category:text(get('category'),512,'Category'),unit:text(get('unit','unit','Pieces'),30,'Unit')||'Pieces',brand:text(get('brand'),150,'Brand'),sku:text(get('sku'),100,'SKU')||old?.sku||`SKU-${crypto.randomUUID()}`,barcode:text(get('barcode'),100,'Barcode')||null,image_url:get('imageUrl','image_url',null)||null};
 for(const [key,column]of [['categoryId','category_id'],['unitId','unit_id'],['brandId','brand_id'],['supplierId','supplier_id']]){const value=get(key,column,null);data[column]=value==null||value===''?null:Number(value);if(data[column]!==null&&(!Number.isInteger(data[column])||data[column]<1))fail('Invalid '+key);}
 if(data.image_url){if(typeof data.image_url!=='string'||data.image_url.length>2800000||!(/^(https?:\/\/[^\s]+|data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+)$/.test(data.image_url)))fail('Use a PNG, JPEG, GIF or WebP image up to 2MB, or an HTTP image URL');}
 if(old){if(data.stock!==Number(old.stock))fail('Use a purchase receipt or stock correction to change quantity');if(Number(old.stock)>0&&data.cost!==Number(old.cost))fail('Cost of stock on hand is maintained by purchase receipts. It cannot be overwritten in product details.');}
 return data;
}
function guardIdentity(data,old,used){if(!old)return;if((Number(old.stock)>0||used)&&(data.location_id!==Number(old.location_id)||(old.unit_id?data.unit_id!==old.unit_id:data.unit!==old.unit)))fail('Location and stock unit cannot change after stock or transactions exist');}
module.exports={normalize,guardIdentity,fail,text};
