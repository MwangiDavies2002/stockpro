const { query } = require('../config/db');
const { currentBusinessId } = require('../utils/tenant');

const Setting = {
  getAll: async () => {
    return query('SELECT * FROM accounting_settings WHERE business_id=?', [currentBusinessId()]);
  },

  update: async (key, data) => {
    // MySQL INSERT ... ON DUPLICATE KEY UPDATE
    return query(
      `INSERT INTO accounting_settings (business_id, setting_key, account_id, treasury_id)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE account_id = VALUES(account_id), treasury_id = VALUES(treasury_id), updated_at = NOW()`,
      [currentBusinessId(), key, data.account_id || null, data.treasury_id || null]
    );
  },

  getByKey: async (key) => {
    return query('SELECT * FROM accounting_settings WHERE setting_key = ? AND business_id=?', [key, currentBusinessId()]);
  }
};

module.exports = Setting;
