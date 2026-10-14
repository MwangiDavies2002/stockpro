const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
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
    const { rows } = await query('SELECT id,business_id,name,email,role,is_owner,active FROM users WHERE id=? AND business_id=?', [req.user.id, req.user.business_id]);
    const account = rows[0];
    if (!account || !account.active || account.role !== req.user.role) return res.status(401).json({ message: 'Account access has changed. Please sign in again.' });
    req.user = { ...req.user, ...account };
    runForBusiness(account.business_id, () => next(), account);
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

/**
 * Middleware to allow only admin users to proceed.
 */
function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}

module.exports = { authenticate, adminOnly };
