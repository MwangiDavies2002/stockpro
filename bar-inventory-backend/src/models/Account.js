const { query } = require('../config/db');

const Account = {
  findAll: async () => {
    return query('SELECT * FROM chart_of_accounts ORDER BY account_code');
  },

  findById: async (id) => {
    return query('SELECT * FROM chart_of_accounts WHERE id = ?', [id]);
  },

  create: async (data) => {
    const { insertId } = await query(
      `INSERT INTO chart_of_accounts 
      (account_code, account_name, parent_id, account_type, account_subtype, detail_type, normal_balance, active, details) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
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
    return Account.findById(insertId);
  },

  update: async (id, data) => {
    await query(
      `UPDATE chart_of_accounts SET 
      account_code = ?, account_name = ?, parent_id = ?, account_type = ?, 
      account_subtype = ?, detail_type = ?, normal_balance = ?, active = ?, 
      details = ?, updated_at = NOW() 
      WHERE id = ?`,
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
        id
      ]
    );
    return Account.findById(id);
  },

  delete: async (id) => {
    return query('DELETE FROM chart_of_accounts WHERE id = ?', [id]);
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
