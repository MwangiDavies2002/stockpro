const router = require('express').Router();
const controller = require('../controllers/businessSettingsController');
const { authenticate, adminOnly } = require('../middleware/auth');
router.get('/', authenticate, controller.get);
router.put('/', authenticate, adminOnly, controller.update);
module.exports = router;
