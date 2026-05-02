const express = require('express');
const router = express.Router();
const { db } = require('../config/db');

// Development helper: list all users (only enabled in non-production)
router.get('/users', (_req, res) => {
  try {
    const users = db.tables.users || [];
    res.json({ count: users.length, users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Development helper: list inventory items
router.get('/inventory', (_req, res) => {
  try {
    const items = db.tables.inventory_items || [];
    res.json({ count: items.length, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
