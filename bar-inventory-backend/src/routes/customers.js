const router = require('express').Router();
const ctrl = require('../controllers/customerController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/',                 ctrl.getAll);
router.get('/:id',              ctrl.getOne);
router.get('/:id/statement',    ctrl.statement);
router.post('/',                ctrl.create);
router.put('/:id',              ctrl.update);
router.post('/:id/payments',    ctrl.recordPayment);

module.exports = router;