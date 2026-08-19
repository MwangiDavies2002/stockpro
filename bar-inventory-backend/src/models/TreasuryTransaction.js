const { query } = require('../config/db');

const TreasuryTransaction = {
  findAll: async (treasuryId = null) => {
    let sql = 'SELECT * FROM treasury_transactions';
    const params = [];
    if (treasuryId) {
      sql += ' WHERE treasury_id = $1';
      params.push(treasuryId);
    }
    sql += ' ORDER BY date DESC';
    return query(sql, params);
  },

  create: async (data) => {
    return query(
      `INSERT INTO treasury_transactions 
      (treasury_id, transaction_type, amount, reference, description, related_transaction_id, created_by) 
      VALUES ($1, $2, $3, $4, $5, $6, $7) 
      RETURNING *`,
      [
        data.treasury_id,
        data.transaction_type,
        data.amount,
        data.reference || null,
        data.description || null,
        data.related_transaction_id || null,
        data.created_by || null
      ]
    );
  }
};

module.exports = TreasuryTransaction;
