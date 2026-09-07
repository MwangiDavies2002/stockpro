const router = require('express').Router();
const ctrl = require('../controllers/discountController');
const { authenticate, adminOnly } = require('../middleware/auth');

router.use(authenticate);
router.get('/', ctrl.list);
router.post('/', adminOnly, ctrl.create);
router.put('/:id', adminOnly, ctrl.update);
router.delete('/:id', adminOnly, ctrl.remove);

module.exports = router;
