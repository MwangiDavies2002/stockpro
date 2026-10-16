const queues=new WeakMap();
function adapter(db){return {query:async(sql,args=[])=>{
 if(/^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(sql)){db.exec(sql);return{rows:[],rowCount:0};}
 const statement=db.prepare(sql);if(/^\s*SELECT\b/i.test(sql)){const rows=statement.all(...args);return{rows,rowCount:rows.length};}
 const result=statement.run(...args);return{rows:[],rowCount:result.changes,insertId:Number(result.lastInsertRowid)};
},getClient:async()=>({...adapter(db),lockClause:'',release(){}})};}
function dispatch(db,user,method,url,body,params,options){const previous=queues.get(db)||Promise.resolve();const pending=previous.catch(()=>{}).then(()=>require('../bar-inventory-backend/src/services/platform').dispatch(adapter(db),user,method,url,body,params,options));queues.set(db,pending);return pending;}
module.exports={adapter,dispatch};
