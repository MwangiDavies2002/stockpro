const express = require('express');
const router = express.Router();
const treasuryController = require('../controllers/treasuryController');

router.get('/', treasuryController.getTreasuries);
router.get('/:id', treasuryController.getTreasury);
router.post('/', treasuryController.createTreasury);
router.put('/:id', treasuryController.updateTreasury);

router.get('/:id/transactions', treasuryController.getTransactions);
router.post('/:id/deposit', treasuryController.deposit);
router.post('/:id/withdraw', treasuryController.withdraw);
router.post('/transfer', treasuryController.transfer);

module.exports = router;
