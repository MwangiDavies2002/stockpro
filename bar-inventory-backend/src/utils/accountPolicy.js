const types=require('./accountTypes.json');
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
function normalize(body,accounts,old=null){
 const data={...old,...body};
 data.account_name=String(data.account_name||'').trim();
 if(!data.account_name||data.account_name.length>150)fail('Enter an account name up to 150 characters');
 if(!Object.hasOwn(types,data.account_type))fail('Choose a valid account type');
 data.account_subtype=String(data.account_subtype||'').trim();data.detail_type=String(data.detail_type||'').trim();
 if(data.account_subtype&&!Object.hasOwn(types[data.account_type],data.account_subtype))fail('Choose a subtype for the selected account type');
 if(data.detail_type){const match=(types[data.account_type][data.account_subtype]||[]).find(t=>t.toLowerCase()===data.detail_type.toLowerCase());if(!match)fail('Choose a detail type for the selected subtype');data.detail_type=match;}
 data.normal_balance=data.normal_balance||(data.detail_type!=='Accumulated depreciation'&&(['Assets','Expenses'].includes(data.account_type)||['Drawings','Partner Distributions','Treasury Shares','Discounts/Refunds Given','Dividend disbursed'].includes(data.detail_type))?'Debit':'Credit');
 if(!['Debit','Credit'].includes(data.normal_balance))fail('Normal balance must be Debit or Credit');
 data.account_code=String(data.account_code||old?.account_code||'').trim();
 if(!data.account_code){let code={Assets:100000,Liabilities:200000,Equity:300000,Income:400000,Expenses:500000}[data.account_type];const used=new Set(accounts.map(a=>String(a.account_code)));while(used.has(String(code)))code++;data.account_code=String(code);}

 if(data.account_code.length>20)fail('GL code must be at most 20 characters');
 if(accounts.some(a=>a.id!==old?.id&&String(a.account_code).toLowerCase()===String(data.account_code).toLowerCase()))fail('This GL code already exists');
 if(old&&data.account_type!==old.account_type&&accounts.some(a=>Number(a.parent_id)===Number(old.id)))fail('Reassign child accounts before changing this account type');
 data.parent_id=Number(data.parent_id)||null;
 let parent=data.parent_id;const seen=new Set(old?[Number(old.id)]:[]);
 while(parent){if(seen.has(parent))fail('Parent account would create a cycle');seen.add(parent);const row=accounts.find(a=>Number(a.id)===parent);if(!row||row.account_type!==data.account_type)fail('Parent must belong to the same shop and account type');parent=Number(row.parent_id)||null;}
 data.active=data.active===undefined?true:!!data.active;
 if(Number(body.opening_balance)&&(!data.active||data.account_code==='3000'))fail('Opening balance requires an active account other than Opening Balance Equity');
 return data;
}
function opening(body){const value=Number(body.opening_balance||0);if(!Number.isFinite(value)||Math.abs(value)>99999999.99)fail('Enter a valid opening balance');if(value&&(!/^\d{4}-\d{2}-\d{2}$/.test(body.as_of||'')||Number.isNaN(Date.parse(body.as_of))||new Date(body.as_of).toISOString().slice(0,10)!==body.as_of))fail('Choose a valid opening balance date');return Math.round(value*100)/100;}
module.exports={normalize,opening,types};
