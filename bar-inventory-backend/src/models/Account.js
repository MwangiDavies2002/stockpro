const { query } = require('../config/db');

const Account = {
  findAll: async (businessId) => {
    return query('SELECT * FROM chart_of_accounts WHERE business_id=? ORDER BY account_code', [businessId]);
  },

  findById: async (id, businessId) => {
    return query('SELECT * FROM chart_of_accounts WHERE id = ? AND business_id=?', [id, businessId]);
  },

  create: async (data, businessId) => {
    const { insertId } = await query(
      `INSERT INTO chart_of_accounts 
      (business_id, account_code, account_name, parent_id, account_type, account_subtype, detail_type, normal_balance, active, details) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        businessId,
        data.account_code,
        data.account_name,
        data.parent_id || null,
        data.account_type,
        data.account_subtype || null,
        data.detail_type || null,
        data.normal_balance,
        data.active !== undefined ? data.active : true,
        data.details ? JSON.stringify(data.details) : null
      ]
    );
    return Account.findById(insertId, businessId);
  },

  update: async (id, data, businessId) => {
    await query(
      `UPDATE chart_of_accounts SET 
      account_code = ?, account_name = ?, parent_id = ?, account_type = ?, 
      account_subtype = ?, detail_type = ?, normal_balance = ?, active = ?, 
      details = ?, updated_at = NOW() 
      WHERE id = ? AND business_id=?`,
      [
        data.account_code,
        data.account_name,
        data.parent_id || null,
        data.account_type,
        data.account_subtype || null,
        data.detail_type || null,
        data.normal_balance,
        data.active !== undefined ? data.active : true,
        data.details ? JSON.stringify(data.details) : null,
        id, businessId
      ]
    );
    return Account.findById(id, businessId);
  },

  delete: async (id, businessId) => {
    return query('DELETE FROM chart_of_accounts WHERE id = ? AND business_id=?', [id, businessId]);
  },

  getBook: async (id, startDate, endDate, transactionType) => {
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
      WHERE jel.account_id = ?
    `;
    const params = [id];

    if (startDate) {
      sql += ' AND je.posting_date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      sql += ' AND je.posting_date <= ?';
      params.push(endDate);
    }

    sql += ' ORDER BY je.posting_date ASC, je.id ASC';

    const { rows } = await query(sql, params);

    // Calculate running balance
    let balance = 0;
    const result = rows.map(row => {
      balance = balance + parseFloat(row.debit) - parseFloat(row.credit);
      return { ...row, balance };
    });

    return result;
  }
};

module.exports = Account;
