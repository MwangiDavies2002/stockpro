const Setting = require('../models/Setting');
const { query } = require('../config/db');
const { getBusinessId } = require('../utils/tenant');

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
