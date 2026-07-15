const router = require('express').Router();
const ctrl   = require('../controllers/inventoryController');
console.log('inventoryController exports:',Object.keys(ctrl));
const { authenticate, adminOnly } = require('../middleware/auth');

router.use(authenticate);

router.get('/',             ctrl.getAll);
router.get('/low-stock',    ctrl.getLowStock);
router.get('/:id',          ctrl.getOne);
router.post('/',            adminOnly, ctrl.create);
router.put('/:id',          adminOnly, ctrl.update);
router.delete('/:id',       adminOnly, ctrl.remove);
router.patch('/:id/restock',adminOnly, ctrl.restock);
router.patch('/:id/sell',   ctrl.sell);
router.post('/import', adminOnly, ctrl.bulkImport);


module.exports = router;