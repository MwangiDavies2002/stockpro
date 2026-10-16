const assert=require('node:assert/strict');
async function scenarios(request,fixtures,key){
 assert.deepEqual(require('../bar-inventory-backend/src/utils/accountTypes.json'),require('../bar-inventory-system/app/lib/accountTypes.json'));
 const registration=await request(null,'/auth/business-registration','POST',{plan:'growth',business:{name:key,currency:'KES',country:'Kenya',state:'Nairobi',city:'Nairobi',zipCode:'00100',landmark:'Test',timezone:'Africa/Nairobi'},settings:{},owner:{firstName:'Owner',username:key,email:key+'@example.invalid',password:'AccountingStrong123!',confirmPassword:'AccountingStrong123!'}});
 assert.equal(registration.status,201,JSON.stringify(registration.body));fixtures.push(registration.body);const token=registration.body.token;
 const call=(url,method='GET',body)=>request(token,url,method,body);
 const create=async body=>{const r=await call('/accounts','POST',body);assert.equal(r.status,201,JSON.stringify(r.body));return r.body;};
 const asset=await create({account_name:'Custom collection asset',account_type:'Assets',account_subtype:'Current assets',detail_type:'Other current assets',opening_balance:100,as_of:'2026-01-02'});
 assert.match(asset.account_code,/^1\d{5}$/);
 const liability=await create({account_name:'Loan',account_type:'Liabilities',account_subtype:'Non-current liabilities',detail_type:'Loans',opening_balance:50,as_of:'2026-01-02'});
 let rows=(await call('/accounts')).body;assert.equal(Number(rows.find(a=>a.id===asset.id).balance),100);assert.equal(Number(rows.find(a=>a.id===liability.id).balance),50);
 const book=(await call(`/accounts/${asset.id}/book`)).body;assert.equal(book.length,1);assert.equal(Number(book[0].balance),100);assert.equal(String(book[0].date).slice(0,10),'2026-01-02');
 const treasury=await call('/treasury','POST',{name:'Branch collections',linked_gl_account:asset.id});assert.equal(treasury.status,201,JSON.stringify(treasury.body));
 assert.equal(Number((await call(`/treasury/${treasury.body.id}`)).body.current_balance),100);
 assert.equal(Number(treasury.body.linked_gl_account),Number(asset.id));
 const renamed=await call(`/accounts/${asset.id}`,'PUT',{...asset,account_name:'User renamed collection asset'});assert.equal(renamed.status,200,JSON.stringify(renamed.body));
 assert.equal(Number((await call(`/treasury/${treasury.body.id}`)).body.linked_gl_account),Number(asset.id));

 assert.ok((await call(`/treasury/${treasury.body.id}/deposit`,'POST',{amount:25})).status<300);
 rows=(await call('/accounts')).body;assert.equal(Number(rows.find(a=>a.id===asset.id).balance),125);
 assert.equal((await call('/accounts','POST',{account_name:'Invalid',account_type:'Assets',account_subtype:'Income'})).status,400);
 assert.equal((await call('/accounts','POST',{account_name:'Duplicate',account_type:'Assets',account_code:asset.account_code})).status,400);
 assert.equal((await call(`/accounts/${asset.id}`,'PUT',{...asset,account_type:'Income',account_subtype:'Income',detail_type:'Sales revenue'})).status,400);
 assert.equal((await call(`/accounts/${asset.id}`,'DELETE')).status,400);
 const parent=await create({account_name:'Group',account_type:'Assets'}),child=await create({account_name:'Child',account_type:'Assets',parent_id:parent.id});
 assert.equal((await call(`/accounts/${parent.id}`,'PUT',{...parent,parent_id:child.id})).status,400);
 assert.equal((await call('/accounts','POST',{account_name:'Bad date',account_type:'Assets',opening_balance:5,as_of:'2026-02-30'})).status,400);
 // Every detail type visible in the supplied references must save, reopen and post.
 const requiredDetails={
  'Cost of sales':['Cost of labour - COS','Equipment rental - COS','Freight and delivery - COS','Other costs of sales - COS','Supplies and materials - COS'],
  Expenses:['Interest paid','Legal and professional fees','Loss on discontinued operations, net of tax','Management compensation','Meals and entertainment','Office/General Administrative Expenses']
 };
 const catalog=require('../bar-inventory-system/app/lib/accountTypes.json');
 for(const [accountType,subtype,details] of Object.entries(catalog).flatMap(([type,subtypes])=>Object.entries(subtypes).map(([subtype,details])=>[type,subtype,details]))){
  for(const detail of details){
   assert.ok(require('../bar-inventory-system/app/lib/accountTypes.json')[accountType][subtype].includes(detail),detail+' missing from dropdown');
   const expense=await create({account_name:detail,account_type:accountType,account_subtype:subtype,detail_type:detail,details:{description:'Reference detail test'}});
   const reopened=await call(`/accounts/${expense.id}`);assert.equal(reopened.status,200);assert.equal(reopened.body.detail_type,detail);assert.equal(reopened.body.account_subtype,subtype);
   const saved=await call(`/accounts/${expense.id}`,'PUT',{...reopened.body,account_name:detail+' test'});assert.equal(saved.status,200,JSON.stringify(saved.body));assert.equal(saved.body.detail_type,detail);
   const expectedNormal=detail!=='Accumulated depreciation'&&(['Assets','Expenses'].includes(accountType)||['Drawings','Partner Distributions','Treasury Shares','Discounts/Refunds Given','Dividend disbursed'].includes(detail))?'Debit':'Credit';
   assert.equal(expense.normal_balance,expectedNormal,detail);
   const credit=expense.normal_balance==='Credit';
   const posting=await call('/journal-entries','SYSTEM',{journalDate:'2026-10-15',description:detail,lines:[{accountId:expense.id,debit:credit?0:10,credit:credit?10:0},{accountId:asset.id,debit:credit?10:0,credit:credit?0:10}]});assert.ok(posting.status<300,JSON.stringify(posting.body));
   const entry=(await call(`/accounts/${expense.id}/book`)).body;assert.equal(entry.length,1);assert.equal(Number(entry[0][credit?'credit':'debit']),10);assert.equal(Number(entry[0].balance),credit?-10:10);
   const listed=(await call('/accounts')).body.find(a=>a.id===expense.id);assert.equal(Number(listed.balance),10);assert.equal(listed.detail_type,detail);
   if(accountType==='Liabilities'){
    const repayment=await call('/journal-entries','SYSTEM',{journalDate:'2026-10-15',description:'Liability reduction test',lines:[{accountId:expense.id,debit:4,credit:0},{accountId:asset.id,debit:0,credit:4}]});assert.ok(repayment.status<300,JSON.stringify(repayment.body));
    const after=(await call('/accounts')).body.find(a=>a.id===expense.id);assert.equal(Number(after.balance),6,detail+' must decrease on debit');
    const bookAfter=(await call(`/accounts/${expense.id}/book`)).body;assert.equal(bookAfter.length,2);assert.equal(Number(bookAfter.at(-1).balance),-6);
   }

  }
 }
 // Verify filters retain prior balances, and invalid journals never post.
 const dated=await create({account_name:'Dated ledger',account_type:'Assets',opening_balance:10,as_of:'2026-01-01'});
 const datedPosting=await call('/journal-entries','SYSTEM',{journalDate:'2026-03-01',description:'Dated movement',lines:[{accountId:liability.id,debit:3},{accountId:dated.id,credit:3}]});assert.ok(datedPosting.status<300,JSON.stringify(datedPosting.body));
 const filtered=await call(`/accounts/${dated.id}/book?startDate=2026-03-01&endDate=2026-03-01&transactionType=Credit`);assert.equal(filtered.status,200,JSON.stringify(filtered.body));assert.equal(filtered.body.length,1);assert.equal(Number(filtered.body[0].balance),7);
 assert.equal((await call(`/accounts/${dated.id}/book?transactionType=Debit`)).body.length,1);
 assert.equal((await call(`/accounts/${dated.id}/book?startDate=invalid`)).status,400);
 assert.equal((await call('/journal-entries','POST',{journalDate:'2026-03-01',lines:[{accountId:dated.id,debit:9},{accountId:liability.id,credit:8}]})).status,400);
 const inactive=await create({account_name:'Inactive test',account_type:'Assets',active:false});
 assert.equal((await call('/journal-entries','POST',{journalDate:'2026-03-01',lines:[{accountId:inactive.id,debit:1},{accountId:liability.id,credit:1}]})).status,400);
 assert.equal((await call('/accounting-settings/payment_cash','PUT',{account_id:inactive.id})).status,400);
 const cashGL=await create({account_name:'Cash integration',account_type:'Assets',opening_balance:200,as_of:'2026-01-01'});
 const bankGL=await create({account_name:'Bank integration',account_type:'Assets'});
 const mobileGL=await create({account_name:'Mobile integration',account_type:'Assets'});
 const makeTreasury=async(name,gl,payment_setting)=>{const r=await call('/treasury','POST',{name,linked_gl_account:gl.id,payment_setting});assert.equal(r.status,201,JSON.stringify(r.body));return r.body;};
 const cash=await makeTreasury('Cash integration',cashGL,'payment_cash'),bank=await makeTreasury('Bank integration',bankGL,'payment_bank'),mobile=await makeTreasury('Mobile integration',mobileGL,'payment_mobile');
 const receiptMappings=(await call('/accounting-settings')).body;
 for(const [key,account] of [['payment_cash',cash],['payment_bank',bank],['payment_mobile',mobile]])assert.equal(Number(receiptMappings.find(s=>s.setting_key===key).treasury_id),account.id);
 const withdrawal=await call(`/treasury/${cash.id}/withdraw`,'POST',{amount:30});assert.ok(withdrawal.status<300);assert.equal(Number(withdrawal.body.current_balance),170);
 const transfer=await call('/treasury/transfer','POST',{fromTreasuryId:cash.id,toTreasuryId:bank.id,amount:50});assert.ok(transfer.status<300,JSON.stringify(transfer.body));
 assert.equal(Number((await call(`/treasury/${cash.id}`)).body.current_balance),120);assert.equal(Number((await call(`/treasury/${bank.id}`)).body.current_balance),50);
 assert.equal((await call(`/treasury/${cash.id}/withdraw`,'POST',{amount:999})).status,400);
 const revenue=await create({account_name:'Revenue integration',account_type:'Income'});
 for(const [setting,data] of [['sales_revenue',{account_id:revenue.id}]])assert.ok((await call('/accounting-settings/'+setting,'PUT',data)).status<300);
 const product=await call('/inventory','POST',{name:'Mapped payment test',locationId:registration.body.locationId,stock:5,cost:0,price:25,threshold:0});assert.equal(product.status,201,JSON.stringify(product.body));
 for(const paymentMethod of ['cash','mpesa','bank']){const sale=await call('/sales','POST',{locationId:registration.body.locationId,paymentMethod,items:[{itemId:product.body.id,quantity:1,unitPrice:25}]});assert.equal(sale.status,201,JSON.stringify(sale.body));}
 for(const [treasury,expected] of [[cash,145],[bank,75],[mobile,25]])assert.equal(Number((await call(`/treasury/${treasury.id}`)).body.current_balance),expected);
 assert.ok((await call('/accounting-settings/payment_mobile','PUT',{account_id:mobileGL.id})).status<300);
 const direct=await call('/sales','POST',{locationId:registration.body.locationId,paymentMethod:'mpesa',items:[{itemId:product.body.id,quantity:1,unitPrice:25}]});assert.equal(direct.status,201,JSON.stringify(direct.body));
 assert.equal(Number((await call(`/treasury/${mobile.id}`)).body.current_balance),50);
 assert.ok((await call(`/treasury/${bank.id}`,'PUT',{...bank,status:'closed'})).status<300);
 assert.equal((await call(`/treasury/${bank.id}/deposit`,'POST',{amount:1})).status,400);
 const rejected=await call('/sales','POST',{locationId:registration.body.locationId,paymentMethod:'bank',items:[{itemId:product.body.id,quantity:1,unitPrice:25}]});assert.equal(rejected.status,400,JSON.stringify(rejected.body));
 assert.equal(Number((await call(`/inventory/${product.body.id}`)).body.stock),1);
 // Manual openings use configured identities and the explicitly requested credit-inventory direction.
 const inventory=await create({account_name:'User chosen stock asset',account_type:'Assets'});
 const openingEquity=await create({account_name:'User chosen opening equity',account_type:'Equity'});
 for(const [setting,account] of [['inventory_asset',inventory],['opening_balance_equity',openingEquity]])assert.ok((await call('/accounting-settings/'+setting,'PUT',{account_id:account.id})).status<300);
 const ensured=await call('/accounts/opening-balance-equity','POST');assert.ok(ensured.status<300,JSON.stringify(ensured.body));assert.equal(ensured.body.id,openingEquity.id);
 assert.ok((await call('/accounting-settings/opening_balance_equity','PUT',{})).status<300);
 assert.ok((await call('/accounts/opening-balance-equity','POST')).status<300);
 assert.ok((await call('/accounting-settings/opening_balance_equity','PUT',{account_id:openingEquity.id})).status<300);
 const initialEquity=(await call('/accounts')).body.find(a=>a.id===openingEquity.id);assert.equal(Number(initialEquity.credit_total),0);
 const mappedOpeningAsset=await create({account_name:'Mapped offset asset',account_type:'Assets',opening_balance:5,as_of:'2026-01-02'});
 const mappedOpeningTreasury=await call('/treasury','POST',{name:'Mapped offset Treasury',linked_gl_account:mappedOpeningAsset.id,opening_balance:2});assert.equal(mappedOpeningTreasury.status,201,JSON.stringify(mappedOpeningTreasury.body));
 assert.equal(Number((await call('/accounts')).body.find(a=>a.id===openingEquity.id).credit_total),7);
 const openingData={entryType:'opening_balance',journalDate:'2026-01-02',referenceNo:'OPEN-TEST',notes:'Opening note',requestId:key+'-opening',lines:[{accountId:inventory.id,credit:40},{accountId:openingEquity.id,debit:40}]};
 assert.equal((await call('/journal-entries','POST',{...openingData,entryType:undefined})).status,400);
 assert.equal((await call('/journal-entries','POST',{...openingData,lines:[{accountId:inventory.id,debit:40},{accountId:openingEquity.id,credit:40}]})).status,400);
 assert.equal((await call('/journal-entries','POST',{...openingData,journalDate:'2026-02-30'})).status,400);
 const opening=await call('/journal-entries','POST',openingData);assert.equal(opening.status,201,JSON.stringify(opening.body));
 const retry=await call('/journal-entries','POST',openingData);assert.equal(retry.status,201,JSON.stringify(retry.body));assert.equal(retry.body.id,opening.body.id);assert.equal(retry.body.replayed,true);
 const detail=await call('/journal-entries/'+opening.body.id);assert.equal(detail.body.entry_type,'opening_balance');assert.equal(detail.body.notes,'Opening note');assert.equal(detail.body.lines.length,2);assert.ok(detail.body.lines.every(l=>l.account_name&&l.account_code));
 const balances=(await call('/accounts')).body;assert.equal(Number(balances.find(a=>a.id===inventory.id).balance),-40);assert.equal(Number(balances.find(a=>a.id===openingEquity.id).debit_total),40);
 // Financial retries must post only once, with persistent account metadata.
 const retryGL=await create({account_name:'Retry safe cash',account_type:'Assets',opening_balance:100,as_of:'2026-01-02'});
 const retryTargetGL=await create({account_name:'Retry target',account_type:'Assets'});
 const treasuryBody={name:'Retry Treasury',account_number:'TEST-123',linked_gl_account:retryGL.id,notes:'Saved note',details:[{label:'Branch',value:'Nairobi'}],requestId:key+'-create'};
 const creations=await Promise.all(Array.from({length:4},()=>call('/treasury','POST',treasuryBody)));for(const r of creations)assert.equal(r.status,201,JSON.stringify(r.body));
 const retryTreasury=creations[0].body;assert.ok(creations.every(r=>r.body.id===retryTreasury.id));
 const detailsOf=row=>typeof row.details==='string'?JSON.parse(row.details):row.details;
 assert.deepEqual(detailsOf((await call('/treasury/'+retryTreasury.id)).body),treasuryBody.details);
 const edited=await call('/treasury/'+retryTreasury.id,'PUT',{notes:'Changed note',details:[{label:'Branch',value:'Kisumu'}]});assert.equal(edited.status,200,JSON.stringify(edited.body));assert.equal(edited.body.notes,'Changed note');assert.equal(edited.body.account_number,'TEST-123');assert.deepEqual(detailsOf(edited.body),[{label:'Branch',value:'Kisumu'}]);
 const target=await makeTreasury('Retry target Treasury',retryTargetGL);
 for(const action of ['deposit','withdraw']){const amount=action==='deposit'?30:20;const replies=await Promise.all(Array.from({length:4},()=>call(`/treasury/${retryTreasury.id}/${action}`,'POST',{amount,reference:'REF-'+action,requestId:key+'-'+action})));assert.ok(replies.every(r=>r.status===201||r.status===200),JSON.stringify(replies));assert.ok(replies.some(r=>r.body.replayed));}
 const retryBook=(await call('/accounts/'+retryGL.id+'/book')).body;assert.ok(retryBook.some(r=>r.reference==='REF-deposit'));assert.ok(retryBook.some(r=>r.reference==='REF-withdraw'));assert.ok(retryBook.every(r=>r.added_by));
 const transfers=await Promise.all(Array.from({length:4},()=>call('/treasury/transfer','POST',{fromTreasuryId:retryTreasury.id,toTreasuryId:target.id,amount:10,requestId:key+'-transfer'})));assert.ok(transfers.every(r=>r.status<300),JSON.stringify(transfers));
 assert.equal(Number((await call('/treasury/'+retryTreasury.id)).body.current_balance),100);assert.equal(Number((await call('/treasury/'+target.id)).body.current_balance),10);
 assert.equal((await call('/treasury/'+retryTreasury.id+'/transactions')).body.length,3);assert.equal((await call('/treasury/'+target.id+'/transactions')).body.length,1);
 const withdrawals=await Promise.all(['A','B'].map(suffix=>call(`/treasury/${retryTreasury.id}/withdraw`,'POST',{amount:60,requestId:key+'-race-'+suffix})));assert.equal(withdrawals.filter(r=>r.status<300).length,1,JSON.stringify(withdrawals));assert.equal(withdrawals.filter(r=>r.status===400).length,1);assert.equal(Number((await call('/treasury/'+retryTreasury.id)).body.current_balance),40);
 for(const amount of [0.001,-1,1.234])assert.equal((await call(`/treasury/${retryTreasury.id}/deposit`,'POST',{amount})).status,400);
 assert.equal((await call('/treasury/'+retryTreasury.id,'PUT',{details:Array(7).fill({label:'Too many',value:'x'})})).status,400);
 assert.ok((await call('/treasury/'+retryTreasury.id,'PUT',{status:'closed'})).status<300);assert.equal((await call(`/treasury/${retryTreasury.id}/deposit`,'POST',{amount:1})).status,400);assert.ok((await call('/treasury/'+retryTreasury.id,'PUT',{status:'active'})).status<300);
 assert.deepEqual(detailsOf((await call('/treasury/'+retryTreasury.id)).body),[{label:'Branch',value:'Kisumu'}]);
 const journals=(await call('/journal-entries')).body;assert.equal(journals.filter(j=>j.id===opening.body.id).length,1);assert.ok(journals.some(j=>j.entry_type==='system'));assert.ok(journals.some(j=>j.added_by));
 assert.ok((await call('/journal-entries/'+opening.body.id,'PUT',openingData)).status>=400);
 assert.equal(Number((await call('/inventory/'+product.body.id)).body.stock),1);
 const ledger=await call('/reports/ledger');assert.equal(ledger.status,200,JSON.stringify(ledger.body));assert.ok(ledger.body.length>0);
 assert.deepEqual(journals.map(j=>j.id).sort((a,b)=>a-b),ledger.body.map(j=>j.id).sort((a,b)=>a-b),'Journal list must include every posted ledger transaction');
 for(const journal of ledger.body){const lines=typeof journal.lines==='string'?JSON.parse(journal.lines):journal.lines;assert.ok(lines.length>=2);const debit=lines.reduce((sum,l)=>sum+Math.round(Number(l.debit||0)*100),0),credit=lines.reduce((sum,l)=>sum+Math.round(Number(l.credit||0)*100),0);assert.equal(debit,credit,'Journal '+journal.id+' must balance');}
 assert.equal((await call('/accounts','POST',{account_name:'Wrong subtype detail',account_type:'Expenses',account_subtype:'Cost of sales',detail_type:'Interest paid'})).status,400);
 const simultaneous=await Promise.all(['Concurrent A','Concurrent B'].map(account_name=>create({account_name,account_type:'Expenses'})));assert.notEqual(simultaneous[0].account_code,simultaneous[1].account_code);
 assert.ok((await call(`/accounts/${child.id}`,'DELETE')).status<300);
}
module.exports={scenarios};
