const router = require('express').Router();
const ctrl = require('../controllers/salesDocumentController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.get('/:id', ctrl.getOne);
router.post('/:id/convert', ctrl.convert);
router.post('/:id/payments', ctrl.addPayment);

module.exports = router;
