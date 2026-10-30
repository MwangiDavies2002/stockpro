const router=require('express').Router();
const controller=require('../controllers/marketplaceController');
const {authenticate,adminOnly}=require('../middleware/auth');

// Public catalogue endpoints intentionally precede authenticated seller tools.
router.get('/products',controller.search);
router.get('/products/:id',controller.getPublic);
router.use(authenticate);
router.get('/manage',adminOnly,controller.manageList);
router.put('/manage/:itemId',adminOnly,controller.save);

module.exports=router;
