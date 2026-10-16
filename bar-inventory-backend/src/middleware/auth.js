const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const {loadAccess,checkReferences}=require('../utils/accessService');
const {assertAccess}=require('../utils/accessPolicy');
const { runForBusiness } = require('../utils/tenant');

/**
 * Express middleware to authenticate requests using `Authorization: Bearer <token>`.
 * On success, attaches `req.user` with the token payload.
 */
async function authenticate(req, res, next) {
  // Allow CORS preflight requests to pass through without authentication
  if (req.method === 'OPTIONS') return next();
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }
  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    if (!Number.isInteger(Number(req.user.business_id)) || Number(req.user.business_id) < 1) {
      return res.status(401).json({ message: 'Account is not assigned to a shop' });
    }
    const { rows } = await query('SELECT id,business_id,name,email,role,is_owner,active,access_role_id,is_superadmin,theme_color FROM users WHERE id=? AND business_id=?', [req.user.id, req.user.business_id]);
    const account = rows[0];
    if (!account || !account.active || account.role !== req.user.role) return res.status(401).json({ message: 'Account access has changed. Please sign in again.' });
    req.user = { ...req.user, ...account };
    if(req.user.support_session_id){
      const {rows:[session]}=await query('SELECT s.*,u.name actor_name,u.theme_color actor_theme_color,u.active actor_active,u.is_superadmin FROM support_sessions s JOIN users u ON u.id=s.actor_user_id WHERE s.id=? AND s.target_user_id=? AND s.business_id=? AND s.ended_at IS NULL AND s.expires_at>CURRENT_TIMESTAMP',[req.user.support_session_id,account.id,account.business_id]);
      if(!session||!session.actor_active||!session.is_superadmin)return res.status(401).json({message:'Support session expired or revoked'});
      const {rows:[business]}=await query('SELECT name FROM businesses WHERE id=?',[account.business_id]);
      req.user.supportSession={id:session.id,actorId:session.actor_user_id,actorName:session.actor_name,businessName:business.name,expiresAt:session.expires_at,themeColor:session.actor_theme_color};
      req.user.is_superadmin=0;
      if(req.method!=='GET'&&(req.baseUrl==='/api/users'||req.baseUrl==='/api/auth'&&req.path==='/register'))return res.status(403).json({message:'Account credentials cannot be changed during a support session'});
      if(!['GET','OPTIONS'].includes(req.method)&&!req.path.includes('support-session/end')){
        await query('INSERT INTO platform_audit (actor_user_id,business_id,action,details_json) VALUES (?,?,?,?)',[session.actor_user_id,account.business_id,'support.request',JSON.stringify({sessionId:session.id,method:req.method,path:req.baseUrl+req.path})]);
      }
    }
    req.user.platformRequest=req.baseUrl==='/api/superadmin';
    req.user.access=await loadAccess(req.user);
    assertAccess(req.user.access, req.baseUrl.replace(/^\/api/,'')+req.path, req.method, req.body);
    await checkReferences(req);
    req.accessAuthorized=true;
    runForBusiness(account.business_id, () => next(), req.user);
  } catch (error) {
    if(error.status)return res.status(error.status).json({message:error.message});
    if(!['JsonWebTokenError','TokenExpiredError','NotBeforeError'].includes(error.name))return next(error);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

/**
 * Middleware to allow only admin users to proceed.
 */
function adminOnly(req, res, next) {
  if (!req.accessAuthorized && req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}

module.exports = { authenticate, adminOnly };
