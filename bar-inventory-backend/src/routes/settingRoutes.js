const express = require('express');
const router = express.Router();
const { authenticate, adminOnly } = require('../middleware/auth');
router.use(authenticate, adminOnly);
const settingController = require('../controllers/settingController');

router.get('/', settingController.getSettings);
router.put('/:key', settingController.updateSetting);

module.exports = router;
