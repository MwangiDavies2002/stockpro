const express = require('express');
const router = express.Router();
const journalEntryController = require('../controllers/journalEntryController');

router.get('/', journalEntryController.getJournalEntries);
router.get('/:id', journalEntryController.getJournalEntry);
router.post('/', journalEntryController.createJournalEntry);

module.exports = router;
