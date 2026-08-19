const { query } = require('../config/db');

const Treasury = {
  findAll: async () => {
    return query('SELECT * FROM treasury ORDER BY name');
  },

  findById: async (id) => {
    return query('SELECT * FROM treasury WHERE id = ?', [id]);
  },

  create: async (data) => {
    const { insertId } = await query(
      `INSERT INTO treasury 
      (name, type, account_number, linked_gl_account, opening_balance, current_balance, status, notes) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.name,
        data.type,
        data.account_number || null,
        data.linked_gl_account || null,
        data.opening_balance || 0,
        data.opening_balance || 0, // Current balance starts at opening balance
        data.status || 'active',
        data.notes || null
      ]
    );
    return Treasury.findById(insertId);
  },

  update: async (id, data) => {
    await query(
      `UPDATE treasury SET 
      name = ?, type = ?, account_number = ?, linked_gl_account = ?, 
      status = ?, notes = ?, updated_at = NOW() 
      WHERE id = ?`,
      [
        data.name,
        data.type,
        data.account_number || null,
        data.linked_gl_account || null,
        data.status || 'active',
        data.notes || null,
        id
      ]
    );
    return Treasury.findById(id);
  },

  updateBalance: async (id, amount) => {
    await query(
      'UPDATE treasury SET current_balance = current_balance + ?, updated_at = NOW() WHERE id = ?',
      [amount, id]
    );
    return Treasury.findById(id);
  },

  delete: async (id) => {
    return query('DELETE FROM treasury WHERE id = ?', [id]);
  }
};

module.exports = Treasury;
