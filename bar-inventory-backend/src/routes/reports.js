const router = require('express').Router();
const ctrl   = require('../controllers/reportController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/stock',        ctrl.getStock);
router.get('/usage',        ctrl.getUsage);
router.get('/mpesa-groups', ctrl.getMpesaGroups);
router.get('/sales-trend',  ctrl.getSalesTrend);

module.exports = router;
