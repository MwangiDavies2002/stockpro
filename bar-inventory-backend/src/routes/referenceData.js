const router = require('express').Router();
const ctrl = require('../controllers/referenceDataController');
const { authenticate, adminOnly } = require('../middleware/auth');

router.use(authenticate);
router.get('/:type', ctrl.getAll);
router.post('/:type', adminOnly, ctrl.create);
router.put('/:type/:id', adminOnly, ctrl.update);
router.delete('/:type/:id', adminOnly, ctrl.remove);

module.exports = router;
