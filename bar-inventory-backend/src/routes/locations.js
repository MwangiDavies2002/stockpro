const router = require('express').Router();
const ctrl = require('../controllers/locationController');
const {authenticate, adminOnly }= require('../middleware/auth');

router.use(authenticate);

router.get('/'  , ctrl.getAll);
router.get('/:id/summary', ctrl.summary);
router.post('/', adminOnly, ctrl.create)
router.post('/:id', adminOnly, ctrl.update);
router.post('/:id', adminOnly, ctrl.remove);

module.exports = router;