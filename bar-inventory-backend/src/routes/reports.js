const router = require('express').Router();
const ctrl   = require('../controllers/reportController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/stock',            ctrl.getStock);
router.get('/usage',            ctrl.getUsage);
router.get('/sale-size-groups', ctrl.getSaleSizeGroups);
router.get('/sales-trend',      ctrl.getSalesTrend);
router.get('/ledger',           ctrl.getLedger);

module.exports = router;