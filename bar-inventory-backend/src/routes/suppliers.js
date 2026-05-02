const router = require('express').Router();
const ctrl   = require('../controllers/supplierController');
const { authenticate, adminOnly } = require('../middleware/auth');

router.use(authenticate);

router.get('/',     ctrl.getAll);
router.get('/:id',  ctrl.getOne);
router.post('/',    adminOnly, ctrl.create);
router.put('/:id',  adminOnly, ctrl.update);
router.delete('/:id',adminOnly,ctrl.remove);

module.exports = router;
