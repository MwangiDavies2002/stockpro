const router = require('express').Router();
const ctrl   = require('../controllers/reportController');
const { authenticate, adminOnly } = require('../middleware/auth');

router.use(authenticate);
router.get('/stock-overview',require('../controllers/operationsReportController').stock);
router.get('/expenses',require('../controllers/operationsReportController').expenses);
router.get('/profit', adminOnly, ctrl.getProfit);
router.get('/owner-intelligence', adminOnly, require('../controllers/intelligenceController').overview);

router.get('/stock',            ctrl.getStock);
router.get('/usage',            ctrl.getUsage);
router.get('/sale-size-groups', ctrl.getSaleSizeGroups);
router.get('/sales-trend',      ctrl.getSalesTrend);
router.get('/hourly-sales',     ctrl.getHourlySales);
router.get('/benchmarks',       ctrl.getBenchmarks);
router.get('/product-pairs',    ctrl.getProductPairs);
router.get('/loss-alerts',      ctrl.getLossAlerts);
router.get('/staff-performance', ctrl.getStaffPerformance);
router.get('/ledger',           ctrl.getLedger);

module.exports = router;
