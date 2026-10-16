const { query, getClient } = require('../config/db');

const Account = {
  findAll: async (businessId) => {
    return query(`SELECT a.*, COALESCE(b.debit_total,0) debit_total, COALESCE(b.credit_total,0) credit_total, (CASE WHEN a.normal_balance='Credit' THEN -1 ELSE 1 END)*COALESCE(b.net,0) balance FROM chart_of_accounts a LEFT JOIN (SELECT l.account_id,SUM(l.debit) debit_total,SUM(l.credit) credit_total,SUM(l.debit-l.credit) net FROM journal_entry_lines l JOIN journal_entries j ON j.id=l.journal_entry_id WHERE j.business_id=? GROUP BY l.account_id) b ON b.account_id=a.id WHERE a.business_id=? ORDER BY a.account_code`,[businessId,businessId]);
  },

  findById: async (id, businessId) => {
    return query('SELECT * FROM chart_of_accounts WHERE id = ? AND business_id=?', [id, businessId]);
  },

  create: async (body, businessId) => {
    const client=await getClient();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM businesses WHERE id=? FOR UPDATE',[businessId]);
      const accounts=(await client.query('SELECT * FROM chart_of_accounts WHERE business_id=?',[businessId])).rows;
      const policy=require('../utils/accountPolicy'),data=policy.normalize(body,accounts),value=policy.opening(body);
      const {insertId}=await client.query('INSERT INTO chart_of_accounts(business_id,account_code,account_name,parent_id,account_type,account_subtype,detail_type,normal_balance,active,details) VALUES (?,?,?,?,?,?,?,?,?,?)',[businessId,data.account_code,data.account_name,data.parent_id,data.account_type,data.account_subtype||null,data.detail_type||null,data.normal_balance,data.active,data.details?JSON.stringify(data.details):null]);
      if(value){
        const equity=await require('../utils/accountingDefaults').openingEquity(client,businessId);
        const net=(data.normal_balance==='Credit'?-1:1)*value;
        await require('./Journal').create({posting_date:body.as_of,description:`Opening balance: ${data.account_name}`,entry_type:'opening_balance',reference:`OPEN-GL-${insertId}`},[{account_id:insertId,debit:Math.max(net,0),credit:Math.max(-net,0)},{account_id:equity.id,debit:Math.max(-net,0),credit:Math.max(net,0)}],client);
      }
      await client.query('COMMIT');return Account.findById(insertId,businessId);
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  },
  update: async (id, body, businessId) => {
    const accounts=(await Account.findAll(businessId)).rows,old=accounts.find(a=>Number(a.id)===Number(id));
    if(!old)return {rows:[]};
    const data=require('../utils/accountPolicy').normalize(body,accounts,old);
    const used=(await query('SELECT id FROM journal_entry_lines WHERE account_id=? LIMIT 1',[id])).rows.length;
    if(used&&(data.account_type!==old.account_type||data.normal_balance!==old.normal_balance))throw Object.assign(new Error('Account type and normal balance cannot change after postings'),{status:400});
    await query('UPDATE chart_of_accounts SET account_code=?,account_name=?,parent_id=?,account_type=?,account_subtype=?,detail_type=?,normal_balance=?,active=?,details=? WHERE id=? AND business_id=?',[data.account_code,data.account_name,data.parent_id,data.account_type,data.account_subtype||null,data.detail_type||null,data.normal_balance,data.active,typeof data.details==='string'?data.details:JSON.stringify(data.details||{}),id,businessId]);return Account.findById(id,businessId);
  },
  delete: async (id,businessId) => {
    const refs=await query('SELECT id FROM chart_of_accounts WHERE parent_id=? AND business_id=? UNION ALL SELECT id FROM journal_entry_lines WHERE account_id=? UNION ALL SELECT id FROM treasury WHERE linked_gl_account=? AND business_id=? UNION ALL SELECT account_id FROM accounting_settings WHERE account_id=? AND business_id=?',[id,businessId,id,id,businessId,id,businessId]);
    if(refs.rows.length)throw Object.assign(new Error('This account has postings, children or mappings. Keep it for its history.'),{status:400});
    return query('DELETE FROM chart_of_accounts WHERE id=? AND business_id=?',[id,businessId]);
  },

  getBook: async (id, startDate, endDate, transactionType, businessId) => {
    let sql = `
      SELECT 
        je.posting_date as date, 
        je.description, 
        je.reference, 
        jel.description as line_description,
        jel.debit, 
        jel.credit,
        u.name as added_by
      FROM journal_entry_lines jel
      JOIN journal_entries je ON jel.journal_entry_id = je.id
      LEFT JOIN users u ON je.created_by = u.id
      WHERE jel.account_id = ? AND je.business_id=?
    `;
    const params = [id, businessId];

    sql += ' ORDER BY je.posting_date ASC, je.id ASC, jel.id ASC';
    const {rows}=await query(sql,params);
    return require('../utils/accountBook').buildBook(rows,{startDate,endDate,transactionType});
  }
};

module.exports = Account;
