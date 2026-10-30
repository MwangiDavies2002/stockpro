const crypto = require('node:crypto');
const { query, getClient } = require('../config/db');
const Journal = require('../models/Journal');
const { getBusinessId } = require('../utils/tenant');
const fail = (message,status=400) => { throw Object.assign(new Error(message),{status}); };
const policy=require('../utils/treasuryPolicy');
const amount=policy.amount;
async function treasury(client,id,businessId,lock=false) {
  const {rows}=await client.query(`SELECT * FROM treasury WHERE id=? AND business_id=?${lock?' FOR UPDATE':''}`,[id,businessId]);
  if (!rows.length) fail('Treasury not found',404);
  const row=rows[0];
  if(row.linked_gl_account){if(lock){await client.query('SELECT id FROM chart_of_accounts WHERE id=? AND business_id=? FOR UPDATE',[row.linked_gl_account,businessId]);const result=await client.query('SELECT l.debit,l.credit FROM journal_entry_lines l JOIN journal_entries j ON j.id=l.journal_entry_id WHERE l.account_id=? AND j.business_id=? FOR UPDATE',[row.linked_gl_account,businessId]);row.current_balance=Number(result.rows.reduce((n,l)=>n+Number(l.debit)-Number(l.credit),0).toFixed(2));}else{const result=await client.query('SELECT COALESCE(SUM(l.debit-l.credit),0) balance FROM journal_entry_lines l JOIN journal_entries j ON j.id=l.journal_entry_id WHERE l.account_id=? AND j.business_id=?',[row.linked_gl_account,businessId]);row.current_balance=Number(result.rows[0].balance);}}
  return row;
}
async function equity(client,businessId) { return (await require('../utils/accountingDefaults').openingEquity(client,businessId)).id; }
async function activeAccount(client,id,businessId) {
  const {rows}=await client.query('SELECT id FROM chart_of_accounts WHERE id=? AND business_id=? AND active=TRUE',[id,businessId]);
  if (!rows.length) fail('GL account must be active and belong to your shop');
  return Number(id);
}
async function transaction(req,res,fn,operation=null) {
  const client=await getClient();
  try { await client.query('BEGIN'); policy.requestKey(req.body?.requestId); const bid=getBusinessId(req); const data=operation?await require('../utils/idempotency').once(client,bid,operation,req.body.requestId,()=>fn(client,bid)):await fn(client,bid); await client.query('COMMIT'); res.json(data); }
  catch(error) { await client.query('ROLLBACK'); res.status(error.status||500).json({error:error.message}); }
  finally {client.release();}
}
exports.getTreasuries=async(req,res,next)=>{try{const businessId=getBusinessId(req); const rows=(await query('SELECT * FROM treasury WHERE business_id=? ORDER BY name',[businessId])).rows; res.json(await Promise.all(rows.map(row=>treasury({query},row.id,businessId))));}catch(e){next(e);}};
exports.getTreasury=async(req,res)=>{try{res.json(await treasury({query},req.params.id,getBusinessId(req)));}catch(e){res.status(e.status||500).json({error:e.message});}};
exports.createTreasury=async(req,res)=>{res.status(201);return transaction(req,res,async(client,businessId)=>{
  const data=policy.accountData(req.body),name=data.name;
  const paymentSetting=req.body.payment_setting||'';
  if(paymentSetting&&!['payment_cash','payment_bank','payment_mobile'].includes(paymentSetting)) fail('Choose a valid payment mapping');
  if(paymentSetting&&req.body.status&&req.body.status!=='active') fail('A payment account must be active');
  const opening=amount(req.body.opening_balance??0,false);
  let linked=Number(req.body.linked_gl_account)||null;
  if(req.body.autoCreateGlAccount===true){
    const type=data.type==='Bank'?'Bank':data.type==='Mobile Money'?'Mobile money':'Cash';
    const policy=require('../utils/accountPolicy');
    const accounts=(await client.query('SELECT * FROM chart_of_accounts WHERE business_id=?',[businessId])).rows;
    const account=policy.normalize({account_name:name,account_type:'Assets',account_subtype:'Cash and cash equivalents',detail_type:type,normal_balance:'Debit',active:true},accounts);
    const created=await client.query('INSERT INTO chart_of_accounts(business_id,account_code,account_name,parent_id,account_type,account_subtype,detail_type,normal_balance,active,details) VALUES (?,?,?,?,?,?,?,?,?,?)',[businessId,account.account_code,account.account_name,account.parent_id,account.account_type,account.account_subtype,account.detail_type,account.normal_balance,account.active,JSON.stringify({description:`Linked Treasury account: ${name}`})]);
    linked=created.insertId;
  }
  if(!linked) fail('Select an existing Chart of Accounts asset account');
  await activeAccount(client,linked,businessId);
  const {rows:[gl]}=await client.query('SELECT * FROM chart_of_accounts WHERE id=? AND business_id=? FOR UPDATE',[linked,businessId]);
  if(gl.account_type!=='Assets') fail('Treasury must link to an asset account');
  if((await client.query('SELECT id FROM treasury WHERE linked_gl_account=? AND business_id=?',[linked,businessId])).rows.length) fail('This Chart of Accounts account is already linked in Treasury');
  const result=await client.query('INSERT INTO treasury(business_id,name,type,account_number,linked_gl_account,opening_balance,current_balance,status,notes,details) VALUES (?,?,?,?,?,?,?,?,?,?)',[businessId,name,data.type,data.account_number,linked,opening,opening,data.status,data.notes,data.details]);
  if(paymentSetting) await client.query('INSERT INTO accounting_settings(business_id,setting_key,account_id,treasury_id) VALUES (?,?,NULL,?) ON DUPLICATE KEY UPDATE account_id=NULL,treasury_id=VALUES(treasury_id)',[businessId,paymentSetting,result.insertId]);
  if(opening>0){
    await Journal.create({posting_date:new Date().toISOString().slice(0,10),description:`Opening balance: ${name}`,entry_type:'opening_balance',reference:`OPEN-TREASURY-${result.insertId}`,created_by:req.user.id},[{account_id:linked,debit:opening},{account_id:await equity(client,businessId),credit:opening}],client);
    await client.query("INSERT INTO treasury_transactions(treasury_id,transaction_type,amount,reference,description,created_by) VALUES (?,'Deposit',?,?,?,?)",[result.insertId,opening,`OPEN-TREASURY-${result.insertId}`,'Opening balance',req.user.id]);
  }
  res.status(201); return treasury(client,result.insertId,businessId);
},'treasury-create');};
exports.updateTreasury=async(req,res)=>transaction(req,res,async(client,businessId)=>{
  const old=await treasury(client,req.params.id,businessId,true);
  const linked=Number(req.body.linked_gl_account||old.linked_gl_account); await activeAccount(client,linked,businessId);
  if(linked!==Number(old.linked_gl_account)) fail('An existing Treasury account cannot be relinked; create a Treasury account for the other asset instead');
  const data=policy.accountData(req.body,old);
  await client.query('UPDATE treasury SET name=?,type=?,account_number=?,linked_gl_account=?,status=?,notes=?,details=? WHERE id=? AND business_id=?',[data.name,data.type,data.account_number,linked,data.status,data.notes,data.details,old.id,businessId]);
  return treasury(client,old.id,businessId);
});
async function movement(req,res,direction){return transaction(req,res,async(client,businessId)=>{
  const value=amount(req.body.amount), account=await treasury(client,req.params.id,businessId,true);
  if(account.status!=='active')fail('This Treasury account is closed');
  if(direction<0&&Number(account.current_balance)<value) fail('Insufficient funds');
  const linked=await activeAccount(client,account.linked_gl_account,businessId);
  const offset=req.body.offsetAccountId ? await activeAccount(client,req.body.offsetAccountId,businessId) : await equity(client,businessId);
  if(linked===offset) fail('Offset account must differ from treasury account');
  const description=req.body.description|| (direction>0?'Owner contribution':'Owner withdrawal');
  await client.query('UPDATE treasury SET current_balance=current_balance+?,updated_at=NOW() WHERE id=? AND business_id=?',[direction*value,account.id,businessId]);
  await client.query('INSERT INTO treasury_transactions(treasury_id,transaction_type,amount,reference,description,created_by) VALUES (?,?,?,?,?,?)',[account.id,direction>0?'Deposit':'Withdrawal',value,req.body.reference||null,description,req.user.id]);
  await Journal.create({posting_date:new Date().toISOString().slice(0,10),description,reference:req.body.reference||`TREASURY-${crypto.randomUUID()}`,created_by:req.user.id},direction>0?[{account_id:linked,debit:value},{account_id:offset,credit:value}]:[{account_id:offset,debit:value},{account_id:linked,credit:value}],client);
  return treasury(client,account.id,businessId);
},`treasury-${direction>0?'deposit':'withdraw'}-${req.params.id}`);}
exports.deposit=(req,res)=>movement(req,res,1);
exports.withdraw=(req,res)=>movement(req,res,-1);
exports.transfer=async(req,res)=>transaction(req,res,async(client,businessId)=>{
  const value=amount(req.body.amount), from=Number(req.body.fromTreasuryId),to=Number(req.body.toTreasuryId);
  if(!Number.isInteger(from)||!Number.isInteger(to)||from===to) fail('Choose different valid source and destination accounts');
  const locked={}; for(const id of [from,to].sort((a,b)=>a-b)) locked[id]=await treasury(client,id,businessId,true);
  const source=locked[from],destination=locked[to]; if(source.status!=='active'||destination.status!=='active')fail('Choose active Treasury accounts'); if(Number(source.current_balance)<value) fail('Insufficient funds');
  await activeAccount(client,source.linked_gl_account,businessId); await activeAccount(client,destination.linked_gl_account,businessId);
  await client.query('UPDATE treasury SET current_balance=current_balance-? WHERE id=? AND business_id=?',[value,from,businessId]);
  await client.query('UPDATE treasury SET current_balance=current_balance+? WHERE id=? AND business_id=?',[value,to,businessId]);
  for(const [id,type]of[[from,'Withdrawal'],[to,'Deposit']])await client.query('INSERT INTO treasury_transactions(treasury_id,transaction_type,amount,reference,description,created_by) VALUES (?,?,?,?,?,?)',[id,type,value,req.body.reference||null,req.body.description||`Transfer ${source.name} to ${destination.name}`,req.user.id]);
  if(source.linked_gl_account!==destination.linked_gl_account) await Journal.create({posting_date:new Date().toISOString().slice(0,10),description:req.body.description||'Treasury transfer',reference:req.body.reference||`TRANSFER-${crypto.randomUUID()}`,created_by:req.user.id},[{account_id:destination.linked_gl_account,debit:value},{account_id:source.linked_gl_account,credit:value}],client);
  return {message:'Transfer successful'};
},'treasury-transfer');
exports.getTransactions=async(req,res)=>{try{await treasury({query},req.params.id,getBusinessId(req));res.json((await query('SELECT tx.* FROM treasury_transactions tx JOIN treasury t ON t.id=tx.treasury_id WHERE tx.treasury_id=? AND t.business_id=? ORDER BY tx.date DESC,tx.id DESC',[req.params.id,getBusinessId(req)])).rows);}catch(e){res.status(e.status||500).json({error:e.message});}};
