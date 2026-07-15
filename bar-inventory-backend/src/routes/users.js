const router = require('express').Router();
const ctrl = require('../controllers/userController');
const { authenticate, adminOnly } = require('../middleware/auth');

router.use(authenticate);
router.use(adminOnly); // entire user-management area is admin-only

router.get('/',                   ctrl.getAll);
router.get('/:id',                ctrl.getOne);
router.post('/',                  ctrl.create);
router.put('/:id',                ctrl.update);
router.patch('/:id/toggle-active',ctrl.toggleActive);
router.delete('/:id',             ctrl.remove);

module.exports = router;