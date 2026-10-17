const rateLimit = require('express-rate-limit');
const router = require('express').Router();
const { register, onboardBusiness, login, logout, me, googleAuth } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Try again later.' }
});

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many registration attempts. Try again later.' }
});

router.get('/packages', async(_req,res,next)=>{try{res.json(await require('../utils/platformCatalog').packages());}catch(e){next(e);}});
router.post('/register', authenticate, (req,res,next)=>{if(!req.user.is_owner)return res.status(403).json({message:'Only the owner can add members'});next();}, register);
router.post('/business-registration', registrationLimiter, onboardBusiness);
router.post('/login',    loginLimiter, login);
router.post('/google',   loginLimiter, googleAuth);
router.post('/logout',   logout);
router.get('/me', authenticate, me);
router.put('/theme',authenticate,async(req,res,next)=>{try{const color=String(req.body.color||'').toLowerCase();if(!/^#[0-9a-f]{6}$/.test(color))return res.status(400).json({message:'Enter a six-digit hex color, for example #2459a6'});const {query}=require('../config/db');const id=req.user.supportSession?.actorId||req.user.id;await query('UPDATE users SET theme_color=? WHERE id=?',[color,id]);res.json({color});}catch(e){next(e);}});
router.post('/support-session/end',authenticate,async(req,res,next)=>{try{const session=req.user.supportSession;if(!session)return res.status(400).json({message:'No support session is active'});const {query}=require('../config/db');await query('UPDATE support_sessions SET ended_at=CURRENT_TIMESTAMP WHERE id=? AND actor_user_id=?',[session.id,session.actorId]);await query('INSERT INTO platform_audit (actor_user_id,business_id,action,details_json) VALUES (?,?,?,?)',[session.actorId,req.user.business_id,'support.end',JSON.stringify({sessionId:session.id})]);res.json({message:'Support session ended'});}catch(e){next(e);}});

module.exports = router;

