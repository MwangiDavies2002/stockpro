const crypto = require('node:crypto');
const { query, getClient } = require('../config/db');
const Journal = require('../models/Journal');
const { getBusinessId } = require('../utils/tenant');
const fail = (message,status=400) => { throw Object.assign(new Error(message),{status}); };
const amount = value => { const number=Number(value); if (!Number.isFinite(number)||number<=0||number>999999999999.99) fail('Amount must be a positive finite number'); return Math.round(number*100)/100; };
async function treasury(client,id,businessId,lock=false) {
  const {rows}=await client.query(`SELECT * FROM treasury WHERE id=? AND business_id=?${lock?' FOR UPDATE':''}`,[id,businessId]);
  if (!rows.length) fail('Treasury not found',404);
  return rows[0];
}
async function equity(client,businessId) {
  const {rows}=await client.query("SELECT id FROM chart_of_accounts WHERE business_id=? AND account_code='3000'",[businessId]);
  if (rows.length) return rows[0].id;
  return (await client.query("INSERT INTO chart_of_accounts(business_id,account_code,account_name,account_type,normal_balance,active) VALUES (?,'3000','Opening Balance Equity','Equity','Credit',TRUE)",[businessId])).insertId;
}
async function activeAccount(client,id,businessId) {
  const {rows}=await client.query('SELECT id FROM chart_of_accounts WHERE id=? AND business_id=? AND active=TRUE',[id,businessId]);
  if (!rows.length) fail('GL account must be active and belong to your shop');
  return Number(id);
}
async function transaction(req,res,fn) {
  const client=await getClient();
  try { await client.query('BEGIN'); const data=await fn(client,getBusinessId(req)); await client.query('COMMIT'); res.json(data); }
  catch(error) { await client.query('ROLLBACK'); res.status(error.status||500).json({error:error.message}); }
  finally {client.release();}
}
exports.getTreasuries=async(req,res,next)=>{try{res.json((await query('SELECT * FROM treasury WHERE business_id=? ORDER BY name',[getBusinessId(req)])).rows);}catch(e){next(e);}};
exports.getTreasury=async(req,res)=>{try{res.json(await treasury({query},req.params.id,getBusinessId(req)));}catch(e){res.status(e.status||500).json({error:e.message});}};
exports.createTreasury=async(req,res)=>transaction(req,res,async(client,businessId)=>{
  const name=String(req.body.name||'').trim(); if(!name) fail('Treasury name is required');
  const opening=Number(req.body.opening_balance??0); if(!Number.isFinite(opening)||opening<0) fail('Opening balance must be non-negative');
  let linked=Number(req.body.linked_gl_account)||null;
  if(linked) await activeAccount(client,linked,businessId);
  else {
    const {rows:[row]}=await client.query("SELECT COALESCE(MAX(CAST(account_code AS UNSIGNED)),1000)+1 code FROM chart_of_accounts WHERE business_id=? AND account_type='Assets'",[businessId]);
    linked=(await client.query("INSERT INTO chart_of_accounts(business_id,account_code,account_name,account_type,normal_balance,active) VALUES (?,?,?,'Assets','Debit',TRUE)",[businessId,String(row.code),`${name} (Treasury)`])).insertId;
  }
  const result=await client.query('INSERT INTO treasury(business_id,name,type,account_number,linked_gl_account,opening_balance,current_balance,status,notes) VALUES (?,?,?,?,?,?,?,?,?)',[businessId,name,req.body.type||'Cash',req.body.account_number||null,linked,opening,opening,req.body.status||'active',req.body.notes||null]);
  if(opening>0){
    await Journal.create({posting_date:new Date().toISOString().slice(0,10),description:`Opening balance: ${name}`,reference:`OPEN-TREASURY-${result.insertId}`,created_by:req.user.id},[{account_id:linked,debit:opening},{account_id:await equity(client,businessId),credit:opening}],client);
    await client.query("INSERT INTO treasury_transactions(treasury_id,transaction_type,amount,reference,description) VALUES (?,'Deposit',?,?,?)",[result.insertId,opening,`OPEN-TREASURY-${result.insertId}`,'Opening balance']);
  }
  res.status(201); return treasury(client,result.insertId,businessId);
});
exports.updateTreasury=async(req,res)=>transaction(req,res,async(client,businessId)=>{
  const old=await treasury(client,req.params.id,businessId,true);
  const linked=req.body.linked_gl_account||old.linked_gl_account; await activeAccount(client,linked,businessId);
  await client.query('UPDATE treasury SET name=?,type=?,account_number=?,linked_gl_account=?,status=?,notes=? WHERE id=? AND business_id=?',[req.body.name||old.name,req.body.type||old.type,req.body.account_number??old.account_number,linked,req.body.status||old.status,req.body.notes??old.notes,old.id,businessId]);
  return treasury(client,old.id,businessId);
});
async function movement(req,res,direction){return transaction(req,res,async(client,businessId)=>{
  const value=amount(req.body.amount), account=await treasury(client,req.params.id,businessId,true);
  if(direction<0&&Number(account.current_balance)<value) fail('Insufficient funds');
  const linked=await activeAccount(client,account.linked_gl_account,businessId);
  const offset=req.body.offsetAccountId ? await activeAccount(client,req.body.offsetAccountId,businessId) : await equity(client,businessId);
  if(linked===offset) fail('Offset account must differ from treasury account');
  const description=req.body.description|| (direction>0?'Owner contribution':'Owner withdrawal');
  await client.query('UPDATE treasury SET current_balance=current_balance+?,updated_at=NOW() WHERE id=? AND business_id=?',[direction*value,account.id,businessId]);
  await client.query('INSERT INTO treasury_transactions(treasury_id,transaction_type,amount,reference,description) VALUES (?,?,?,?,?)',[account.id,direction>0?'Deposit':'Withdrawal',value,req.body.reference||null,description]);
  await Journal.create({posting_date:new Date().toISOString().slice(0,10),description,reference:`TREASURY-${crypto.randomUUID()}`,created_by:req.user.id},direction>0?[{account_id:linked,debit:value},{account_id:offset,credit:value}]:[{account_id:offset,debit:value},{account_id:linked,credit:value}],client);
  return treasury(client,account.id,businessId);
});}
exports.deposit=(req,res)=>movement(req,res,1);
exports.withdraw=(req,res)=>movement(req,res,-1);
exports.transfer=async(req,res)=>transaction(req,res,async(client,businessId)=>{
  const value=amount(req.body.amount), from=Number(req.body.fromTreasuryId),to=Number(req.body.toTreasuryId);
  if(!Number.isInteger(from)||!Number.isInteger(to)||from===to) fail('Choose different valid source and destination accounts');
  const locked={}; for(const id of [from,to].sort((a,b)=>a-b)) locked[id]=await treasury(client,id,businessId,true);
  const source=locked[from],destination=locked[to]; if(Number(source.current_balance)<value) fail('Insufficient funds');
  await activeAccount(client,source.linked_gl_account,businessId); await activeAccount(client,destination.linked_gl_account,businessId);
  await client.query('UPDATE treasury SET current_balance=current_balance-? WHERE id=? AND business_id=?',[value,from,businessId]);
  await client.query('UPDATE treasury SET current_balance=current_balance+? WHERE id=? AND business_id=?',[value,to,businessId]);
  for(const [id,type]of[[from,'Withdrawal'],[to,'Deposit']])await client.query('INSERT INTO treasury_transactions(treasury_id,transaction_type,amount,reference,description) VALUES (?,?,?,?,?)',[id,type,value,req.body.reference||null,req.body.description||`Transfer ${source.name} to ${destination.name}`]);
  if(source.linked_gl_account!==destination.linked_gl_account) await Journal.create({posting_date:new Date().toISOString().slice(0,10),description:req.body.description||'Treasury transfer',reference:`TRANSFER-${crypto.randomUUID()}`,created_by:req.user.id},[{account_id:destination.linked_gl_account,debit:value},{account_id:source.linked_gl_account,credit:value}],client);
  return {message:'Transfer successful'};
});
exports.getTransactions=async(req,res)=>{try{await treasury({query},req.params.id,getBusinessId(req));res.json((await query('SELECT tx.* FROM treasury_transactions tx JOIN treasury t ON t.id=tx.treasury_id WHERE tx.treasury_id=? AND t.business_id=? ORDER BY tx.date DESC,tx.id DESC',[req.params.id,getBusinessId(req)])).rows);}catch(e){res.status(e.status||500).json({error:e.message});}};
