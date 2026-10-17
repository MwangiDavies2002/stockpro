const Setting = require('../models/Setting');
const { query } = require('../config/db');
const { getBusinessId } = require('../utils/tenant');
const ACCOUNT_TYPES={opening_balance_equity:'Equity',sales_revenue:'Income',sales_receivable:'Assets',sales_vat_output:'Liabilities',inventory_asset:'Assets',inventory_cogs:'Expenses',inventory_adjustment:'Expenses',purchases_expense:'Expenses',purchases_payable:'Liabilities',purchases_vat_input:'Assets'};

exports.getSettings = async (req, res) => {
  try {
    const { rows } = await Setting.getAll();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateSetting = async (req, res) => {
  try {
    const { key } = req.params;
    if(req.body.account_id&&ACCOUNT_TYPES[key]){const{rows:[account]}=await query('SELECT account_type,active FROM chart_of_accounts WHERE id=? AND business_id=?',[req.body.account_id,getBusinessId(req)]);if(!account||!account.active)return res.status(400).json({error:'Choose an active general ledger account in your business'});if(account.account_type!==ACCOUNT_TYPES[key])return res.status(400).json({error:`${key} must map to an active ${ACCOUNT_TYPES[key]} account`});}
    for (const [field, table] of [['account_id','chart_of_accounts'], ['treasury_id','treasury']]) {
      if (!req.body[field]) continue;
      const { rows } = await query(`SELECT id FROM ${table} WHERE id=? AND business_id=?${table==='treasury'?" AND status='active'":' AND active=TRUE'}`, [req.body[field], getBusinessId(req)]);
      if (!rows.length) return res.status(400).json({ error: 'Choose an active accounting account belonging to your shop' });
    }
    await Setting.update(key, req.body);
    res.json({ message: 'Setting updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
