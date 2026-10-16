const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {openDatabase,apiRequest}=require('../electron/db');
test('Treasury links the existing MPESA ledger and shares its balance',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stockpro-treasury-'));const db=openDatabase(dir);
 try {
 const send=(token,url,method='get',data)=>apiRequest(db,{authorization:token?`Bearer ${token}`:undefined,url,method,data});
 const registration=send(null,'/auth/business-registration','post',{plan:'growth',business:{name:'Treasury test'},settings:{},owner:{firstName:'Owner',email:'treasury@test.invalid',password:'TreasuryStrong123!',confirmPassword:'TreasuryStrong123!'}});
 const token=registration.token;
 const gl=send(token,'/accounts','post',{account_code:'1099',account_name:'MPESA',account_type:'Assets',account_subtype:'Cash and cash equivalents',normal_balance:'Debit',active:true});
 const account=send(token,'/treasury','post',{name:'MPESA',linked_gl_account:gl.id,opening_balance:100});
 assert.equal(Number(account.linked_gl_account),Number(gl.id));
 assert.throws(()=>send(token,'/treasury','post',{name:'Duplicate',linked_gl_account:gl.id}),/already linked/);
 assert.throws(()=>send(token,'/treasury','post',{name:'Unlinked'}),/existing Chart/);
 send(token,`/treasury/${account.id}/deposit`,'post',{amount:25});
 assert.equal(Number(send(token,`/treasury/${account.id}`).current_balance),125);
 const ledger=db.prepare('SELECT SUM(debit-credit) balance FROM journal_entry_lines WHERE account_id=?').get(gl.id);
 assert.equal(Number(ledger.balance),125);
 assert.equal(send(token,'/accounts').filter(a=>a.account_name==='MPESA').length,1);
 } finally { db.close(); if(path.dirname(path.resolve(dir))===path.resolve(os.tmpdir())&&path.basename(dir).startsWith('stockpro-treasury-'))fs.rmSync(dir,{recursive:true,force:true}); }
});
