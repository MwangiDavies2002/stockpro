const { query } = require('../config/db');
const { getBusinessId } = require('../utils/tenant');

exports.get = async (req, res, next) => {
  try {
    const { rows } = await query('SELECT settings_json FROM businesses WHERE id=?', [getBusinessId(req)]);
    let settings = {};
    try { settings = rows[0]?.settings_json ? JSON.parse(rows[0].settings_json) : {}; } catch {}
    res.json(settings);
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    await query('UPDATE businesses SET settings_json=? WHERE id=?', [JSON.stringify(req.body || {}), getBusinessId(req)]);
    res.json({ message: 'Business settings saved', settings: req.body || {} });
  } catch (err) { next(err); }
};
