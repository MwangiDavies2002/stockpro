const router = require('express').Router();
const ctrl   = require('../controllers/inventoryController');
console.log('inventoryController exports:',Object.keys(ctrl));
const { authenticate, adminOnly } = require('../middleware/auth');

router.use(authenticate);

router.get('/',             ctrl.getAll);
router.get('/adjustments',async(req,res,next)=>{try{res.json((await require('../config/db').query("SELECT l.*,i.name item_name,i.unit,i.location_id,loc.name location_name,u.name added_by,(l.after_stock-l.before_stock) quantity FROM inventory_stock_log l JOIN inventory_items i ON i.id=l.item_id JOIN locations loc ON loc.id=i.location_id AND loc.business_id=i.business_id LEFT JOIN users u ON u.id=l.user_id AND u.business_id=i.business_id WHERE i.business_id=? AND l.change_type='adjustment' ORDER BY l.id DESC",[req.user.business_id])).rows);}catch(e){next(e);}});
router.get('/low-stock',    ctrl.getLowStock);
router.get('/:id/history',  ctrl.getHistory);
router.get('/:id',          ctrl.getOne);
router.post('/',            adminOnly, ctrl.create);
router.put('/:id',          adminOnly, ctrl.update);
router.delete('/:id',       adminOnly, ctrl.remove);
router.patch('/:id/restock',adminOnly, ctrl.restock);
router.patch('/:id/adjustment', adminOnly, ctrl.adjustStock);
router.patch('/:id/sell',   ctrl.sell);
router.post('/import', adminOnly, ctrl.bulkImport);


module.exports = router;
