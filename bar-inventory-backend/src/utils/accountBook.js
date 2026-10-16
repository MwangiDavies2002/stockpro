function buildBook(rows,{startDate,endDate,transactionType='All'}={}) {
 const fail=message=>{throw Object.assign(new Error(message),{status:400});};
 for(const date of [startDate,endDate])if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))fail('Enter a valid account-book date');
 if(startDate&&endDate&&startDate>endDate)fail('Start date must not follow end date');
 if(!['All','Debit','Credit'].includes(transactionType))fail('Choose All, Debit or Credit');
 let cents=0;
 return rows.map(row=>{cents+=Math.round(Number(row.debit||0)*100)-Math.round(Number(row.credit||0)*100);return{...row,balance:cents/100};}).filter(row=>{
  const date=row.date instanceof Date?row.date.toISOString().slice(0,10):String(row.date).slice(0,10);
  return(!startDate||date>=startDate)&&(!endDate||date<=endDate)&&(transactionType==='All'||Number(row[transactionType.toLowerCase()])>0);
 });
}
module.exports={buildBook};
