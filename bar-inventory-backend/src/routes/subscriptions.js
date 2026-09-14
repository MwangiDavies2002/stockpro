const router = require('express').Router();
const ctrl = require('../controllers/subscriptionController');
const { authenticate, adminOnly } = require('../middleware/auth');
router.use(authenticate);
router.get('/', ctrl.getAll);
router.get('/current', ctrl.getCurrent);
router.post('/', ctrl.create);
router.patch('/:id/approve', adminOnly, ctrl.approve);
module.exports = router;
