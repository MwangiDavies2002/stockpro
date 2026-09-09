const router = require('express').Router();
const controller = require('../controllers/businessSettingsController');
const { authenticate, adminOnly } = require('../middleware/auth');
router.use(authenticate, adminOnly);
router.get('/', controller.get);
router.put('/', controller.update);
module.exports = router;
