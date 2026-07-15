const router = require('express').Router();
const ctrl = require('../controllers/salesController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.post('/',    ctrl.create);
router.get('/',     ctrl.getAll);
router.get('/:id',  ctrl.getOne);

module.exports = router;