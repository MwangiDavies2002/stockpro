const { query } = require('../config/db');
const { currentBusinessId } = require('./tenant');

const purchaseMappings = [
  {
    key: 'inventory_asset',
    code: '1200',
    name: 'Inventory Asset',
    type: 'Assets',
    subtype: 'Current Assets',
    detail: 'Inventory',
    normal: 'Debit',
  },
  {
    key: 'purchases_payable',
    code: '2000',
    name: 'Accounts Payable',
    type: 'Liabilities',
    subtype: 'Current Liabilities',
    detail: 'Accounts Payable',
    normal: 'Credit',
  },
  {
    key: 'purchases_expense',
    code: '5100',
    name: 'Purchase Expense',
    type: 'Expenses',
    subtype: 'Operating Expenses',
    detail: 'Purchases',
    normal: 'Debit',
  },
];

async function ensureAccount(client, account) {
  const q = client ? client.query.bind(client) : query;
  const { rows: existing } = await q(
    'SELECT id FROM chart_of_accounts WHERE business_id=? AND (account_code = ? OR account_name = ?) ORDER BY id LIMIT 1',
    [currentBusinessId(), account.code, account.name]
  );
  if (existing.length) return existing[0].id;

  const result = await q(
    `INSERT INTO chart_of_accounts
     (business_id,account_code, account_name, account_type, account_subtype, detail_type, normal_balance, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
    [currentBusinessId(), account.code, account.name, account.type, account.subtype||null, account.detail||null, account.normal]
  );
  return result.insertId;
}

async function ensureMappings(definitions,client=null){
 const q=client?client.query.bind(client):query,ids={};
 for(const mapping of definitions){
  const {rows}=await q('SELECT a.id,a.active,a.account_type FROM accounting_settings s JOIN chart_of_accounts a ON a.id=s.account_id AND a.business_id=s.business_id WHERE s.business_id=? AND s.setting_key=?',[currentBusinessId(),mapping.key]);
  if(rows.length){if(rows[0].account_type!==mapping.type)throw Object.assign(new Error('Choose a '+mapping.type+' account for '+mapping.key),{status:400});if(!rows[0].active)throw Object.assign(new Error('Choose an active account for '+mapping.key),{status:400});ids[mapping.key]=rows[0].id;continue;}
  const id=await ensureAccount(client,mapping);const account=(await q('SELECT active,account_type FROM chart_of_accounts WHERE id=? AND business_id=?',[id,currentBusinessId()])).rows[0];if(!account?.active||account.account_type!==mapping.type)throw Object.assign(new Error('Choose an active '+mapping.type+' account for '+mapping.key),{status:400});await q('INSERT INTO accounting_settings(business_id,setting_key,account_id,treasury_id) VALUES (?,?,?,NULL) ON DUPLICATE KEY UPDATE account_id=VALUES(account_id),treasury_id=NULL',[currentBusinessId(),mapping.key,id]);ids[mapping.key]=id;
 }
 return ids;
}
async function ensurePurchaseAccountingMappings(client=null){return ensureMappings(purchaseMappings,client);}
async function ensureSalesAccountingMappings(client=null,tax=false){
 const definitions=[{key:'sales_receivable',code:'1100',name:'Accounts Receivable',type:'Assets',normal:'Debit'},{key:'sales_revenue',code:'4000',name:'Sales Revenue',type:'Income',normal:'Credit'},{key:'inventory_cogs',code:'5000',name:'Cost of Sales',type:'Expenses',normal:'Debit'},purchaseMappings[0]];
 if(tax)definitions.push({key:'sales_vat_output',code:'2200',name:'VAT Output',type:'Liabilities',normal:'Credit'});
 // Receipt mappings may point to a Treasury account; preserve those assignments.
 const settings=(await (client?client.query.bind(client):query)("SELECT account_id,treasury_id FROM accounting_settings WHERE business_id=? AND setting_key='payment_cash'",[currentBusinessId()])).rows;
 if(!settings[0]?.account_id&&!settings[0]?.treasury_id)definitions.push({key:'payment_cash',code:'1000',name:'Cash',type:'Assets',normal:'Debit'});
 return ensureMappings(definitions,client);
}

// Opening offsets follow the selected identity, even when the user renames it.
async function openingEquity(client,businessId) {
  const settings=(await client.query("SELECT account_id FROM accounting_settings WHERE business_id=? AND setting_key='opening_balance_equity'",[businessId])).rows;
  const mapped=Number(settings[0]?.account_id);
  let account;
  if(mapped) account=(await client.query('SELECT * FROM chart_of_accounts WHERE id=? AND business_id=?',[mapped,businessId])).rows[0];
  else account=(await client.query("SELECT * FROM chart_of_accounts WHERE business_id=? AND account_code='3000'",[businessId])).rows[0];
  if(account&&(!account.active||account.account_type!=='Equity'))throw Object.assign(new Error('Choose an active Opening Balance Equity account in Posting settings'),{status:400});
  if(mapped&&!account)throw Object.assign(new Error('Opening Balance Equity mapping is unavailable'),{status:400});
  if(!account){
    const result=await client.query("INSERT INTO chart_of_accounts(business_id,account_code,account_name,account_type,account_subtype,detail_type,normal_balance,active) VALUES (?,'3000','Opening Balance Equity','Equity',?,?, 'Credit',TRUE)",[businessId,"Owner's Equity",'Opening Balance Equity']);
    account=(await client.query('SELECT * FROM chart_of_accounts WHERE id=? AND business_id=?',[result.insertId,businessId])).rows[0];
  }
  if(!mapped)await client.query("INSERT INTO accounting_settings(business_id,setting_key,account_id,treasury_id) VALUES (?,'opening_balance_equity',?,NULL) ON DUPLICATE KEY UPDATE account_id=VALUES(account_id),treasury_id=NULL",[businessId,account.id]);
  return account;
}
module.exports = { ensurePurchaseAccountingMappings, ensureSalesAccountingMappings, ensureMappings, openingEquity };
