const fail=message=>{throw Object.assign(new Error(message),{status:400});};
function amount(value,positive=true){
 const n=Number(value),rounded=Math.round(n*100)/100;
 if(!Number.isFinite(n)||n<0||(positive&&rounded<=0)||n>999999999999.99||Math.abs(n-rounded)>0.0000001)fail('Amount must be '+(positive?'positive':'non-negative')+' with at most two decimal places');
 return rounded;
}
function text(value,max,label){if(value==null)return '';if(typeof value!=='string')fail(label+' must be text');const s=value.trim();if(s.length>max)fail(label+' is too long');return s;}
function accountData(body,old={}){
 const name=text(body.name??old.name,100,'Account name');if(!name)fail('Treasury name is required');
 const status=body.status??old.status??'active';if(!['active','inactive','closed'].includes(status))fail('Invalid Treasury status');
 let details=body.details??old.details??[];if(typeof details==='string'){try{details=JSON.parse(details);}catch{fail('Account details must be valid JSON');}}
 if(!Array.isArray(details)||details.length>6)fail('Use up to six account detail rows');
 details=details.map(d=>{if(!d||typeof d!=='object')fail('Invalid account detail');return{label:text(d.label,120,'Detail label'),value:text(d.value,500,'Detail value')};}).filter(d=>d.label||d.value);
 return{name,type:text(body.type??old.type??'Cash',50,'Account type')||'Cash',account_number:text(body.account_number??old.account_number,50,'Account number')||null,notes:text(body.notes??old.notes,4000,'Notes')||null,status,details:JSON.stringify(details)};
}
function requestKey(key){if(key!==undefined&&key!==null&&(typeof key!=='string'||!key.length||key.length>100))fail('Invalid request identifier');}
module.exports={amount,accountData,requestKey};
