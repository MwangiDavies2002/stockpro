const router = require('express').Router();
const { authenticate, adminOnly } = require('../middleware/auth');
const controller = require('../controllers/etimsController');
router.use(authenticate, adminOnly);
router.get('/config', controller.getConfig);
router.put('/config', controller.updateConfig);
module.exports = router;
