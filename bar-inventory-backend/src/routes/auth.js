const router = require('express').Router();
const { register, login, logout, me } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

router.post('/register', register);
router.post('/login',    login);
router.post('/logout',   logout);
router.get('/me',        authenticate, me);

module.exports = router;
