const { query } = require('../config/db');
const { getBusinessId } = require('../utils/tenant');

exports.getConfig = async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT kra_pin, etims_enabled, etims_mode, etims_api_url, etims_username, etims_device_serial
       FROM businesses WHERE id=?`, [getBusinessId(req)]
    );
    if (!rows.length) return res.status(404).json({ message: 'Shop not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
};

exports.updateConfig = async (req, res, next) => {
  try {
    const mode = req.body.mode || 'sandbox';
    if (!['sandbox', 'production'].includes(mode)) return res.status(400).json({ message: 'Invalid eTIMS mode' });
    await query(
      `UPDATE businesses SET kra_pin=?, etims_enabled=?, etims_mode=?, etims_api_url=?,
       etims_username=?, etims_password_encrypted=? WHERE id=?`,
      [req.body.kraPin || null, !!req.body.enabled, mode, req.body.apiUrl || null,
        req.body.username || null, req.body.password || null, getBusinessId(req)]
    );
    res.json({ message: 'eTIMS configuration saved', mode, enabled: !!req.body.enabled });
  } catch (err) { next(err); }
};

