async function once(client,businessId,operation,key,fn) {
  if (!key) return fn();
  if (typeof key!=='string'||key.length>100) throw Object.assign(new Error('Invalid request identifier'),{status:400});
  await client.query('INSERT INTO operation_requests(business_id,operation,request_key) VALUES (?,?,?) ON DUPLICATE KEY UPDATE request_key=VALUES(request_key)',[businessId,operation,key]);
  const {rows:[row]}=await client.query('SELECT result_json FROM operation_requests WHERE business_id=? AND operation=? AND request_key=? FOR UPDATE',[businessId,operation,key]);
  if(row.result_json) return {...(typeof row.result_json==='string'?JSON.parse(row.result_json):row.result_json),replayed:true};
  const result=await fn();
  await client.query('UPDATE operation_requests SET result_json=? WHERE business_id=? AND operation=? AND request_key=?',[JSON.stringify(result),businessId,operation,key]);
  return result;
}
module.exports = {once};
