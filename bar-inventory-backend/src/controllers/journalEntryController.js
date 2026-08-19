const JournalEntry = require('../models/JournalEntry');

exports.createJournalEntry = async (req, res) => {
  try {
    const entry = await JournalEntry.create(req.body);
    res.status(201).json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getJournalEntries = async (req, res) => {
  try {
    const { rows } = await JournalEntry.findAll();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getJournalEntry = async (req, res) => {
  try {
    const entry = await JournalEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ error: 'Journal entry not found' });
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
