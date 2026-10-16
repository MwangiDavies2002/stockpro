const {validateJournal}=require('./journalValidation');
function openingJournal(data,accounts,settings){
 const fail=message=>{throw Object.assign(new Error(message),{status:400});};
 if(data.entryType!=='opening_balance')fail('Only opening balances can be added manually. Other journals are created by their transactions.');
 require('./accountPolicy').opening({opening_balance:1,as_of:data.journalDate});
 validateJournal(data.lines);
 const mapped=key=>Number(settings.find(s=>s.setting_key===key)?.account_id);
 const inventoryId=mapped('inventory_asset'),equityId=mapped('opening_balance_equity');
 const inventory=accounts.find(a=>a.id===inventoryId),equity=accounts.find(a=>a.id===equityId);
 if(!inventory?.active||inventory.account_type!=='Assets'||!equity?.active||equity.account_type!=='Equity')fail('Map an active Inventory Asset account and Opening Balance Equity account in Posting settings first');
 const lines=data.lines.map(l=>({...l,account_id:Number(l.accountId??l.account_id)}));
 if(lines.length!==2||!lines.some(l=>l.account_id===inventoryId)||!lines.some(l=>l.account_id===equityId))fail('An inventory opening balance must use the mapped Inventory Asset and Opening Balance Equity accounts only');
 const stock=lines.find(l=>l.account_id===inventoryId),opening=lines.find(l=>l.account_id===equityId);
 if(Number(stock.debit||0)!==0||Number(stock.credit||0)<=0||Number(opening.credit||0)!==0||Number(opening.debit||0)<=0)fail('Use Credit Inventory and Debit Opening Balance for this opening entry');
 return lines;
}
module.exports={openingJournal};
