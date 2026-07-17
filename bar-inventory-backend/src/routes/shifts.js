const router = require('express').Router();
const ctrl = require('../controllers/shiftController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/',          ctrl.getAll);
router.get('/current',   ctrl.current);
router.post('/',         ctrl.open);
router.patch('/:id/close', ctrl.close);

module.exports = router;