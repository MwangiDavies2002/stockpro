const { query } = require('../config/db');
const { getBusinessId } = require('../utils/tenant');

const Treasury = {
  findAll: async (businessId) => {
    return query('SELECT * FROM treasury WHERE business_id=? ORDER BY name', [businessId]);
  },

  findById: async (id, businessId) => {
    return query('SELECT * FROM treasury WHERE id = ? AND business_id=?', [id, businessId]);
  },

  create: async (data, businessId) => {
    const { insertId } = await query(
      `INSERT INTO treasury 
      (business_id, name, type, account_number, linked_gl_account, opening_balance, current_balance, status, notes) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        businessId,
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
    return Treasury.findById(insertId, businessId);
  },

  update: async (id, data, businessId) => {
    await query(
      `UPDATE treasury SET 
      name = ?, type = ?, account_number = ?, linked_gl_account = ?, 
      status = ?, notes = ?, updated_at = NOW() 
      WHERE id = ? AND business_id=?`,
      [
        data.name,
        data.type,
        data.account_number || null,
        data.linked_gl_account || null,
        data.status || 'active',
        data.notes || null,
        id, businessId
      ]
    );
    return Treasury.findById(id, businessId);
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
