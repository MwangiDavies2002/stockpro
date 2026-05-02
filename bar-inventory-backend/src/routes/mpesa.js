const router = require('express').Router();
const ctrl   = require('../controllers/mpesaController');
const { authenticate } = require('../middleware/auth');

// Callback from Safaricom — no auth (public endpoint)
router.post('/callback', ctrl.callback);

// Protected routes
router.use(authenticate);
router.post('/stk-push', ctrl.stkPush);
router.get('/payments',  ctrl.getPayments);
router.get('/groups',    ctrl.getGroups);

module.exports = router;
