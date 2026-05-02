const router = require('express').Router();
const ctrl   = require('../controllers/orderController');
const { authenticate, adminOnly } = require('../middleware/auth');

router.use(authenticate);

router.get('/',              ctrl.getAll);
router.get('/:id',           ctrl.getOne);
router.post('/',             ctrl.create);
router.put('/:id',           adminOnly, ctrl.update);
router.delete('/:id',        adminOnly, ctrl.remove);
router.patch('/:id/status',  adminOnly, ctrl.updateStatus);

module.exports = router;
