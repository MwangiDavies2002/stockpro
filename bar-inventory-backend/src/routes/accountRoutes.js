const express = require('express');
const router = express.Router();
const { authenticate, adminOnly } = require('../middleware/auth');
router.use(authenticate, adminOnly);
const accountController = require('../controllers/accountController');

router.get('/', accountController.getAccounts);
router.post('/opening-balance-equity', accountController.ensureOpeningBalanceEquity);
router.get('/:id', accountController.getAccount);
router.get('/:id/book', accountController.getAccountBook);
router.post('/', accountController.createAccount);
router.put('/:id', accountController.updateAccount);
router.delete('/:id', accountController.deleteAccount);

module.exports = router;
