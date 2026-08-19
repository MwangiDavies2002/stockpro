const Setting = require('../models/Setting');

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
    await Setting.update(key, req.body);
    res.json({ message: 'Setting updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
